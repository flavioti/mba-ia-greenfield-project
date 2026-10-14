import { IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
import {
  ACCEPTED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
} from '../videos.constants';

export class CreateVideoUploadDto {
  /** Original file name; the draft title is this name without extension. */
  @IsString()
  @Length(1, 255)
  file_name: string;

  /** One of the accepted video container types. */
  @IsIn(ACCEPTED_VIDEO_MIME_TYPES)
  mime_type: string;

  /** File size in bytes (max 10 GiB). */
  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_SIZE_BYTES)
  size_bytes: number;
}
