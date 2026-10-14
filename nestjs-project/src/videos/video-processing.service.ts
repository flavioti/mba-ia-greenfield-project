import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import {
  ProbeFailedException,
  TranscodeFailedException,
  VIDEO_PROCESSING_ERRORS,
  VideoPipelineException,
} from './exceptions/video-pipeline.exception';
import { VIDEO_STORAGE_KEYS } from './videos.constants';
import { spawnFfmpeg, spawnFfprobe } from './util/ffmpeg-spawn.util';
import type { Spawner } from './util/ffmpeg-spawn.util';
import {
  FFPROBE_ARGS,
  isBrowserSafe,
  parseFfprobeOutput,
  remuxArgs,
  thumbnailArgs,
  transcodeArgs,
} from './util/media-probe.util';
import type { MediaInfo } from './util/media-probe.util';

/** Injection token for the process spawner — unit tests swap in a fake. */
export const MEDIA_SPAWNER = Symbol('MEDIA_SPAWNER');

const PROBE_TIMEOUT_MS = 2 * 60 * 1000;
const TRANSCODE_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const THUMBNAIL_TIMEOUT_MS = 2 * 60 * 1000;
const STDERR_TAIL_CHARS = 500;

/** Videos in these states are (re)processable; others were cancelled or abandoned. */
const PROCESSABLE_STATUSES = [
  VideoProcessingStatus.PROCESSING,
  VideoProcessingStatus.READY,
];

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    @Inject(MEDIA_SPAWNER) private readonly spawner: Spawner,
  ) {}

  /**
   * Download → ffprobe → remux/transcode to MP4 faststart → thumbnail →
   * upload → `ready`. Idempotent: reprocessing overwrites the same keys.
   */
  async process(videoId: string): Promise<void> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId, processing_status: In(PROCESSABLE_STATUSES) },
    });
    if (!video) {
      this.logger.warn(
        `Skipping video ${videoId}: not found or not processable`,
      );
      return;
    }

    const workDir = await mkdtemp(join(tmpdir(), `video-${videoId}-`));
    try {
      const sourcePath = join(workDir, 'source');
      const videoPath = join(workDir, 'video.mp4');
      const thumbnailPath = join(workDir, 'thumbnail.jpg');

      await this.storageService.downloadToFile(video.source_key, sourcePath);
      const source = await this.probe(sourcePath);
      const mode = isBrowserSafe(source) ? 'remux' : 'transcode';
      this.logger.log(
        `Video ${videoId}: ${mode} (${source.formatName}, ${source.videoCodec}/${source.audioCodec ?? 'no audio'})`,
      );
      await this.runFfmpeg(
        mode === 'remux'
          ? remuxArgs(sourcePath, videoPath)
          : transcodeArgs(sourcePath, videoPath),
        TRANSCODE_TIMEOUT_MS,
      );

      const output = await this.probe(videoPath);
      await this.runFfmpeg(
        thumbnailArgs(videoPath, thumbnailPath, output.durationSeconds),
        THUMBNAIL_TIMEOUT_MS,
      );

      const videoKey = VIDEO_STORAGE_KEYS.video(videoId);
      const thumbnailKey = VIDEO_STORAGE_KEYS.thumbnail(videoId);
      await this.storageService.uploadFile(videoKey, videoPath, 'video/mp4');
      await this.storageService.uploadFile(
        thumbnailKey,
        thumbnailPath,
        'image/jpeg',
      );

      await this.videoRepository.update(
        { id: videoId },
        {
          processing_status: VideoProcessingStatus.READY,
          processing_error: null,
          video_key: videoKey,
          thumbnail_key: thumbnailKey,
          duration_seconds: output.durationSeconds,
          width: output.width,
          height: output.height,
          video_codec: output.videoCodec,
          audio_codec: output.audioCodec,
        },
      );
      this.logger.log(`Video ${videoId} ready`);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /** Final failure (retries exhausted): records the pipeline error code. */
  async markFailed(videoId: string, error: unknown): Promise<void> {
    const processingError =
      error instanceof VideoPipelineException
        ? error.processingError
        : VIDEO_PROCESSING_ERRORS.TRANSCODE_FAILED;
    await this.videoRepository.update(
      { id: videoId, processing_status: VideoProcessingStatus.PROCESSING },
      {
        processing_status: VideoProcessingStatus.FAILED,
        processing_error: processingError,
      },
    );
  }

  private async probe(filePath: string): Promise<MediaInfo> {
    const result = await spawnFfprobe([...FFPROBE_ARGS, filePath], {
      timeoutMs: PROBE_TIMEOUT_MS,
      spawner: this.spawner,
    });
    const info =
      result.exitCode === 0 ? parseFfprobeOutput(result.stdout) : null;
    if (!info) {
      throw new ProbeFailedException(
        result.exitCode === 0
          ? 'no video stream found'
          : result.stderr.slice(-STDERR_TAIL_CHARS),
      );
    }
    return info;
  }

  private async runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
    const result = await spawnFfmpeg(args, {
      timeoutMs,
      spawner: this.spawner,
    });
    if (result.exitCode !== 0) {
      throw new TranscodeFailedException(
        result.timedOut
          ? `timed out after ${timeoutMs} ms`
          : result.stderr.slice(-STDERR_TAIL_CHARS),
      );
    }
  }
}
