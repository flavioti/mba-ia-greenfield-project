---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-10-13
scope_description: "Upload and processing of videos up to 10GB: object storage engine, upload protocol (browser ↔ BFF ↔ API ↔ storage handshake), background job queue, video worker topology and FFmpeg invocation, video lifecycle states, unique public video IDs, streaming/download delivery, accepted formats, abandoned-upload cleanup, and how the frontend surfaces upload and processing progress."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — primary subproject. Owns the `videos` domain (entity, draft pre-registration, upload orchestration endpoints), the storage service (S3 API client), the queue producer, and the video worker (FFmpeg metadata + thumbnail). Its `compose.yaml` gains the object storage and queue backing services. Covered by TD-01, TD-02, TD-04 through TD-13 (all except TD-03).
- `next-frontend/` — owns the upload screen, the BFF Route Handlers that proxy upload orchestration calls (`app/api/videos/**`), the browser-side upload client, and the processing-status display. Covered by TD-02, TD-03, TD-06, TD-08, TD-09, TD-10, TD-11, TD-13.

> Cross-doc anchors (already decided — do NOT reopen):
> - **Strict BFF — single server-only `API_URL`:** `next-frontend-config-base/TD-03`. The browser never calls the NestJS API directly. This constraint is about the **NestJS API**; the architecture diagram (`docs/diagrams/software-arch.mermaid`) already models a direct `Frontend → Object Storage` relationship ("Streams, HTTPS"), and `next-frontend/CLAUDE.md` § Talking to the NestJS API notes "Media streaming will eventually come from Object Storage (S3/MinIO) — TBD". TD-02 and TD-09 resolve that TBD.
> - **Auth model:** custom JWT guards with a global `JwtAuthGuard` and `@Public()` opt-out (`phase-02-auth/TD-02`); BFF iron-session cookie carrying the access token and transparent refresh on upstream 401 (`phase-02-auth-frontend/TD-01..TD-03`). Upload orchestration endpoints are authenticated; media playback must also work anonymously (project-plan § Principais Características).
> - **Error envelope:** `{ statusCode, error, message }` via the custom domain exception filter (`phase-02-auth/TD-07`).
> - **Validation:** class-validator + class-transformer on the backend (`phase-02-auth/TD-06`); Zod 4 + react-hook-form on the frontend (`phase-02-auth-frontend/TD-04`).
> - **Config:** `@nestjs/config` + Joi + namespaced `registerAs` (`phase-01-configuracao-base/TD-01..TD-04`). New storage/queue env keys follow that pattern.
> - **OpenAPI contract chain + MSW per domain:** `openapi-docs-nestjs/TD-01..TD-03`, `next-frontend-openapi-typing/TD-01..TD-05`, `next-frontend-msw-foundation/TD-01..TD-04`. Phase 03 adds a `videos` domain to both sides; no new decision needed there.
> - **Mutation pathway on the FE:** Route Handler POST + client `fetch` (`phase-02-auth-frontend/TD-05`).

> Dependency map: TD-01 → TD-02 (the storage engine must support presigned multipart + CORS). TD-02 → TD-03 (client library depends on protocol). TD-04 → TD-05 (worker topology depends on queue tech). TD-08 ↔ TD-11 (delivery format and accepted inputs are coupled). TD-02 → TD-12 (cleanup depends on how uploads are staged). TD-04 → TD-12 (cleanup reuses the queue).

---

## TD-01: Object Storage Engine (S3-compatible, local/dev)

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** The architecture diagram names "S3 or MinIO". Since that diagram was drawn, MinIO's community edition changed status: Docker images and pre-built binaries stopped being published in October 2025, the project entered maintenance mode on 2025-12-03, and the repository was reported archived (read-only) in April 2026. `minio/minio` pulls from Docker Hub are no longer reliable. The engine is a `compose.yaml` service plus a set of env keys (endpoint, credentials, bucket) consumed by the API and the worker, so it is a cross-file contract. Application code talks to it through the S3 API (AWS SDK v3), so the engine is swappable later — but the choice still decides dev ergonomics, presigned-multipart/CORS support (needed by TD-02), and license exposure.

**Options:**

### Option A: SeaweedFS (S3 gateway, single container `weed server -s3`)
- Mature (10+ years) distributed file store with an S3 API served through its filer; Apache 2.0. One container can run master + volume + filer + S3 for dev.
- **Pros:** Permissive license; long track record; documents multipart uploads, presigned URLs, CORS and bucket policies; lightweight enough for a laptop.
- **Cons:** S3 compatibility goes through the filer and is "good but not identical" to AWS in edge cases; credentials are configured via a JSON identities file rather than two env vars; no polished web console.

