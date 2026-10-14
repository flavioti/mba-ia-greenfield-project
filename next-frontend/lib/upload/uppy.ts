import Uppy from "@uppy/core"
import AwsS3, { type AwsBody, type AwsS3Part } from "@uppy/aws-s3"

import type {
  ApiErrorEnvelope,
  UploadPartsResponse,
  UploadPartUrlResponse,
} from "@/lib/api/contracts"

/** Draft ids returned by `POST /api/videos`, attached to the Uppy file before upload. */
export type VideoUploadMeta = {
  videoId: string
  uploadId: string
  key: string
}

export type VideoUppy = Uppy<VideoUploadMeta, AwsBody>

/** S3 multipart limits: parts ≥ 5 MiB and ≤ 10,000 parts per upload. */
const MIN_CHUNK_BYTES = 64 * 1024 * 1024
const MAX_PARTS = 10_000
const CONCURRENT_PARTS = 4

export class UploadRequestError extends Error {
  constructor(
    readonly status: number,
    readonly envelope: ApiErrorEnvelope | null,
  ) {
    super(envelope ? [envelope.message].flat().join(" ") : `Request failed (${status})`)
    this.name = "UploadRequestError"
  }
}

/** 64 MiB parts, grown when needed so a 10 GiB file never exceeds 10,000 parts. */
export function chunkSizeFor(fileSize: number): number {
  return Math.max(MIN_CHUNK_BYTES, Math.ceil(fileSize / MAX_PARTS))
}

type Fetch = typeof fetch

async function bffJson<T>(fetchImpl: Fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await fetchImpl(url, init)
  if (!res.ok) {
    const envelope = (await res.json().catch(() => null)) as ApiErrorEnvelope | null
    throw new UploadRequestError(res.status, envelope)
  }
  return (res.status === 204 ? null : await res.json()) as T
}

function videoIdOf(file: { meta: VideoUploadMeta }): string {
  return encodeURIComponent(file.meta.videoId)
}

/**
 * Headless Uppy configured for TD-02's API-orchestrated multipart upload:
 * every S3 step goes through the same-origin BFF, only the part bytes go
 * straight from the browser to storage via presigned URLs.
 */
export function createVideoUploader({
  baseUrl = "",
  fetchImpl = (...args) => fetch(...args),
}: { baseUrl?: string; fetchImpl?: Fetch } = {}): VideoUppy {
  const api = (path: string) => `${baseUrl}/api/videos/${path}`

  const uppy: VideoUppy = new Uppy<VideoUploadMeta, AwsBody>({
    autoProceed: false,
    restrictions: { maxNumberOfFiles: 1 },
  })

  return uppy.use(AwsS3<VideoUploadMeta, AwsBody>, {
    // Literal `true` (always multipart) — the function form would also require getUploadParameters.
    shouldUseMultipart: true,
    limit: CONCURRENT_PARTS,
    getChunkSize: (file) => chunkSizeFor(file.size),

    // The draft (and its multipart upload) is created by the dropzone before
    // the file reaches Uppy; reuse those ids instead of a second round trip.
    createMultipartUpload: (file) => ({
      uploadId: file.meta.uploadId,
      key: file.meta.key,
    }),

    signPart: async (file, { partNumber, signal }) => {
      const { url } = await bffJson<UploadPartUrlResponse>(
        fetchImpl,
        api(`${videoIdOf(file)}/upload/parts/${partNumber}/url`),
        { signal },
      )
      return { method: "PUT", url }
    },

    listParts: async (file, { signal }) => {
      const { parts } = await bffJson<UploadPartsResponse>(
        fetchImpl,
        api(`${videoIdOf(file)}/upload/parts`),
        { signal },
      )
      return parts
    },

    completeMultipartUpload: async (file, { parts, signal }) => {
      await bffJson<unknown>(fetchImpl, api(`${videoIdOf(file)}/upload/complete`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: parts.map((part: AwsS3Part) => ({
            PartNumber: part.PartNumber ?? 0,
            ETag: part.ETag ?? "",
          })),
        }),
        signal,
      })
      return {}
    },

    abortMultipartUpload: async (file) => {
      try {
        await bffJson<null>(fetchImpl, api(`${videoIdOf(file)}/upload`), {
          method: "DELETE",
        })
      } catch (err) {
        // 409: already completed/cancelled server-side — nothing left to abort.
        if (!(err instanceof UploadRequestError && err.status === 409)) throw err
      }
    },
  })
}
