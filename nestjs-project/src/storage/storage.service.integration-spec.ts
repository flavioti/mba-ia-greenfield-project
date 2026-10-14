import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import storageConfig from '../config/storage.config';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';
import { setupStorage } from './storage-setup';
import {
  InvalidMultipartPartsException,
  MultipartUploadNotFoundException,
} from './storage.exceptions';

const MIN_PART_BYTES = 5 * 1024 * 1024;

describe('StorageService (integration — SeaweedFS)', () => {
  let module: TestingModule;
  let storage: StorageService;
  let workDir: string;

  beforeAll(async () => {
    // Presigned URLs are exercised from inside the compose network, so sign
    // them against the internal host instead of the browser-facing one.
    process.env.STORAGE_PUBLIC_ENDPOINT = process.env.STORAGE_ENDPOINT;
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [storageConfig] }),
        StorageModule,
      ],
    }).compile();
    storage = module.get(StorageService);
    await setupStorage();
    workDir = await mkdtemp(join(tmpdir(), 'storage-it-'));
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    await module.close();
  });

  const newKey = (): string => `tests/${randomUUID()}/source`;

  async function putPart(url: string, body: Buffer): Promise<string> {
    const res = await fetch(url, { method: 'PUT', body: new Uint8Array(body) });
    expect(res.status).toBe(200);
    const etag = res.headers.get('etag');
    expect(etag).toBeTruthy();
    return etag!;
  }

  it('should create a multipart upload returning an UploadId and the key', async () => {
    const key = newKey();

    const ref = await storage.createMultipartUpload(key, 'video/mp4');

    expect(ref.key).toBe(key);
    expect(ref.uploadId).toEqual(expect.any(String));
    await storage.abortMultipartUpload(key, ref.uploadId);
  });

  it('should accept parts through presigned PUT URLs, list them, and complete into a readable object', async () => {
    const key = newKey();
    const { uploadId } = await storage.createMultipartUpload(key, 'video/mp4');
    const part1 = Buffer.alloc(MIN_PART_BYTES, 'a');
    const part2 = Buffer.from('tail-bytes');

    const etag1 = await putPart(
      await storage.presignPartUrl(key, uploadId, 1),
      part1,
    );
    const etag2 = await putPart(
      await storage.presignPartUrl(key, uploadId, 2),
      part2,
    );

    const listed = await storage.listParts(key, uploadId);
    expect(listed.map((p) => [p.PartNumber, p.Size])).toEqual([
      [1, part1.length],
      [2, part2.length],
    ]);

    await storage.completeMultipartUpload(key, uploadId, [
      { PartNumber: 2, ETag: etag2 },
      { PartNumber: 1, ETag: etag1 },
    ]);

    const target = join(workDir, 'completed.bin');
    await storage.downloadToFile(key, target);
    const content = await readFile(target);
    expect(content.length).toBe(part1.length + part2.length);
    expect(content.subarray(-part2.length).toString()).toBe('tail-bytes');
  });

  it('should reject an inconsistent part list with InvalidMultipartPartsException', async () => {
    const key = newKey();
    const { uploadId } = await storage.createMultipartUpload(key, 'video/mp4');
    await putPart(
      await storage.presignPartUrl(key, uploadId, 1),
      Buffer.from('only-part'),
    );

    await expect(
      storage.completeMultipartUpload(key, uploadId, [
        { PartNumber: 1, ETag: '"0000000000000000000000000000dead"' },
      ]),
    ).rejects.toBeInstanceOf(InvalidMultipartPartsException);
    await storage.abortMultipartUpload(key, uploadId);
  });

  it('should abort an upload so it can no longer be listed', async () => {
    const key = newKey();
    const { uploadId } = await storage.createMultipartUpload(key, 'video/mp4');

    await storage.abortMultipartUpload(key, uploadId);

    await expect(storage.listParts(key, uploadId)).rejects.toBeInstanceOf(
      MultipartUploadNotFoundException,
    );
  });

  it('should upload a local file and serve it through presigned GETs (Range + attachment)', async () => {
    const key = `tests/${randomUUID()}/video.mp4`;
    const source = join(workDir, 'clip.mp4');
    await writeFile(source, '0123456789');
    await storage.uploadFile(key, source, 'video/mp4');

    const ranged = await fetch(await storage.presignGetVideoUrl(key), {
      headers: { Range: 'bytes=2-5' },
    });
    expect(ranged.status).toBe(206);
    expect(await ranged.text()).toBe('2345');

    const download = await fetch(
      await storage.presignGetDownloadUrl(key, 'Meu vídeo.mp4'),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('attachment');
  });
});