### Option B: RustFS
- Newer Rust implementation positioned as a MinIO drop-in (same env-var style, console UI); Apache 2.0.
- **Pros:** Closest developer experience to MinIO (root user/password env vars, web console); broad S3 feature table (multipart, presigned, versioning, lifecycle).
- **Cons:** Young project — maturity and API-edge-case coverage are less proven than SeaweedFS; release cadence and breaking changes are still settling.

### Option C: Garage
- Lightweight geo-distributed S3 store written in Rust; AGPL-3.0.
- **Pros:** Very small footprint; supports multipart and presigned URLs; stable for core S3 operations.
- **Cons:** AGPL (irrelevant for a dev container, but a consideration if ever shipped); requires a bootstrap step (layout assignment + key creation via CLI) before first use, which complicates a one-command `docker compose up`; no versioning/object-lock.

### Option D: MinIO pinned to the last community release (Quay / Chainguard image)
- Keep MinIO, pinning the last published community image from Quay or the free Chainguard rebuild.
- **Pros:** Best-known DX (env-var credentials, console, `mc` CLI); most tutorials/examples target it; matches the diagram text.
- **Cons:** Archived upstream — no security fixes or bug fixes; image availability depends on third parties; builds the project on a dead dependency that will likely need replacing before Phase 07 anyway.

**Recommendation:** **Option A (SeaweedFS)** — it is the mature, permissively licensed replacement that supports everything TD-02 and TD-09 need (presigned multipart, CORS, presigned GET with Range); because the API and worker use the plain S3 API via AWS SDK v3 (`forcePathStyle: true`), switching to RustFS later or to managed S3/R2 in Phase 07 is an env/compose change only. Option B is the right pick if a MinIO-like console matters more than maturity. The architecture diagram's "S3 or MinIO" label should be updated during `/plan-build`.

**Decision:** A (SeaweedFS — single-container `weed server -s3`)
**Libraries:** @aws-sdk/client-s3

---

## TD-02: Upload Protocol for Files up to 10GB (resumable)

**Scope:** Cross-layer

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** The project plan's attention points demand that a 10GB upload "não trave o sistema e permita retomar em caso de falha de conexão". The strict-BFF model routes browser traffic through Next.js Route Handlers, but Next.js buffers proxied request bodies in memory and silently truncates beyond `proxyClientMaxBodySize` (default 10MB) — proxying 10GB through the BFF is not viable. The protocol defines the handshake on both sides: which endpoints the API exposes, what the BFF proxies, what the browser sends where, and how "upload finished" is detected (which triggers the draft → processing transition and the job enqueue).

**Options:**

### Option A: S3 multipart with presigned part URLs (browser → storage direct; API orchestrates)
- Browser asks BFF → API to *create* an upload (API pre-registers the draft video, calls `CreateMultipartUpload`, returns `videoId` + `uploadId`). For each part (e.g., 64–100MB) the browser gets a presigned `PUT` URL via BFF → API and uploads the bytes **directly to storage**. On finish, the browser calls BFF → API *complete* (`CompleteMultipartUpload`), and the API enqueues the processing job. Resume = `ListParts` and re-upload only missing parts.
- **Pros:** Zero video bytes traverse Next.js or NestJS — API/BFF memory and CPU stay flat regardless of file size; resumable per part; parallel part uploads; standard S3 semantics that work identically on SeaweedFS and managed S3. Only small JSON orchestration calls go through the BFF, so the strict-BFF rule for the **API** stays intact.
- **Cons:** Introduces a sanctioned browser → storage path (needs bucket CORS exposing `ETag`, and a browser-reachable storage endpoint for signing — see TD-09); more orchestration endpoints (create / sign-part / list-parts / complete / abort); completion is client-driven, so abandoned uploads need cleanup (TD-10).

### Option B: tus protocol served by NestJS (`@tus/server` + `@tus/s3-store`)
- NestJS mounts a tus endpoint; the browser streams chunks via tus (`PATCH` with offsets); the tus server writes them to storage as S3 multipart.
- **Pros:** Purpose-built resumable protocol with mature clients (tus-js-client, Uppy); server-side hooks (`onUploadFinish`) make completion detection server-driven.
- **Cons:** All 10GB flows through NestJS (bandwidth + event-loop pressure on the API — the "impacto na performance" the plan wants to avoid). Under strict BFF, tus would have to pass through Next.js too (memory buffering — not viable) **or** the browser must call NestJS directly, breaking `next-frontend-config-base/TD-03`. `@tus/server` 2.x is ESM-only; multi-instance needs a shared KV store (Redis).

### Option C: Custom chunked upload through BFF → API → storage
- Browser splits the file into small chunks (≤ BFF body limit), POSTs each to a Route Handler that forwards to NestJS, which appends to an S3 multipart upload.
- **Pros:** Keeps every byte inside the BFF → API path; no storage CORS or public storage endpoint for uploads.
- **Cons:** Every byte crosses two Node processes (double bandwidth, double latency); hand-rolled resumability and chunk bookkeeping; chunk size capped by the BFF buffer limit, so thousands of requests per 10GB file. Highest custom code for the worst performance.

