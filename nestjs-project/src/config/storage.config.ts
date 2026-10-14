import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT || 'http://seaweedfs:8333',
  publicEndpoint:
    process.env.STORAGE_PUBLIC_ENDPOINT || 'http://localhost:8333',
  corsAllowedOrigins: (
    process.env.STORAGE_CORS_ALLOWED_ORIGINS || 'http://localhost:3001'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  bucket: process.env.STORAGE_BUCKET || 'streamtube',
  accessKeyId: process.env.STORAGE_ACCESS_KEY || 'streamtube',
  secretAccessKey: process.env.STORAGE_SECRET_KEY || 'streamtube',
  region: process.env.STORAGE_REGION || 'us-east-1',
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== 'false',
  presignTtlSeconds: parseInt(
    process.env.STORAGE_PRESIGN_TTL_SECONDS || '3600',
    10,
  ),
}));
