# Phase 03 — phase-03-upload-processing — Progress

**Status:** in_progress
**SIs:** 16/16 completed

### SI-03.1 — Infra: instalação e configuração do armazenamento S3-compatível
- **Status:** completed
- **Tests:** 3 passing (storage.config.spec.ts: 2, storage.module.spec.ts: 1)
- **Observations:**
  - SeaweedFS 4.x removed `-access_key/-secret_key`; compose now pins `chrislusf/seaweedfs:4.48`, passes credentials via `AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY` and binds `-ip.bind=0.0.0.0` (healthcheck was refused on localhost).
  - Added `STORAGE_PUBLIC_ENDPOINT` (presign host must be browser-reachable, per library-refs) and `STORAGE_CORS_ALLOWED_ORIGINS`; `npm run storage:setup` (`src/storage/storage-setup.ts`) creates the bucket + CORS (ETag exposed) idempotently.
  - StorageModule refactored to inject `storageConfig.KEY` (removes the 11 lint errors of the first version) and to expose an internal and a presign S3 client.
  - S3 clients use `requestChecksumCalculation: 'WHEN_REQUIRED'` — SDK default flexible checksums signed a CRC32 of the empty body into presigned UploadPart URLs (SeaweedFS answered BadDigest).
  - Redis host port mapping removed from compose: host port 6379 is taken by another project's container and services reach Redis by service name.

### SI-03.2 — Infra: Redis/Valkey e BullMQ (API + worker skeleton)
- **Status:** completed
- **Tests:** 2 passing (app.module.spec.ts: 1, worker.module.spec.ts: 1)
- **Observations:**
  - Previously marked completed without its planned `src/app.module.spec.ts` and without the `video-worker` compose service — both added now.
  - Root config/TypeORM/BullMQ extracted into `InfrastructureModule`; the worker boots `WorkerModule` (Infrastructure + Users + VideosWorkerModule) instead of the whole `AppModule`, so processors never run in the API process.
  - `start:worker:dev` used `ts-node-dev` (not installed) → now `nest start --watch --path tsconfig.worker.json --entryFile worker` with its own `dist-worker/` outDir so it does not race the API watcher on `dist/`.
  - Added `REDIS_QUEUE_PREFIX` (default `bull`); video test suites use `streamtube-test` so the dev worker never consumes test jobs.
  - Bull Board (`/queues`, optional per AC) not added.

### SI-03.3 — Entidade Video + migração inicial
- **Status:** completed
- **Tests:** 6 passing (video.entity.integration-spec.ts: 4, videos.module.spec.ts: 1, migrations.integration-spec.ts updated: 2→ still 2)
- **Observations:**
  - Adding `Channel.videos` requires `Video` in every explicit test entity array (11 existing specs updated mechanically) and `videos` cleanup in `cleanAllTables`.
  - `migrations.integration-spec.ts`: drops are now sequential (parallel `DROP ... CASCADE` deadlocked once `videos` FK existed) and also drop leftover enum types.
  - `size_bytes` (bigint) uses a transformer to number (≤ 10 GiB fits in a JS number).
  - Worker needs the full Video → Channel → User entity graph for `autoLoadEntities` — `WorkerModule` imports `UsersModule`.

### SI-03.4 — public_id + spawn-wrapper FFmpeg
- **Status:** completed
- **Tests:** 9 passing (public-id.util.spec.ts: 5, ffmpeg-spawn.util.spec.ts: 4)
- **Observations:**
  - Pipeline errors live in `src/videos/exceptions/video-pipeline.exception.ts` (`ProbeFailedException`/`TranscodeFailedException` carry the `processing_error` code); they are not HTTP domain exceptions.
  - Integration smoke against a real FFmpeg binary is covered by the SI-03.7 processor integration test.

