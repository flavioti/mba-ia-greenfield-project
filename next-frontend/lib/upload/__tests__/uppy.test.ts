import { describe, it, expect } from "vitest"
import { http, HttpResponse } from "msw"
import type { UppyFile } from "@uppy/core"
import type { AwsBody } from "@uppy/aws-s3"

import { server } from "@/mocks/server"
import {
  chunkSizeFor,
  createVideoUploader,
  UploadRequestError,
  type VideoUploadMeta,
} from "@/lib/upload/uppy"

const BASE = "http://localhost"
const VIDEO_ID = "11111111-1111-4111-8111-111111111111"
const MIB = 1024 * 1024

const file = {
  id: "f1",
  size: 10 * MIB,
  meta: { videoId: VIDEO_ID, uploadId: "upload-1", key: `videos/${VIDEO_ID}/source` },
} as unknown as UppyFile<VideoUploadMeta, AwsBody>

function pluginOpts() {
  const uppy = createVideoUploader({ baseUrl: BASE })
  const plugin = uppy.getPlugin("AwsS3Multipart")
  if (!plugin) throw new Error("AwsS3Multipart plugin not installed")
  return plugin.opts
}

describe("chunkSizeFor", () => {
  it("uses 64 MiB parts for ordinary files", () => {
    expect(chunkSizeFor(500 * MIB)).toBe(64 * MIB)
  })

  it("keeps a 10 GiB file within 10,000 parts", () => {
    const tenGiB = 10 * 1024 * MIB
    expect(Math.ceil(tenGiB / chunkSizeFor(tenGiB))).toBeLessThanOrEqual(10_000)
  })
})

describe("createVideoUploader — multipart callbacks", () => {
  it("reuses the draft ids from the file meta instead of creating a new upload", async () => {
    const result = await pluginOpts().createMultipartUpload(file)

    expect(result).toEqual({ uploadId: "upload-1", key: `videos/${VIDEO_ID}/source` })
  })

  it("signs each part through the BFF and returns a PUT target", async () => {
    server.use(
      http.get(`${BASE}/api/videos/${VIDEO_ID}/upload/parts/3/url`, () =>
        HttpResponse.json({ url: "http://storage.test/part-3" }),
      ),
    )

    const params = await pluginOpts().signPart(file, {
      uploadId: "upload-1",
      key: "k",
      partNumber: 3,
      body: new Blob(["x"]),
    })

    expect(params).toEqual({ method: "PUT", url: "http://storage.test/part-3" })
  })

  it("lists uploaded parts for resume", async () => {
    const parts = [{ PartNumber: 1, Size: 64 * MIB, ETag: '"a"' }]
    server.use(
      http.get(`${BASE}/api/videos/${VIDEO_ID}/upload/parts`, () => HttpResponse.json({ parts })),
    )

    await expect(
      pluginOpts().listParts(file, { uploadId: "upload-1", key: "k", signal: undefined }),
    ).resolves.toEqual(parts)
  })

  it("completes with the PartNumber/ETag list", async () => {
    let body: unknown
    server.use(
      http.post(`${BASE}/api/videos/${VIDEO_ID}/upload/complete`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ processing_status: "processing" })
      }),
    )

    await pluginOpts().completeMultipartUpload(file, {
      uploadId: "upload-1",
      key: "k",
      parts: [{ PartNumber: 1, ETag: '"a"', Size: 5 }],
      signal: new AbortController().signal,
    })

    expect(body).toEqual({ parts: [{ PartNumber: 1, ETag: '"a"' }] })
  })

  it("surfaces BFF errors as UploadRequestError with the envelope", async () => {
    server.use(
      http.post(`${BASE}/api/videos/${VIDEO_ID}/upload/complete`, () =>
        HttpResponse.json(
          { statusCode: 400, error: "INVALID_UPLOAD_PARTS", message: "rejected" },
          { status: 400 },
        ),
      ),
    )

    const error = await Promise.resolve(
      pluginOpts().completeMultipartUpload(file, {
        uploadId: "upload-1",
        key: "k",
        parts: [],
        signal: new AbortController().signal,
      }),
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UploadRequestError)
    expect((error as UploadRequestError).envelope?.error).toBe("INVALID_UPLOAD_PARTS")
  })

  it("treats a 409 on abort as already cancelled", async () => {
    server.use(
      http.delete(`${BASE}/api/videos/${VIDEO_ID}/upload`, () =>
        HttpResponse.json(
          { statusCode: 409, error: "UPLOAD_NOT_IN_PROGRESS", message: "done" },
          { status: 409 },
        ),
      ),
    )

    await expect(
      Promise.resolve(
        pluginOpts().abortMultipartUpload(file, { uploadId: "upload-1", key: "k", signal: undefined }),
      ),
    ).resolves.toBeUndefined()
  })
})
