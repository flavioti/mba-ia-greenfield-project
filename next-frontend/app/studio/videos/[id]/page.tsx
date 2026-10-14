import type { Metadata } from "next"

import { ProcessingScreen } from "@/components/studio/processing-screen"

export const metadata: Metadata = { title: "Upload video — StreamTube" }

export default async function VideoProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <h1 className="text-display text-foreground">Upload video</h1>
      <ProcessingScreen videoId={id} />
    </div>
  )
}
