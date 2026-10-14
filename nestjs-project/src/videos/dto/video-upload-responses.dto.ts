import { ApiProperty } from '@nestjs/swagger';

export class CreateVideoUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  videoId: string;

  @ApiProperty({ description: 'Storage multipart UploadId' })
  uploadId: string;

  @ApiProperty({ example: 'videos/7f1c…/source' })
  key: string;
}

export class UploadedPartDto {
  @ApiProperty({ example: 1 })
  PartNumber: number;

  @ApiProperty({ example: 67108864 })
  Size: number;

  @ApiProperty({ example: '"9b2cf535f27731c974343645a3985328"' })
  ETag: string;
}

export class UploadPartsResponseDto {
  @ApiProperty({ type: [UploadedPartDto] })
  parts: UploadedPartDto[];
}

export class UploadPartUrlResponseDto {
  @ApiProperty({ description: 'Presigned PUT URL for the part' })
  url: string;
}
