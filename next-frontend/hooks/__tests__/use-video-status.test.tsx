// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { server } from "@/mocks/server"
import { VIDEO_IDS, buildReadyVideo, buildVideo } from "@/mocks/factories/videos"
import { useVideoStatus } from "../use-video-status"

const FAST_POLL_MS = 15
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("useVideoStatus", () => {
  it("polls while processing and stops once the video is ready", async () => {
    const statuses = ["uploading", "processing", "ready"] as const
    let calls = 0
    server.use(
      http.get("/api/videos/:id", () => {
        const status = statuses[Math.min(calls, statuses.length - 1)]
        calls++
        return HttpResponse.json(
          status === "ready" ? buildReadyVideo() : buildVideo({ processing_status: status }),
        )
      }),
    )

    const { result } = renderHook(() => useVideoStatus(VIDEO_IDS.READY, FAST_POLL_MS))

    await waitFor(() => expect(result.current.video?.processing_status).toBe("ready"))
    const callsAtReady = calls
    await wait(FAST_POLL_MS * 5)
    expect(calls).toBe(callsAtReady)
    expect(callsAtReady).toBe(3)
  })

  it("does not poll a failed video", async () => {
    let calls = 0
    server.use(
      http.get("/api/videos/:id", () => {
        calls++
        return HttpResponse.json(buildVideo({ processing_status: "failed", processing_error: "PROBE_FAILED" }))
      }),
    )

    const { result } = renderHook(() => useVideoStatus(VIDEO_IDS.FAILED, FAST_POLL_MS))

    await waitFor(() => expect(result.current.video?.processing_status).toBe("failed"))
    await wait(FAST_POLL_MS * 5)
    expect(calls).toBe(1)
  })

  it("reports not_found on 404 and stops polling", async () => {
    let calls = 0
    server.use(
      http.get("/api/videos/:id", () => {
        calls++
        return HttpResponse.json(
          { statusCode: 404, error: "VIDEO_NOT_FOUND", message: "Video not found" },
          { status: 404 },
        )
      }),
    )

    const { result } = renderHook(() => useVideoStatus(VIDEO_IDS.NOT_FOUND, FAST_POLL_MS))

    await waitFor(() => expect(result.current.error).toBe("not_found"))
    await wait(FAST_POLL_MS * 5)
    expect(calls).toBe(1)
  })

  it("reports unauthorized on 401", async () => {
    server.use(http.get("/api/videos/:id", () => HttpResponse.json({}, { status: 401 })))

    const { result } = renderHook(() => useVideoStatus(VIDEO_IDS.READY, FAST_POLL_MS))

    await waitFor(() => expect(result.current.error).toBe("unauthorized"))
  })

  it("defaults to a 3 second polling interval", async () => {
    let calls = 0
    server.use(
      http.get("/api/videos/:id", () => {
        calls++
        return HttpResponse.json(buildVideo({ processing_status: "processing" }))
      }),
    )

    const { result, unmount } = renderHook(() => useVideoStatus(VIDEO_IDS.PROCESSING))

    await waitFor(() => expect(result.current.video).not.toBeNull())
    await wait(200)
    expect(calls).toBe(1)
    unmount()
  })
})
