import { registerAs } from '@nestjs/config';

export default registerAs('videos', () => ({
  workerConcurrency: parseInt(process.env.VIDEO_WORKER_CONCURRENCY || '1', 10),
  uploadAbandonAfterHours: parseInt(
    process.env.UPLOAD_ABANDON_AFTER_HOURS || '24',
    10,
  ),
  publicBaseUrl: process.env.VIDEO_PUBLIC_BASE_URL || 'http://localhost:3001',
}));