### SI-03.5 — StorageService multipart + presigned URLs
- **Status:** completed
- **Tests:** 5 passing (storage.service.integration-spec.ts against SeaweedFS)
- **Observations:**
  - Storage exceptions (`MultipartUploadNotFoundException`, `InvalidMultipartPartsException`) are transport-agnostic; VideosService maps them to INVALID_UPLOAD_PARTS / UPLOAD_NOT_IN_PROGRESS.
  - Also added `downloadToFile` and `uploadFile` (multipart above 100 MB — single PUT is capped at 5 GB on S3) for the worker.

### SI-03.6 — VideosService + Controller endpoints de upload
- **Status:** completed
- **Tests:** 37 unit+integration passing in src/videos + channels; 11 e2e passing (test/videos.e2e-spec.ts)
- **Observations:**
  - `ChannelsService.findByUserId` added (channel lookup stays in its owning module) with integration tests.
  - Global `ThrottlerGuard` (10 req/min, meant for auth — SI-02.13) would 429 the part-URL calls and the 3 s polling → `@SkipThrottle()` on `VideosController`, covered by an e2e test.
  - State transitions use conditional `UPDATE ... WHERE processing_status='uploading'` so cancel/complete/cleanup cannot both win; draft insert failure aborts the multipart (compensation).

### SI-03.7 — VideoProcessingProcessor
- **Status:** completed
- **Tests:** 12 passing (video-processing.processor.spec.ts: 8 with fake spawner, video-processing.processor.integration-spec.ts: 4 with real FFmpeg + SeaweedFS + DB)
- **Observations:**
  - Pipeline logic lives in `VideoProcessingService` (+ pure helpers in `util/media-probe.util.ts`); `VideoProcessingProcessor` is a thin `WorkerHost` — plan text mentions `@Process('process-video')`, which is the legacy Bull API; BullMQ uses `process(job)` + `job.name` dispatch.
  - Final failure is handled in `@OnWorkerEvent('failed')` only when `attemptsMade >= opts.attempts`; retries use the job options set by the producer (attempts 3, exponential 5 s).
  - Concurrency is applied from `VIDEO_WORKER_CONCURRENCY` in `onApplicationBootstrap` (`worker.concurrency`).
  - Fixture videos are generated at test time with FFmpeg lavfi (H.264/AAC MP4, VP9/Opus WebM) — no binary fixtures committed.
  - The source object is kept after processing (no deletion rule in the plan) — storage growth follow-up for Phase 07.

### SI-03.8 — AbandonedUploadCleanup + worker compose
- **Status:** completed
- **Tests:** 4 passing (abandoned-upload-cleanup.processor.integration-spec.ts)
- **Observations:**
  - Cleanup logic in `AbandonedUploadCleanupService`; scheduler upserted in the processor's `onApplicationBootstrap`, which only exists in the worker process.
  - `ffmpeg`/`ffprobe` added to `Dockerfile.dev` (shared by API and worker images); `video-worker` service added to compose in SI-03.2.

