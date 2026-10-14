import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { MAX_UPLOAD_PARTS } from '../videos.constants';

export class UploadPartUrlParamsDto {
  /** Video id (UUID v4). */
  @IsUUID('4')
  id: string;

  /** Part number (1..10000). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_PARTS)
  partNumber: number;
}
