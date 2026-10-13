---
libs:
  "@aws-sdk/client-s3":
    version: "^3.1150.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-10-13T10:44:33-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "^3.1150.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-10-13T10:44:33-03:00"
  "@uppy/core":
    version: "^5.2.0"
    context7_id: "/websites/uppy_io"
    fetched_at: "2026-10-13T10:44:33-03:00"
  "@uppy/aws-s3":
    version: "^5.1.0"
    context7_id: "/websites/uppy_io"
    fetched_at: "2026-10-13T10:44:33-03:00"
  "@nestjs/bullmq":
    version: "^12.0.0"
    context7_id: "/nestjs/docs.nestjs.com"
    fetched_at: "2026-10-13T10:44:33-03:00"
  "bullmq":
    version: "^6.3.14"
    context7_id: "/websites/bullmq_io"
    fetched_at: "2026-10-13T10:44:33-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-upload-processing.md: "2026-10-13T10:44:09-03:00"
---

# Library references — phase-03-upload-processing

Versions are the npm `latest` on 2026-10-13, except Uppy, which is pinned to the 5.x major (TD-03 revision 2026-10-13).

### @aws-sdk/client-s3

Used by the API (TD-01, TD-02, TD-09) and the worker to talk to SeaweedFS through the plain S3 API.

- Client against a non-AWS endpoint: `new S3Client({ endpoint: "http://<compose-service>:<port>", region, credentials, forcePathStyle: true })`. TD-01 requires `forcePathStyle: true` for SeaweedFS.
- Multipart orchestration, all called server-side by the API per TD-02:
  - `CreateMultipartUploadCommand({ Bucket, Key, ContentType })` returns `UploadId`.
  - `UploadPartCommand({ Bucket, Key, UploadId, PartNumber })` is presigned for the browser (see the presigner section below).
  - `ListPartsCommand({ Bucket, Key, UploadId })` returns `Parts[] { PartNumber, Size, ETag }` and is used for resume.
  - `CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts: [{ PartNumber, ETag }] } })`.
  - `AbortMultipartUploadCommand({ Bucket, Key, UploadId })` is used by cancel and by the TD-12 cleanup job.
- Every part response must carry an `ETag`; a missing ETag almost always means the bucket CORS does not expose the `ETag` header.
- Worker side: `GetObjectCommand` to read the source file and `PutObjectCommand` to write the remuxed or transcoded MP4 and the thumbnail.

### @aws-sdk/s3-request-presigner

- `getSignedUrl(client, command, { expiresIn })` (default 900 s) presigns any command.
- TD-02 uses it to sign `UploadPartCommand` per part.
- TD-09 uses it to sign `GetObjectCommand` for streaming, download and thumbnails. Range requests work on the presigned GET URL.
- Download uses `ResponseContentDisposition: 'attachment; filename="..."'` on `GetObjectCommand`.
- The presigned URL host must be reachable by the browser. The signing client's endpoint has to be the public storage URL, not the internal compose hostname, so plan a separate public endpoint config key for presigning.

### @uppy/core

Pinned `^5.2.0`; `@uppy/aws-s3@5.1.0` requires `@uppy/core ^5.2.0`.

- Headless use: `new Uppy({ restrictions: { maxNumberOfFiles: 1, maxFileSize: 10 * 1024 ** 3, allowedFileTypes: [...] } })`. No Dashboard (TD-03 custom shadcn UI).
- Events:
  - `upload-progress (file, { bytesUploaded, bytesTotal })`
  - `upload-success`
  - `upload-error`
  - `complete`
- Methods:
  - `addFile` and `upload()` start the upload.
  - `cancelAll()` cancels it. In multipart mode this triggers `abortMultipartUpload`.
- Typed responses: `new Uppy<Meta, AwsBody>()` with `AwsBody` imported from `@uppy/aws-s3`.

### @uppy/aws-s3

Pinned `^5.1.0`. The 5.x option surface keeps the callbacks; **6.x removed them in favor of `signRequest`** (Context7: uppy.io migration guide "Migrate from Uppy 5.x to 6.x").

- 5.x callbacks map 1:1 to TD-02's API orchestration endpoints, proxied through the BFF:
  - `shouldUseMultipart(file)`: always `true` for this phase.
  - `createMultipartUpload(file)` returns `{ uploadId, key }`. This is the BFF call that also pre-registers the draft (TD-06, AMB-3).
  - `signPart(file, { uploadId, key, partNumber, signal })` returns `{ url }`.
  - `listParts(file, { uploadId, key })` returns `[{ PartNumber, Size, ETag }]`.
  - `completeMultipartUpload(file, { uploadId, key, parts })` returns `{ location? }`. The API completes the upload and enqueues processing (TD-04).
  - `abortMultipartUpload(file, { uploadId, key })`.
- Also available: `getChunkSize(file)` (part size; S3 requires at least 5 MiB, at most 10,000 parts, so use 64 MiB or larger for 10 GB files) and `limit` (concurrent parts).
- Bucket CORS: `AllowedMethods: [GET, PUT, POST, DELETE]`, `AllowedOrigins: [<frontend origin>]`, `ExposeHeaders: [ETag]`. ETag must be exposed or multipart cannot complete.
- At implement time, confirm callback signatures against `node_modules/@uppy/aws-s3/lib/index.d.ts` (5.x). The online docs now describe 6.x.

### @nestjs/bullmq

`^12.0.0` declares peers `@nestjs/common|core ^10 || ^11 || ^12` and `bullmq ^3–^6`, so it is compatible with the project's NestJS 11.

- Root connection, following the phase-01 config conventions (a `registerAs` namespace for the queue config):
  `BullModule.forRootAsync({ imports: [ConfigModule], inject: [queueConfig.KEY], useFactory: (cfg) => ({ connection: { host: cfg.host, port: cfg.port } }) })`.
- `BullModule.registerQueue({ name: 'video-processing' })` (and a cleanup queue) in the videos module. The producer uses `@InjectQueue('video-processing') queue: Queue`.
- Consumer in the worker entrypoint (TD-05): `@Processor('video-processing') class X extends WorkerHost { async process(job: Job) { ... await job.updateProgress(n) } }`.
- Tests mock the queue via `getQueueToken('video-processing')`.

### bullmq

- Retries: `queue.add(name, data, { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: 1000 })`.
- Repeatable cleanup (TD-12): `queue.upsertJobScheduler('abandoned-upload-cleanup', { pattern: '0 0 * * * *' }, { name: 'cleanup', data: {}, opts: { attempts: 3 } })`. This is idempotent on the scheduler ID, so it is safe to call on every boot. Staleness window ≥ 24h (TD-12).
- `Worker(queueName, processor, { connection, concurrency })`: keep concurrency low (1–2) because of FFmpeg transcode cost (TD-11).
