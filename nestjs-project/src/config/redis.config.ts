import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  /** BullMQ key prefix — tests use their own so the dev worker never consumes test jobs. */
  queuePrefix: process.env.REDIS_QUEUE_PREFIX || 'bull',
}));
