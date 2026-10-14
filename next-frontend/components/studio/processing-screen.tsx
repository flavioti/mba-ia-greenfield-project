"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { ProcessingStatus, type ProcessingStatusKind } from "@/components/studio/processing-status"
import { UploadProgress } from "@/components/studio/upload-progress"
import { VideoLinkField } from "@/components/studio/video-link-field"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { VideoPlayer } from "@/components/video/video-player"
import { VideoThumbnail } from "@/components/video/video-thumbnail"
import { useVideoStatus } from "@/hooks/use-video-status"
import { useVideoUpload } from "@/hooks/use-video-upload"
import type { Video } from "@/lib/api/contracts"
import { formatDuration, formatQuality } from "@/lib/video/format"

type ProcessingScreenProps = {
  videoId: string
  /** Origin used to build the public video URL; defaults to the current origin. */
  publicOrigin?: string
}

function statusKind(
  video: Video,
  upload: ReturnType<typeof useVideoUpload>,
): ProcessingStatusKind {
  if (upload.phase === "error" && video.processing_status === "uploading") {
    return upload.errorCode === "INVALID_UPLOAD_PARTS" ? "upload_failed" : "interrupted"
  }
  // Draft still `uploading` but this tab has no Uppy session for it (reload / other tab) — OQ-14.
  if (video.processing_status === "uploading" && upload.phase === "none") return "interrupted"
  return video.processing_status
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-4">
      <p className="text-helper text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

/**
 * Upload + processing panel for one draft: Uppy progress while this tab
 * uploads, then the server's processing status via polling, and the media
 * (player, thumbnail, duration, quality, link) once `ready`.
 */
function ProcessingScreen({ videoId, publicOrigin }: ProcessingScreenProps) {
  const router = useRouter()
  const { video, error, loading, refresh } = useVideoStatus(videoId)
  const upload = useVideoUpload(videoId)
  // Only read once the video has loaded client-side, so there is no SSR/hydration mismatch.
  const origin = publicOrigin ?? (typeof window === "undefined" ? "" : window.location.origin)

  // The server flips to `processing` when Uppy's complete call succeeds — fetch right away.
  React.useEffect(() => {
    if (upload.phase === "complete") refresh()
  }, [upload.phase, refresh])

  React.useEffect(() => {
    if (error === "unauthorized") router.push("/login")
  }, [error, router])

  if (error === "not_found") {
    return (
      <Card className="items-center gap-2 px-6 py-12 text-center" data-slot="video-not-found">
        <h2 className="text-h2 text-foreground">Vídeo não encontrado</h2>
        <Link href="/studio/videos/new" className="text-body-md text-link underline-offset-4 hover:underline">
          Enviar um vídeo
        </Link>
      </Card>
    )
  }

  if (loading || !video) {
    return (
      <Card className="gap-6 p-6" aria-busy="true" data-slot="processing-skeleton">
        <Skeleton className="h-24 w-full" />
        <div className="flex flex-col gap-6 lg:flex-row">
          <Skeleton className="h-48 flex-1" />
          <Skeleton className="aspect-video w-full lg:w-88" />
        </div>
      </Card>
    )
  }

  const kind = statusKind(video, upload)
  const uploadingHere = upload.phase === "uploading" && video.processing_status === "uploading"
  const ready = video.processing_status === "ready"
  const durationLabel = formatDuration(video.duration_seconds)
  const qualityLabel = formatQuality(video.height)

  return (
    <Card className="gap-0 py-0 shadow-card">
      {uploadingHere ? (
        <div className="border-b border-border p-6">
          <UploadProgress
            fileName={upload.fileName ?? video.original_filename}
            percent={upload.percent}
            onCancel={() => {
              upload.cancel()
              refresh()
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-8 p-6 lg:flex-row">
        <section className="flex flex-1 flex-col gap-4" aria-labelledby="processing-details">
          <h2 id="processing-details" className="text-h2 text-foreground">
            {video.title}
          </h2>
          <div className="flex flex-col gap-2">
            <h3 className="text-h3 text-foreground">Thumbnail</h3>
            {ready ? (
              <VideoThumbnail src={video.thumbnail_url} alt={`Thumbnail de ${video.title}`} />
            ) : (
              <Skeleton className="aspect-video w-60" data-slot="thumbnail-pending" />
            )}
          </div>
        </section>

        <aside className="w-full overflow-hidden rounded-[var(--radius-2)] border border-border bg-background lg:w-88">
          <VideoPlayer
            src={ready ? video.video_url : null}
            poster={video.thumbnail_url}
            durationLabel={durationLabel ?? "0:00"}
            title={video.title}
          />
          <div className="flex flex-col gap-4 p-4">
            <VideoLinkField url={`${origin}/v/${video.public_id}`} />
            <MetaRow label="Filename">
              <p className="truncate text-helper text-muted-foreground" data-slot="filename">
                {video.original_filename}
              </p>
            </MetaRow>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <span className="text-helper text-muted-foreground">Duration</span>
              <span className="text-helper text-foreground" data-slot="duration">
                {ready && durationLabel ? durationLabel : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-helper text-muted-foreground">Video Quality</span>
              <span className="text-helper text-foreground" data-slot="quality">
                {ready && qualityLabel ? qualityLabel : "—"}
              </span>
            </div>
          </div>
        </aside>
      </div>

      <div className="border-t border-border p-4">
        <ProcessingStatus status={kind} processingError={video.processing_error} />
      </div>
    </Card>
  )
}

export { ProcessingScreen }
