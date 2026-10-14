"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { UploadIcon } from "@/components/icons/upload-icon"
import { useUppy } from "@/components/studio/uppy-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { ApiErrorEnvelope, CreateVideoUploadResponse } from "@/lib/api/contracts"
import { ACCEPTED_VIDEO_MIME_TYPES, validateVideoFile } from "@/lib/upload/validate-video-file"
import { cn } from "@/lib/utils"

const START_FAILED_MESSAGE = "Não foi possível iniciar o upload. Tente novamente."

type DropzoneState = "idle" | "dragover" | "starting"

function messageOf(envelope: ApiErrorEnvelope | null): string {
  if (!envelope) return START_FAILED_MESSAGE
  return [envelope.message].flat().join(" ")
}

/**
 * Single-file drag-and-drop area. Selecting a file pre-registers the draft
 * (`POST /api/videos`), hands the file to the shared Uppy instance (multipart
 * upload continues in the background) and navigates to the processing screen.
 */
function VideoDropzone() {
  const router = useRouter()
  const uppy = useUppy()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [state, setState] = React.useState<DropzoneState>("idle")
  const [error, setError] = React.useState<string | null>(null)

  async function startUpload(file: File) {
    setError(null)
    const validation = validateVideoFile(file)
    if (!validation.ok) {
      setError(validation.message)
      setState("idle")
      return
    }
    if (Object.keys(uppy.getState().currentUploads).length > 0) {
      setError("Já existe um upload em andamento. Aguarde a conclusão para enviar outro vídeo.")
      setState("idle")
      return
    }

    setState("starting")
    let res: Response
    try {
      res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_name: file.name, mime_type: file.type, size_bytes: file.size }),
      })
    } catch {
      setError(START_FAILED_MESSAGE)
      setState("idle")
      return
    }

    if (res.status === 401) {
      router.push("/login")
      return
    }
    if (!res.ok) {
      const envelope = (await res.json().catch(() => null)) as ApiErrorEnvelope | null
      setError(res.status === 400 ? messageOf(envelope) : START_FAILED_MESSAGE)
      setState("idle")
      return
    }

    const draft = (await res.json()) as CreateVideoUploadResponse
    // Uppy holds one file at a time; drop the finished upload, if any.
    uppy.getFiles().forEach((previous) => uppy.removeFile(previous.id))
    uppy.addFile({
      name: file.name,
      type: file.type,
      data: file,
      meta: { videoId: draft.videoId, uploadId: draft.uploadId, key: draft.key },
    })
    // Fire-and-forget: progress and errors are read from the provider on /studio/videos/[id].
    void uppy.upload()
    router.push(`/studio/videos/${draft.videoId}`)
  }

  function handleFiles(files: FileList | null) {
    // Single-file: the first file wins, the rest is ignored.
    const file = files?.[0]
    if (file) void startUpload(file)
  }

  const starting = state === "starting"

  return (
    <div
      data-slot="video-dropzone"
      data-state={state}
      aria-busy={starting}
      onDragOver={(event) => {
        event.preventDefault()
        if (!starting) setState("dragover")
      }}
      onDragLeave={() => {
        if (!starting) setState("idle")
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (starting) return
        setState("idle")
        handleFiles(event.dataTransfer.files)
      }}
      className={cn(
        "flex min-h-100 flex-col items-center justify-center gap-2 rounded-[var(--radius-4)] border-2 border-dashed border-border bg-card px-6 py-12 text-center transition-colors",
        "data-[state=dragover]:border-link data-[state=dragover]:bg-blue-alpha-10",
        "data-[state=starting]:opacity-70",
      )}
    >
      <div className="mb-6 flex size-32 items-center justify-center rounded-[var(--radius-full)] bg-background">
        <UploadIcon className="size-9 text-muted-foreground" />
      </div>
      <h2 className="text-h2 text-foreground">Drag and drop a video file to upload</h2>
      <p className="text-body-md text-muted-foreground">
        Your videos will be private until you publish them.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_MIME_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label="Video file"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ""
        }}
      />
      <Button
        type="button"
        size="md"
        className="mt-6"
        disabled={starting}
        data-loading={starting}
        onClick={() => inputRef.current?.click()}
      >
        {starting ? "Iniciando upload…" : "Select file"}
      </Button>

      {error ? (
        <Alert variant="destructive" className="mt-6 max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

export { VideoDropzone }
