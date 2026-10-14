// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { server } from "@/mocks/server"
import { BAD_REQUEST_FILE_NAME, VIDEO_IDS } from "@/mocks/factories/videos"
import { UppyProvider } from "@/components/studio/uppy-provider"
import type { VideoUppy } from "@/lib/upload/uppy"
import { VideoDropzone } from "../video-dropzone"

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}))

function createFakeUppy(currentUploads: Record<string, unknown> = {}) {
  const fake = {
    getState: vi.fn(() => ({ currentUploads })),
    getFiles: vi.fn(() => []),
    removeFile: vi.fn(),
    addFile: vi.fn(),
    upload: vi.fn(() => Promise.resolve()),
  }
  return fake
}

function renderDropzone(fake = createFakeUppy()) {
  render(
    <UppyProvider createUploader={() => fake as unknown as VideoUppy}>
      <VideoDropzone />
    </UppyProvider>,
  )
  return fake
}

function videoFile(name = "holiday.mp4", type = "video/mp4", size = 1024) {
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: size })
  return file
}

beforeEach(() => {
  pushMock.mockClear()
})

describe("<VideoDropzone /> wiring", () => {
  it("pre-registers the draft, hands the file to Uppy and navigates to the processing screen", async () => {
    const user = userEvent.setup()
    let payload: unknown
    server.use(
      http.post("/api/videos", async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json(
          { videoId: VIDEO_IDS.UPLOADING, uploadId: "upload-1", key: "videos/k/source" },
          { status: 201 },
        )
      }),
    )
    const fake = renderDropzone()

    await user.upload(screen.getByLabelText("Video file"), videoFile())

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/studio/videos/${VIDEO_IDS.UPLOADING}`))
    expect(payload).toEqual({ file_name: "holiday.mp4", mime_type: "video/mp4", size_bytes: 1024 })
    expect(fake.addFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "holiday.mp4",
        meta: { videoId: VIDEO_IDS.UPLOADING, uploadId: "upload-1", key: "videos/k/source" },
      }),
    )
    expect(fake.upload).toHaveBeenCalledTimes(1)
  })

  it("rejects a file over 10 GB inline without calling the API", async () => {
    let calls = 0
    server.use(
      http.post("/api/videos", () => {
        calls++
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    renderDropzone()

    fireEvent.change(screen.getByLabelText("Video file"), {
      target: { files: [videoFile("big.mp4", "video/mp4", 10 * 1024 ** 3 + 1)] },
    })

    expect(await screen.findByRole("alert")).toHaveTextContent("10 GB")
    expect(calls).toBe(0)
    expect(screen.getByRole("button", { name: "Select file" })).toBeEnabled()
  })

  it("rejects an unsupported file type dropped on the area", async () => {
    renderDropzone()

    fireEvent.drop(screen.getByText(/drag and drop/i).parentElement!, {
      dataTransfer: { files: [new File(["x"], "photo.png", { type: "image/png" })] },
    })

    expect(await screen.findByRole("alert")).toHaveTextContent("Formato não suportado")
  })

  it("only uses the first of several dropped files", async () => {
    let names: string[] = []
    server.use(
      http.post("/api/videos", async ({ request }) => {
        names.push(((await request.json()) as { file_name: string }).file_name)
        return HttpResponse.json(
          { videoId: VIDEO_IDS.UPLOADING, uploadId: "u", key: "k" },
          { status: 201 },
        )
      }),
    )
    renderDropzone()

    fireEvent.drop(screen.getByText(/drag and drop/i).parentElement!, {
      dataTransfer: { files: [videoFile("first.mp4"), videoFile("second.mp4")] },
    })

    await waitFor(() => expect(pushMock).toHaveBeenCalled())
    expect(names).toEqual(["first.mp4"])
    names = []
  })

  it("shows the server validation message on 400 and stays idle", async () => {
    const user = userEvent.setup()
    renderDropzone()

    // BAD_REQUEST_FILE_NAME trips the shared upstream 400 branch through the BFF fixture.
    server.use(
      http.post("/api/videos", () =>
        HttpResponse.json(
          { statusCode: 400, error: "VALIDATION_ERROR", message: ["mime_type must be one of the following values"] },
          { status: 400 },
        ),
      ),
    )
    await user.upload(screen.getByLabelText("Video file"), videoFile(BAD_REQUEST_FILE_NAME))

    expect(await screen.findByRole("alert")).toHaveTextContent("mime_type must be one of")
    expect(pushMock).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Select file" })).toBeEnabled()
  })

  it("redirects to /login on 401", async () => {
    const user = userEvent.setup()
    server.use(http.post("/api/videos", () => HttpResponse.json({}, { status: 401 })))
    renderDropzone()

    await user.upload(screen.getByLabelText("Video file"), videoFile())

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"))
  })

  it("shows a generic retry message on 5xx", async () => {
    const user = userEvent.setup()
    server.use(http.post("/api/videos", () => HttpResponse.json({}, { status: 503 })))
    renderDropzone()

    await user.upload(screen.getByLabelText("Video file"), videoFile())

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível iniciar o upload. Tente novamente.",
    )
  })
})
