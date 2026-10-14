"use client"

import * as React from "react"

import { useUppy } from "@/components/studio/uppy-provider"
import type { VideoUppy } from "@/lib/upload/uppy"
import { UploadRequestError } from "@/lib/upload/uppy"

export type VideoUploadPhase = "none" | "uploading" | "complete" | "error"

export type VideoUploadState = {
  phase: VideoUploadPhase
  /** 0..100 */
  percent: number
  fileName: string | null
  /** Error Catalog code when the BFF rejected a step (e.g. INVALID_UPLOAD_PARTS). */
  errorCode: string | null
  cancel: () => void
}

type Snapshot = Omit<VideoUploadState, "cancel">

const NO_UPLOAD: Snapshot = { phase: "none", percent: 0, fileName: null, errorCode: null }

function snapshotFor(uppy: VideoUppy, videoId: string, errorCode: string | null): Snapshot {
  const file = uppy.getFiles().find((f) => f.meta.videoId === videoId)
  if (!file) return NO_UPLOAD
  const { progress } = file
  const percent =
    progress.bytesTotal && progress.bytesTotal > 0
      ? Math.min(100, Math.round(((progress.bytesUploaded || 0) / progress.bytesTotal) * 100))
      : 0
  const phase: VideoUploadPhase = file.error
    ? "error"
    : progress.uploadComplete
      ? "complete"
      : "uploading"
  return { phase, percent, fileName: file.name ?? null, errorCode: phase === "error" ? errorCode : null }
}

/**
 * Upload progress of `videoId` from the shared Uppy instance (lives in the
 * `/studio` layout, so it survives `/new` → `/[id]` navigation — OQ-14).
 * `phase: "none"` means this tab is not uploading that video (e.g. after a reload).
 */
export function useVideoUpload(videoId: string): VideoUploadState {
  const uppy = useUppy()
  const errorCodeRef = React.useRef<string | null>(null)
  const [snapshot, setSnapshot] = React.useState<Snapshot>(() => snapshotFor(uppy, videoId, null))

  React.useEffect(() => {
    const update = () => setSnapshot(snapshotFor(uppy, videoId, errorCodeRef.current))
    const onError = (_file: unknown, error: unknown) => {
      errorCodeRef.current =
        error instanceof UploadRequestError ? (error.envelope?.error ?? null) : null
      update()
    }
    update()
    uppy.on("upload-progress", update)
    uppy.on("upload-success", update)
    uppy.on("file-removed", update)
    uppy.on("cancel-all", update)
    uppy.on("upload-error", onError)
    return () => {
      uppy.off("upload-progress", update)
      uppy.off("upload-success", update)
      uppy.off("file-removed", update)
      uppy.off("cancel-all", update)
      uppy.off("upload-error", onError)
    }
  }, [uppy, videoId])

  // Aborts the multipart (Uppy calls DELETE /api/videos/[id]/upload) and forgets the file.
  const cancel = React.useCallback(() => uppy.cancelAll(), [uppy])

  return { ...snapshot, cancel }
}
