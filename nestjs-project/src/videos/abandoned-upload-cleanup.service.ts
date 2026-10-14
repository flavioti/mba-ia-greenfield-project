import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import videosConfig from '../config/videos.config';
import { StorageService } from '../storage/storage.service';
import { MultipartUploadNotFoundException } from '../storage/storage.exceptions';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import { VIDEO_PROCESSING_ERRORS } from './exceptions/video-pipeline.exception';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class AbandonedUploadCleanupService {
  private readonly logger = new Logger(AbandonedUploadCleanupService.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    @Inject(videosConfig.KEY)
    private readonly config: ConfigType<typeof videosConfig>,
  ) {}

  /**
   * Aborts multipart uploads of drafts stuck in `uploading` for longer than
   * UPLOAD_ABANDON_AFTER_HOURS and fails them with UPLOAD_ABANDONED (TD-12).
   * Idempotent: only rows still `uploading` are touched.
   * @returns how many drafts were marked abandoned
   */
  async cleanup(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.config.uploadAbandonAfterHours * HOUR_MS,
    );
    const candidates = await this.videoRepository.find({
      where: {
        processing_status: VideoProcessingStatus.UPLOADING,
        created_at: LessThan(cutoff),
      },
    });

    let abandoned = 0;
    for (const video of candidates) {
      if (video.upload_id) {
        try {
          await this.storageService.abortMultipartUpload(
            video.source_key,
            video.upload_id,
          );
        } catch (err) {
          if (!(err instanceof MultipartUploadNotFoundException)) throw err;
        }
      }
      const result = await this.videoRepository.update(
        { id: video.id, processing_status: VideoProcessingStatus.UPLOADING },
        {
          processing_status: VideoProcessingStatus.FAILED,
          processing_error: VIDEO_PROCESSING_ERRORS.UPLOAD_ABANDONED,
          upload_id: null,
        },
      );
      abandoned += result.affected ?? 0;
    }

    if (abandoned > 0) {
      this.logger.log(`Marked ${abandoned} abandoned upload(s) as failed`);
    }
    return abandoned;
  }
}
