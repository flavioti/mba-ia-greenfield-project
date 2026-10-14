---
kind: phase
name: phase-03-upload-processing
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-upload-processing/context.md: "2026-10-13T10:45:07-03:00"
  docs/phases/phase-03-upload-processing/library-refs.md: "2026-10-13T10:44:58-03:00"
  docs/project-plan.md: "2026-10-13T08:32:05-03:00"
  docs/decisions/technical-decisions-phase-03-upload-processing.md: "2026-10-13T10:44:09-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-13T08:32:05-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-10-13T08:32:05-03:00"
  docs/phases/phase-02-auth/context.md: "2026-10-13T08:32:05-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-10-13T08:32:05-03:00"
  docs/inventories/screen-inventory-phase-03-upload-processing.md: "2026-10-13T10:35:41-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Entregar o upload de vídeos de até 10GB sem impacto na performance: o vídeo é pré-cadastrado como rascunho ao iniciar o upload, os bytes vão do browser direto ao armazenamento de arquivos (vídeos e thumbnails) via multipart pré-assinado, um serviço de processamento em segundo plano (filas) extrai duração e metadados, gera a thumbnail a partir de um frame e normaliza o arquivo para reprodução via streaming (sem necessidade de download completo), cada vídeo recebe uma URL única sem conflito com outros vídeos, e o download do vídeo pelo usuário fica disponível. Inclui as telas `/studio/videos/new` e `/studio/videos/[id]` com a camada BFF que as conecta à API.

---

## Step Implementations

### SI-03.1 — Infra: instalação e configuração do armazenamento S3-compatível

**Description:** Instalar o client SDK, criar o módulo namespaced de configuração do storage (endpoint, bucket, credenciais, TTL de URLs), adicionar o SeaweedFS ao Compose e validar a conexão no bootstrap, sem ainda implementar operações de negócio.

**Technical actions:**

1. Instalar `@aws-sdk/client-s3@^3.x` e `@aws-sdk/s3-request-presigner@^3.x` (per phase-03/TD-01, TD-02).
2. Criar `src/config/storage.config.ts` (registerAs) com `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_REGION`, `STORAGE_FORCE_PATH_STYLE`, `STORAGE_PRESIGN_TTL_SECONDS` (per phase-03/TD-09).
3. Criar `StorageModule` expondo um `S3Client` configurado com `forcePathStyle` (SeaweedFS) e a factory do ConfigModule (per padrão phase-01/TD-03).
4. Adicionar serviço `seaweedfs` (volume) no `compose.yaml` do nestjs-project e a variável de bucket autocreate no bootstrap; criar bucket `streamtube` via script de setup.
5. Atualizar `.env.example` e `env.validation.ts` (Joi) com as novas chaves; garantir `npm run migration:run` e `npm test` sem regressão.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| StorageConfigFactory | Unit | `src/config/storage.config.spec.ts` |
| StorageModule (compilation) | Unit | `src/storage/storage.module.spec.ts` |

**Dependencies:** None

**Acceptance criteria:**

- `S3Client` instancia sem erro com credenciais do `.env` local e `forcePathStyle=true`.
- `docker compose up -d` sobe SeaweedFS acessível em `http://seaweedfs:8333` dentro da rede.
- `npx tsc --noEmit` e `npm test` passam sem regressão.

---

### SI-03.2 — Infra: Redis/Valkey e BullMQ (API + worker skeleton)

**Description:** Adicionar o Redis ao Compose, registrar as filas `video-processing` e `video-maintenance` na API e criar o entrypoint do worker (`src/worker.ts`) reaproveitando TypeORM entities, sem consumidores ainda.

**Technical actions:**

