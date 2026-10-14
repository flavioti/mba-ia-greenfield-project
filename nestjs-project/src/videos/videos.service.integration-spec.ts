import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import {
  UploadNotInProgressException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { InfrastructureModule } from '../infrastructure.module';
import { StorageService } from '../storage/storage.service';
import { setupStorage } from '../storage/storage-setup';
import { cleanAllTables } from '../test/create-test-data-source';
import { applyVideoTestEnv } from '../test/video-test-env';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import { VIDEO_JOBS, VIDEO_QUEUES } from './videos.constants';
import { VideosModule } from './videos.module';
import { VideosService } from './videos.service';
import type { ProcessVideoJobData } from './videos.service';

describe('VideosService (integration)', () => {
  let module: TestingModule;
  let service: VideosService;
  let storage: StorageService;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let queue: Queue<ProcessVideoJobData>;

  beforeAll(async () => {
    applyVideoTestEnv();
    module = await Test.createTestingModule({
      imports: [InfrastructureModule, UsersModule, VideosModule],
    }).compile();
    await module.init();
    service = module.get(VideosService);
    storage = module.get(StorageService);
    dataSource = module.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
    queue = module.get<Queue<ProcessVideoJobData>>(
      getQueueToken(VIDEO_QUEUES.PROCESSING),
    );
    await setupStorage();
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await module.close();
  });

  let counter = 0;
  async function createOwner(): Promise<User> {
    const n = ++counter;
    const user = await dataSource.getRepository(User).save({
      email: `videos_svc_${n}@example.com`,
      password: 'hashed',
    });
    await dataSource.getRepository(Channel).save({
      name: `vsvc${n}`,
      nickname: `videos_svc_${n}`,
      user_id: user.id,
    });
    return user;
  }

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    await queue.obliterate({ force: true });
  });

  const dto = {
    file_name: 'holiday.mp4',
    mime_type: 'video/mp4',
    size_bytes: 5,
  };

  it('should persist an uploading draft with a unique public_id and an open multipart upload', async () => {
    const owner = await createOwner();

    const { videoId, uploadId, key } = await service.createDraft(owner.id, dto);

    const row = await videoRepository.findOneByOrFail({ id: videoId });
    expect(row).toMatchObject({
      title: 'holiday',
      processing_status: VideoProcessingStatus.UPLOADING,
      upload_id: uploadId,
      source_key: key,
    });
    expect(row.public_id).toMatch(/^[0-9A-Za-z]{11}$/);
    await expect(storage.listParts(key, uploadId)).resolves.toEqual([]);
  });

  it('should complete an uploaded multipart, switch to processing and enqueue process-video', async () => {
    const owner = await createOwner();
    const { videoId } = await service.createDraft(owner.id, dto);
    const url = await service.presignPartUrl(owner.id, videoId, 1);
    const put = await fetch(url, { method: 'PUT', body: 'hello' });
    const etag = put.headers.get('etag')!;

    const video = await service.completeUpload(owner.id, videoId, {
      parts: [{ PartNumber: 1, ETag: etag }],
    });

    expect(video.processing_status).toBe(VideoProcessingStatus.PROCESSING);
    const row = await videoRepository.findOneByOrFail({ id: videoId });
    expect(row.upload_id).toBeNull();
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);
    expect(
      jobs.map((j): [string, ProcessVideoJobData] => [j.name, j.data]),
    ).toEqual([[VIDEO_JOBS.PROCESS_VIDEO, { videoId }]]);
  });

  it('should fail the draft with UPLOAD_ABORTED and abort the multipart on cancel', async () => {
    const owner = await createOwner();
    const { videoId, uploadId, key } = await service.createDraft(owner.id, dto);

    await service.abortUpload(owner.id, videoId);

    const row = await videoRepository.findOneByOrFail({ id: videoId });
    expect(row).toMatchObject({
      processing_status: VideoProcessingStatus.FAILED,
      processing_error: 'UPLOAD_ABORTED',
      upload_id: null,
    });
    await expect(storage.listParts(key, uploadId)).rejects.toThrow();
    await expect(service.abortUpload(owner.id, videoId)).rejects.toBeInstanceOf(
      UploadNotInProgressException,
    );
  });

  it("should hide another channel's video as not found", async () => {
    const owner = await createOwner();
    const stranger = await createOwner();
    const { videoId } = await service.createDraft(owner.id, dto);

    await expect(service.findById(stranger.id, videoId)).rejects.toBeInstanceOf(
      VideoNotFoundException,
    );
  });
});
