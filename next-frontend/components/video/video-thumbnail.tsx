import Image from "next/image"

import { ImageIcon } from "@/components/icons/image-icon"

/** Generated thumbnail (Figma 39:1802) or a placeholder while processing. */
function VideoThumbnail({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div
      data-slot="video-thumbnail"
      className="relative flex aspect-video w-60 items-center justify-center overflow-hidden rounded-[var(--radius-1-5)] border border-border bg-background"
    >
      {src ? (
        // Presigned, short-lived storage URL: bypass the optimizer (it would cache an expiring URL).
        <Image src={src} alt={alt} fill sizes="240px" className="object-cover" unoptimized />
      ) : (
        <ImageIcon className="size-6 text-neutral-700" />
      )}
    </div>
  )
}

export { VideoThumbnail }
