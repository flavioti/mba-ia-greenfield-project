/** `processing_error` codes written by the pipeline (Error Catalog — non-HTTP). */
export const VIDEO_PROCESSING_ERRORS = {
  UPLOAD_ABORTED: 'UPLOAD_ABORTED',
  UPLOAD_ABANDONED: 'UPLOAD_ABANDONED',
  PROBE_FAILED: 'PROBE_FAILED',
  TRANSCODE_FAILED: 'TRANSCODE_FAILED',
} as const;

export type VideoProcessingError =
  (typeof VIDEO_PROCESSING_ERRORS)[keyof typeof VIDEO_PROCESSING_ERRORS];

/** Pipeline failure carrying the code persisted to `videos.processing_error`. */
export abstract class VideoPipelineException extends Error {
  constructor(
    public readonly processingError: VideoProcessingError,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ProbeFailedException extends VideoPipelineException {
  constructor(detail: string) {
    super(VIDEO_PROCESSING_ERRORS.PROBE_FAILED, `ffprobe failed: ${detail}`);
  }
}

export class TranscodeFailedException extends VideoPipelineException {
  constructor(detail: string) {
    super(VIDEO_PROCESSING_ERRORS.TRANSCODE_FAILED, `ffmpeg failed: ${detail}`);
  }
}
