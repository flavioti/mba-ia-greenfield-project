"use client"

import * as React from "react"

import { createVideoUploader, type VideoUppy } from "@/lib/upload/uppy"

const UppyContext = React.createContext<VideoUppy | null>(null)

type UppyProviderProps = {
  children: React.ReactNode
  /** Injectable for tests; defaults to the BFF-wired uploader. */
  createUploader?: () => VideoUppy
}

/**
 * Holds the single Uppy instance above every `/studio` route so an upload
 * started on `/studio/videos/new` keeps running (and reporting progress) on
 * `/studio/videos/[id]` (OQ-14). Warns before the tab is closed mid-upload.
 */
function UppyProvider({ children, createUploader = createVideoUploader }: UppyProviderProps) {
  // Lazy state: one instance per mounted layout, stable across navigations.
  const [uppy] = React.useState(createUploader)

  React.useEffect(() => {
    function warnIfUploading(event: BeforeUnloadEvent) {
      if (Object.keys(uppy.getState().currentUploads).length > 0) {
        event.preventDefault()
      }
    }
    window.addEventListener("beforeunload", warnIfUploading)
    return () => window.removeEventListener("beforeunload", warnIfUploading)
  }, [uppy])

  return <UppyContext.Provider value={uppy}>{children}</UppyContext.Provider>
}

function useUppy(): VideoUppy {
  const uppy = React.useContext(UppyContext)
  if (!uppy) {
    throw new Error("useUppy must be used inside <UppyProvider>")
  }
  return uppy
}

export { UppyProvider, useUppy }