1. Instalar `@nestjs/bullmq@^11.x` e `bullmq@^5.x` (per phase-03/TD-04, TD-05).
2. Adicionar serviço `redis` (Valkey) ao `compose.yaml` e variáveis `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (per phase-01/TD-01 convenção de service name).
3. Configurar `BullModule.forRootAsync` em `AppModule` e `BullModule.registerQueue({ name: 'video-processing' }, { name: 'video-maintenance' })` em `VideosModule` (per phase-03/TD-04).
4. Criar `src/worker.ts` (entrypoint Node) que bootstrap NestApp redundante mínimo: config, TypeORM, Bull consumers (placeholder), graciosamente lida c/ shutdown.
5. Adicionar script `start:worker` ao `package.json` e serviço `video-worker` (depende de redis/db/seaweedfs) ao compose, montando o mesmo volume de código em watch.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| BullModule wiring | Unit | `src/app.module.spec.ts` ( compilation smoke ) |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- API sobe registrando as duas filas sem erro; `/queues` (Bull board opcional) mostra filas registradas.
- `npm run start:worker` sobe o processo consumidor sem crash em compose.
- `npx tsc --noEmit` passa.

---

### SI-03.3 — Entidade Video + migração inicial

**Description:** Modelar a tabela `videos` (dois eixos ortogonais de estado) com public_id, source/video/thumbnail keys e metadados, gerar a migração TypeORM e a repository wiring.

**Technical actions:**

1. Criar `src/videos/entities/video.entity.ts` com colunas per TD-06 (uuid id, public_id varchar(11) unique, channel_id FK (CASCADE), title, description, original_filename, mime_type, size_bytes bigint, status enum default draft, processing_status enum default uploading, processing_error, source_key, upload_id, video_key, thumbnail_key, duration_seconds, width, height, video_codec, audio_codec, timestamps) — per phase-03/TD-06.
2. Adicionar enums `video_status` (`draft`) e `video_processing_status` (`uploading`,`processing`,`ready`,`failed`) e o índice `(processing_status, created_at)`, unique em `public_id`, index em `channel_id` (per phase-03/TD-06, TD-10).
3. Criar relação `Channel (one) ↔ Video (many)` em `channel.entity.ts` / `video.entity.ts`.
4. Rodar `npm run migration:generate -- src/database/migrations/AddVideosTable` e revisar SQL (enums, FK, índices) + `npm run migration:run`.
5. Registrar `TypeOrmModule.forFeature([Video])` em `VideosModule` e exportar `Repository<Video>`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Video entity (constraints/defaults) | Integration | `src/videos/entities/video.entity.integration-spec.ts` |
| VideosModule (compilation) | Unit | `src/videos/videos.module.spec.ts` |

**Dependencies:** SI-03.1, SI-03.2

**Acceptance criteria:**

- `npm run migration:run` cria a tabela com enums/índices/FK; `npm run migration:revert` desfaz sem erros.
- Inserir dois vídeos com mesmo `public_id` (gerado manualmente) falha com unique violation.
- Criar `Video` com payload mínimo popula defaults (`status=draft`, `processing_status=uploading`, timestamps).

---

### SI-03.4 — Helper de public_id (base62, 11 chars) e spawn-wrapper FFmpeg

**Description:** Implementar gerador de `public_id` com `crypto.randomBytes` (retry em colisão) e um wrapper spawnpromisse para `ffprobe`/`ffmpeg` com captura de stdout/stderr e timeout, testável com fake spawner.

**Technical actions:**

1. Criar `src/videos/util/public-id.util.ts` expondo `generatePublicId(length=11)` usando `crypto.randomBytes` + alfabeto base62 (per phase-03/TD-10) — retry até `N` tentativas em colisão (delega checagem ao repo).
2. Criar `src/videos/util/ffmpeg-spawn.util.ts` (`spawnFfprobe`, `spawnFfmpeg`) retornando `{exitCode, stdout, stderr}` com `timeout` e cancellation por `kill`, usando `child_process.spawn` (per phase-03/TD-07).
3. Internacionalizar erros como `ProbeFailedException`/`TranscodeFailedException` mapeados ao ErrorCatalog.
4. Testes unitários com spawner fake (sem binário real no unit) e integration smoke contra fixture de vídeo se disponível.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| PublicId util | Unit | `src/videos/util/public-id.util.spec.ts` |
| Ffmpeg spawn util | Unit | `src/videos/util/ffmpeg-spawn.util.spec.ts` |

**Dependencies:** SI-03.3

**Acceptance criteria:**

- 10.000 gerações de `publicId` não produzem duplicatas em memória (smoke estatístico).
- Spawn wrapper mata o processo em timeout e retorna `exitCode !== 0` com stderr capturado.
- `npx tsc --noEmit` passa.

---

### SI-03.5 — StorageService: operações multipart + URLs pré-assinadas de mídia

**Description:** Encapsular todas as operações S3 (CreateMultipartUpload, UploadPart presign, ListParts, CompleteMultipartUpload, AbortMultipartUpload) e presigned GET para vídeo (Range), download (attachment) e thumbnail, com o endpoint público correto.

**Technical actions:**

1. Criar `src/storage/storage.service.ts` com métodos: `createMultipartUpload(key, contentType)`, `presignPartUrl(key, uploadId, partNumber)`, `listParts(key, uploadId)`, `completeMultipartUpload(key, uploadId, parts)`, `abortMultipartUpload(key, uploadId)` (per phase-03/TD-02).
2. Adicionar `presignGetVideoUrl(key)`, `presignGetDownloadUrl(key, filename)` (ResponseContentDisposition attachment) e `presignGetThumbnailUrl(key)` (per phase-03/TD-09).
3. Usar `getSignedUrl` com `forcePathStyle` endpoint público e TTL de `STORAGE_PRESIGN_TTL_SECONDS`; assinar com endpoint público (per phase-03/TD-02/TD-09).
4. Criar `StorageModule` (export) e registrar no `VideosModule`.
5. Tratar erros S3 (`InvalidPart`, `NoSuchUpload`) mapeando para `INVALID_UPLOAD_PARTS` e 404 (per phase-03/TD-02/TD-09).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| StorageService (multipart + presign) | Integration | `src/storage/storage.service.integration-spec.ts` |

**Dependencies:** SI-03.1, SI-03.4

**Acceptance criteria:**

- CreateMultipartUpload contra SeaweedFS retorna `UploadId` e `key`.
- `presignPartUrl` retorna URL PUT válida que aceita bytes e o GET posteriormente (smoke).
- `completeMultipartUpload` com partes válidas produz objeto legível; partes inválidas lançam `INVALID_UPLOAD_PARTS`.
- Abort remove o upload (ListParts falha/empty).

---

### SI-03.6 — DTOs, VideosService e Controller (endpoints de upload)

**Description:** Implementar o CRUD/orquestração de upload: pré-cadastro do rascunho (POST /videos), presign/list parts, complete (enfileira processamento) e abort, com ownership (404 para não-dono) e ValidationPipe.

**Technical actions:**

1. Criar DTOs `CreateVideoUploadDto` (file_name, mime_type, size_bytes), `CompleteVideoUploadDto` (parts array), aplicando class-validator (per phase-02/TD-06, phase-03 validation rules) + ParseUUIDPipe/ParseIntPipe.
2. Criar `VideosService`: `createDraft(userId, dto)` (channel lookup via ChannelsService, resolve public_id com retry, source_key `videos/{id}/source`, insert uploading), `listParts`, `presignPartUrl`, `completeUpload` (CompleteMultipart + status=processing + enqueue `process-video`), `abortUpload` (AbortMultipart + status=failed/UPLOAD_ABORTED), `findById` (owner only, presigned URLs quando ready).
3. Criar `VideosController` com rotas per API Contracts §Backend tier, aplicando `@Public()`? (manter guard global sem @Public — all protected) e `@Throttle()`? (default).
4. Adicionar `public_id` retry loop em colisão e normalização de `title` (filename sem ext).
5. Exportar `Queue` injection no service via `@InjectQueue('video-processing')` (per phase-03/TD-04).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| VideosService (branch + DB) | Unit + Integration | `src/videos/videos.service.spec.ts`, `src/videos/videos.service.integration-spec.ts` |
| VideosController (validation wiring) | E2E | `test/videos.e2e-spec.ts` |

**Dependencies:** SI-03.3, SI-03.4, SI-03.5

**Acceptance criteria:**

- `POST /videos` com payload válido retorna 201 com `{videoId, uploadId, key}` e cria rascunho `processing_status=uploading`.
- `GET /videos/{id}/upload/parts/{n}/url` retorna URL assinada; parte não-owner (ou não-upload) → 404/409.
- `POST /videos/{id}/upload/complete` com partes válidas → 200 com `processing_status=processing` e job enfileirado.
- `DELETE /videos/{id}/upload` → 204 e `processing_status=failed`, `processing_error=UPLOAD_ABORTED`.
- `GET /videos/{id}` retorna URLs pré-assinadas apenas quando `ready`.

---

### SI-03.7 — VideoProcessingProcessor (ffprobe + remux/transcode + thumbnail)

**Description:** Consumer BullMQ que processa o vídeo: download do source para tmp, ffprobe, decisão remux vs transcode para MP4 faststart (H.264/AAC), geração de thumbnail JPEG (~10% duração), grava metadados + status=ready; grava failed + processing_error em erro final (attempts=3, backoff exponencial).

**Technical actions:**

1. Criar `src/videos/processors/video-processing.processor.ts` (`@Processor('video-processing')`, `@Process('process-video')`) consumindo `{videoId}` per Events/Messages (per phase-03/TD-04, TD-07).
2. Pipeline: download source → `ffprobe` (duração, resolução, codecs) → se codec browser-safe (H.264/AAC em MP4/MOV) remux faststart, senão transcode H.264/AAC MP4 faststart → thumbnail JPEG em ~10% duração → upload outputs → persistir `video_key`, `thumbnail_key`, metadados, `processing_status=ready` (per phase-03/TD-07, TD-08, TD-11).
3. Em falha final, setar `processing_status=failed` + `processing_error` (`PROBE_FAILED`/`TRANSCODE_FAILED`); idempotência por sobrescrita das chaves (per phase-03/TD-04/TD-11).
4. Configurar `attempts: 3`, `backoff: { type:'exponential', delay:5000 }`, concurrency `VIDEO_WORKER_CONCURRENCY` (default 1) no módulo (per phase-03/TD-04).
5. Limpeza de arquivos temporários (try/finally) e logging estruturado; graceful handling de SIGTERM.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| VideoProcessingProcessor (branch/pipeline) | Unit (fake spawner) + Integration (fixture vídeo + SeaweedFS real) | `src/videos/processors/video-processing.processor.spec.ts`, `src/videos/processors/video-processing.processor.integration-spec.ts` |

**Dependencies:** SI-03.3, SI-03.4, SI-03.6

**Acceptance criteria:**

- Vídeo MP4 compatível → `processing_status=ready` com `video_key`, `thumbnail_key`, duração/resolução; reproduz via Range sem download completo.
- Vídeo com codec não compatível → normalizado para H.264/AAC MP4 faststart e marcado `ready`.
- `ffprobe` falho → `processing_status=failed`, `processing_error=PROBE_FAILED` após 3 tentativas.
- Reprocessar o mesmo job sobrescreve as mesmas chaves sem erro (idempotente).

---

### SI-03.8 — AbandonedUploadCleanup (job agendado) + worker compose

**Description:** Implementar o cleanup horário de uploads abandonados (AbortMultipart + failed/UPLOAD_ABANDONED) e finalizar o worker no Compose com FFmpeg instalado na imagem dev.

**Technical actions:**

1. Criar `src/videos/processors/abandoned-upload-cleanup.processor.ts` consumindo `cleanup-abandoned-uploads` com payload `{}` selecionando vídeos `uploading` com `created_at < now() - UPLOAD_ABANDON_AFTER_HOURS` (default 24) (per phase-03/TD-12).
2. Para cada candidato: `AbortMultipartUpload` (ignorar `NoSuchUpload`) + update `processing_status=failed`, `processing_error=UPLOAD_ABANDONED`, `upload_id=null`.
3. Registrar `upsertJobScheduler('abandoned-upload-cleanup', { pattern: '0 0 * * * *' })` no bootstrap do worker (per phase-03/TD-12).
4. Atualizar `Dockerfile.dev`/`compose.yaml` para incluir `ffmpeg` e `ffprobe` na imagem API/worker (ou imagem dedicada worker com ffmpeg + node).
5. Garantir idempotência (só atua em linhas ainda `uploading`) e que o scheduler não derruba a API (worker-only).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| AbandonedUploadCleanupProcessor | Integration (DB + storage) | `src/videos/processors/abandoned-upload-cleanup.processor.integration-spec.ts` |

**Dependencies:** SI-03.6, SI-03.7

**Acceptance criteria:**

- Vídeo `uploading` com `created_at` mais antigo que a janela → abortado + marcado `failed/UPLOAD_ABANDONED`.
- Vídeo `uploading` recente → não é tocado.
- Worker container inicia com `ffmpeg`/`ffprobe` disponíveis (`which ffmpeg` exit 0).

---

### SI-03.9 — BFF: contracts + Route Handlers + integração OpenAPI (next-frontend)

**Description:** Adicionar aliases de contrato em `lib/api/contracts.ts`, regenerar `types.gen.ts` a partir do openapi exportado, e criar os Route Handlers BFF para upload (pass-through com `withRefresh`).

**Technical actions:**

1. Rodar export OpenAPI do NestJS e copiar para `next-frontend/openapi.json`; rodar script de geração (`npm run generate:api-types`) → `lib/api/types.gen.ts`.
2. Adicionar aliases em `lib/api/contracts.ts`: `CreateVideoUploadDto`, `CompleteVideoUploadDto`, `Video` (pass-through, reshape none) per phase-02-openapi-typing/TD-04.
3. Criar Route Handlers: `app/api/videos/route.ts` (POST), `app/api/videos/[id]/route.ts` (GET), `app/api/videos/[id]/upload/parts/route.ts` (GET), `app/api/videos/[id]/upload/parts/[partNumber]/url/route.ts` (GET), `app/api/videos/[id]/upload/complete/route.ts` (POST), `app/api/videos/[id]/upload/route.ts` (DELETE), cada um lendo cookie iron-session, upstream via openapi-fetch, refresh transparente no 401 (withRefresh) per phase-02-auth-frontend/TD-01/TD-03.
4. Criar MSW handlers em `mocks/handlers/videos.ts` (typed via `paths`) para os endpoints de upload (incl. reserved triggers para 404/409/invalid parts) per next-frontend-msw-foundation.
5. Atualizar `lib/auth/*` se necessário para expor helper `upstream` reusável (já existente da base).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| BFF Route Handlers (proxy + reshape) | Integration (MSW) | `app/api/videos/**/route.integration.test.ts` |

**Dependencies:** SI-03.6, SI-03.5

**Acceptance criteria:**

- Cada Route Handler retorna pass-through (sem reshape) e 401 → redirect sessão expirou per BFF policy.
- MSW handlers tipados via `paths` compilam (`npx tsc --noEmit`).
- `npm run generate:api-types` não produz diff após rodar twice (idempotente).

---

### SI-03.10 — Frontend: layout `/studio` (shell mínimo) + route guard + Uppy provider

**Description:** Criar o layout autenticado mínimo para `/studio`: AppShell, AppHeader (logo + atalho upload + avatar), route guard RSC (redirect `/login` se sem sessão), e o provider Uppy (TD-03 5.x) acima das rotas para progresso sobreviver à navegação.

**Technical actions:**

1. Instalar `@uppy/core@^5.2.0`, `@uppy/aws-s3@^5.1.0` (per phase-03/TD-03, pinned 5.x).
2. Criar `app/studio/layout.tsx` (RSC) lendo iron-session; sem sessão → `redirect('/login')`; renderiza `<AppShell>` + `<UppyProvider>`.
3. Criar componentes em `components/layout/app-shell.tsx`, `app-header.tsx`, `account-menu.tsx`, `components/ui/avatar.tsx` per UI Contracts (per OQ-17: omitir sidebar/search/subscriptions).
4. Criar `components/ui/progress.tsx` (primitive shadcn) e `components/studio/*.tsx` placeholders que serão preenchidos nas screens (dropzone/progress/status/thumbnail/link/player).
5. Criar `lib/upload/uppy.ts` instanciando Uppy core + AwsS3 plugin com `shouldUseMultipart: () => true` (per phase-03/TD-02/TD-03) e callbacks createMultipartUpload/signPart/listParts/abort/complete chamando os BFF endpoints.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| session guard (layout) | E2E | `tests/studio.e2e-spec.ts` |
| Uppy provider / util | Unit | `lib/upload/uppy.spec.ts` |

**Dependencies:** SI-03.9

**Acceptance criteria:**

- Anônimo acessando `/studio/*` → redirect `/login`.
- Autenticado renderiza shell com logo, atalho de upload e avatar; sem sidebar/search (per OQ-17).
- Instância Uppy é estável entre navegação `/studio/videos/new` → `/studio/videos/[id]` (progresso não se perde).

---

### SI-03.11.0 — Drift audit: tela de upload de vídeo (`/studio/videos/new`)

**Description:** Auditar o Figma (node 39-1594) contra os componentes existentes em disco e emitir `frontend-drift-report.md` (per schema referenced), sem edits de código.

**Technical actions:**

1. Rodar o audit per `docs/inventories/screen-inventory-phase-03-upload-processing.md` (Reused DS list) + Figma node 39-1594.
2. Emitir `docs/phases/phase-03-upload-processing/frontend-drift-report.md` seguindo schema (classification: alinhado/drift-menor/drift-relevante/ausente).
3. Listar auto-Edits (menor) a aplicar em SI-03.11a, sem CONFLICT por overlap com SI anteriores.

**Tests:** _(empty — audit-only)_

**Dependencies:** SI-03.10

**Acceptance criteria:**

- `frontend-drift-report.md` emitido com quick-scan (components, classification, drift count).
- Nenhum edit em `next-frontend/` pelo audit (AC "git diff vazio" interpretado como sem edits de código).

---

### SI-03.11a — Tela de upload de vídeo (`/studio/videos/new`): visual shell

**Description:** Implementar o visual shell da tela de upload (dropzone idle/drag-over, validação inline, botão "Select file") aplicando os auto-Edits do drift report, com copy no singular.

**Technical actions:**

1. Criar `app/studio/videos/new/page.tsx` (RSC shell + client dropzone).
2. Criar `components/studio/video-dropzone.tsx` (drag-over, validação client-side mime/size, erro inline Alert, single-file accept) per UI Contracts.
3. Aplicar auto-Edits do drift report em DS existentes se houver.
4. Compor com AppShell, AppHeader, BrandLogo, UploadNavButton, Avatar (per UI Contracts Reused DS list).

**Tests:** _(empty — shell smoke-gated by build AC; Unit tests live in SI-03.11b; E2E via /plan-test-specs)_

**Dependencies:** SI-03.10, SI-03.11.0

**Acceptance criteria:**

- Rota `/studio/videos/new` renderiza dropzone idle (ícone, copy singular, botão "Select file").
- Validação client-side rejeita tipo não aceito e arquivo >10GB com Alert inline; dropzone volta ao idle.
- `npm run build` da next-frontend compila.

---

### SI-03.11b — Tela de upload de vídeo (`/studio/videos/new`): lógica & wiring

**Description:** Conectar a dropzone ao fluxo de upload: validação, pré-cadastro via BFF, navegação para `/studio/videos/{videoId}` e erro handling com reservados MSW.

**Technical actions:**

1. Wiring RHF/validação de arquivo + chamada `POST /api/videos` (CreateVideoUploadDto) → `{videoId, uploadId, key}`.
2. Disparar fluxo Uppy (multipart) em background no provider; navegar para `/studio/videos/{videoId}`.
3. Error mapping: 400 → Alert inline; 401 → redirect `/login`; rede/5xx → Alert "Não foi possível iniciar o upload".
4. Mais de um arquivo solto → aceitar o primeiro e ignorar o restante (single-file).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| VideoDropzone wiring | Unit (Vitest+jsdom, MSW) | `components/studio/__tests__/video-dropzone.wiring.test.tsx` |

**Dependencies:** SI-03.9, SI-03.10, SI-03.11a

**Acceptance criteria:**

- Selecionar arquivo válido → pré-cadastra rascunho e navega para `/studio/videos/{videoId}`.
- Payload inválido → Alert inline + dropzone volta ao idle (sem navegação).
- Arquivo >10GB → erro inline antes de chamar a API.

---

### SI-03.12.0 — Drift audit: tela de upload e processamento (`/studio/videos/[id]`)

**Description:** Auditar Figma node 39-1642 contra disco e emitir drift report para o painel de upload/processamento (UI Contracts Reused DS list), sem edits.

**Technical actions:**

1. Rodar audit per inventory (13 componentes new) + Figma node 39-1642.
2. Emitir `frontend-drift-report.md` (ou seção adicional) com classificação por componente.
3. Listar auto-Edits para SI-03.12a.

**Tests:** _(empty — audit-only)_

**Dependencies:** SI-03.10

**Acceptance criteria:**

- Drift report emitido para a tela, sem edits de código.

---

### SI-03.12a — Tela de processamento (`/studio/videos/[id]`): visual shell

**Description:** Implementar visual shell: painel de mídia (player, thumbnail, duração, qualidade), VideoLinkField, ProcessingStatus, UploadProgress, sem lógica de polling (SI-03.12b).

**Technical actions:**

1. Criar `app/studio/videos/[id]/page.tsx` (RSC shell + client components).
2. Criar `components/studio/upload-progress.tsx`, `processing-status.tsx`, `video-link-field.tsx`, `components/video/video-player.tsx`, `components/video/video-thumbnail.tsx` per UI Contracts.
3. Compor Card/Progress/Avatar/Button primitives; copy singular e estados de skeletons.
4. Aplicar auto-Edits do drift report 03.12.0.

**Tests:** _(empty — shell smoke-gated by build AC; Unit tests live in SI-03.12b; E2E via /plan-test-specs)_

**Dependencies:** SI-03.10, SI-03.12.0

**Acceptance criteria:**

- Rota `/studio/videos/[id]` (UUID válido) renderiza painel com placeholders/skeletons até primeira resposta de `GET /api/videos/[id]`.
- Componentes de status (uploading/processing/ready/failed) renderizam a mensagem correspondente per TD-06.
- `npm run build` compila.

---

### SI-03.12b — Tela de processamento (`/studio/videos/[id]`): lógica & wiring

**Description:** Conectar ao rascunho + polling de status (3s enquanto uploading/processing) + Uppy progress + complete/cancel + copy link.

**Technical actions:**

1. Wiring: `GET /api/videos/[id]` para carregar rascunho; exibir filename/duração/qualidade/thumbnail/player quando `ready`.
2. Integrar estado Uppy (progresso multipart) → UploadProgress; botão cancelar → `cancelAll()` → `DELETE /api/videos/[id]/upload` → status `failed/UPLOAD_ABORTED`.
3. Short polling a cada 3s enquanto `uploading`/`processing`; parar em `ready`/`failed` (per phase-03/TD-13).
4. CopyLinkButton: copiar URL pública (public_id) para clipboard com toggle "copiado" ~2s; renderizar como texto não clicável (per OQ-16).
5. Estados de falha: mensagem por `processing_error` + link "Enviar outro vídeo" para `/studio/videos/new`; 404 → "Vídeo não encontrado".

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Processing screen wiring | Unit (Vitest+jsdom, MSW) | `components/studio/__tests__/processing-screen.wiring.test.tsx` |
| Polling hook | Unit | `hooks/use-video-status.test.ts` |

**Dependencies:** SI-03.9, SI-03.10, SI-03.11b, SI-03.12a

**Acceptance criteria:**

- Upload em andamento + navegação `/new`→`/[id]` preserva progresso via provider (per OQ-14).
- Polling a cada 3s enquanto uploading/processing; para em ready/failed.
- Botão cancelar aborta multipart e exibe status failed (UPLOAD_ABORTED).
- CopyLinkButton copia a URL e mostra "copiado" ~2s.

---

## Dependency Map

SI-03.1 (root)
└── SI-03.2 — depends on SI-03.1
    └── SI-03.3 — depends on SI-03.1, SI-03.2
        └── SI-03.4 — depends on SI-03.3
            └── SI-03.5 — depends on SI-03.4
                └── SI-03.6 — depends on SI-03.3, SI-03.4, SI-03.5
                    └── SI-03.7 — depends on SI-03.3, SI-03.4, SI-03.6
                        └── SI-03.8 — depends on SI-03.6, SI-03.7
                            └── SI-03.9 — depends on SI-03.5, SI-03.6 (BFF)
                                └── SI-03.10 — depends on SI-03.9
                                    ├── SI-03.11.0 — depends on SI-03.10
                                    │   └── SI-03.11a — depends on SI-03.10, SI-03.11.0
                                    │       └── SI-03.11b — depends on SI-03.9, SI-03.10, SI-03.11a
                                    └── SI-03.12.0 — depends on SI-03.10
                                        └── SI-03.12a — depends on SI-03.10, SI-03.12.0
                                            └── SI-03.12b — depends on SI-03.9, SI-03.10, SI-03.11b, SI-03.12a

## Deliverables

- [ ] SI-03.1 — Infra storage (S3-compatível)
- [ ] SI-03.2 — Infra fila (BullMQ + worker skeleton)
- [ ] SI-03.3 — Entidade Video + migração
- [ ] SI-03.4 — public_id + spawn-wrapper FFmpeg
- [ ] SI-03.5 — StorageService multipart + presigned URLs
- [ ] SI-03.6 — VideosService + Controller endpoints de upload
- [ ] SI-03.7 — VideoProcessingProcessor
- [ ] SI-03.8 — AbandonedUploadCleanup + worker compose
- [ ] SI-03.9 — BFF Route Handlers + contracts + OpenAPI
- [ ] SI-03.10 — Layout /studio + shell + Uppy provider
- [ ] SI-03.11.0 — Drift audit tela de upload
- [ ] SI-03.11a — Shell visual tela de upload
- [ ] SI-03.11b — Wiring tela de upload
- [ ] SI-03.12.0 — Drift audit tela de processamento
- [ ] SI-03.12a — Shell visual tela de processamento
- [ ] SI-03.12b — Wiring tela de processamento

**Per-screen deliverables:**

- [ ] Tela `/studio/videos/new` (upload) é roteável e cobre estados loading/success/error
- [ ] Tela `/studio/videos/[id]` (processamento) é roteável e cobre estados uploading/processing/ready/failed

**Full test suites:**

- [ ] Backend tests pass (`cd nestjs-project && npm test -- --runInBand`)
- [ ] Backend E2E tests pass (`cd nestjs-project && npm run test:e2e`)
- [ ] Backend type-check pass (`cd nestjs-project && npx tsc --noEmit`)
- [ ] Backend build pass (`cd nestjs-project && npm run build`)
- [ ] Frontend tests pass (`cd next-frontend && npm test`)
- [ ] Frontend E2E tests pass (`cd next-frontend && npx playwright test`)
- [ ] Frontend type-check pass (`cd next-frontend && npx tsc --noEmit`)
- [ ] Frontend build pass (`cd next-frontend && npm run build`)

---

## Technical Specifications

### Data Model

#### Video

Tabela `videos`. Dois eixos ortogonais de estado — `status` (publicação) + `processing_status` (pipeline) (per `phase-03-upload-processing/TD-06`).

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, generated |
| public_id | varchar(11) | unique, not null — base62 aleatório de 11 chars gerado com `crypto` (per `phase-03-upload-processing/TD-10`) |
| channel_id | uuid | FK → `channels.id`, not null, `ON DELETE CASCADE` |
| title | varchar(255) | not null — nome original do arquivo sem extensão no pré-cadastro (AMB-3) |
| description | text | nullable — vazio (`null`) no pré-cadastro (AMB-3) |
| original_filename | varchar(255) | not null |
| mime_type | varchar(100) | not null — um dos tipos aceitos (per `phase-03-upload-processing/TD-11`) |
| size_bytes | bigint | not null — 1..10737418240 (10 GiB) |
| status | enum `video_status` (`draft`) | not null, default `draft` — Fase 04 adiciona `published` (per `phase-03-upload-processing/TD-06`) |
| processing_status | enum `video_processing_status` (`uploading`, `processing`, `ready`, `failed`) | not null, default `uploading` (per `phase-03-upload-processing/TD-06`) |
| processing_error | text | nullable — motivo quando `processing_status = failed` (per `phase-03-upload-processing/TD-06`) |
| source_key | varchar(512) | not null — chave do arquivo original no bucket: `videos/{id}/source` |
| upload_id | varchar(1024) | nullable — `UploadId` do multipart S3 enquanto `uploading`; `null` após complete/abort (per `phase-03-upload-processing/TD-02`) |
| video_key | varchar(512) | nullable — MP4 reproduzível (faststart): `videos/{id}/video.mp4` (per `phase-03-upload-processing/TD-08`) |
| thumbnail_key | varchar(512) | nullable — `videos/{id}/thumbnail.jpg` (per `phase-03-upload-processing/TD-07`) |
| duration_seconds | double precision | nullable — extraído via `ffprobe` (per `phase-03-upload-processing/TD-07`) |
| width | integer | nullable |
| height | integer | nullable |
| video_codec | varchar(50) | nullable — codec do arquivo final |
| audio_codec | varchar(50) | nullable — codec do arquivo final |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now(), on update |

**Relations:** `Channel` has many `Video` (one-to-many; `Video.channel` many-to-one via `channel_id`)
**Indexes:** unique on `public_id`; index on `channel_id`; index on (`processing_status`, `created_at`) — usado pelo job de limpeza (per `phase-03-upload-processing/TD-12`)

**Storage layout** (bucket privado único; per `phase-03-upload-processing/TD-01`, `phase-03-upload-processing/TD-09`): `videos/{id}/source` (upload original), `videos/{id}/video.mp4` (saída normalizada para streaming e download), `videos/{id}/thumbnail.jpg` (frame gerado pelo worker).

### API Contracts

> _Backend tier — NestJS (`nestjs-project/`). Todos os endpoints exigem `Authorization: Bearer <access_token>` (guard global `JwtAuthGuard`, sem `@Public()`). Erros seguem o envelope `{ statusCode, error, message }` (per `phase-02-auth/TD-07`). Os bytes do vídeo nunca passam pela API: o browser envia as partes direto ao storage via URLs pré-assinadas (per `phase-03-upload-processing/TD-02`)._

#### POST /videos (SI-03.5)

Pré-cadastra o rascunho e inicia o multipart no storage (`CreateMultipartUpload`) (per `phase-03-upload-processing/TD-02`, `phase-03-upload-processing/TD-06`).

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer <access_token>

**Request body:**
- file_name: string, required — 1..255 chars; `title` do rascunho = `file_name` sem extensão
- mime_type: string, required — um de `video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska` (per `phase-03-upload-processing/TD-11`)
- size_bytes: integer, required — 1..10737418240

**Response 201:**
- videoId: string (uuid)
- uploadId: string — `UploadId` do multipart
- key: string — chave do objeto (`videos/{videoId}/source`)

**Error responses:**
- 400 VALIDATION_ERROR: corpo inválido (campo ausente, `mime_type` fora da lista, `size_bytes` > 10 GiB)
- 401 Unauthorized: sem Bearer válido

---

#### GET /videos/{id}/upload/parts (SI-03.5)

Lista as partes já enviadas (`ListParts`) — usado para retomar upload (per `phase-03-upload-processing/TD-02`).

**Request headers:**
- Authorization: Bearer <access_token>

**Response 200:**
- parts: array of `{ PartNumber: integer, Size: integer, ETag: string }`

**Error responses:**
- 400 VALIDATION_ERROR: `id` não é UUID
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND: vídeo inexistente ou de outro canal
- 409 UPLOAD_NOT_IN_PROGRESS: `processing_status` ≠ `uploading`

---

#### GET /videos/{id}/upload/parts/{partNumber}/url (SI-03.5)

Assina uma URL `PUT` de curta duração para a parte `partNumber` (`UploadPartCommand` + `getSignedUrl`), assinada contra o endpoint público do storage (per `phase-03-upload-processing/TD-02`, `phase-03-upload-processing/TD-09`).

**Request headers:**
- Authorization: Bearer <access_token>

**Response 200:**
- url: string — URL pré-assinada `PUT` (expira em `STORAGE_PRESIGN_TTL_SECONDS`)

**Error responses:**
- 400 VALIDATION_ERROR: `id` não é UUID ou `partNumber` fora de 1..10000
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND
- 409 UPLOAD_NOT_IN_PROGRESS

---

#### POST /videos/{id}/upload/complete (SI-03.5)

Conclui o multipart (`CompleteMultipartUpload`), move `processing_status` para `processing` e enfileira `process-video` (per `phase-03-upload-processing/TD-02`, `phase-03-upload-processing/TD-04`).

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer <access_token>

**Request body:**
- parts: array, required, 1..10000 itens — `{ PartNumber: integer 1..10000, ETag: string }`

**Response 200:** `Video` (shape de `GET /videos/{id}`), com `processing_status: "processing"`

**Error responses:**
- 400 VALIDATION_ERROR: corpo inválido
- 400 INVALID_UPLOAD_PARTS: o storage rejeitou a lista de partes (parte ausente, ETag divergente)
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND
- 409 UPLOAD_NOT_IN_PROGRESS

---

#### DELETE /videos/{id}/upload (SI-03.5)

Cancela o upload (`AbortMultipartUpload`); o rascunho vai para `processing_status: failed` com `processing_error: "UPLOAD_ABORTED"`.

**Request headers:**
- Authorization: Bearer <access_token>

**Response 204:** No content.

**Error responses:**
- 400 VALIDATION_ERROR: `id` não é UUID
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND
- 409 UPLOAD_NOT_IN_PROGRESS

---

#### GET /videos/{id} (SI-03.5)

Retorna o vídeo do dono, com URLs de mídia pré-assinadas quando disponíveis (per `phase-03-upload-processing/TD-09`, `phase-03-upload-processing/TD-13`). Rascunhos são visíveis apenas ao dono (AMB-2).

**Request headers:**
- Authorization: Bearer <access_token>

**Response 200:**
- id: string (uuid)
- public_id: string — 11 chars base62 (per `phase-03-upload-processing/TD-10`)
- title: string
- description: string | null
- original_filename: string
- status: `"draft"`
- processing_status: `"uploading"` | `"processing"` | `"ready"` | `"failed"`
- processing_error: string | null
- duration_seconds: number | null
- width: integer | null
- height: integer | null
- video_url: string | null — GET pré-assinado do MP4 (Range), presente quando `ready`
- thumbnail_url: string | null — GET pré-assinado da thumbnail, presente quando gerada
- download_url: string | null — GET pré-assinado com `ResponseContentDisposition: attachment`, presente quando `ready` (capability "Download do vídeo pelo usuário" — UI adiada)
- created_at: string (ISO-8601)

**Error responses:**
- 400 VALIDATION_ERROR: `id` não é UUID
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND: vídeo inexistente ou de outro canal (não revela existência)

---

> _BFF tier — frontend-exposed contract. O browser chama as rotas same-origin `app/api/videos/**`; cada Route Handler lê o access token do cookie iron-session, envia `Authorization: Bearer` ao upstream via `upstream` (openapi-fetch) e aplica refresh transparente no 401 (`withRefresh`) (per `phase-02-auth-frontend/TD-01`, `phase-02-auth-frontend/TD-03`). Contrato upstream derivado de `next-frontend/openapi.json` → `lib/api/types.gen.ts` (per `next-frontend-openapi-typing/TD-01`, `next-frontend-openapi-typing/TD-04`)._

#### POST /api/videos (SI-03.12)

**forwards-to:** `POST /videos` *(derived: project contract source)*

**Request headers:**
- Content-Type: application/json *(derived: project contract source)*

**Request body:** `CreateVideoUploadDto` *(derived: project contract source — fields per source; not re-spelled to avoid duplication)*

**Response 201 (FE-facing):** `{ videoId, uploadId, key }` — pass-through *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 400 VALIDATION_ERROR: pass-through *(derived: project contract source)*
- 401 UNAUTHORIZED: sessão ausente ou refresh falhou *(per phase-02-auth-frontend/TD-03)*

---

#### GET /api/videos/[id]/upload/parts (SI-03.13)

**forwards-to:** `GET /videos/{id}/upload/parts` *(derived: project contract source)*

**Response 200 (FE-facing):** `{ parts }` — pass-through *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 404 VIDEO_NOT_FOUND, 409 UPLOAD_NOT_IN_PROGRESS, 400 VALIDATION_ERROR: pass-through *(derived: project contract source)*
- 401 UNAUTHORIZED *(per phase-02-auth-frontend/TD-03)*

---

#### GET /api/videos/[id]/upload/parts/[partNumber]/url (SI-03.13)

**forwards-to:** `GET /videos/{id}/upload/parts/{partNumber}/url` *(derived: project contract source)*

**Response 200 (FE-facing):** `{ url }` — pass-through *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 404 VIDEO_NOT_FOUND, 409 UPLOAD_NOT_IN_PROGRESS, 400 VALIDATION_ERROR: pass-through *(derived: project contract source)*
- 401 UNAUTHORIZED *(per phase-02-auth-frontend/TD-03)*

---

#### POST /api/videos/[id]/upload/complete (SI-03.13)

**forwards-to:** `POST /videos/{id}/upload/complete` *(derived: project contract source)*

**Request headers:**
- Content-Type: application/json *(derived: project contract source)*

**Request body:** `CompleteVideoUploadDto` *(derived: project contract source — fields per source; not re-spelled to avoid duplication)*

**Response 200 (FE-facing):** `Video` — pass-through *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 400 VALIDATION_ERROR, 400 INVALID_UPLOAD_PARTS, 404 VIDEO_NOT_FOUND, 409 UPLOAD_NOT_IN_PROGRESS: pass-through *(derived: project contract source)*
- 401 UNAUTHORIZED *(per phase-02-auth-frontend/TD-03)*

---

#### DELETE /api/videos/[id]/upload (SI-03.13)

**forwards-to:** `DELETE /videos/{id}/upload` *(derived: project contract source)*

**Response 204 (FE-facing):** No content — pass-through *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 404 VIDEO_NOT_FOUND, 409 UPLOAD_NOT_IN_PROGRESS, 400 VALIDATION_ERROR: pass-through *(derived: project contract source)*
- 401 UNAUTHORIZED *(per phase-02-auth-frontend/TD-03)*

---

#### GET /api/videos/[id] (SI-03.14)

**forwards-to:** `GET /videos/{id}` *(derived: project contract source)*

**Response 200 (FE-facing):** `Video` — pass-through *(derived: project contract source; reshape: none)*. Consultado por short polling enquanto `processing_status ∈ {uploading, processing}` *(per phase-03-upload-processing/TD-13)*

**Error responses (FE-facing):**
- 404 VIDEO_NOT_FOUND, 400 VALIDATION_ERROR: pass-through *(derived: project contract source)*
- 401 UNAUTHORIZED *(per phase-02-auth-frontend/TD-03)*

---

#### Validation Rules — videos

- `file_name`: required, string, 1..255 chars
- `mime_type`: required, um de `video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`
- `size_bytes`: required, integer, 1..10737418240
- `parts`: required, array 1..10000 itens; cada item `PartNumber` integer 1..10000 e `ETag` string não vazia
- `id` (path): UUID v4 (`ParseUUIDPipe`)
- `partNumber` (path): integer 1..10000 (`ParseIntPipe` + range)

### Authorization Matrix

"Owner" = usuário autenticado dono do canal (`channels.user_id = sub`) ao qual o vídeo pertence. Não-dono recebe `404 VIDEO_NOT_FOUND` (não revela existência — AMB-2).

| Endpoint | Anonymous | Authenticated | Owner |
|----------|-----------|---------------|-------|
| POST /videos | ✗ (401) | ✓ | ✓ |
| GET /videos/{id}/upload/parts | ✗ (401) | ✗ (404) | ✓ |
| GET /videos/{id}/upload/parts/{partNumber}/url | ✗ (401) | ✗ (404) | ✓ |
| POST /videos/{id}/upload/complete | ✗ (401) | ✗ (404) | ✓ |
| DELETE /videos/{id}/upload | ✗ (401) | ✗ (404) | ✓ |
| GET /videos/{id} | ✗ (401) | ✗ (404) | ✓ |
| POST /api/videos | ✗ (401) | ✓ | ✓ |
| GET /api/videos/[id]/upload/parts | ✗ (401) | ✗ (404) | ✓ |
| GET /api/videos/[id]/upload/parts/[partNumber]/url | ✗ (401) | ✗ (404) | ✓ |
| POST /api/videos/[id]/upload/complete | ✗ (401) | ✗ (404) | ✓ |
| DELETE /api/videos/[id]/upload | ✗ (401) | ✗ (404) | ✓ |
| GET /api/videos/[id] | ✗ (401) | ✗ (404) | ✓ |
| Página `/studio/videos/new` | ✗ (redirect `/login`) | ✓ | ✓ |
| Página `/studio/videos/[id]` | ✗ (redirect `/login`) | ✗ (404 da API → estado "não encontrado") | ✓ |

### Error Catalog

Formato herdado: `{ statusCode, error, message }` (per `phase-02-auth/TD-07`); `error` carrega o `errorCode`.

| errorCode | HTTP | Trigger |
|-----------|------|---------|
| VALIDATION_ERROR | 400 | Corpo/parâmetro inválido (`ValidationPipe` / `ParseUUIDPipe` / `ParseIntPipe`) |
| INVALID_UPLOAD_PARTS | 400 | `CompleteMultipartUpload` rejeitado pelo storage (`InvalidPart` / `InvalidPartOrder` / `EntityTooSmall`) |
| VIDEO_NOT_FOUND | 404 | Vídeo inexistente ou pertencente a outro canal |
| UPLOAD_NOT_IN_PROGRESS | 409 | Operação de upload (parts / url / complete / abort) em vídeo com `processing_status` ≠ `uploading` |
| UNAUTHORIZED | 401 | BFF: sessão ausente ou refresh falhou (`withRefresh`); upstream Nest retorna `401 Unauthorized` padrão |

**Erros do pipeline (não-HTTP — gravados em `processing_error`, exibidos pela tela de processamento):**

| processing_error | Trigger |
|------------------|---------|
| UPLOAD_ABORTED | Usuário cancelou o upload (`DELETE /videos/{id}/upload`) |
| UPLOAD_ABANDONED | Job de limpeza encontrou rascunho em `uploading` há mais de `UPLOAD_ABANDON_AFTER_HOURS` (per `phase-03-upload-processing/TD-12`) |
| PROBE_FAILED | `ffprobe` falhou ou o arquivo não tem stream de vídeo (per `phase-03-upload-processing/TD-07`) |
| TRANSCODE_FAILED | `ffmpeg` falhou no remux/transcode ou na geração da thumbnail após esgotar as tentativas (per `phase-03-upload-processing/TD-07`, `phase-03-upload-processing/TD-11`) |

### Events/Messages

#### process-video (fila `video-processing`)

**Payload:**

```json
{ "videoId": "uuid" }
```

**Producer:** `VideosService.completeUpload` — após `CompleteMultipartUpload` e `processing_status = processing` (per `phase-03-upload-processing/TD-04`)
**Consumer:** `VideoProcessingProcessor` no processo worker (`src/worker.ts`, serviço compose `video-worker`) (per `phase-03-upload-processing/TD-05`)
**Trigger:** upload concluído pelo cliente.
**Processing:** baixa `source_key` para arquivo temporário → `ffprobe` (duração, resolução, codecs) → se codecs browser-safe (H.264/AAC em MP4/MOV) faz remux faststart, senão transcode para H.264/AAC MP4 faststart → gera thumbnail JPEG de um frame (~10% da duração) → grava `video_key` + `thumbnail_key` + metadados e `processing_status = ready` (per `phase-03-upload-processing/TD-07`, `phase-03-upload-processing/TD-08`, `phase-03-upload-processing/TD-11`). Na falha final grava `processing_status = failed` + `processing_error`.
**Delivery semantics:** at-least-once — `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`; processamento idempotente (reprocessar sobrescreve as mesmas chaves); concurrency do worker = `VIDEO_WORKER_CONCURRENCY` (default 1) (per `phase-03-upload-processing/TD-04`, `phase-03-upload-processing/TD-11`)

#### cleanup-abandoned-uploads (fila `video-maintenance`)

**Payload:**

```json
{}
```

**Producer:** job scheduler `abandoned-upload-cleanup` (`upsertJobScheduler`, `pattern: '0 0 * * * *'` — de hora em hora), registrado no bootstrap do worker (per `phase-03-upload-processing/TD-12`)
**Consumer:** `AbandonedUploadCleanupProcessor` no processo worker
**Trigger:** schedule.
**Processing:** seleciona vídeos com `processing_status = uploading` e `created_at < now() - UPLOAD_ABANDON_AFTER_HOURS` (default 24) → `AbortMultipartUpload` (ignora `NoSuchUpload`) → `processing_status = failed`, `processing_error = UPLOAD_ABANDONED`, `upload_id = null`.
**Delivery semantics:** at-least-once; idempotente (só atua em linhas ainda `uploading`)

### UI Contracts

**Shell autenticado mínimo (comum às duas telas — DG-1 + OQ-17):** layout `app/studio/layout.tsx` (RSC) lê a sessão iron-session; sem sessão → `redirect('/login')`. Header com BrandLogo, atalho de upload e avatar da sessão. Itens de fases futuras (busca, aside com Home / Subscriptions / Liked videos / Your videos, lista de canais inscritos, menu de conta com logout) são **omitidos** nesta fase (OQ-17). O provider de upload (instância Uppy) vive neste layout para o progresso sobreviver à navegação `/studio/videos/new` → `/studio/videos/[id]` (OQ-14).

#### Screen: Tela de upload de vídeo

**Route:** `/studio/videos/new`
**Figma:** https://www.figma.com/design/0RPjuDoEGx4nzxWjwqei6S/?node-id=39-1594 (node `0RPjuDoEGx4nzxWjwqei6S:39:1594`)
**Purpose:** "Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance"

**Auth requirement:** Authenticated _(source: §Authorization Matrix — `POST /api/videos`)_

**Rendering strategy:** Server Component (RSC) para a página e o shell (sessão lida no servidor, sem flicker) + Client Components (`"use client"`) para dropzone/seleção de arquivo _(source: phase-02-auth-frontend/TD-06; client upload per phase-03-upload-processing/TD-03)_

**Reused DS components:**
- `components/layout/app-shell.tsx` (new) — AppShell — Shell autenticado mínimo (DG-1). O route guard depende do estado de sessão no servidor e redireciona anônimos para /login
- `components/layout/app-header.tsx` (new) — AppHeader — Contêiner do header (Fase 03: logo + atalho de upload + avatar; busca omitida — OQ-17)
- `components/auth/brand-logo.tsx` — BrandLogo — StreamtubeIcon + wordmark "StreamTube"; reusado de `components/auth/` (OQ-19)
- `components/icons/streamtube-icon.tsx` — StreamtubeIcon — Sub-componente do BrandLogo
- `components/ui/icon-button.tsx` — UploadNavButton "camera" — Atalho de upload no header. Navegação client-side (Next.js `<Link>`) para `/studio/videos/new`
- `components/layout/account-menu.tsx` (new) — AccountAvatarButton — Nesta fase só exibe o avatar da sessão já carregada (`components/auth/session-provider.tsx`). O menu de conta com logout é da Fase 04 (DG-1)
- `components/ui/avatar.tsx` (new) — Avatar img — Primitive de avatar ainda não existe no repo
- `components/studio/video-dropzone.tsx` (new) — VideoDropzone — Área drag-and-drop de um único arquivo com estado local de drag-over e erro de validação; ao soltar/selecionar dispara o fluxo de upload (per phase-03-upload-processing/TD-02, phase-03-upload-processing/TD-03)
- `components/ui/button.tsx` — SelectFileButton "Select file" — Abre o seletor nativo (`<input type="file">` sem `multiple`)

_Omitidos na Fase 03 (OQ-17 / OQ-20): `components/layout/app-sidebar.tsx`, `components/layout/sidebar-nav-item.tsx`, `components/layout/search-bar.tsx`, `components/layout/sidebar-subscriptions.tsx`, SidebarToggleButton._

**Server-connected components:**
- `VideoDropzone` + `SelectFileButton` — verbs: Pré-cadastrar o vídeo como rascunho ao iniciar o upload do arquivo; Enviar o arquivo de vídeo selecionado (até 10GB) em partes; Armazenar o arquivo de vídeo enviado no armazenamento de objetos | endpoint: `POST /api/videos` + `GET /api/videos/[id]/upload/parts/[partNumber]/url` + `GET /api/videos/[id]/upload/parts` + `POST /api/videos/[id]/upload/complete` + `DELETE /api/videos/[id]/upload` (§API Contracts → BFF tier — see for `forwards-to` + request/response/projection) | reuse: `components/studio/video-dropzone.tsx` (new)

**Behaviors:**

*Rendered states:*
- Loading: após selecionar o arquivo, dropzone desabilitada com indicador "Iniciando upload…" até `POST /api/videos` responder; então navega para `/studio/videos/{videoId}`
- Empty: estado idle do Figma (ícone de upload, "Drag and drop a video file to upload", "Your videos will be private until you publish them.", botão "Select file") — copy no singular (OQ-18)
- Success: navegação para `/studio/videos/{videoId}` com o upload seguindo em background no provider
- Error: mensagem inline (`Alert`) dentro da dropzone; dropzone volta ao idle (OQ-15)

*Interactions:*
- Arrastar arquivo sobre `<VideoDropzone>` → estado drag-over (borda/realce); sair → volta ao idle
- Soltar arquivo ou escolher via `<SelectFileButton>` → validação client-side (tipo + tamanho) → inicia upload ou exibe erro inline
- Mais de um arquivo solto → aceita apenas o primeiro e ignora o restante (single-file — inventory decision)

**Error Catalog → UX mapping:**

| errorCode (from §Error Catalog) | UX treatment |
|---------------------------------|--------------|
| `VALIDATION_ERROR` | Alert inline na dropzone com a mensagem do servidor; volta ao idle |
| `UNAUTHORIZED` | Redirect para `/login` |
| _(erro de rede / 5xx)_ | Alert inline "Não foi possível iniciar o upload. Tente novamente." |

**Client-side validation mirror:** _(source: §API Contracts → Validation Rules — `POST /videos`)_

- `mime_type`: arquivo deve ser `video/mp4`, `video/quicktime`, `video/webm` ou `video/x-matroska` (atributo `accept` + checagem antes do upload)
- `size_bytes`: 1..10737418240 (arquivo vazio ou > 10 GiB → erro inline, upload não inicia)
- `file_name`: 1..255 chars

**Accessibility notes:**
- Dropzone operável por teclado (o botão "Select file" é o caminho acessível); mensagem de erro anunciada via `role="alert"`.
- Follow DS defaults.

#### Screen: Tela de upload e processamento do vídeo

**Route:** `/studio/videos/[id]` _(`[id]` = UUID interno do vídeo — AMB-4)_
**Figma:** https://www.figma.com/design/0RPjuDoEGx4nzxWjwqei6S/?node-id=39-1642 (node `0RPjuDoEGx4nzxWjwqei6S:39:1642`)
**Purpose:** "Processamento automático do vídeo após upload (extração de duração e metadados)"

**Auth requirement:** Authenticated+Owner _(source: §Authorization Matrix — `GET /api/videos/[id]`; não-dono recebe 404)_

**Rendering strategy:** Server Component (RSC) para a página e o shell + Client Components (`"use client"`) para progresso do upload (estado do provider Uppy) e short polling de status _(source: phase-02-auth-frontend/TD-06; polling per phase-03-upload-processing/TD-13)_

**Reused DS components:**
- `components/layout/app-shell.tsx` (new) — AppShell — see screen: Tela de upload de vídeo
- `components/layout/app-header.tsx` (new) — AppHeader — see screen: Tela de upload de vídeo
- `components/auth/brand-logo.tsx` — BrandLogo — see screen: Tela de upload de vídeo
- `components/icons/streamtube-icon.tsx` — StreamtubeIcon — see screen: Tela de upload de vídeo
- `components/ui/icon-button.tsx` — UploadNavButton "camera" / CopyLinkButton — atalho de upload (see screen: Tela de upload de vídeo); CopyLinkButton copia para a área de transferência no cliente
- `components/layout/account-menu.tsx` (new) — AccountAvatarButton — see screen: Tela de upload de vídeo
- `components/ui/avatar.tsx` (new) — Avatar img — see screen: Tela de upload de vídeo
- `components/ui/card.tsx` — Card do painel de upload / VideoMediaPanel — Container principal e painel lateral de mídia
- `components/studio/upload-progress.tsx` (new) — UploadProgress — Progresso do upload multipart (nome do arquivo, percentual, rótulo de estado) recebido via props do provider Uppy (per phase-03-upload-processing/TD-03)
- `components/ui/progress.tsx` (new) — ProgressBar — Primitive do DS ainda não criada; recebe `value` via props
- `components/video/video-player.tsx` (new) — VideoPlayer — `<video>` nativo com `video_url` (MP4 progressivo via HTTP Range) (per phase-03-upload-processing/TD-08, phase-03-upload-processing/TD-09)
- `components/studio/video-link-field.tsx` (new) — VideoLinkField — URL única (`public_id`) como texto copiável com estado local "copiado" (toggle) (per phase-03-upload-processing/TD-10, OQ-16)
- `components/studio/processing-status.tsx` (new) — ProcessingStatus — Mapeia `processing_status` / `processing_error` para mensagem + ícone (per phase-03-upload-processing/TD-06, phase-03-upload-processing/TD-13)
- `components/video/video-thumbnail.tsx` (new) — ThumbnailPreview — Exibe a thumbnail gerada (`thumbnail_url`) ou placeholder

_Omitidos na Fase 03 (Fase 04 — "Edição das informações do vídeo" / "Fluxo de rascunho → publicação"): VideoDetailsForm, Textarea, CategorySelect, VisibilityRadioGroup, ChangeThumbnailButton, SaveDraftButton, PublishButton (`components/studio/video-details-form.tsx`, `components/ui/textarea.tsx`, `components/ui/select.tsx`, `components/ui/radio-group.tsx`)._

**Server-connected components:**
- `UploadProgress` — verbs: Enviar o arquivo de vídeo ao armazenamento acompanhando o progresso | endpoint: `GET /api/videos/[id]/upload/parts/[partNumber]/url` + `POST /api/videos/[id]/upload/complete` + `DELETE /api/videos/[id]/upload` (§API Contracts → BFF tier — see for `forwards-to` + request/response/projection) | reuse: `components/studio/upload-progress.tsx` (new)
- `FilenameRow` — verbs: Carregar o rascunho pré-cadastrado do vídeo (nome original do arquivo) | endpoint: `GET /api/videos/[id]` (§API Contracts → BFF tier) | reuse: new
- `ProcessingStatus` — verbs: Acompanhar o status de processamento do vídeo | endpoint: `GET /api/videos/[id]` (§API Contracts → BFF tier) | reuse: `components/studio/processing-status.tsx` (new)
- `VideoDuration` + `VideoQualityRow` — verbs: Exibir duração e qualidade extraídas do vídeo | endpoint: `GET /api/videos/[id]` (§API Contracts → BFF tier) | reuse: new
- `ThumbnailPreview` — verbs: Exibir a thumbnail gerada automaticamente | endpoint: `GET /api/videos/[id]` (§API Contracts → BFF tier) | reuse: `components/video/video-thumbnail.tsx` (new)
- `VideoLinkField` — verbs: Exibir o link único do vídeo | endpoint: `GET /api/videos/[id]` (§API Contracts → BFF tier) | reuse: `components/studio/video-link-field.tsx` (new)
- `VideoPlayer` — verbs: Reproduzir a prévia do vídeo enviado sem baixá-lo por completo | endpoint: `GET /api/videos/[id]` (`video_url`) (§API Contracts → BFF tier) | reuse: `components/video/video-player.tsx` (new)

**Behaviors:**

*Rendered states:*
- Loading: skeletons no painel de mídia e no status até a primeira resposta de `GET /api/videos/[id]`
- Empty: not applicable
- Success:
  - `uploading` com sessão Uppy ativa → UploadProgress com percentual ("Uploading… N%") + botão cancelar; player/thumbnail em placeholder
  - `uploading` sem sessão Uppy (reload) → ProcessingStatus "Upload interrompido" a partir do estado do rascunho (OQ-14)
  - `processing` → ProcessingStatus "Processando…"; duração/qualidade/thumbnail/player indisponíveis (skeleton/placeholder)
  - `ready` → ProcessingStatus "Checks complete. No issues found."; VideoPlayer com `video_url`, ThumbnailPreview, duração (`m:ss`), qualidade (`{height}p`), Video link
  - polling a cada 3 s enquanto `uploading`/`processing`; para em `ready`/`failed` (per phase-03-upload-processing/TD-13)
- Error: `failed` → ProcessingStatus com mensagem por `processing_error` (`UPLOAD_ABORTED`, `UPLOAD_ABANDONED`, `PROBE_FAILED`, `TRANSCODE_FAILED`) + link "Enviar outro vídeo" para `/studio/videos/new`; `VIDEO_NOT_FOUND` → estado "Vídeo não encontrado"

*Interactions:*
- `<CopyLinkButton>` click → copia a URL completa do vídeo para a área de transferência e mostra "copiado" por ~2 s
- Botão cancelar no `<UploadProgress>` → `cancelAll()` do Uppy (aborta o multipart via `DELETE /api/videos/[id]/upload`) → status `failed` (`UPLOAD_ABORTED`)
- Upload em andamento + tentativa de fechar/recarregar a aba → aviso `beforeunload` (OQ-14)

**Error Catalog → UX mapping:**

| errorCode (from §Error Catalog) | UX treatment |
|---------------------------------|--------------|
| `VIDEO_NOT_FOUND` | Estado "Vídeo não encontrado" com link para `/studio/videos/new` |
| `UPLOAD_NOT_IN_PROGRESS` | Ignorado no cliente (upload já concluído/cancelado); polling segue refletindo o status do servidor |
| `INVALID_UPLOAD_PARTS` | ProcessingStatus de erro "Falha ao concluir o upload" + link "Enviar outro vídeo" |
| `UNAUTHORIZED` | Redirect para `/login` |
| `VALIDATION_ERROR` | _TBD — implementer decides per screen_ (só ocorre com `id` inválido → tratar como "Vídeo não encontrado") |

**Client-side validation mirror:** _None — a tela não submete formulários nesta fase (formulário de detalhes é Fase 04)._

**Accessibility notes:**
- ProcessingStatus com `aria-live="polite"` para anunciar mudanças de status do polling.
- ProgressBar com `aria-valuenow`/`aria-valuemin`/`aria-valuemax` (primitive shadcn).
- Follow DS defaults.

### UI ↔ API Traceability Matrix

| Verb | Component | Screen | Endpoint (from API Contracts) | TD ref |
|------|-----------|--------|-------------------------------|--------|
| Pré-cadastrar o vídeo como rascunho ao iniciar o upload do arquivo | VideoDropzone + SelectFileButton | /studio/videos/new | POST /api/videos → forwards-to POST /videos | phase-03-upload-processing/TD-06 |
| Enviar o arquivo de vídeo selecionado (até 10GB) em partes | VideoDropzone + SelectFileButton | /studio/videos/new | GET /api/videos/[id]/upload/parts/[partNumber]/url → forwards-to GET /videos/{id}/upload/parts/{partNumber}/url | phase-03-upload-processing/TD-02, phase-03-upload-processing/TD-03 |
| Armazenar o arquivo de vídeo enviado no armazenamento de objetos | VideoDropzone | /studio/videos/new | POST /api/videos/[id]/upload/complete → forwards-to POST /videos/{id}/upload/complete | phase-03-upload-processing/TD-01, phase-03-upload-processing/TD-02 |
| Enviar o arquivo de vídeo ao armazenamento acompanhando o progresso | UploadProgress | /studio/videos/[id] | GET /api/videos/[id]/upload/parts → forwards-to GET /videos/{id}/upload/parts; DELETE /api/videos/[id]/upload → forwards-to DELETE /videos/{id}/upload | phase-03-upload-processing/TD-03 |
| Carregar o rascunho pré-cadastrado do vídeo (nome original do arquivo) | FilenameRow | /studio/videos/[id] | GET /api/videos/[id] → forwards-to GET /videos/{id} | phase-03-upload-processing/TD-06 |
| Acompanhar o status de processamento do vídeo | ProcessingStatus | /studio/videos/[id] | GET /api/videos/[id] → forwards-to GET /videos/{id} | phase-03-upload-processing/TD-13 |
| Exibir duração e qualidade extraídas do vídeo | VideoDuration + VideoQualityRow | /studio/videos/[id] | GET /api/videos/[id] → forwards-to GET /videos/{id} | phase-03-upload-processing/TD-07 |
| Exibir a thumbnail gerada automaticamente | ThumbnailPreview | /studio/videos/[id] | GET /api/videos/[id] → forwards-to GET /videos/{id} | phase-03-upload-processing/TD-07, phase-03-upload-processing/TD-09 |
| Exibir o link único do vídeo | VideoLinkField | /studio/videos/[id] | GET /api/videos/[id] → forwards-to GET /videos/{id} | phase-03-upload-processing/TD-10 |
| Reproduzir a prévia do vídeo enviado sem baixá-lo por completo | VideoPlayer | /studio/videos/[id] | GET /api/videos/[id] → forwards-to GET /videos/{id} (`video_url`) | phase-03-upload-processing/TD-08, phase-03-upload-processing/TD-09 |

_Capabilities marked in `## Non-UI / Deferred Capabilities` are excluded from this matrix ("Serviço de processamento em segundo plano (filas)" — non-ui; "Download do vídeo pelo usuário" — deferred; `download_url` já é entregue por `GET /videos/{id}`)._

---

## Dependency Map

<!-- Dep Map will be written in Phase B -->

---

## Deliverables

<!-- Deliverables will be written in Phase B -->
