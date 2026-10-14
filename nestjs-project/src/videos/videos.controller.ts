import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { UploadPartUrlParamsDto } from './dto/upload-part-url-params.dto';
import {
  CreateVideoUploadResponseDto,
  UploadPartsResponseDto,
  UploadPartUrlResponseDto,
} from './dto/video-upload-responses.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideosService } from './videos.service';

const UUID_V4 = new ParseUUIDPipe({ version: '4' });
const ERROR_SCHEMA = { $ref: getSchemaPath(ApiErrorEnvelope) };

// The global 10 req/min throttle targets the auth endpoints; uploads call the
// part-URL endpoint once per part and the processing screen polls every 3 s.
@SkipThrottle()
@ApiTags('videos')
@ApiBearerAuth('access-token')
@ApiResponse({
  status: 401,
  description: 'Missing or invalid access token',
  schema: ERROR_SCHEMA,
})
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Pre-register a video draft and start its upload',
    description:
      'Creates the draft (processing_status=uploading) and opens a multipart upload in storage. The browser then PUTs the parts directly to storage using presigned URLs.',
  })
  @ApiResponse({
    status: 201,
    description: 'Draft created and multipart upload started',
    type: CreateVideoUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed (missing field, unsupported mime_type, size over 10 GiB)',
    schema: ERROR_SCHEMA,
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVideoUploadDto,
  ): Promise<CreateVideoUploadResponseDto> {
    return this.videosService.createDraft(user.sub, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an owned video',
    description:
      'Returns the video with presigned media URLs when available. Drafts are visible only to their owner; other users get 404.',
  })
  @ApiResponse({
    status: 200,
    description: 'The video',
    type: VideoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'id is not a UUID',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: ERROR_SCHEMA,
  })
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', UUID_V4) id: string,
  ): Promise<VideoResponseDto> {
    return this.videosService.findById(user.sub, id);
  }

  @Get(':id/upload/parts')
  @ApiOperation({
    summary: 'List the uploaded parts',
    description:
      'Lists the parts already stored — used to resume an interrupted upload.',
  })
  @ApiResponse({
    status: 200,
    description: 'Uploaded parts',
    type: UploadPartsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'id is not a UUID',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'Upload is not in progress',
    schema: ERROR_SCHEMA,
  })
  async listParts(
    @CurrentUser() user: JwtPayload,
    @Param('id', UUID_V4) id: string,
  ): Promise<UploadPartsResponseDto> {
    return { parts: await this.videosService.listUploadedParts(user.sub, id) };
  }

  @Get(':id/upload/parts/:partNumber/url')
  @ApiOperation({
    summary: 'Presign the PUT URL of one part',
    description:
      'Returns a short-lived presigned PUT URL, signed against the public storage endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Presigned part URL',
    type: UploadPartUrlResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'id is not a UUID or partNumber is outside 1..10000',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'Upload is not in progress',
    schema: ERROR_SCHEMA,
  })
  async presignPart(
    @CurrentUser() user: JwtPayload,
    @Param() params: UploadPartUrlParamsDto,
  ): Promise<UploadPartUrlResponseDto> {
    return {
      url: await this.videosService.presignPartUrl(
        user.sub,
        params.id,
        params.partNumber,
      ),
    };
  }

  @Post(':id/upload/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete the upload',
    description:
      'Completes the multipart upload, moves the video to processing and enqueues the processing job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload completed; processing started',
    type: VideoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed or storage rejected the parts (INVALID_UPLOAD_PARTS)',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'Upload is not in progress',
    schema: ERROR_SCHEMA,
  })
  async complete(
    @CurrentUser() user: JwtPayload,
    @Param('id', UUID_V4) id: string,
    @Body() dto: CompleteVideoUploadDto,
  ): Promise<VideoResponseDto> {
    return this.videosService.completeUpload(user.sub, id, dto);
  }

  @Delete(':id/upload')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel the upload',
    description:
      'Aborts the multipart upload; the draft becomes failed with processing_error=UPLOAD_ABORTED.',
  })
  @ApiResponse({ status: 204, description: 'Upload cancelled' })
  @ApiResponse({
    status: 400,
    description: 'id is not a UUID',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'Upload is not in progress',
    schema: ERROR_SCHEMA,
  })
  async abort(
    @CurrentUser() user: JwtPayload,
    @Param('id', UUID_V4) id: string,
  ): Promise<void> {
    return this.videosService.abortUpload(user.sub, id);
  }
}
