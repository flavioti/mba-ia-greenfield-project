import { createReadStream, createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import storageConfig from '../config/storage.config';
import {
  STORAGE_PRESIGN_S3_CLIENT,
  STORAGE_S3_CLIENT,
} from './storage.constants';
import {
  InvalidMultipartPartsException,
  MultipartUploadNotFoundException,
} from './storage.exceptions';

export interface MultipartUploadRef {
  key: string;
  uploadId: string;
}

export interface UploadedPart {
  PartNumber: number;
  Size: number;
  ETag: string;
}

export interface CompletedPart {
  PartNumber: number;
  ETag: string;
}

const INVALID_PARTS_ERRORS = new Set([
  'InvalidPart',
  'InvalidPartOrder',
  'EntityTooSmall',
]);
const NO_SUCH_UPLOAD = 'NoSuchUpload';

/** Files above this size are written with a server-side multipart upload. */
const SERVER_MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;
const SERVER_MULTIPART_PART_BYTES = 64 * 1024 * 1024;

function s3ErrorName(err: unknown): string | undefined {
  return err instanceof S3ServiceException ? err.name : undefined;
}

/** RFC 6266 `attachment` header with an ASCII fallback and a UTF-8 filename*. */
function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_S3_CLIENT) private readonly s3: S3Client,
    @Inject(STORAGE_PRESIGN_S3_CLIENT) private readonly presignS3: S3Client,
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {}

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<MultipartUploadRef> {
    const { UploadId } = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!UploadId) {
      throw new Error(`Storage returned no UploadId for key ${key}`);
    }
    return { key, uploadId: UploadId };
  }

  async presignPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    return getSignedUrl(
      this.presignS3,
      new UploadPartCommand({
        Bucket: this.config.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: this.config.presignTtlSeconds },
    );
  }

  async listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker: string | undefined;
    try {
      do {
        const page = await this.s3.send(
          new ListPartsCommand({
            Bucket: this.config.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumberMarker: marker,
          }),
        );
        for (const part of page.Parts ?? []) {
          parts.push({
            PartNumber: part.PartNumber ?? 0,
            Size: part.Size ?? 0,
            ETag: part.ETag ?? '',
          });
        }
        marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
      } while (marker);
    } catch (err) {
      if (s3ErrorName(err) === NO_SUCH_UPLOAD) {
        throw new MultipartUploadNotFoundException(key);
      }
      throw err;
    }
    return parts;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    try {
      await this.s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: [...parts]
              .sort((a, b) => a.PartNumber - b.PartNumber)
              .map(({ PartNumber, ETag }) => ({ PartNumber, ETag })),
          },
        }),
      );
    } catch (err) {
      const name = s3ErrorName(err);
      if (name && INVALID_PARTS_ERRORS.has(name)) {
        throw new InvalidMultipartPartsException(name);
      }
      if (name === NO_SUCH_UPLOAD) {
        throw new MultipartUploadNotFoundException(key);
      }
      throw err;
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.s3.send(
        new AbortMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (err) {
      if (s3ErrorName(err) === NO_SUCH_UPLOAD) {
        throw new MultipartUploadNotFoundException(key);
      }
      throw err;
    }
  }

  /** Inline GET (HTTP Range supported) used by the `<video>` element. */
  async presignGetVideoUrl(key: string): Promise<string> {
    return this.presignGet(key);
  }

  async presignGetThumbnailUrl(key: string): Promise<string> {
    return this.presignGet(key);
  }

  async presignGetDownloadUrl(key: string, filename: string): Promise<string> {
    return this.presignGet(key, attachmentDisposition(filename));
  }

  /** Streams an object to a local file (worker side). */
  async downloadToFile(key: string, filePath: string): Promise<void> {
    const { Body } = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    if (!(Body instanceof Readable)) {
      throw new Error(`Storage returned no readable body for key ${key}`);
    }
    await pipeline(Body, createWriteStream(filePath));
  }

  /**
   * Writes a local file to the bucket, overwriting any previous object (the
   * worker relies on this for idempotent reprocessing). Large files use
   * multipart because a single PUT is capped at 5 GB on S3.
   */
  async uploadFile(
    key: string,
    filePath: string,
    contentType: string,
  ): Promise<void> {
    const { size } = await stat(filePath);
    if (size <= SERVER_MULTIPART_THRESHOLD_BYTES) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentLength: size,
          ContentType: contentType,
        }),
      );
      return;
    }

    const { uploadId } = await this.createMultipartUpload(key, contentType);
    try {
      const parts: CompletedPart[] = [];
      for (
        let start = 0, partNumber = 1;
        start < size;
        start += SERVER_MULTIPART_PART_BYTES, partNumber++
      ) {
        const end = Math.min(start + SERVER_MULTIPART_PART_BYTES, size) - 1;
        const { ETag } = await this.s3.send(
          new UploadPartCommand({
            Bucket: this.config.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: createReadStream(filePath, { start, end }),
            ContentLength: end - start + 1,
          }),
        );
        parts.push({ PartNumber: partNumber, ETag: ETag ?? '' });
      }
      await this.completeMultipartUpload(key, uploadId, parts);
    } catch (err) {
      try {
        await this.abortMultipartUpload(key, uploadId);
      } catch {
        // Best-effort compensation — the original failure is what matters.
      }
      throw err;
    }
  }

  private async presignGet(
    key: string,
    responseContentDisposition?: string,
  ): Promise<string> {
    return getSignedUrl(
      this.presignS3,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ResponseContentDisposition: responseContentDisposition,
      }),
      { expiresIn: this.config.presignTtlSeconds },
    );
  }
}
