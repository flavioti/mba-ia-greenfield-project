import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import storageConfig from '../config/storage.config';
import { StorageService } from './storage.service';
import {
  STORAGE_PRESIGN_S3_CLIENT,
  STORAGE_S3_CLIENT,
} from './storage.constants';

function buildS3Client(
  cfg: ConfigType<typeof storageConfig>,
  endpoint: string,
): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint,
    forcePathStyle: cfg.forcePathStyle,
    // The SDK's default flexible checksums would sign a CRC32 of the empty
    // presign body into UploadPart URLs, making every browser PUT fail.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

@Module({
  providers: [
    {
      provide: STORAGE_S3_CLIENT,
      inject: [storageConfig.KEY],
      useFactory: (cfg: ConfigType<typeof storageConfig>): S3Client =>
        buildS3Client(cfg, cfg.endpoint),
    },
    {
      provide: STORAGE_PRESIGN_S3_CLIENT,
      inject: [storageConfig.KEY],
      useFactory: (cfg: ConfigType<typeof storageConfig>): S3Client =>
        buildS3Client(cfg, cfg.publicEndpoint),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
