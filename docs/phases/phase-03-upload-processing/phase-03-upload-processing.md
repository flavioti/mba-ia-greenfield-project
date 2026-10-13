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

<!-- SIs will be written in Phase B -->

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
