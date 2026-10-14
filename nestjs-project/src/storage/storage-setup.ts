import 'dotenv/config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import storageConfig from '../config/storage.config';

/**
 * Idempotent bucket bootstrap: creates the private bucket and the CORS rules
 * the browser needs to PUT multipart parts directly (ETag must be exposed).
 */
export async function setupStorage(
  cfg = storageConfig(),
  client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  }),
): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: cfg.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: cfg.corsAllowedOrigins,
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}

if (require.main === module) {
  setupStorage()
    .then(() => console.log('Storage bucket ready'))
    .catch((err: unknown) => {
      console.error('Storage setup failed', err);
      process.exit(1);
    });
}