### SI-03.9 — BFF: contracts + Route Handlers + OpenAPI
- **Status:** completed
- **Tests:** 15 passing (6 route.integration.test.ts files under app/api/videos/**)
- **Observations:**
  - `openapi:export` now runs from the compiled build (`nest build && node dist/openapi-export`): via ts-node the Swagger CLI plugin never ran, so every request DTO (including Phase 02's `RegisterDto`) was exported with empty `properties`. Regenerated `types.gen.ts` is idempotent and the frontend still type-checks.
  - Plan names the type script `generate:api-types`; the existing `openapi:types` script was used.
  - Shared helper `lib/api/authed-proxy.ts` (session check → `withRefresh` → pass-through status/body); route handlers import it after MSW starts because openapi-fetch captures `fetch` at module creation.
  - Route params typed explicitly (`{ params: Promise<…> }`) instead of the global `RouteContext`, which only exists after `next typegen`.

### SI-03.10 — Layout /studio + shell + Uppy provider
- **Status:** completed
- **Tests:** 8 passing (lib/upload/__tests__/uppy.test.ts); tests/studio.e2e-spec.ts written, not run (see final verification)
- **Observations:**
  - Test file follows the project convention (`lib/upload/__tests__/uppy.test.ts`) instead of the plan's `lib/upload/uppy.spec.ts`.
  - Uppy 5.x: `shouldUseMultipart: true` (literal) — the function form selects the type variant that also requires `getUploadParameters`; `createMultipartUpload` reuses the draft ids from the file meta (the dropzone already called `POST /api/videos`).
  - `shadcn add` (4.21.4) generated `import { cn } from "cn"` and added the unrelated `cn` npm package despite `components.json` aliasing `@/lib/utils`; imports fixed, package removed, primitives reconciled to project tokens.
  - `--color-destructive-text` / `--color-success-text` were missing from `@theme inline` (the UI rule says these utilities exist) — registered in `app/globals.css`.

### SI-03.11.0 — Drift audit tela de upload
- **Status:** completed
- **Tests:** no tests (audit-only)
- **Observations:**
  - Created `frontend-drift-report.md`; Figma read via `get_design_context` (node 39:1594). `figma:figma-implement-design` plugin skill is not installed — the Figma MCP + `figma-design-to-code` resource guidance were used instead.
  - Button ('Select files', raw `#ff0000`) and the header pill are unbound Figma frames — recorded as `exception` (no byte-literal variant name); follow-up: semantic brand-CTA token/variant.

### SI-03.11a — Shell visual tela de upload
- **Status:** completed
- **Tests:** no tests (visual shell)
- **Observations:**
  - Copy singularised (OQ-18); icons converted from Figma SVGs into `components/icons/*` (upload, video-camera, file-video, play, image, copy, check-circle).

### SI-03.11b — Wiring tela de upload
- **Status:** completed
- **Tests:** 7 passing (components/studio/__tests__/video-dropzone.wiring.test.tsx)
- **Observations:**
  - Only one upload at a time per tab (Uppy `maxNumberOfFiles: 1`); a second selection while uploading shows an inline message.

### SI-03.12.0 — Drift audit tela de processamento
- **Status:** completed
- **Tests:** no tests (audit-only)
- **Observations:**
  - Updated `frontend-drift-report.md` (node 39:1642); Phase 04 blocks of the frame not audited (OQ-20).

### SI-03.12a — Shell visual tela de processamento
- **Status:** completed
- **Tests:** no tests (visual shell)
- **Observations:**
  - Thumbnail uses `next/image` with `unoptimized` — presigned URLs expire and the optimizer would fetch from inside the container.

### SI-03.12b — Wiring tela de processamento
- **Status:** completed
- **Tests:** 14 passing (processing-screen.wiring.test.tsx: 9, hooks/__tests__/use-video-status.test.tsx: 5)
- **Observations:**
  - Hook test lives in `hooks/__tests__/` (project convention) instead of the plan's `hooks/use-video-status.test.ts`.
  - States: Uppy progress + cancel while this tab uploads; `uploading` without a Uppy session → 'Upload interrompido' (OQ-14); `beforeunload` warning in the provider.

## Final verification (2026-10-13)

- Backend unit + integration: 37 suites / 204 tests passing (`npm test -- --runInBand`).
- Backend E2E: 4 suites / 63 tests passing (`npm run test:e2e`). The script lacked `--runInBand` (documented as required in nestjs-project/CLAUDE.md); with two DB-backed e2e suites they wiped each other's tables — flag added.
- Backend `npx tsc --noEmit` and `npm run build`: pass.
- Frontend Vitest: 27 files / 111 tests passing; `npx tsc --noEmit`, `npm run lint` (0 errors) and `npm run build`: pass.
- Frontend Playwright: **not run** — requires restarting the dev server with `MSW_ENABLED=true` and installing Playwright browsers on the host.
- Backend `npm run lint`: Phase 03 files are clean; the pre-existing Phase 02 errors (auth/mail/channels specs, `channels.service.ts`, `test/auth.e2e-spec.ts`, `env.validation.integration-spec.ts`) remain — separate task.
