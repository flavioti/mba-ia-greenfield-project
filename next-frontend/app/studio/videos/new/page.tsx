import type { Metadata } from "next"

import { VideoDropzone } from "@/components/studio/video-dropzone"

export const metadata: Metadata = { title: "Upload video — StreamTube" }

export default function UploadVideoPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-8">
      <h1 className="text-display text-foreground">Upload video</h1>
      <VideoDropzone />
    </div>
  )
}
