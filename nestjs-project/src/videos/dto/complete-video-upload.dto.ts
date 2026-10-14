import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_UPLOAD_PARTS } from '../videos.constants';

export class CompletedPartDto {
  /** Part number (1..10000). */
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_PARTS)
  PartNumber: number;

  /** ETag returned by the storage for the part PUT. */
  @IsString()
  @IsNotEmpty()
  ETag: string;
}

export class CompleteVideoUploadDto {
  /** Every uploaded part, as reported by the storage. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_UPLOAD_PARTS)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts: CompletedPartDto[];
}
