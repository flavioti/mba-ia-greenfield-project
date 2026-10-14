import type { paths } from "@/lib/api/types.gen";

type Video =
  paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];

// Reserved trigger ids (shared by Vitest and E2E — must not collide with other fixtures).
export const VIDEO_IDS = {
  /** Default draft returned by POST /videos; GET answers `uploading`. */
  UPLOADING: "11111111-1111-4111-8111-111111111111",
  PROCESSING: "22222222-2222-4222-8222-222222222222",
  READY: "33333333-3333-4333-8333-333333333333",
  FAILED: "44444444-4444-4444-8444-444444444444",
  NOT_FOUND: "55555555-5555-4555-8555-555555555555",
} as const;

/** `file_name` that makes POST /videos answer 400. */
export const BAD_REQUEST_FILE_NAME = "badrequest.mp4";
/** ETag that makes POST /videos/{id}/upload/complete answer 400 INVALID_UPLOAD_PARTS. */
export const INVALID_ETAG = '"invalid-etag"';

const baseVideo: Video = {
  id: VIDEO_IDS.UPLOADING,
  public_id: "aZ3kP9xQ2Lm",
  title: "holiday",
  description: null,
  original_filename: "holiday.mp4",
  status: "draft",
  processing_status: "uploading",
  processing_error: null,
  duration_seconds: null,
  width: null,
  height: null,
  video_url: null,
  thumbnail_url: null,
  download_url: null,
  created_at: "2026-10-13T12:00:00.000Z",
};

export const buildVideo = (overrides: Partial<Video> = {}): Video => ({
  ...baseVideo,
  ...overrides,
});

export const buildReadyVideo = (overrides: Partial<Video> = {}): Video =>
  buildVideo({
    id: VIDEO_IDS.READY,
    processing_status: "ready",
    duration_seconds: 125.4,
    width: 1920,
    height: 1080,
    video_url: "http://storage.test/streamtube/videos/ready/video.mp4?sig=1",
    thumbnail_url: "http://storage.test/streamtube/videos/ready/thumbnail.jpg?sig=1",
    download_url: "http://storage.test/streamtube/videos/ready/video.mp4?sig=2",
    ...overrides,
  });
