import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { AbandonedUploadCleanupService } from '../abandoned-upload-cleanup.service';
import { VIDEO_JOBS, VIDEO_QUEUES } from '../videos.constants';

export const ABANDONED_UPLOAD_CLEANUP_SCHEDULER_ID = 'abandoned-upload-cleanup';
/** Every hour, at minute 0 (6-field cron with seconds). */
export const ABANDONED_UPLOAD_CLEANUP_PATTERN = '0 0 * * * *';

@Processor(VIDEO_QUEUES.MAINTENANCE)
export class AbandonedUploadCleanupProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(AbandonedUploadCleanupProcessor.name);

  constructor(
    private readonly cleanupService: AbandonedUploadCleanupService,
    @InjectQueue(VIDEO_QUEUES.MAINTENANCE)
    private readonly maintenanceQueue: Queue,
  ) {
    super();
  }

  /** Worker-only (this processor is not registered in the API). Upsert is idempotent per scheduler id. */
  async onApplicationBootstrap(): Promise<void> {
    await this.maintenanceQueue.upsertJobScheduler(
      ABANDONED_UPLOAD_CLEANUP_SCHEDULER_ID,
      { pattern: ABANDONED_UPLOAD_CLEANUP_PATTERN },
      {
        name: VIDEO_JOBS.CLEANUP_ABANDONED_UPLOADS,
        data: {},
        opts: { attempts: 3, removeOnComplete: true, removeOnFail: 100 },
      },
    );
  }

  async process(job: Job): Promise<number> {
    if (job.name !== VIDEO_JOBS.CLEANUP_ABANDONED_UPLOADS) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return 0;
    }
    return this.cleanupService.cleanup();
  }
}
