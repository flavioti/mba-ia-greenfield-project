import { ApiProperty } from '@nestjs/swagger';
import { VideoProcessingStatus, VideoStatus } from '../entities/video.entity';

export class VideoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    example: 'aZ3kP9xQ2Lm',
    description: '11-char base62 public id',
  })
  public_id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty()
  original_filename: string;

  @ApiProperty({ enum: VideoStatus, enumName: 'VideoStatus' })
  status: VideoStatus;

  @ApiProperty({
    enum: VideoProcessingStatus,
    enumName: 'VideoProcessingStatus',
  })
  processing_status: VideoProcessingStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'UPLOAD_ABORTED | UPLOAD_ABANDONED | PROBE_FAILED | TRANSCODE_FAILED when failed',
  })
  processing_error: string | null;

  @ApiProperty({ type: Number, nullable: true })
  duration_seconds: number | null;

  @ApiProperty({ type: 'integer', nullable: true })
  width: number | null;

  @ApiProperty({ type: 'integer', nullable: true })
  height: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Presigned GET of the streamable MP4 (when ready)',
  })
  video_url: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Presigned GET of the generated thumbnail',
  })
  thumbnail_url: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Presigned GET with attachment disposition (when ready)',
  })
  download_url: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}
