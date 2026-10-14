import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import storageConfig from '../config/storage.config';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';
import {
  STORAGE_PRESIGN_S3_CLIENT,
  STORAGE_S3_CLIENT,
} from './storage.constants';

describe('StorageModule', () => {
  it('should compile and provide StorageService with internal and presign S3 clients', async () => {
    process.env.STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY || 'ak';
    process.env.STORAGE_SECRET_KEY = process.env.STORAGE_SECRET_KEY || 'sk';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [storageConfig],
        }),
        StorageModule,
      ],
    }).compile();

    const internal = module.get<S3Client>(STORAGE_S3_CLIENT);
    const presign = module.get<S3Client>(STORAGE_PRESIGN_S3_CLIENT);

    expect(internal).toBeInstanceOf(S3Client);
    expect(presign).toBeInstanceOf(S3Client);
    expect(internal.config.forcePathStyle).toBe(true);
    expect(presign).not.toBe(internal);
    expect(module.get(StorageService)).toBeInstanceOf(StorageService);
    await module.close();
  });
});