**Recommendation:** **Option A (S3 multipart with presigned part URLs)** — it is the only option where file size has no effect on API or BFF resources, it is natively resumable, and it keeps the strict-BFF rule intact for the NestJS API (only orchestration JSON is proxied; the direct path is browser → storage, which the architecture diagram already models). The cost is bucket CORS plus a browser-reachable signing endpoint, both small config contracts.

**Decision:** A (S3 multipart with presigned part URLs — browser → storage direct; API orchestrates)
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

---

## TD-03: Browser Upload Client Library

**Scope:** Frontend

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** Depends on TD-02. With presigned multipart, the browser must slice the `File`, request signatures, `PUT` parts with retry/concurrency, track ETags, report progress, and resume after a reload or network drop. This is a dependency choice for `next-frontend/` (no existing upload code).

**Options:**

### Option A: Uppy core + `@uppy/aws-s3` (multipart mode), custom UI
- Use `@uppy/core` + `@uppy/aws-s3` with `shouldUseMultipart` and the `createMultipartUpload` / `signPart` / `listParts` / `completeMultipartUpload` / `abortMultipartUpload` callbacks pointed at our BFF routes. Render progress with our own shadcn components (no Uppy Dashboard), optionally `@uppy/golden-retriever` for resume after reload.
- **Pros:** Retry with backoff, part concurrency, progress events and resume logic are maintained upstream; callback contract maps 1:1 onto TD-02's endpoints; UI stays on the design system.
- **Cons:** Adds a dependency family (core + aws-s3 + optional golden-retriever); Uppy's state model must be bridged into React (hooks/`useSyncExternalStore`); version-specific behavior (multipart defaults changed across majors) must be pinned and verified.

### Option B: Hand-written multipart client (`File.slice` + `fetch`/XHR)
- A small `lib/upload/` module: slice the file, call BFF for signatures, `PUT` parts with a concurrency pool and retries, persist `{videoId, uploadId, completedParts}` in IndexedDB for resume. XHR is needed for per-part upload progress.
- **Pros:** No dependency; full control; tiny bundle.
- **Cons:** Retry/backoff, concurrency, abort, resume, and progress aggregation all become our code and our tests — the riskiest part of the phase, hand-rolled.

**Recommendation:** **Option A (Uppy core + `@uppy/aws-s3`, custom UI)** — the resilience logic (retries, concurrency, resume) is exactly the part that is expensive to get right and test; Uppy's multipart callbacks line up with TD-02 Option A's endpoints, and skipping its Dashboard keeps the UI on the shadcn design system. Pick B only if minimizing dependencies outweighs the extra test surface.

**Decision:** A (Uppy core + `@uppy/aws-s3` in multipart mode, custom shadcn UI)
**Libraries:** @uppy/core, @uppy/aws-s3

**Revisions:**
- 2026-10-13 — Uppy pinned to the 5.x major (`@uppy/core@^5.2.0`, `@uppy/aws-s3@^5.1.0`); 6.x replaced the multipart callbacks (createMultipartUpload/signPart/listParts/abortMultipartUpload/completeMultipartUpload) with a single `signRequest` where the browser calls Create/Complete itself, which breaks TD-02's "API orchestrates" contract. Rationale: Param updated to match lib version (Context7 migration guide, plan-resolve).

---

## TD-04: Background Job Queue Technology

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** The diagram leaves "Message Queue: TBD". Processing (ffprobe + thumbnail + any remux) must run outside the request path with retries and failure visibility. The choice adds (or not) a compose service and env keys, and decides the NestJS integration module.

**Options:**

### Option A: BullMQ on Redis/Valkey (`@nestjs/bullmq`)
- Official NestJS integration (`BullModule.forRoot`, `@Processor`, `WorkerHost`); BullMQ is the actively developed successor to Bull. Jobs live in Redis.
- **Pros:** First-class Nest docs and decorators; retries with exponential backoff, concurrency, job progress, delayed and repeatable jobs (useful for TD-10 cleanup), stalled-job recovery; large ecosystem.
- **Cons:** New infra service (Redis or Valkey container) and env keys; Redis persistence must be configured if jobs must survive restarts.

### Option B: pg-boss (PostgreSQL-backed queue)
- Job queue built on PostgreSQL `SKIP LOCKED`; uses the database already in the stack.
- **Pros:** No new infra; jobs are transactional with the `videos` row (enqueue in the same transaction as the status change); simple ops.
- **Cons:** No official NestJS module (community wrappers or manual provider); adds load on the primary DB; smaller ecosystem than BullMQ.

