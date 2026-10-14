import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { ChildProcess } from 'child_process';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import videosConfig from '../../config/videos.config';
import { StorageService } from '../../storage/storage.service';
import { Video, VideoProcessingStatus } from '../entities/video.entity';
import { ProbeFailedException } from '../exceptions/video-pipeline.exception';
import type { Spawner } from '../util/ffmpeg-spawn.util';
import {
  MEDIA_SPAWNER,
  VideoProcessingService,
} from '../video-processing.service';
import { VIDEO_JOBS } from '../videos.constants';
import type { ProcessVideoJobData } from '../videos.service';
import { VideoProcessingProcessor } from './video-processing.processor';

const VIDEO_ID = '0b5a3d8e-3f7e-4c7a-9a39-1f4f3b0c2d11';

interface FakeRun {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

function probeJson(
  formatName: string,
  videoCodec: string,
  audioCodec: string | null,
): string {
  const streams: Record<string, unknown>[] = [
    { codec_type: 'video', codec_name: videoCodec, width: 1920, height: 1080 },
  ];
  if (audioCodec) streams.push({ codec_type: 'audio', codec_name: audioCodec });
  return JSON.stringify({
    format: { format_name: formatName, duration: '42.5' },
    streams,
  });
}

/** Scripted spawner: each call pops the next run for that binary. */
function scriptedSpawner(runs: Record<'ffprobe' | 'ffmpeg', FakeRun[]>): {
  spawner: Spawner;
  calls: { command: string; args: readonly string[] }[];
} {
  const calls: { command: string; args: readonly string[] }[] = [];
  const spawner: Spawner = (command, args) => {
    calls.push({ command, args });
    const run = runs[command as 'ffprobe' | 'ffmpeg'].shift() ?? {
      exitCode: 0,
    };
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn(),
    });
    setImmediate(() => {
      if (run.stdout) child.stdout.write(run.stdout);
      if (run.stderr) child.stderr.write(run.stderr);
      child.emit('close', run.exitCode);
    });
    return child as unknown as ChildProcess;
  };
  return { spawner, calls };
}

