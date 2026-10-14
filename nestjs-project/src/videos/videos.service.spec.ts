import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { QueryFailedError } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import {
  InvalidUploadPartsException,
  UploadNotInProgressException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import {
  InvalidMultipartPartsException,
  MultipartUploadNotFoundException,
} from '../storage/storage.exceptions';
import {
  Video,
  VideoProcessingStatus,
  VideoStatus,
} from './entities/video.entity';
import { VIDEO_JOBS, VIDEO_QUEUES } from './videos.constants';
import { VideosService } from './videos.service';

const USER_ID = 'user-1';
const VIDEO_ID = '0b5a3d8e-3f7e-4c7a-9a39-1f4f3b0c2d11';

function makeVideo(overrides: Partial<Video> = {}): Video {
  return Object.assign(new Video(), {
    id: VIDEO_ID,
    public_id: 'aZ3kP9xQ2Lm',
    channel_id: 'channel-1',
    title: 'clip',
    description: null,
    original_filename: 'clip.mp4',
    mime_type: 'video/mp4',
    size_bytes: 100,
    status: VideoStatus.DRAFT,
    processing_status: VideoProcessingStatus.UPLOADING,
    processing_error: null,
    source_key: `videos/${VIDEO_ID}/source`,
    upload_id: 'upload-1',
    video_key: null,
    thumbnail_key: null,
    duration_seconds: null,
    width: null,
    height: null,
    video_codec: null,
    audio_codec: null,
    created_at: new Date('2026-10-13T12:00:00Z'),
    updated_at: new Date('2026-10-13T12:00:00Z'),
    ...overrides,
  });
}

function uniqueViolation(detail: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('duplicate'), { code: '23505', detail }),
  );
}

