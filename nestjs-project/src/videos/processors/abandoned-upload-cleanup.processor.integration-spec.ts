import { randomUUID } from 'crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { InfrastructureModule } from '../../infrastructure.module';
import { StorageService } from '../../storage/storage.service';
import { MultipartUploadNotFoundException } from '../../storage/storage.exceptions';
import { setupStorage } from '../../storage/storage-setup';
import { cleanAllTables } from '../../test/create-test-data-source';
import { applyVideoTestEnv } from '../../test/video-test-env';
import { User } from '../../users/entities/user.entity';
import { UsersModule } from '../../users/users.module';
import { Video, VideoProcessingStatus } from '../entities/video.entity';
import { VideosWorkerModule } from '../videos-worker.module';
import {
  VIDEO_JOBS,
  VIDEO_QUEUES,
  VIDEO_STORAGE_KEYS,
} from '../videos.constants';
import {
  ABANDONED_UPLOAD_CLEANUP_PATTERN,
  ABANDONED_UPLOAD_CLEANUP_SCHEDULER_ID,
  AbandonedUploadCleanupProcessor,
} from './abandoned-upload-cleanup.processor';

describe('AbandonedUploadCleanupProcessor (integration — DB + storage)', () => {
  let module: TestingModule;
  let processor: AbandonedUploadCleanupProcessor;
  let storage: StorageService;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let maintenanceQueue: Queue;
  let channel: Channel;

  beforeAll(async () => {
    applyVideoTestEnv();
    module = await Test.createTestingModule({
      imports: [InfrastructureModule, UsersModule, VideosWorkerModule],
    }).compile();
    await module.init();
    processor = module.get(AbandonedUploadCleanupProcessor);
    storage = module.get(StorageService);
    dataSource = module.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
    maintenanceQueue = module.get<Queue>(
      getQueueToken(VIDEO_QUEUES.MAINTENANCE),
    );
    await setupStorage();
  });

  afterAll(async () => {
    await maintenanceQueue.obliterate({ force: true });
    await module.close();
  });

  let counter = 0;
  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const n = ++counter;
    const user = await dataSource.getRepository(User).save({
      email: `cleanup_${n}@example.com`,
      password: 'hashed',
    });
    channel = await dataSource.getRepository(Channel).save({
      name: `clean${n}`,
      nickname: `cleanup_${n}`,
      user_id: user.id,
    });
  });

  /** Draft in `uploading` with a real open multipart upload, created `ageHours` ago. */
  async function seedUploading(
    ageHours: number,
  ): Promise<{ id: string; key: string; uploadId: string }> {
    const id = randomUUID();
    const key = VIDEO_STORAGE_KEYS.source(id);
    const { uploadId } = await storage.createMultipartUpload(key, 'video/mp4');
    await videoRepository.insert({
      id,
      public_id: `cln${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      channel_id: channel.id,
      title: 'draft',
      original_filename: 'draft.mp4',
      mime_type: 'video/mp4',
      size_bytes: 1,
      source_key: key,
      upload_id: uploadId,
    });
    await dataSource.query(
      `UPDATE "videos" SET "created_at" = now() - ($2 || ' hours')::interval WHERE id = $1`,
      [id, String(ageHours)],
    );
    return { id, key, uploadId };
  }

  const cleanupJob = {
    name: VIDEO_JOBS.CLEANUP_ABANDONED_UPLOADS,
    data: {},
  } as Job;

  it('should register the hourly job scheduler on worker bootstrap', async () => {
    const schedulers = await maintenanceQueue.getJobSchedulers();

    expect(schedulers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: ABANDONED_UPLOAD_CLEANUP_SCHEDULER_ID,
          pattern: ABANDONED_UPLOAD_CLEANUP_PATTERN,
        }),
      ]),
    );
  });

  it('should abort and fail drafts stuck in uploading beyond the window', async () => {
    const stale = await seedUploading(25);

    const abandoned = await processor.process(cleanupJob);

    expect(abandoned).toBe(1);
    const row = await videoRepository.findOneByOrFail({ id: stale.id });
    expect(row).toMatchObject({
      processing_status: VideoProcessingStatus.FAILED,
      processing_error: 'UPLOAD_ABANDONED',
      upload_id: null,
    });
    await expect(
      storage.listParts(stale.key, stale.uploadId),
    ).rejects.toBeInstanceOf(MultipartUploadNotFoundException);
  });

  it('should leave recent uploads untouched', async () => {
    const recent = await seedUploading(1);

    const abandoned = await processor.process(cleanupJob);

    expect(abandoned).toBe(0);
    const row = await videoRepository.findOneByOrFail({ id: recent.id });
    expect(row.processing_status).toBe(VideoProcessingStatus.UPLOADING);
    await expect(
      storage.listParts(recent.key, recent.uploadId),
    ).resolves.toEqual([]);
    await storage.abortMultipartUpload(recent.key, recent.uploadId);
  });

  it('should be idempotent when the multipart upload is already gone', async () => {
    const stale = await seedUploading(48);
    await storage.abortMultipartUpload(stale.key, stale.uploadId);

    await expect(processor.process(cleanupJob)).resolves.toBe(1);
    await expect(processor.process(cleanupJob)).resolves.toBe(0);
  });
});
