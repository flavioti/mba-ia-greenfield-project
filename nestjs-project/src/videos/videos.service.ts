import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QueryFailedError, Repository } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import {
  InvalidUploadPartsException,
  UploadNotInProgressException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import type { UploadedPart } from '../storage/storage.service';
import {
  InvalidMultipartPartsException,
  MultipartUploadNotFoundException,
} from '../storage/storage.exceptions';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { CreateVideoUploadResponseDto } from './dto/video-upload-responses.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import { VIDEO_PROCESSING_ERRORS } from './exceptions/video-pipeline.exception';
import {
  PROCESS_VIDEO_JOB_OPTIONS,
  VIDEO_JOBS,
  VIDEO_QUEUES,
  VIDEO_STORAGE_KEYS,
} from './videos.constants';
import { generateUniquePublicId } from './util/public-id.util';

const PG_UNIQUE_VIOLATION = '23505';
const MAX_PUBLIC_ID_INSERT_ATTEMPTS = 5;

export interface ProcessVideoJobData {
  videoId: string;
}

function isPublicIdUniqueViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driverError = err.driverError as { code?: string; detail?: string };
  return (
    driverError.code === PG_UNIQUE_VIOLATION &&
    typeof driverError.detail === 'string' &&
    driverError.detail.includes('public_id')
  );
}

