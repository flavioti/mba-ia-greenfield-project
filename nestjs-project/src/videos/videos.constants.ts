export const VIDEO_QUEUES = {
  PROCESSING: 'video-processing',
  MAINTENANCE: 'video-maintenance',
} as const;

export const VIDEO_JOBS = {
  PROCESS_VIDEO: 'process-video',
  CLEANUP_ABANDONED_UPLOADS: 'cleanup-abandoned-uploads',
} as const;

export const ACCEPTED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
] as const;

/** 10 GiB */
export const MAX_VIDEO_SIZE_BYTES = 10 * 1024 ** 3;

export const MAX_UPLOAD_PARTS = 10_000;

export const VIDEO_STORAGE_KEYS = {
  source: (videoId: string): string => `videos/${videoId}/source`,
  video: (videoId: string): string => `videos/${videoId}/video.mp4`,
  thumbnail: (videoId: string): string => `videos/${videoId}/thumbnail.jpg`,
} as const;

export const PROCESS_VIDEO_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: 1000,
} as const;
