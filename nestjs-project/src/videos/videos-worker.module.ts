import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../storage/storage.module';
import { Video } from './entities/video.entity';
import { AbandonedUploadCleanupService } from './abandoned-upload-cleanup.service';
import { AbandonedUploadCleanupProcessor } from './processors/abandoned-upload-cleanup.processor';
import { VideoProcessingProcessor } from './processors/video-processing.processor';
import {
  MEDIA_SPAWNER,
  VideoProcessingService,
} from './video-processing.service';
import { VIDEO_QUEUES } from './videos.constants';
import { defaultSpawner } from './util/ffmpeg-spawn.util';

/**
 * Consumer side of the video queues. Imported only by `WorkerModule`, so the
 * API process never runs FFmpeg jobs.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Video]),
    StorageModule,
    BullModule.registerQueue(
      { name: VIDEO_QUEUES.PROCESSING },
      { name: VIDEO_QUEUES.MAINTENANCE },
    ),
  ],
  providers: [
    { provide: MEDIA_SPAWNER, useValue: defaultSpawner },
    VideoProcessingService,
    VideoProcessingProcessor,
    AbandonedUploadCleanupService,
    AbandonedUploadCleanupProcessor,
  ],
})
export class VideosWorkerModule {}
