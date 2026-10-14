"use client"

import * as React from "react"

import { CheckIcon } from "@/components/icons/check-icon"
import { CopyIcon } from "@/components/icons/copy-icon"
import { IconButton } from "@/components/ui/icon-button"

const COPIED_FEEDBACK_MS = 2000

/** The video's unique URL as copyable, non-clickable text (OQ-16 — the watch page is Phase 05). */
function VideoLinkField({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <div data-slot="video-link-field" className="flex flex-col gap-1">
      <p className="text-helper text-muted-foreground">Video link</p>
      <div className="flex items-center gap-2">
        <span className="truncate text-body-md text-link">{url}</span>
        <IconButton
          size="sm"
          aria-label={copied ? "Link copiado" : "Copiar link"}
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon className="text-success-text" /> : <CopyIcon className="text-muted-foreground" />}
        </IconButton>
        <span aria-live="polite" className="text-helper text-success-text">
          {copied ? "Copiado" : ""}
        </span>
      </div>
    </div>
  )
}

export { VideoLinkField }