function makeJob(attemptsMade: number, attempts = 3): Job<ProcessVideoJobData> {
  return {
    name: VIDEO_JOBS.PROCESS_VIDEO,
    data: { videoId: VIDEO_ID },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<ProcessVideoJobData>;
}

describe('VideoProcessingProcessor', () => {
  const repository = { findOne: jest.fn(), update: jest.fn() };
  const storage = { downloadToFile: jest.fn(), uploadFile: jest.fn() };

  async function build(spawner: Spawner): Promise<{
    processor: VideoProcessingProcessor;
    service: VideoProcessingService;
  }> {
    const module = await Test.createTestingModule({
      providers: [
        VideoProcessingProcessor,
        VideoProcessingService,
        { provide: getRepositoryToken(Video), useValue: repository },
        { provide: StorageService, useValue: storage },
        { provide: MEDIA_SPAWNER, useValue: spawner },
        {
          provide: videosConfig.KEY,
          useValue: { workerConcurrency: 1, uploadAbandonAfterHours: 24 },
        },
      ],
    }).compile();
    return {
      processor: module.get(VideoProcessingProcessor),
      service: module.get(VideoProcessingService),
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findOne.mockResolvedValue(
      Object.assign(new Video(), {
        id: VIDEO_ID,
        source_key: `videos/${VIDEO_ID}/source`,
        processing_status: VideoProcessingStatus.PROCESSING,
      }),
    );
  });

  it('should remux an H.264/AAC MP4 with stream copy and mark it ready with metadata', async () => {
    const { spawner, calls } = scriptedSpawner({
      ffprobe: [
        {
          exitCode: 0,
          stdout: probeJson('mov,mp4,m4a,3gp,3g2,mj2', 'h264', 'aac'),
        },
        {
          exitCode: 0,
          stdout: probeJson('mov,mp4,m4a,3gp,3g2,mj2', 'h264', 'aac'),
        },
      ],
      ffmpeg: [],
    });
    const { processor } = await build(spawner);

    await processor.process(makeJob(0));

    const ffmpegCalls = calls.filter((c) => c.command === 'ffmpeg');
    expect(ffmpegCalls[0].args).toEqual(
      expect.arrayContaining(['-c', 'copy', '-movflags', '+faststart']),
    );
    expect(ffmpegCalls[1].args).toEqual(
      expect.arrayContaining(['-ss', '4.250', '-frames:v', '1']),
    );
    expect(storage.uploadFile).toHaveBeenCalledWith(
      `videos/${VIDEO_ID}/video.mp4`,
      expect.stringContaining('video.mp4'),
      'video/mp4',
    );
    expect(repository.update).toHaveBeenCalledWith(
      { id: VIDEO_ID },
      expect.objectContaining({
        processing_status: VideoProcessingStatus.READY,
        video_key: `videos/${VIDEO_ID}/video.mp4`,
        thumbnail_key: `videos/${VIDEO_ID}/thumbnail.jpg`,
        duration_seconds: 42.5,
        width: 1920,
        height: 1080,
        video_codec: 'h264',
        audio_codec: 'aac',
      }),
    );
  });

  it('should transcode a non browser-safe video (VP9/Opus WebM) to H.264/AAC', async () => {
    const { spawner, calls } = scriptedSpawner({
      ffprobe: [
        { exitCode: 0, stdout: probeJson('matroska,webm', 'vp9', 'opus') },
        {
          exitCode: 0,
          stdout: probeJson('mov,mp4,m4a,3gp,3g2,mj2', 'h264', 'aac'),
        },
      ],
      ffmpeg: [],
    });
    const { processor } = await build(spawner);

    await processor.process(makeJob(0));

    const transcode = calls.find((c) => c.command === 'ffmpeg')!;
    expect(transcode.args).toEqual(
      expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac', '+faststart']),
    );
  });

  it('should throw ProbeFailedException and not mark ready when ffprobe fails', async () => {
    const { spawner } = scriptedSpawner({
      ffprobe: [
        { exitCode: 1, stderr: 'Invalid data found when processing input' },
      ],
      ffmpeg: [],
    });
    const { processor } = await build(spawner);

    await expect(processor.process(makeJob(0))).rejects.toBeInstanceOf(
      ProbeFailedException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('should treat a file without a video stream as a probe failure', async () => {
    const { spawner } = scriptedSpawner({
      ffprobe: [
        {
          exitCode: 0,
          stdout: JSON.stringify({
            format: { format_name: 'mp3' },
            streams: [{ codec_type: 'audio', codec_name: 'mp3' }],
          }),
        },
      ],
      ffmpeg: [],
    });
    const { processor } = await build(spawner);

    await expect(processor.process(makeJob(0))).rejects.toBeInstanceOf(
      ProbeFailedException,
    );
  });

  it('should skip videos that are no longer processable (e.g. cancelled)', async () => {
    repository.findOne.mockResolvedValue(null);
    const { spawner, calls } = scriptedSpawner({ ffprobe: [], ffmpeg: [] });
    const { processor } = await build(spawner);

    await processor.process(makeJob(0));

    expect(calls).toHaveLength(0);
    expect(storage.downloadToFile).not.toHaveBeenCalled();
  });

  describe('onFailed', () => {
    it('should not mark the video failed while retries remain', async () => {
      const { spawner } = scriptedSpawner({ ffprobe: [], ffmpeg: [] });
      const { processor } = await build(spawner);

      await processor.onFailed(makeJob(2), new ProbeFailedException('x'));

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should mark the video failed with the pipeline error code after the last attempt', async () => {
      const { spawner } = scriptedSpawner({ ffprobe: [], ffmpeg: [] });
      const { processor } = await build(spawner);

      await processor.onFailed(makeJob(3), new ProbeFailedException('x'));

      expect(repository.update).toHaveBeenCalledWith(
        { id: VIDEO_ID, processing_status: VideoProcessingStatus.PROCESSING },
        {
          processing_status: VideoProcessingStatus.FAILED,
          processing_error: 'PROBE_FAILED',
        },
      );
    });

    it('should fall back to TRANSCODE_FAILED for unexpected errors', async () => {
      const { spawner } = scriptedSpawner({ ffprobe: [], ffmpeg: [] });
      const { processor } = await build(spawner);

      await processor.onFailed(makeJob(3), new Error('disk full'));

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ processing_error: 'TRANSCODE_FAILED' }),
      );
    });
  });
});