describe('VideosService', () => {
  let service: VideosService;
  let ownedVideo: Video | null;
  let updateAffected: number;
  const repository = {
    exists: jest.fn(),
    insert: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const channelsService = { findByUserId: jest.fn() };
  const storage = {
    createMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
    completeMultipartUpload: jest.fn(),
    listParts: jest.fn(),
    presignPartUrl: jest.fn(),
    presignGetVideoUrl: jest.fn(),
    presignGetThumbnailUrl: jest.fn(),
    presignGetDownloadUrl: jest.fn(),
  };
  const queue = { add: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    ownedVideo = makeVideo();
    updateAffected = 1;
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      getOne: jest.fn(() => Promise.resolve(ownedVideo)),
      execute: jest.fn(() => Promise.resolve({ affected: updateAffected })),
    };
    repository.createQueryBuilder.mockReturnValue(qb);
    repository.exists.mockResolvedValue(false);
    channelsService.findByUserId.mockResolvedValue({ id: 'channel-1' });
    storage.createMultipartUpload.mockImplementation((key: string) =>
      Promise.resolve({ key, uploadId: 'upload-1' }),
    );

    const module = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: getRepositoryToken(Video), useValue: repository },
        { provide: ChannelsService, useValue: channelsService },
        { provide: StorageService, useValue: storage },
        { provide: getQueueToken(VIDEO_QUEUES.PROCESSING), useValue: queue },
      ],
    }).compile();
    service = module.get(VideosService);
  });

  describe('createDraft', () => {
    const dto = {
      file_name: 'My Trip.final.mov',
      mime_type: 'video/quicktime',
      size_bytes: 2048,
    };

    it('should insert an uploading draft titled after the file name without extension', async () => {
      const result = await service.createDraft(USER_ID, dto);

      expect(result.key).toBe(`videos/${result.videoId}/source`);
      expect(result.uploadId).toBe('upload-1');
      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: result.videoId,
          channel_id: 'channel-1',
          title: 'My Trip.final',
          original_filename: 'My Trip.final.mov',
          processing_status: VideoProcessingStatus.UPLOADING,
          upload_id: 'upload-1',
          public_id: expect.stringMatching(/^[0-9A-Za-z]{11}$/) as unknown,
        }),
      );
    });

    it('should retry with a new public_id when a concurrent insert takes it', async () => {
      repository.insert
        .mockRejectedValueOnce(uniqueViolation('Key (public_id)=(x) exists'))
        .mockResolvedValueOnce(undefined);

      await service.createDraft(USER_ID, dto);

      expect(repository.insert).toHaveBeenCalledTimes(2);
      const [first, second] = repository.insert.mock.calls.map(
        ([draft]: [Partial<Video>]) => draft.public_id,
      );
      expect(first).not.toBe(second);
    });

    it('should abort the multipart upload when the draft insert fails', async () => {
      repository.insert.mockRejectedValue(new Error('db down'));

      await expect(service.createDraft(USER_ID, dto)).rejects.toThrow(
        'db down',
      );
      expect(storage.abortMultipartUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^videos\/.+\/source$/),
        'upload-1',
      );
    });

    it('should fail without touching storage when the user has no channel', async () => {
      channelsService.findByUserId.mockResolvedValue(null);

      await expect(service.createDraft(USER_ID, dto)).rejects.toThrow(
        'has no channel',
      );
      expect(storage.createMultipartUpload).not.toHaveBeenCalled();
    });
  });

  describe('upload operations on a non-uploading or foreign video', () => {
    it('should throw VideoNotFoundException when the video is not owned', async () => {
      ownedVideo = null;

      await expect(
        service.presignPartUrl(USER_ID, VIDEO_ID, 1),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should throw UploadNotInProgressException when the video is already processing', async () => {
      ownedVideo = makeVideo({
        processing_status: VideoProcessingStatus.PROCESSING,
        upload_id: null,
      });

      await expect(
        service.listUploadedParts(USER_ID, VIDEO_ID),
      ).rejects.toBeInstanceOf(UploadNotInProgressException);
    });

    it('should map a vanished multipart upload on listParts to UploadNotInProgressException', async () => {
      storage.listParts.mockRejectedValue(
        new MultipartUploadNotFoundException('k'),
      );

      await expect(
        service.listUploadedParts(USER_ID, VIDEO_ID),
      ).rejects.toBeInstanceOf(UploadNotInProgressException);
    });
  });

  describe('completeUpload', () => {
    const dto = { parts: [{ PartNumber: 1, ETag: '"etag"' }] };

    it('should move the video to processing and enqueue process-video', async () => {
      ownedVideo = makeVideo();
      const response = service.completeUpload(USER_ID, VIDEO_ID, dto);
      // findById after the transition reads the updated row
      ownedVideo = makeVideo({
        processing_status: VideoProcessingStatus.PROCESSING,
        upload_id: null,
      });

      await expect(response).resolves.toMatchObject({
        processing_status: VideoProcessingStatus.PROCESSING,
      });
      expect(storage.completeMultipartUpload).toHaveBeenCalledWith(
        `videos/${VIDEO_ID}/source`,
        'upload-1',
        dto.parts,
      );
      expect(queue.add).toHaveBeenCalledWith(
        VIDEO_JOBS.PROCESS_VIDEO,
        { videoId: VIDEO_ID },
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      );
    });

    it('should map rejected parts to InvalidUploadPartsException and not enqueue', async () => {
      storage.completeMultipartUpload.mockRejectedValue(
        new InvalidMultipartPartsException('InvalidPart'),
      );

      await expect(
        service.completeUpload(USER_ID, VIDEO_ID, dto),
      ).rejects.toBeInstanceOf(InvalidUploadPartsException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should not enqueue when a concurrent transition already left uploading', async () => {
      updateAffected = 0;

      await expect(
        service.completeUpload(USER_ID, VIDEO_ID, dto),
      ).rejects.toBeInstanceOf(UploadNotInProgressException);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('abortUpload', () => {
    it('should still fail the draft when the multipart upload is already gone in storage', async () => {
      storage.abortMultipartUpload.mockRejectedValue(
        new MultipartUploadNotFoundException('k'),
      );

      await expect(
        service.abortUpload(USER_ID, VIDEO_ID),
      ).resolves.toBeUndefined();
      const qb = repository.createQueryBuilder.mock.results.at(-1)!.value as {
        set: jest.Mock;
      };
      expect(qb.set).toHaveBeenCalledWith({
        processing_status: VideoProcessingStatus.FAILED,
        processing_error: 'UPLOAD_ABORTED',
        upload_id: null,
      });
    });

    it('should propagate unexpected storage errors', async () => {
      storage.abortMultipartUpload.mockRejectedValue(new Error('network'));

      await expect(service.abortUpload(USER_ID, VIDEO_ID)).rejects.toThrow(
        'network',
      );
    });
  });

  describe('findById', () => {
    it('should not presign media URLs while the video is not ready', async () => {
      ownedVideo = makeVideo({
        processing_status: VideoProcessingStatus.PROCESSING,
        video_key: `videos/${VIDEO_ID}/video.mp4`,
      });

      const video = await service.findById(USER_ID, VIDEO_ID);

      expect(video.video_url).toBeNull();
      expect(video.download_url).toBeNull();
      expect(storage.presignGetVideoUrl).not.toHaveBeenCalled();
    });

    it('should presign video, thumbnail and download URLs once ready', async () => {
      ownedVideo = makeVideo({
        processing_status: VideoProcessingStatus.READY,
        upload_id: null,
        video_key: `videos/${VIDEO_ID}/video.mp4`,
        thumbnail_key: `videos/${VIDEO_ID}/thumbnail.jpg`,
      });
      storage.presignGetVideoUrl.mockResolvedValue('https://s/video');
      storage.presignGetThumbnailUrl.mockResolvedValue('https://s/thumb');
      storage.presignGetDownloadUrl.mockResolvedValue('https://s/download');

      const video = await service.findById(USER_ID, VIDEO_ID);

      expect(video).toMatchObject({
        video_url: 'https://s/video',
        thumbnail_url: 'https://s/thumb',
        download_url: 'https://s/download',
        created_at: '2026-10-13T12:00:00.000Z',
      });
      expect(storage.presignGetDownloadUrl).toHaveBeenCalledWith(
        `videos/${VIDEO_ID}/video.mp4`,
        'clip.mp4',
      );
    });
  });
});
