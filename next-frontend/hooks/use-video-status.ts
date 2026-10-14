"use client"

import * as React from "react"

import type { Video } from "@/lib/api/contracts"

export const VIDEO_STATUS_POLL_INTERVAL_MS = 3000

export type VideoStatusError = "not_found" | "unauthorized" | "network"

export type VideoStatusState = {
  video: Video | null
  error: VideoStatusError | null
  loading: boolean
  /** Fetch now (e.g. right after the upload finishes) without waiting for the next tick. */
  refresh: () => void
}

const TERMINAL_STATUSES: ReadonlyArray<Video["processing_status"]> = ["ready", "failed"]

/**
 * Loads the draft from `GET /api/videos/[id]` and short-polls every 3 s while
 * it is `uploading` or `processing`; polling stops at `ready` / `failed` or on
 * a 404 / 401 (TD-13).
 */
export function useVideoStatus(
  videoId: string,
  intervalMs: number = VIDEO_STATUS_POLL_INTERVAL_MS,
): VideoStatusState {
  const [video, setVideo] = React.useState<Video | null>(null)
  const [error, setError] = React.useState<VideoStatusError | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [tick, setTick] = React.useState(0)
  const refresh = React.useCallback(() => setTick((t) => t + 1), [])

  React.useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function load() {
      let next: { video?: Video; error?: VideoStatusError }
      try {
        const res = await fetch(`/api/videos/${encodeURIComponent(videoId)}`, { cache: "no-store" })
        if (res.ok) next = { video: (await res.json()) as Video }
        else if (res.status === 401) next = { error: "unauthorized" }
        // 400 (invalid id) is indistinguishable from a missing video for the user.
        else if (res.status === 404 || res.status === 400) next = { error: "not_found" }
        else next = { error: "network" }
      } catch {
        next = { error: "network" }
      }
      if (cancelled) return

      setLoading(false)
      if (next.video) {
        setVideo(next.video)
        setError(null)
      } else {
        setError(next.error ?? "network")
      }

      const keepPolling = next.video
        ? !TERMINAL_STATUSES.includes(next.video.processing_status)
        : next.error === "network"
      if (keepPolling) {
        timer = setTimeout(() => setTick((t) => t + 1), intervalMs)
      }
    }

    void load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [videoId, intervalMs, tick])

  return { video, error, loading, refresh }
}