/** Draft title = original file name without its extension (AMB-3). */
function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]+$/, '').trim();
  return withoutExtension.length > 0 ? withoutExtension : fileName;
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly channelsService: ChannelsService,
    private readonly storageService: StorageService,
    @InjectQueue(VIDEO_QUEUES.PROCESSING)
    private readonly processingQueue: Queue<ProcessVideoJobData>,
  ) {}

  /** Pre-registers the draft and opens the storage multipart upload (TD-02, TD-06). */
  async createDraft(
    userId: string,
    dto: CreateVideoUploadDto,
  ): Promise<CreateVideoUploadResponseDto> {
    const channel = await this.channelsService.findByUserId(userId);
    if (!channel) {
      throw new Error(`User ${userId} has no channel`);
    }

    const videoId = randomUUID();
    const sourceKey = VIDEO_STORAGE_KEYS.source(videoId);
    const { uploadId } = await this.storageService.createMultipartUpload(
      sourceKey,
      dto.mime_type,
    );

    try {
      await this.insertDraftWithUniquePublicId({
        id: videoId,
        channel_id: channel.id,
        title: titleFromFileName(dto.file_name),
        description: null,
        original_filename: dto.file_name,
        mime_type: dto.mime_type,
        size_bytes: dto.size_bytes,
        processing_status: VideoProcessingStatus.UPLOADING,
        source_key: sourceKey,
        upload_id: uploadId,
      });
    } catch (err) {
      // Compensation: don't leave an orphan multipart upload in the bucket.
      await this.storageService.abortMultipartUpload(sourceKey, uploadId);
      throw err;
    }

    return { videoId, uploadId, key: sourceKey };
  }

  async listUploadedParts(
    userId: string,
    videoId: string,
  ): Promise<UploadedPart[]> {
    const video = await this.findUploadingVideo(userId, videoId);
    try {
      return await this.storageService.listParts(
        video.source_key,
        video.upload_id,
      );
    } catch (err) {
      if (err instanceof MultipartUploadNotFoundException) {
        throw new UploadNotInProgressException();
      }
      throw err;
    }
  }

  async presignPartUrl(
    userId: string,
    videoId: string,
    partNumber: number,
  ): Promise<string> {
    const video = await this.findUploadingVideo(userId, videoId);
    return this.storageService.presignPartUrl(
      video.source_key,
      video.upload_id,
      partNumber,
    );
  }

  /** Completes the multipart upload and enqueues `process-video` (TD-04). */
  async completeUpload(
    userId: string,
    videoId: string,
    dto: CompleteVideoUploadDto,
  ): Promise<VideoResponseDto> {
    const video = await this.findUploadingVideo(userId, videoId);

    try {
      await this.storageService.completeMultipartUpload(
        video.source_key,
        video.upload_id,
        dto.parts,
      );
    } catch (err) {
      if (err instanceof InvalidMultipartPartsException) {
        throw new InvalidUploadPartsException();
      }
      if (err instanceof MultipartUploadNotFoundException) {
        throw new UploadNotInProgressException();
      }
      throw err;
    }

    await this.transitionFromUploading(videoId, {
      processing_status: VideoProcessingStatus.PROCESSING,
      upload_id: null,
    });
    await this.processingQueue.add(
      VIDEO_JOBS.PROCESS_VIDEO,
      { videoId },
      PROCESS_VIDEO_JOB_OPTIONS,
    );

    return this.findById(userId, videoId);
  }

  /** User cancel: aborts the multipart and fails the draft with UPLOAD_ABORTED. */
  async abortUpload(userId: string, videoId: string): Promise<void> {
    const video = await this.findUploadingVideo(userId, videoId);

    try {
      await this.storageService.abortMultipartUpload(
        video.source_key,
        video.upload_id,
      );
    } catch (err) {
      // Already gone in storage — the draft still has to reach `failed`.
      if (!(err instanceof MultipartUploadNotFoundException)) throw err;
    }

    await this.transitionFromUploading(videoId, {
      processing_status: VideoProcessingStatus.FAILED,
      processing_error: VIDEO_PROCESSING_ERRORS.UPLOAD_ABORTED,
      upload_id: null,
    });
  }

  async findById(userId: string, videoId: string): Promise<VideoResponseDto> {
    const video = await this.findOwnedVideo(userId, videoId);
    return this.toResponse(video);
  }

  /** Owner-scoped lookup; other channels' videos are indistinguishable from missing ones (AMB-2). */
  private async findOwnedVideo(
    userId: string,
    videoId: string,
  ): Promise<Video> {
    const video = await this.videoRepository
      .createQueryBuilder('video')
      .innerJoin('video.channel', 'channel')
      .where('video.id = :videoId', { videoId })
      .andWhere('channel.user_id = :userId', { userId })
      .getOne();
    if (!video) {
      throw new VideoNotFoundException();
    }
    return video;
  }

  private async findUploadingVideo(
    userId: string,
    videoId: string,
  ): Promise<Video & { upload_id: string }> {
    const video = await this.findOwnedVideo(userId, videoId);
    if (
      video.processing_status !== VideoProcessingStatus.UPLOADING ||
      !video.upload_id
    ) {
      throw new UploadNotInProgressException();
    }
    return video as Video & { upload_id: string };
  }

  /**
   * Conditional update guarded on `uploading`, so a concurrent cancel,
   * complete or abandoned-upload cleanup cannot both win.
   */
  private async transitionFromUploading(
    videoId: string,
    changes: Partial<Video>,
  ): Promise<void> {
    const result = await this.videoRepository
      .createQueryBuilder()
      .update(Video)
      .set(changes)
      .where('id = :videoId', { videoId })
      .andWhere('processing_status = :uploading', {
        uploading: VideoProcessingStatus.UPLOADING,
      })
      .execute();
    if (result.affected === 0) {
      throw new UploadNotInProgressException();
    }
  }

  private async insertDraftWithUniquePublicId(
    draft: Partial<Video>,
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      const publicId = await generateUniquePublicId((candidate) =>
        this.videoRepository.exists({ where: { public_id: candidate } }),
      );
      try {
        await this.videoRepository.insert({ ...draft, public_id: publicId });
        return;
      } catch (err) {
        // A concurrent insert took the id between the check and the insert.
        if (
          !isPublicIdUniqueViolation(err) ||
          attempt >= MAX_PUBLIC_ID_INSERT_ATTEMPTS
        ) {
          throw err;
        }
      }
    }
  }

  private async toResponse(video: Video): Promise<VideoResponseDto> {
    const ready = video.processing_status === VideoProcessingStatus.READY;
    const videoKey = ready ? video.video_key : null;

    return {
      id: video.id,
      public_id: video.public_id,
      title: video.title,
      description: video.description,
      original_filename: video.original_filename,
      status: video.status,
      processing_status: video.processing_status,
      processing_error: video.processing_error,
      duration_seconds: video.duration_seconds,
      width: video.width,
      height: video.height,
      video_url: videoKey
        ? await this.storageService.presignGetVideoUrl(videoKey)
        : null,
      thumbnail_url: video.thumbnail_key
        ? await this.storageService.presignGetThumbnailUrl(video.thumbnail_key)
        : null,
      download_url: videoKey
        ? await this.storageService.presignGetDownloadUrl(
            videoKey,
            `${video.title}.mp4`,
          )
        : null,
      created_at: video.created_at.toISOString(),
    };
  }
}
