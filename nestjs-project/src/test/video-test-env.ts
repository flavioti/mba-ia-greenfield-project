/**
 * Env overrides for suites that touch the video queues or presigned URLs.
 * Call before compiling the Nest testing module.
 */
export function applyVideoTestEnv(): void {
  // Keep test jobs away from the dev `video-worker` container.
  process.env.REDIS_QUEUE_PREFIX = 'streamtube-test';
  // Presigned URLs are fetched from inside the compose network in tests.
  process.env.STORAGE_PUBLIC_ENDPOINT = process.env.STORAGE_ENDPOINT;
}
