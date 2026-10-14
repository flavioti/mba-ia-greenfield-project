// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { env } from "@/lib/env"
import { server } from "@/mocks/server"
import { VIDEO_IDS, buildVideo } from "@/mocks/factories/videos"
import { UppyProvider } from "@/components/studio/uppy-provider"
import type { VideoUppy } from "@/lib/upload/uppy"
import { ProcessingScreen } from "../processing-screen"

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}))

type FakeFile = {
  id: string
  name: string
  meta: { videoId: string }
  progress: { bytesUploaded: number; bytesTotal: number; uploadComplete: boolean }
  error: string | null
}

function createFakeUppy(files: FakeFile[] = []) {
  return {
    getFiles: vi.fn(() => files),
    getState: vi.fn(() => ({ currentUploads: {} })),
    on: vi.fn(),
    off: vi.fn(),
    cancelAll: vi.fn(),
  }
}

function renderScreen(videoId: string, fake = createFakeUppy()) {
  render(
    <UppyProvider createUploader={() => fake as unknown as VideoUppy}>
      <ProcessingScreen videoId={videoId} publicOrigin="http://localhost:3001" />
    </UppyProvider>,
  )
  return fake
}

beforeEach(() => {
  pushMock.mockClear()
  // The component calls the BFF; forward it to the shared upstream fixtures so the
  // reserved VIDEO_IDS triggers drive each state (per-test server.use overrides win).
  server.use(
    http.get("/api/videos/:id", ({ params }) =>
      fetch(`${env.API_URL}/videos/${String(params.id)}`),
    ),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe("<ProcessingScreen /> wiring", () => {
  it("shows the media, duration, quality and the unique link once ready", async () => {
    renderScreen(VIDEO_IDS.READY)

    expect(await screen.findByText("Checks complete. No issues found.")).toBeInTheDocument()
    expect(screen.getByText("http://localhost:3001/v/aZ3kP9xQ2Lm")).toBeInTheDocument()
    expect(document.querySelector("[data-slot='duration']")).toHaveTextContent("2:05")
    expect(document.querySelector("[data-slot='quality']")).toHaveTextContent("1080p HD")
    expect(document.querySelector("[data-slot='filename']")).toHaveTextContent("holiday.mp4")
    expect(screen.getByLabelText("Prévia de holiday")).toHaveAttribute(
      "src",
      expect.stringContaining("video.mp4"),
    )
  })

  it("shows the Uppy progress for an upload started in this tab and cancels it", async () => {
    const fake = createFakeUppy([
      {
        id: "f1",
        name: "holiday.mp4",
        meta: { videoId: VIDEO_IDS.UPLOADING },
        progress: { bytesUploaded: 42, bytesTotal: 100, uploadComplete: false },
        error: null,
      },
    ])
    renderScreen(VIDEO_IDS.UPLOADING, fake)

    expect(await screen.findByText("Uploading… 42%")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(fake.cancelAll).toHaveBeenCalledTimes(1)
  })

  it("reports an interrupted upload when the draft is uploading but this tab has no Uppy session", async () => {
    renderScreen(VIDEO_IDS.UPLOADING)

    expect(await screen.findByText(/Upload interrompido/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Enviar outro vídeo" })).toHaveAttribute(
      "href",
      "/studio/videos/new",
    )
  })

  it("shows the processing state without media while processing", async () => {
    renderScreen(VIDEO_IDS.PROCESSING)

    expect(await screen.findByText("Processando…")).toBeInTheDocument()
    expect(document.querySelector("[data-slot='video-player']")).toHaveAttribute(
      "data-state",
      "placeholder",
    )
    expect(document.querySelector("[data-slot='quality']")).toHaveTextContent("—")
  })

  it("maps processing_error to a message with a link to send another video", async () => {
    renderScreen(VIDEO_IDS.FAILED)

    expect(await screen.findByText("Falha ao processar o vídeo.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Enviar outro vídeo" })).toBeInTheDocument()
  })

  it("maps UPLOAD_ABORTED to a cancelled message", async () => {
    server.use(
      http.get("/api/videos/:id", () =>
        HttpResponse.json(buildVideo({ processing_status: "failed", processing_error: "UPLOAD_ABORTED" })),
      ),
    )
    renderScreen(VIDEO_IDS.UPLOADING)

    expect(await screen.findByText("Upload cancelado.")).toBeInTheDocument()
  })

  it("renders 'Vídeo não encontrado' on 404", async () => {
    renderScreen(VIDEO_IDS.NOT_FOUND)

    expect(await screen.findByText("Vídeo não encontrado")).toBeInTheDocument()
  })

  it("redirects to /login when the session expired", async () => {
    server.use(http.get("/api/videos/:id", () => HttpResponse.json({}, { status: 401 })))
    renderScreen(VIDEO_IDS.READY)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"))
  })

  it("copies the link and shows 'Copiado' for about 2 seconds", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    renderScreen(VIDEO_IDS.READY)
    const copyButton = await screen.findByRole("button", { name: "Copiar link" })

    vi.useFakeTimers()
    await act(async () => {
      fireEvent.click(copyButton)
    })

    expect(writeText).toHaveBeenCalledWith("http://localhost:3001/v/aZ3kP9xQ2Lm")
    expect(screen.getByText("Copiado")).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByText("Copiado")).not.toBeInTheDocument()
  })
})
