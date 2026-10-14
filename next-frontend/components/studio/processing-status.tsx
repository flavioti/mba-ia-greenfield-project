import Link from "next/link"

import { CheckCircleIcon } from "@/components/icons/check-circle-icon"
import type { VideoProcessingStatus } from "@/lib/api/contracts"
import { cn } from "@/lib/utils"

export type ProcessingStatusKind = VideoProcessingStatus | "interrupted" | "upload_failed"

const FAILURE_MESSAGES: Record<string, string> = {
  UPLOAD_ABORTED: "Upload cancelado.",
  UPLOAD_ABANDONED: "O upload foi abandonado e expirou.",
  PROBE_FAILED: "Não foi possível ler o arquivo de vídeo.",
  TRANSCODE_FAILED: "Falha ao processar o vídeo.",
}

type ProcessingStatusProps = {
  status: ProcessingStatusKind
  processingError?: string | null
}

function messageFor(status: ProcessingStatusKind, processingError?: string | null): string {
  switch (status) {
    case "uploading":
      return "Enviando o vídeo…"
    case "processing":
      return "Processando…"
    case "ready":
      return "Checks complete. No issues found."
    case "interrupted":
      return "Upload interrompido. Envie o arquivo novamente."
    case "upload_failed":
      return "Falha ao concluir o upload."
    case "failed":
      return (processingError && FAILURE_MESSAGES[processingError]) || "Falha ao processar o vídeo."
  }
}

/** Maps `processing_status` / `processing_error` to a message (Figma 39:1755); announced via aria-live. */
function ProcessingStatus({ status, processingError }: ProcessingStatusProps) {
  const failed = status === "failed" || status === "interrupted" || status === "upload_failed"

  return (
    <div
      data-slot="processing-status"
      data-status={status}
      aria-live="polite"
      className="flex flex-wrap items-center gap-2"
    >
      {status === "ready" ? <CheckCircleIcon className="size-3 text-success-text" /> : null}
      <p
        className={cn(
          "text-helper",
          failed ? "text-destructive-text" : "text-muted-foreground",
        )}
      >
        {messageFor(status, processingError)}
      </p>
      {failed ? (
        <Link href="/studio/videos/new" className="text-helper text-link underline-offset-4 hover:underline">
          Enviar outro vídeo
        </Link>
      ) : null}
    </div>
  )
}

export { ProcessingStatus }
