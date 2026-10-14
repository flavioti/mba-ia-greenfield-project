import { PlayIcon } from "@/components/icons/play-icon"
import { ImageIcon } from "@/components/icons/image-icon"

type VideoPlayerProps = {
  src: string | null
  poster?: string | null
  durationLabel?: string | null
  title: string
}

/**
 * Native `<video>` over the presigned MP4 URL — the browser streams it with
 * HTTP Range requests, no full download (TD-08 / TD-09). Placeholder until ready.
 */
function VideoPlayer({ src, poster, durationLabel, title }: VideoPlayerProps) {
  if (src) {
    return (
      <video
        data-slot="video-player"
        className="aspect-video w-full bg-neutral-1000"
        src={src}
        poster={poster ?? undefined}
        controls
        preload="metadata"
        aria-label={`Prévia de ${title}`}
      />
    )
  }

  return (
    <div
      data-slot="video-player"
      data-state="placeholder"
      className="relative flex aspect-video w-full items-center justify-center bg-neutral-1000"
    >
      <ImageIcon className="absolute top-2 left-2 size-3 text-neutral-700" />
      <PlayIcon className="h-9 w-7 text-neutral-400" />
      {durationLabel ? (
        <span className="absolute right-2 bottom-2 text-helper text-neutral-100">{durationLabel}</span>
      ) : null}
    </div>
  )
}

export { VideoPlayer }
