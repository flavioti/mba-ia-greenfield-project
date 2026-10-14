import { FileVideoIcon } from "@/components/icons/file-video-icon"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

type UploadProgressProps = {
  fileName: string
  percent: number
  onCancel?: () => void
}

/** Multipart upload progress fed by the Uppy provider (Figma 39:1752). */
function UploadProgress({ fileName, percent, onCancel }: UploadProgressProps) {
  return (
    <div
      data-slot="upload-progress"
      className="flex flex-col gap-4 rounded-[var(--radius-2)] border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <FileVideoIcon className="h-5 w-4 shrink-0 text-blue-500" />
          <div className="min-w-0">
            <p className="truncate text-label-md text-foreground">{fileName}</p>
            <p className="text-helper text-muted-foreground">Uploading… {percent}%</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-helper text-blue-500">Uploading</span>
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>
      <Progress value={percent} aria-label={`Upload de ${fileName}`} />
    </div>
  )
}

export { UploadProgress }
