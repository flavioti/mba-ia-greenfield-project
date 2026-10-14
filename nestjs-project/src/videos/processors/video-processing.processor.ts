import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import videosConfig from '../../config/videos.config';
import { VideoProcessingService } from '../video-processing.service';
import type { ProcessVideoJobData } from '../videos.service';
import { VIDEO_JOBS, VIDEO_QUEUES } from '../videos.constants';

@Processor(VIDEO_QUEUES.PROCESSING)
export class VideoProcessingProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(VideoProcessingProcessor.name);

  constructor(
    private readonly videoProcessingService: VideoProcessingService,
    @Inject(videosConfig.KEY)
    private readonly config: ConfigType<typeof videosConfig>,
  ) {
    super();
  }

  /** FFmpeg is CPU-heavy: concurrency comes from VIDEO_WORKER_CONCURRENCY (default 1). */
  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.workerConcurrency;
  }

  async process(job: Job<ProcessVideoJobData>): Promise<void> {
    if (job.name !== VIDEO_JOBS.PROCESS_VIDEO) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return;
    }
    await this.videoProcessingService.process(job.data.videoId);
  }

  /** Only the last failed attempt marks the video as failed; earlier ones are retried with backoff. */
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<ProcessVideoJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    this.logger.error(
      `process-video ${job.data.videoId} attempt ${job.attemptsMade}/${maxAttempts} failed: ${error.message}`,
    );
    if (job.attemptsMade < maxAttempts) return;
    try {
      await this.videoProcessingService.markFailed(job.data.videoId, error);
    } catch (err) {
      // Background context: log instead of crashing the worker.
      this.logger.error(
        `Could not mark video ${job.data.videoId} as failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
