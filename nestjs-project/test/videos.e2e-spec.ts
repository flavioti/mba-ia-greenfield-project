import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Channel } from '../src/channels/entities/channel.entity';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { setupStorage } from '../src/storage/storage-setup';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { applyVideoTestEnv } from '../src/test/video-test-env';
import { User } from '../src/users/entities/user.entity';
import { VIDEO_QUEUES } from '../src/videos/videos.constants';

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let queue: Queue;

  beforeAll(async () => {
    applyVideoTestEnv();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    jwtService = moduleFixture.get(JwtService);
    queue = moduleFixture.get<Queue>(getQueueToken(VIDEO_QUEUES.PROCESSING));
    await setupStorage();
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  /** Confirmed user + channel, with a valid access token. */
  async function createOwner(): Promise<{ token: string }> {
    const n = ++counter;
    const email = `videos_e2e_${n}@example.com`;
    const user = await dataSource.getRepository(User).save({
      email,
      password: 'hashed',
      is_confirmed: true,
    });
    await dataSource.getRepository(Channel).save({
      name: `ve2e${n}`,
      nickname: `videos_e2e_${n}`,
      user_id: user.id,
    });
    return { token: await jwtService.signAsync({ sub: user.id, email }) };
  }

  const server = () => app.getHttpServer();
  /** supertest types `body` as `any`; narrow it once per assertion site. */
  const bodyOf = <T>(res: request.Response): T => res.body as T;
  type ErrorBody = { error: string };
  const validBody = {
    file_name: 'clip.mp4',
    mime_type: 'video/mp4',
    size_bytes: 1024,
  };

  async function createDraft(token: string): Promise<string> {
    const res = await request(server())
      .post('/videos')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(201);
    return bodyOf<{ videoId: string }>(res).videoId;
  }

  describe('authentication', () => {
    it('should reject POST /videos without a bearer token (401)', async () => {
      await request(server()).post('/videos').send(validBody).expect(401);
    });
  });

  describe('POST /videos', () => {
    it('should create an uploading draft and return videoId, uploadId and key (201)', async () => {
      const { token } = await createOwner();

      const res = await request(server())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)
        .expect(201);

      const body = bodyOf<{ videoId: string; uploadId: string; key: string }>(
        res,
      );
      expect(body.uploadId).toEqual(expect.any(String));
      expect(body.key).toBe(`videos/${body.videoId}/source`);
    });

    it('should reject an unsupported mime_type or a size above 10 GiB (400 VALIDATION_ERROR)', async () => {
      const { token } = await createOwner();

      const res = await request(server())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBody,
          mime_type: 'image/png',
          size_bytes: 10 * 1024 ** 3 + 1,
        })
        .expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
    });

    it('should not be rate limited like the auth endpoints', async () => {
      const { token } = await createOwner();
      const videoId = await createDraft(token);

      for (let i = 0; i < 12; i++) {
        await request(server())
          .get(`/videos/${videoId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });
  });

  describe('GET /videos/:id', () => {
    it('should return the draft without media URLs while uploading', async () => {
      const { token } = await createOwner();
      const videoId = await createDraft(token);

      const res = await request(server())
        .get(`/videos/${videoId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: videoId,
        title: 'clip',
        original_filename: 'clip.mp4',
        status: 'draft',
        processing_status: 'uploading',
        video_url: null,
        download_url: null,
      });
      expect(bodyOf<{ public_id: string }>(res).public_id).toMatch(
        /^[0-9A-Za-z]{11}$/,
      );
    });

    it("should answer 404 VIDEO_NOT_FOUND for another user's video", async () => {
      const owner = await createOwner();
      const stranger = await createOwner();
      const videoId = await createDraft(owner.token);

      const res = await request(server())
        .get(`/videos/${videoId}`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('should answer 400 VALIDATION_ERROR for a non-UUID id', async () => {
      const { token } = await createOwner();

      const res = await request(server())
        .get('/videos/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
    });
  });

  describe('multipart upload flow', () => {
    it('should presign a part, list it, complete and move to processing (200)', async () => {
      const { token } = await createOwner();
      const videoId = await createDraft(token);
      const auth = { Authorization: `Bearer ${token}` };

      const urlRes = await request(server())
        .get(`/videos/${videoId}/upload/parts/1/url`)
        .set(auth)
        .expect(200);
      const put = await fetch(bodyOf<{ url: string }>(urlRes).url, {
        method: 'PUT',
        body: 'video-bytes',
      });
      const etag = put.headers.get('etag')!;

      const partsRes = await request(server())
        .get(`/videos/${videoId}/upload/parts`)
        .set(auth)
        .expect(200);
      expect(bodyOf<{ parts: unknown[] }>(partsRes).parts).toEqual([
        { PartNumber: 1, Size: 11, ETag: expect.any(String) as unknown },
      ]);

      const completeRes = await request(server())
        .post(`/videos/${videoId}/upload/complete`)
        .set(auth)
        .send({ parts: [{ PartNumber: 1, ETag: etag }] })
        .expect(200);
      expect(
        bodyOf<{ processing_status: string }>(completeRes).processing_status,
      ).toBe('processing');

      await request(server())
        .get(`/videos/${videoId}/upload/parts/2/url`)
        .set(auth)
        .expect(409);
    });

    it('should reject partNumber outside 1..10000 (400)', async () => {
      const { token } = await createOwner();
      const videoId = await createDraft(token);

      await request(server())
        .get(`/videos/${videoId}/upload/parts/0/url`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should reject a complete body without parts (400)', async () => {
      const { token } = await createOwner();
      const videoId = await createDraft(token);

      await request(server())
        .post(`/videos/${videoId}/upload/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parts: [] })
        .expect(400);
    });

    it('should cancel the upload (204) and then report UPLOAD_ABORTED', async () => {
      const { token } = await createOwner();
      const videoId = await createDraft(token);
      const auth = { Authorization: `Bearer ${token}` };

      await request(server())
        .delete(`/videos/${videoId}/upload`)
        .set(auth)
        .expect(204);

      const res = await request(server())
        .get(`/videos/${videoId}`)
        .set(auth)
        .expect(200);
      expect(res.body).toMatchObject({
        processing_status: 'failed',
        processing_error: 'UPLOAD_ABORTED',
      });

      const again = await request(server())
        .delete(`/videos/${videoId}/upload`)
        .set(auth)
        .expect(409);
      expect(bodyOf<ErrorBody>(again).error).toBe('UPLOAD_NOT_IN_PROGRESS');
    });
  });
});
