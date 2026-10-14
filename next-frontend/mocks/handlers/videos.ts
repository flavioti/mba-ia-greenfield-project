import { http, HttpResponse } from "msw";

import type { paths } from "@/lib/api/types.gen";
import { env } from "@/lib/env";
import {
  BAD_REQUEST_FILE_NAME,
  INVALID_ETAG,
  VIDEO_IDS,
  buildReadyVideo,
  buildVideo,
} from "@/mocks/factories/videos";

type CreateBody =
  paths["/videos"]["post"]["requestBody"]["content"]["application/json"];
type CreateOk =
  paths["/videos"]["post"]["responses"][201]["content"]["application/json"];
type Video =
  paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];
type PartsOk =
  paths["/videos/{id}/upload/parts"]["get"]["responses"][200]["content"]["application/json"];
type PartUrlOk =
  paths["/videos/{id}/upload/parts/{partNumber}/url"]["get"]["responses"][200]["content"]["application/json"];
type CompleteBody =
  paths["/videos/{id}/upload/complete"]["post"]["requestBody"]["content"]["application/json"];
type ErrorEnvelope =
  paths["/videos/{id}"]["get"]["responses"][404]["content"]["application/json"];

const VIDEOS_URL = `${env.API_URL}/videos`;

function error(statusCode: number, code: string, message: string): Response {
  return HttpResponse.json<ErrorEnvelope>(
    { statusCode, error: code, message },
    { status: statusCode },
  );
}

function videoFor(id: string): Video | null {
  switch (id) {
    case VIDEO_IDS.NOT_FOUND:
      return null;
    case VIDEO_IDS.PROCESSING:
      return buildVideo({ id, processing_status: "processing" });
    case VIDEO_IDS.READY:
      return buildReadyVideo();
    case VIDEO_IDS.FAILED:
      return buildVideo({
        id,
        processing_status: "failed",
        processing_error: "TRANSCODE_FAILED",
      });
    default:
      return buildVideo({ id });
  }
}

/** Upload operations only succeed while the draft is `uploading`. */
function uploadGuard(id: string): Response | null {
  const video = videoFor(id);
  if (!video) return error(404, "VIDEO_NOT_FOUND", "Video not found");
  if (video.processing_status !== "uploading") {
    return error(409, "UPLOAD_NOT_IN_PROGRESS", "The video upload is not in progress");
  }
  return null;
}

export const handlers = [
  // POST /videos
  http.post(VIDEOS_URL, async ({ request }): Promise<Response> => {
    const body = (await request.json()) as CreateBody;
    if (body.file_name === BAD_REQUEST_FILE_NAME) {
      return HttpResponse.json<ErrorEnvelope>(
        { statusCode: 400, error: "VALIDATION_ERROR", message: ["mime_type must be one of the following values"] },
        { status: 400 },
      );
    }
    return HttpResponse.json<CreateOk>(
      {
        videoId: VIDEO_IDS.UPLOADING,
        uploadId: "upload-fixture-id",
        key: `videos/${VIDEO_IDS.UPLOADING}/source`,
      },
      { status: 201 },
    );
  }),

  // GET /videos/{id}
  http.get(`${VIDEOS_URL}/:id`, ({ params }): Response => {
    const video = videoFor(String(params.id));
    return video
      ? HttpResponse.json<Video>(video)
      : error(404, "VIDEO_NOT_FOUND", "Video not found");
  }),

  // GET /videos/{id}/upload/parts
  http.get(`${VIDEOS_URL}/:id/upload/parts`, ({ params }): Response => {
    return uploadGuard(String(params.id)) ?? HttpResponse.json<PartsOk>({ parts: [] });
  }),

  // GET /videos/{id}/upload/parts/{partNumber}/url
  http.get(`${VIDEOS_URL}/:id/upload/parts/:partNumber/url`, ({ params }): Response => {
    const partNumber = Number(params.partNumber);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      return error(400, "VALIDATION_ERROR", "partNumber must not be less than 1");
    }
    return (
      uploadGuard(String(params.id)) ??
      HttpResponse.json<PartUrlOk>({
        url: `http://storage.test/streamtube/videos/${String(params.id)}/source?partNumber=${partNumber}&uploadId=upload-fixture-id`,
      })
    );
  }),

  // POST /videos/{id}/upload/complete
  http.post(`${VIDEOS_URL}/:id/upload/complete`, async ({ params, request }): Promise<Response> => {
    const id = String(params.id);
    const guard = uploadGuard(id);
    if (guard) return guard;
    const body = (await request.json()) as CompleteBody;
    if (body.parts.some((part) => part.ETag === INVALID_ETAG)) {
      return error(400, "INVALID_UPLOAD_PARTS", "Storage rejected the uploaded parts list");
    }
    return HttpResponse.json<Video>(buildVideo({ id, processing_status: "processing" }));
  }),

  // DELETE /videos/{id}/upload
  http.delete(`${VIDEOS_URL}/:id/upload`, ({ params }): Response => {
    return uploadGuard(String(params.id)) ?? new HttpResponse(null, { status: 204 });
  }),
];