### Option C: RabbitMQ (`@nestjs/microservices` RMQ transport or `amqplib`)
- Message broker with durable queues; worker consumes messages.
- **Pros:** True broker semantics, routing, DLQs; language-agnostic consumers (a non-Node worker would be possible).
- **Cons:** Heaviest infra; Nest's RMQ transport is RPC/event-oriented, not a job queue (no built-in retry/backoff/progress — must be built); more concepts for a single job type.

**Recommendation:** **Option A (BullMQ on Redis/Valkey)** — it is the queue the NestJS docs officially support, and it ships the job semantics this phase needs (retries/backoff, progress, repeatable jobs for cleanup) without building them; the cost is one Redis/Valkey container. Option B is a strong alternative if avoiding new infra is the priority — say so at decision time.

**Decision:** A (BullMQ on Redis/Valkey via `@nestjs/bullmq`)
**Libraries:** @nestjs/bullmq, bullmq

---

## TD-05: Video Worker Topology

**Scope:** Backend

**Capability:** Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** The diagram models the Video Worker as a separate container ("FFmpeg") that consumes the queue and updates DB and storage. Where its code lives decides whether it reuses the API's TypeORM entities, config modules and storage service, and how it is built, tested and run. Depends on TD-04.

**Options:**

### Option A: Same NestJS codebase, separate entrypoint and compose service
- Add `src/worker.ts` bootstrapping a `WorkerModule` (`NestFactory.createApplicationContext`) that imports the shared `videos`/storage/config modules and registers the BullMQ processor. A second compose service (`video-worker`) runs it from an image that also installs FFmpeg.
- **Pros:** Reuses entities, migrations, config validation, storage service and test helpers — no duplicated domain code; independently scalable process, matching the diagram; one lint/test/tsc pipeline.
- **Cons:** API image and worker image diverge only by FFmpeg and command; module boundaries must keep HTTP-only providers out of the worker context.

### Option B: Separate subproject (`video-worker/`)
- Its own `package.json`, Dockerfile and test setup; talks to DB and storage directly.
- **Pros:** Strict isolation; could later be rewritten in another language.
- **Cons:** Duplicates the `videos` entity/schema knowledge and config validation across two codebases (schema drift risk); a third subproject to maintain in a monorepo without workspace tooling.

### Option C: In-process processor inside the API
- Register the BullMQ processor in the API process itself.
- **Pros:** Simplest — no new service.
- **Cons:** FFmpeg CPU spikes run in the API container and compete with request handling — the "impacto na performance" the plan forbids; contradicts the diagram.

**Recommendation:** **Option A (same codebase, separate entrypoint and service)** — it keeps the worker in its own process/container as the diagram requires, while reusing the TypeORM entities and config so there is a single source of truth for the `videos` schema.

**Decision:** A (Same NestJS codebase, separate entrypoint and compose service)

---

## TD-06: Video Lifecycle State Model

**Scope:** Cross-layer

**Capability:** Pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Context:** A video row is created when the upload starts (draft), then moves through upload → processing → ready/failed. Phase 04 adds draft → published and public/unlisted visibility. The state shape is returned by the API and rendered by the FE (upload screen now, channel panel in Phase 04), so it is a wire contract.

**Options:**

### Option A: Two orthogonal fields — `status` (publication) + `processing_status` (pipeline)
- `status: draft` (Phase 04 adds `published`) and `processing_status: uploading | processing | ready | failed` (+ `processing_error`).
- **Pros:** Each axis evolves independently (Phase 04 changes only `status`); queries are simple ("published AND ready" for listings); FE renders two clear badges.
- **Cons:** Some combinations must be guarded by rules (e.g., cannot publish unless `ready`).

