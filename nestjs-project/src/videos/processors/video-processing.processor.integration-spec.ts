import { randomUUID } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { InfrastructureModule } from '../../infrastructure.module';
import { StorageService } from '../../storage/storage.service';
import { setupStorage } from '../../storage/storage-setup';
import { cleanAllTables } from '../../test/create-test-data-source';
import { applyVideoTestEnv } from '../../test/video-test-env';
import { User } from '../../users/entities/user.entity';
import { UsersModule } from '../../users/users.module';
import { Video, VideoProcessingStatus } from '../entities/video.entity';
import { ProbeFailedException } from '../exceptions/video-pipeline.exception';
import { spawnFfmpeg } from '../util/ffmpeg-spawn.util';
import { VideosWorkerModule } from '../videos-worker.module';
import { VIDEO_JOBS, VIDEO_STORAGE_KEYS } from '../videos.constants';
import type { ProcessVideoJobData } from '../videos.service';
import { VideoProcessingProcessor } from './video-processing.processor';

const LAVFI_SOURCES = [
  '-f',
  'lavfi',
  '-i',
  'testsrc=duration=2:size=320x240:rate=25',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=2',
  '-shortest',
];

async function generateFixture(
  output: string,
  codecArgs: string[],
): Promise<void> {
  const result = await spawnFfmpeg([
    '-y',
    ...LAVFI_SOURCES,
    ...codecArgs,
    output,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`fixture generation failed: ${result.stderr.slice(-500)}`);
  }
}

describe('VideoProcessingProcessor (integration — FFmpeg + SeaweedFS + DB)', () => {
  let module: TestingModule;
  let processor: VideoProcessingProcessor;
  let storage: StorageService;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let fixturesDir: string;
  let mp4Fixture: string;
  let webmFixture: string;
  let garbageFixture: string;

  beforeAll(async () => {
    applyVideoTestEnv();
    fixturesDir = await mkdtemp(join(tmpdir(), 'video-fixtures-'));
    mp4Fixture = join(fixturesDir, 'h264-aac.mp4');
    webmFixture = join(fixturesDir, 'vp9-opus.webm');
    garbageFixture = join(fixturesDir, 'not-a-video.mp4');
    await generateFixture(mp4Fixture, [
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
    ]);
    await generateFixture(webmFixture, [
      '-c:v',
      'libvpx-vp9',
      '-deadline',
      'realtime',
      '-cpu-used',
      '8',
      '-c:a',
      'libopus',
    ]);
    await writeFile(garbageFixture, 'definitely not a video container');

    module = await Test.createTestingModule({
      imports: [InfrastructureModule, UsersModule, VideosWorkerModule],
    }).compile();
    processor = module.get(VideoProcessingProcessor);
    storage = module.get(StorageService);
    dataSource = module.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
    await setupStorage();
  }, 60000);

  afterAll(async () => {
    await rm(fixturesDir, { recursive: true, force: true });
    await module.close();
  });

  let counter = 0;
  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  /** Inserts a `processing` video whose source object is the given fixture. */
  async function seedProcessingVideo(fixture: string): Promise<string> {
    const n = ++counter;
    const user = await dataSource.getRepository(User).save({
      email: `processor_${n}@example.com`,
      password: 'hashed',
    });
    const channel = await dataSource.getRepository(Channel).save({
      name: `proc${n}`,
      nickname: `processor_${n}`,
      user_id: user.id,
    });
    const id = randomUUID();
    await storage.uploadFile(
      VIDEO_STORAGE_KEYS.source(id),
      fixture,
      'video/mp4',
    );
    await videoRepository.insert({
      id,
      public_id: `proc${String(n).padStart(7, '0')}`,
      channel_id: channel.id,
      title: 'fixture',
      original_filename: 'fixture.mp4',
      mime_type: 'video/mp4',
      size_bytes: 1,
      processing_status: VideoProcessingStatus.PROCESSING,
      source_key: VIDEO_STORAGE_KEYS.source(id),
    });
    return id;
  }

  const job = (videoId: string, attemptsMade = 0): Job<ProcessVideoJobData> =>
    ({
      name: VIDEO_JOBS.PROCESS_VIDEO,
      data: { videoId },
      attemptsMade,
      opts: { attempts: 3 },
    }) as unknown as Job<ProcessVideoJobData>;

  it('should remux a compatible MP4, generate the thumbnail and stream it via Range', async () => {
    const videoId = await seedProcessingVideo(mp4Fixture);

    await processor.process(job(videoId));

    const row = await videoRepository.findOneByOrFail({ id: videoId });
    expect(row).toMatchObject({
      processing_status: VideoProcessingStatus.READY,
      processing_error: null,
      video_key: VIDEO_STORAGE_KEYS.video(videoId),
      thumbnail_key: VIDEO_STORAGE_KEYS.thumbnail(videoId),
      width: 320,
      height: 240,
      video_codec: 'h264',
      audio_codec: 'aac',
    });
    expect(row.duration_seconds).toBeCloseTo(2, 0);

    const ranged = await fetch(
      await storage.presignGetVideoUrl(row.video_key!),
      {
        headers: { Range: 'bytes=0-1023' },
      },
    );
    expect(ranged.status).toBe(206);
    const thumb = await fetch(
      await storage.presignGetThumbnailUrl(row.thumbnail_key!),
    );
    expect(thumb.headers.get('content-type')).toBe('image/jpeg');
  }, 60000);

  it('should transcode a VP9/Opus WebM into H.264/AAC MP4', async () => {
    const videoId = await seedProcessingVideo(webmFixture);

    await processor.process(job(videoId));

    const row = await videoRepository.findOneByOrFail({ id: videoId });
    expect(row).toMatchObject({
      processing_status: VideoProcessingStatus.READY,
      video_codec: 'h264',
      audio_codec: 'aac',
    });
  }, 60000);

  it('should be idempotent: reprocessing overwrites the same keys', async () => {
    const videoId = await seedProcessingVideo(mp4Fixture);
    await processor.process(job(videoId));

    await processor.process(job(videoId));

    const row = await videoRepository.findOneByOrFail({ id: videoId });
    expect(row.processing_status).toBe(VideoProcessingStatus.READY);
    expect(row.video_key).toBe(VIDEO_STORAGE_KEYS.video(videoId));
  }, 60000);

  it('should fail with PROBE_FAILED once the last attempt fails on an unreadable file', async () => {
    const videoId = await seedProcessingVideo(garbageFixture);

    const error = await processor
      .process(job(videoId))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProbeFailedException);
    await processor.onFailed(job(videoId, 3), error as Error);

    const row = await videoRepository.findOneByOrFail({ id: videoId });
    expect(row).toMatchObject({
      processing_status: VideoProcessingStatus.FAILED,
      processing_error: 'PROBE_FAILED',
    });
  }, 60000);
});