### Option B: Single state machine enum
- `uploading → processing → draft → published`, plus `failed`.
- **Pros:** One field; invalid combinations are unrepresentable.
- **Cons:** Conflates publication with technical pipeline; Phase 04 features (re-processing, editing a published video's thumbnail) force new combined states; harder to extend.

**Recommendation:** **Option A (two orthogonal fields)** — Phase 04 owns publication and Phase 03 owns processing; separate fields let each phase change its own axis without migrating the other's semantics.

**Decision:** A (Two orthogonal fields — `status` + `processing_status`)

---

## TD-07: FFmpeg Invocation and Binary Sourcing

**Scope:** Backend

**Capability:** Transversal — covers: "Processamento automático do vídeo após upload (extração de duração e metadados)", "Geração automática de thumbnail a partir de um frame do vídeo"

**Context:** The worker must run `ffprobe` (duration, resolution, codecs) and `ffmpeg` (thumbnail frame, faststart remux per TD-08/TD-11). The usual Node wrapper, `fluent-ffmpeg`, is deprecated and unmaintained on npm. The choice spans the worker Dockerfile and the processing code.

**Options:**

### Option A: System FFmpeg in the worker image + thin typed `child_process.spawn` wrapper
- `apt install ffmpeg` in the worker image; a small `FfmpegService` that spawns `ffprobe -print_format json -show_format -show_streams` and parses the result into typed DTOs, and spawns `ffmpeg` for thumbnail/remux, streaming input from a presigned GET URL or temp file.
- **Pros:** No unmaintained dependency; typed, testable surface we own; distro-patched binary.
- **Cons:** We write arg building and error mapping (small, ~100 LOC); FFmpeg version follows the base image's distro.

### Option B: `fluent-ffmpeg` + system FFmpeg
- Fluent builder API over the CLI.
- **Pros:** Familiar API; less arg-string handling.
- **Cons:** Deprecated, unmaintained — open bugs will not be fixed; outdated types; a dead dependency on the critical path.

### Option C: `ffmpeg-static` / `ffprobe-static` npm binaries + spawn wrapper
- Binaries are pulled via npm instead of the OS.
- **Pros:** Pinned FFmpeg version via `package.json`; works identically on any host.
- **Cons:** Large install (~70MB+ per binary), downloaded at `npm install` time in every container including the API; static builds lag security patches.

**Recommendation:** **Option A (system FFmpeg + thin spawn wrapper)** — avoids the deprecated `fluent-ffmpeg`, keeps FFmpeg only in the worker image, and the wrapper is small enough to unit-test with a fake spawner and integration-test against a fixture video.

**Decision:** A (System FFmpeg in the worker image + thin typed `child_process.spawn` wrapper)

---

## TD-08: Streaming Delivery Format

**Scope:** Cross-layer

**Capability:** Reprodução via streaming (sem necessidade de download completo)

**Context:** "Streaming" means playback starts before the whole file arrives. The format determines worker cost (TD-07), storage layout, and the player the FE uses (Phase 05 builds the full player; Phase 03 must prove streaming works). Coupled with TD-11 (which inputs are accepted).

**Options:**

### Option A: Progressive MP4 over HTTP Range (faststart)
- Worker produces one MP4 with the `moov` atom at the front (`-movflags +faststart`, stream-copy when codecs are already H.264/AAC). The browser `<video>` element plays it directly with HTTP Range requests from storage.
- **Pros:** Native `<video>` support, no player library; seeking works via Range; processing is a fast remux (minutes → seconds) for compatible inputs; one file serves both streaming and download (TD-09).
- **Cons:** Single bitrate — no adaptive quality for slow connections; a 4K upload streams at 4K.

### Option B: HLS adaptive bitrate (multiple renditions + `.m3u8`)
- Worker transcodes into several resolutions segmented as HLS; FE uses `hls.js` (or native on Safari).
- **Pros:** Adaptive quality, YouTube-like behavior; segment caching friendly.
- **Cons:** Full transcode of up to 10GB × N renditions — hours of CPU per video locally; many objects per video; signing per-segment URLs (or making segments public) complicates TD-09; adds a player dependency.

### Option C: Progressive now, HLS as a later enhancement
- Ship Option A in Phase 03; record HLS as a deferred capability for a later phase/task if needed.
- **Pros:** Delivers the capability at Option A's cost while explicitly keeping the door open.
- **Cons:** Same as A for this phase; just a documentation commitment.

**Recommendation:** **Option A (progressive MP4 over Range, faststart)** — it satisfies "reprodução sem download completo" with the browser's native player and a cheap remux, keeps the worker within laptop CPU budgets for 10GB inputs, and reuses the same object for downloads. HLS (Option B) only pays off with multi-rendition needs the plan does not state.

**Decision:** A (Progressive MP4 over HTTP Range, faststart)

---

## TD-09: Media Access Strategy (streaming, download, thumbnails)

**Scope:** Cross-layer

**Capability:** Transversal — covers: "Reprodução via streaming (sem necessidade de download completo)", "Download do vídeo pelo usuário", "Serviço de armazenamento de arquivos (vídeos e thumbnails)"

**Context:** Anonymous users must be able to stream and download; drafts must not be publicly reachable; Phase 04 adds unlisted (link-only). Bytes should flow storage → browser without passing through the BFF or API (same performance argument as TD-02). Presigned URLs are signed against a host: inside Docker the API reaches storage at its Compose service name, but the browser needs a host-reachable address — so the signing endpoint is a cross-component env contract (`S3_ENDPOINT` internal vs `S3_PUBLIC_ENDPOINT` browser-facing). Note: per CLAUDE.md, service-to-service hosts use Compose service names; the public endpoint is the one legitimate browser-facing exception.

**Options:**

### Option A: Private bucket + short-lived presigned GET URLs issued by the API
- The API (via BFF for page data) returns presigned GET URLs for the video file and thumbnail when the caller is allowed to see the video. Download uses the same mechanism with `response-content-disposition=attachment`.
- **Pros:** Access is decided by the API per request (drafts hidden, unlisted works in Phase 04 without changing storage); Range requests work on presigned URLs; no bytes through Node.
- **Cons:** URLs expire (TTL must exceed typical watch time, or the player must refresh them); thumbnails in listings each need a signature (cheap, CPU-only); signed URLs aren't CDN-cache-friendly without extra config.

### Option B: Public-read prefix for ready videos + unguessable object keys
- Ready videos/thumbnails are written under a public-read prefix with random keys; drafts live in a private prefix.
- **Pros:** Simple, cacheable, stable URLs; no signing.
- **Cons:** Once a URL leaks it is permanent; unpublishing/unlisting in Phase 04 requires moving objects or changing ACLs; access rules live in storage policy instead of the API.

### Option C: Stream through the API/BFF (proxy with Range forwarding)
- The FE requests `/api/videos/{id}/stream`; BFF → API → storage, forwarding Range headers.
- **Pros:** Single origin; full control and logging per byte.
- **Cons:** Every viewer's bytes cross two Node processes — the opposite of the phase's performance goal; download of 10GB through the BFF hits the same buffering concerns as uploads.

**Recommendation:** **Option A (private bucket + presigned GET)** — the API stays the single authority for who may see a video (drafts now, unlisted in Phase 04) while bytes go straight from storage to the browser with Range support; one mechanism serves streaming, download and thumbnails.

**Decision:** A (Private bucket + short-lived presigned GET URLs issued by the API)
**Libraries:** @aws-sdk/s3-request-presigner

---

## TD-10: Unique Public Video ID (URL slug)

**Scope:** Cross-layer

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** The plan asks for "uma URL curta e única que nunca conflite". Existing entities use UUID primary keys. The public ID appears in FE routes (`/watch/{id}` in Phase 05), API paths and storage keys, so its format is a cross-layer contract.

**Options:**

### Option A: Random base62 short ID (11 chars) in a unique column, UUID stays as PK
- Generate with `crypto.randomBytes` (or `nanoid` with a custom alphabet) → 11 base62 chars (~65 bits); unique index; retry on the (astronomically rare) collision.
- **Pros:** Short, URL-safe, YouTube-like; non-enumerable; independent from the internal PK; collision guaranteed impossible by the unique constraint + retry.
- **Cons:** Extra column and index; generation helper to test.

### Option B: Use the UUID primary key in the URL
- **Pros:** Zero extra work; already unique.
- **Cons:** 36 chars — not "curta"; UUID v4 is fine for uniqueness but fails the short-URL requirement.

### Option C: Sequential ID encoded with Sqids
- Encode a bigint sequence into a short string.
- **Pros:** Shortest IDs; deterministic, no collision handling.
- **Cons:** Reversible encoding — sequence and upload volume are inferable; needs a sequence column alongside the UUID PK; the alphabet/shuffle becomes a secret that must never change.

**Recommendation:** **Option A (random base62, 11 chars, unique column)** — it meets "curta e única" with a DB-enforced guarantee, does not leak volume, and keeps the existing UUID PK convention untouched. Generating with Node's `crypto` avoids adding a dependency.

**Decision:** A (Random base62 short ID, 11 chars, unique column; UUID stays as PK)

---

## TD-11: Accepted Input Formats and Playback Normalization

**Scope:** Cross-layer

**Capability:** Transversal — covers: "Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance", "Processamento automático do vídeo após upload (extração de duração e metadados)"

**Context:** With TD-08's progressive MP4, only H.264/AAC (or VP9/AV1 in WebM) play reliably across browsers. Users will upload MOV, MKV, HEVC, etc. The FE needs the accepted-type list for the file picker and client-side pre-validation; the API validates declared size/type at upload creation (10GB cap); the worker decides remux vs transcode vs reject.

**Options:**

### Option A: Accept common containers; remux when compatible, transcode to H.264/AAC otherwise
- Accept `video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`. Worker: if codecs are browser-safe → faststart remux (seconds); else → transcode to H.264/AAC MP4 (slow, CPU-heavy).
- **Pros:** Users can upload almost anything; output is always playable.
- **Cons:** Transcoding a 10GB HEVC file takes a long time on a dev machine; worker concurrency must be limited.

### Option B: Accept common containers; remux when compatible, mark `failed` otherwise
- Same accepted list, but incompatible codecs end in `processing_status: failed` with a clear `processing_error` ("codec not supported").
- **Pros:** Fast, predictable processing; simple worker; still covers the most common case (phone/camera MP4 H.264).
- **Cons:** Some valid uploads are rejected after the full upload — poor UX for HEVC phone videos.

### Option C: Accept MP4 (H.264/AAC) only
- **Pros:** Simplest pipeline (remux only).
- **Cons:** Users must convert beforehand; codec can't be verified client-side, so failures still happen post-upload.

**Recommendation:** **Option A (accept common containers, remux or transcode)** — it is the only option where every accepted upload ends playable, which matters for a YouTube-like product; the cost is bounded by limiting worker concurrency (TD-04) and is invisible to the user because processing is asynchronous. Choose B if the long transcode times in local development are unacceptable for this course project.

**Decision:** A (Accept common containers; remux when compatible, transcode to H.264/AAC otherwise)

---

## TD-12: Abandoned Upload Cleanup

**Scope:** Backend

**Capability:** Pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Context:** With TD-02 Option A the draft row exists from the moment the upload starts, and completion is client-driven. Closed tabs leave a draft stuck in `uploading` and orphan multipart parts consuming storage (the plan flags storage growth as an attention point).

**Options:**

### Option A: Scheduled cleanup job (BullMQ repeatable) + storage lifecycle rule as safety net
- A repeatable job marks drafts in `uploading` older than N hours as `failed` and calls `AbortMultipartUpload`; the bucket also gets an `AbortIncompleteMultipartUpload` lifecycle rule (if the engine supports it).
- **Pros:** DB and storage converge; defense in depth; reuses the queue from TD-04.
- **Cons:** Two mechanisms to configure; lifecycle support varies by engine (TD-01).

### Option B: Scheduled cleanup job only
- **Pros:** Single mechanism, engine-independent, fully testable in integration tests.
- **Cons:** If the job is down, orphan parts accumulate until it runs again.

### Option C: No automatic cleanup (resume-only)
- **Pros:** Nothing to build.
- **Cons:** Unbounded storage growth from abandoned uploads; stuck drafts pollute the channel panel in Phase 04.

**Recommendation:** **Option B (scheduled cleanup job only)** — it keeps behavior engine-independent (TD-01's lifecycle support differs between SeaweedFS, RustFS and managed S3) and testable end-to-end; a lifecycle rule can be added later as an ops improvement without changing app code. The staleness window N must exceed the expected time to resume an interrupted 10GB upload (suggested: 24h).

**Decision:** B (Scheduled cleanup job only)

---

## TD-13: Processing Status Updates to the Frontend

**Scope:** Cross-layer

**Capability:** Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** After the upload finishes, processing runs asynchronously; the upload screen should show "processing → ready (with thumbnail and duration)" or "failed". Upload byte progress is client-side (TD-03) and not part of this decision. The transport shapes both the API (endpoint vs event stream) and the BFF (Route Handlers proxying a long-lived stream are a new pattern).

**Options:**

### Option A: Short polling via BFF (`GET /api/videos/{id}` every few seconds while not terminal)
- **Pros:** Reuses the existing Route Handler + `upstream` pattern and MSW test style; no long-lived connections; trivially resilient to reconnects.
- **Cons:** Some wasted requests; latency up to the poll interval.

### Option B: Server-Sent Events (API emits, BFF streams through)
- **Pros:** Push updates with low latency; one connection per watcher.
- **Cons:** The BFF must proxy a streaming response with auth refresh; the API needs a pub/sub path from worker → API process (Redis pub/sub or BullMQ `QueueEvents`); harder to test with the current MSW setup.

**Recommendation:** **Option A (short polling via BFF)** — processing takes seconds to minutes and only the uploader watches it, so polling's overhead is negligible while it fits the existing BFF and MSW testing patterns with zero new infrastructure.

**Decision:** A (Short polling via BFF)

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|----------------|--------|
| TD-01 | Backend | Object storage engine (S3-compatible) | **A** (SeaweedFS) | _[pending]_ |
| TD-02 | Cross-layer | Upload protocol for files up to 10GB | **A** (S3 multipart with presigned part URLs, browser → storage) | _[pending]_ |
| TD-03 | Frontend | Browser upload client library | **A** (Uppy core + `@uppy/aws-s3`, custom UI) | _[pending]_ |
| TD-04 | Backend | Background job queue technology | **A** (BullMQ on Redis/Valkey) | _[pending]_ |
| TD-05 | Backend | Video worker topology | **A** (same NestJS codebase, separate entrypoint + compose service) | _[pending]_ |
| TD-06 | Cross-layer | Video lifecycle state model | **A** (`status` + `processing_status`) | _[pending]_ |
| TD-07 | Backend | FFmpeg invocation and binary sourcing | **A** (system FFmpeg + typed spawn wrapper) | _[pending]_ |
| TD-08 | Cross-layer | Streaming delivery format | **A** (progressive MP4, faststart, HTTP Range) | _[pending]_ |
| TD-09 | Cross-layer | Media access strategy | **A** (private bucket + presigned GET) | _[pending]_ |
| TD-10 | Cross-layer | Unique public video ID | **A** (random base62, 11 chars) | _[pending]_ |
| TD-11 | Cross-layer | Accepted input formats and normalization | **A** (remux or transcode to H.264/AAC) | _[pending]_ |
| TD-12 | Backend | Abandoned upload cleanup | **B** (scheduled cleanup job only) | _[pending]_ |
| TD-13 | Cross-layer | Processing status updates to the frontend | **A** (short polling via BFF) | _[pending]_ |

---

## Notes for downstream pipeline

- **Capability trace (per TD):** storage → TD-01, TD-09; queue → TD-04; 10GB upload → TD-02, TD-03, TD-11; draft pre-registration → TD-06, TD-12; processing/metadata → TD-05, TD-07, TD-11, TD-13; thumbnail → TD-07; unique URL → TD-10; streaming → TD-08, TD-09; download → TD-09. Aggregate coverage is assembled by `plan-context`.
- **Monolithic phase doc.** No `covers_capabilities` is declared — this single doc covers both subprojects. If the user prefers the Phase 02 pattern (separate backend and frontend docs), the FE-only TD-03 can move to a sibling slice; all other cross-layer TDs must stay here (one contract, decided once).
- **New env contract (TD-01/TD-02/TD-04/TD-09):** storage endpoint (internal, Compose service name), storage public endpoint (browser-facing — the only legitimate host-reachable URL), access key/secret, bucket name, region, Redis host/port (Compose service name). These land in the Joi schema, `compose.yaml` and `.env.example` together.
- **Diagram update (TD-01/TD-04):** `docs/diagrams/software-arch.mermaid` should replace "S3 or MinIO" and "Message Queue: TBD" with the decided engines, and `next-frontend/CLAUDE.md` § Talking to the NestJS API should document the sanctioned browser → storage path (presigned upload parts + presigned GET).
- **BFF exception wording (TD-02/TD-09):** the strict-BFF rule (`next-frontend-config-base/TD-03`) is about the NestJS API and is not reopened. `.claude/rules/next-frontend-bff-api.md` should gain a short "Object storage" note so later phases don't misread presigned URLs as a BFF violation.
- **Testing inheritance:** existing integration tests use real Postgres and real Mailpit containers; the same pattern (real storage + real Redis containers in compose, MSW on the FE) is the default — no separate testing TD is opened.
- **ESM note:** `nestjs-project` compiles with `module: nodenext` on Node 25, where `require(esm)` is supported, so ESM-only packages are not a blocker; TD-10 recommends `crypto` anyway to avoid a dependency.
- **Out of scope here:** player UI/controls (Phase 05), publication/visibility/custom thumbnail editing (Phase 04), production storage/CDN (Phase 07).

Sources consulted during research:
- [MinIO maintenance mode and S3 alternatives](https://alexandre-vazquez.com/minio-maintenance-mode-s3-open-source-alternatives/), [MinIO Docker images discontinued (lobehub#9845)](https://github.com/lobehub/lobehub/issues/9845), [Chainguard — MinIO image changes](https://www.chainguard.dev/unchained/secure-and-free-minio-chainguard-containers) — MinIO community status (TD-01).
- [Self-hosted S3 alternatives in 2026 (RustFS, Garage, SeaweedFS, Ceph)](https://dev.to/rosgluk/self-hosted-s3-alternatives-in-2026-rustfs-garage-seaweedfs-ceph-4klp), [RustFS vs SeaweedFS vs Garage](https://blog.elest.io/rustfs-vs-seaweedfs-vs-garage-which-minio-alternative-should-you-pick/), [Local S3 with SeaweedFS & Garage in Docker Compose](https://www.sitepoint.com/local-s3-storage-without-minio-seaweedfs-garage-docker-compose/) — engine comparison (TD-01; third-party, verify features against official docs at `/plan-resolve`).
- [Next.js `proxyClientMaxBodySize`](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize) — BFF body buffering and silent truncation (TD-02).
- [@tus/server](https://npmjs.com/package/%40tus%2Fserver), [@tus/s3-store](https://npmjs.com/package/%40tus%2Fs3-store), [tus-node-server 1.0 announcement](https://tus.io/blog/2023/09/04/tus-node-server-v100) — tus option (TD-02).
- [Uppy AWS S3 (multipart)](https://uppy.io/docs/aws-s3-multipart), [Uppy 3.3–3.13 release notes](https://uppy.io/blog/2023/07/3.3-3.13/) — browser client (TD-03).
- [NestJS — Queues (`@nestjs/bullmq`)](https://docs.nestjs.com/techniques/queues), [BullMQ docs](https://docs.bullmq.io/bull/install) — queue (TD-04, TD-12).
- [fluent-ffmpeg on npm (deprecated)](https://npmjs.com/package/fluent-ffmpeg) — FFmpeg wrapper status (TD-07).
- Context7 MCP was not available in this session; library versions should be pinned and checked against official docs in `/plan-resolve` (`library-refs.md`).
