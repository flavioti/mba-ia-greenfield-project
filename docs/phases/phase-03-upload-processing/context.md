---
kind: phase
name: phase-03-upload-processing
sources_mtime:
  docs/project-plan.md: "2026-10-13T08:32:05-03:00"
  docs/decisions/technical-decisions-phase-03-upload-processing.md: "2026-10-13T10:44:09-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-13T08:32:05-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-10-13T08:32:05-03:00"
  docs/phases/phase-02-auth/context.md: "2026-10-13T08:32:05-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-10-13T08:32:05-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-10-13T08:32:05-03:00"
  .claude/skills/testing-guide-next-frontend/SKILL.md: "2026-10-13T08:32:05-03:00"
  docs/inventories/screen-inventory-phase-03-upload-processing.md: "2026-10-13T10:35:41-03:00"
  docs/phases/phase-03-upload-processing/library-refs.md: "2026-10-13T10:44:58-03:00"
---

# phase-03-upload-processing — Context

## Scope

**Phase name:** Upload e Processamento de Vídeos

Phase intro (verbatim): "Upload de arquivos grandes sem travar o sistema, processamento automático do vídeo e geração de URL única."

**Capabilities** (literal, `docs/project-plan.md`):

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** _Not specified._
**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.
**Affected subprojects:** _None named explicitly. The phase section in project-plan.md does not mention any subproject path._
**Deferred subprojects:** _None._
**Sequencing notes:** > Depende de: Fase 01, Fase 02

**Neighbors (for boundary detection only):**

- **Phase 02:** Cadastro, Login e Gerenciamento de Conta — "Fluxo completo de criação de conta, confirmação por e-mail, login, logout e recuperação de senha."
- **Phase 04:** Gerenciamento de Vídeos e Canal (Depende de: Fase 02, Fase 03) — "Edição das informações do vídeo, fluxo de rascunho e publicação, painel de administração do canal e página pública."

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries | Renders in |
|-----|--------|-------|-------|--------|----------|-----------|------------|
| phase-03-upload-processing/TD-01 | phase | Backend | Object Storage Engine (S3-compatible, local/dev) | decided | A (SeaweedFS) | @aws-sdk/client-s3 | — |
| phase-03-upload-processing/TD-02 | phase | Cross-layer | Upload Protocol for Files up to 10GB (resumable) | decided | A (S3 multipart with presigned part URLs) | @aws-sdk/client-s3, @aws-sdk/s3-request-presigner | — |
| phase-03-upload-processing/TD-03 | phase | Frontend | Browser Upload Client Library | decided | A (Uppy core + @uppy/aws-s3, custom UI) | @uppy/core, @uppy/aws-s3 | — |
| └─ Last revision: 2026-10-13 — Uppy pinned to 5.x (`@uppy/core@^5.2.0`, `@uppy/aws-s3@^5.1.0`); 6.x dropped the multipart callbacks | | | | | | | |
| phase-03-upload-processing/TD-04 | phase | Backend | Background Job Queue Technology | decided | A (BullMQ on Redis/Valkey) | @nestjs/bullmq, bullmq | — |
| phase-03-upload-processing/TD-05 | phase | Backend | Video Worker Topology | decided | A (Same codebase, separate entrypoint + service) | — | — |
| phase-03-upload-processing/TD-06 | phase | Cross-layer | Video Lifecycle State Model | decided | A (Two orthogonal fields) | — | — |
| phase-03-upload-processing/TD-07 | phase | Backend | FFmpeg Invocation and Binary Sourcing | decided | A (System FFmpeg + spawn wrapper) | — | — |
| phase-03-upload-processing/TD-08 | phase | Cross-layer | Streaming Delivery Format | decided | A (Progressive MP4 over Range, faststart) | — | — |
| phase-03-upload-processing/TD-09 | phase | Cross-layer | Media Access Strategy (streaming, download, thumbnails) | decided | A (Private bucket + presigned GET) | @aws-sdk/s3-request-presigner | — |
| phase-03-upload-processing/TD-10 | phase | Cross-layer | Unique Public Video ID (URL slug) | decided | A (Random base62, 11 chars) | — | — |
| phase-03-upload-processing/TD-11 | phase | Cross-layer | Accepted Input Formats and Playback Normalization | decided | A (Remux when compatible, else transcode H.264/AAC) | — | — |
| phase-03-upload-processing/TD-12 | phase | Backend | Abandoned Upload Cleanup | decided | B (Scheduled cleanup job only) | — | — |
| phase-03-upload-processing/TD-13 | phase | Cross-layer | Processing Status Updates to the Frontend | decided | A (Short polling via BFF) | — | — |

_Source files:_

- phase-03-upload-processing — `docs/decisions/technical-decisions-phase-03-upload-processing.md` (scope_type: phase, related_phases: [3])

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-upload-processing/TD-01, phase-03-upload-processing/TD-09 |
| Serviço de processamento em segundo plano (filas) | phase-03-upload-processing/TD-04 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-upload-processing/TD-02, phase-03-upload-processing/TD-03, phase-03-upload-processing/TD-11 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-upload-processing/TD-06, phase-03-upload-processing/TD-12 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-upload-processing/TD-05, phase-03-upload-processing/TD-07, phase-03-upload-processing/TD-11, phase-03-upload-processing/TD-13 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-upload-processing/TD-07 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-upload-processing/TD-10 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-upload-processing/TD-08, phase-03-upload-processing/TD-09 |
| Download do vídeo pelo usuário | phase-03-upload-processing/TD-09 |

## Decisions Detail

### phase-03-upload-processing/TD-01

**Recommendation:** It is the mature, permissively licensed replacement that supports everything TD-02 and TD-09 need (presigned multipart, CORS, presigned GET with Range); because the API and worker use the plain S3 API via AWS SDK v3 (`forcePathStyle: true`), switching to RustFS later or to managed S3/R2 in Phase 07 is an env/compose change only. Option B is the right pick if a MinIO-like console matters more than maturity. The architecture diagram's "S3 or MinIO" label should be updated during `/plan-build`.
**Libraries:** @aws-sdk/client-s3

### phase-03-upload-processing/TD-02

**Recommendation:** It is the only option where file size has no effect on API or BFF resources, it is natively resumable, and it keeps the strict-BFF rule intact for the NestJS API (only orchestration JSON is proxied; the direct path is browser → storage, which the architecture diagram already models). The cost is bucket CORS plus a browser-reachable signing endpoint, both small config contracts.
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

### phase-03-upload-processing/TD-03

**Recommendation:** The resilience logic (retries, concurrency, resume) is exactly the part that is expensive to get right and test; Uppy's multipart callbacks line up with TD-02 Option A's endpoints, and skipping its Dashboard keeps the UI on the shadcn design system. Pick B only if minimizing dependencies outweighs the extra test surface.
**Libraries:** @uppy/core, @uppy/aws-s3
**Revisions:**
- 2026-10-13 — Uppy pinned to the 5.x major (`@uppy/core@^5.2.0`, `@uppy/aws-s3@^5.1.0`); 6.x replaced the multipart callbacks (createMultipartUpload/signPart/listParts/abortMultipartUpload/completeMultipartUpload) with a single `signRequest` where the browser calls Create/Complete itself, which breaks TD-02's "API orchestrates" contract. Rationale: Param updated to match lib version (Context7 migration guide, plan-resolve).

### phase-03-upload-processing/TD-04

**Recommendation:** It is the queue the NestJS docs officially support, and it ships the job semantics this phase needs (retries/backoff, progress, repeatable jobs for cleanup) without building them; the cost is one Redis/Valkey container. Option B is a strong alternative if avoiding new infra is the priority — say so at decision time.
**Libraries:** @nestjs/bullmq, bullmq

### phase-03-upload-processing/TD-05

**Recommendation:** It keeps the worker in its own process/container as the diagram requires, while reusing the TypeORM entities and config so there is a single source of truth for the `videos` schema.
**Libraries:** —

### phase-03-upload-processing/TD-06

**Recommendation:** Phase 04 owns publication and Phase 03 owns processing; separate fields let each phase change its own axis without migrating the other's semantics.
**Libraries:** —

### phase-03-upload-processing/TD-07

**Recommendation:** Avoids the deprecated `fluent-ffmpeg`, keeps FFmpeg only in the worker image, and the wrapper is small enough to unit-test with a fake spawner and integration-test against a fixture video.
**Libraries:** —

### phase-03-upload-processing/TD-08

**Recommendation:** It satisfies "reprodução sem download completo" with the browser's native player and a cheap remux, keeps the worker within laptop CPU budgets for 10GB inputs, and reuses the same object for downloads. HLS (Option B) only pays off with multi-rendition needs the plan does not state.
**Libraries:** —

### phase-03-upload-processing/TD-09

**Recommendation:** The API stays the single authority for who may see a video (drafts now, unlisted in Phase 04) while bytes go straight from storage to the browser with Range support; one mechanism serves streaming, download and thumbnails.
**Libraries:** @aws-sdk/s3-request-presigner

### phase-03-upload-processing/TD-10

**Recommendation:** It meets "curta e única" with a DB-enforced guarantee, does not leak volume, and keeps the existing UUID PK convention untouched. Generating with Node's `crypto` avoids adding a dependency.
**Libraries:** —

### phase-03-upload-processing/TD-11

**Recommendation:** It is the only option where every accepted upload ends playable, which matters for a YouTube-like product; the cost is bounded by limiting worker concurrency (TD-04) and is invisible to the user because processing is asynchronous. Choose B if the long transcode times in local development are unacceptable for this course project.
**Libraries:** —

### phase-03-upload-processing/TD-12

**Recommendation:** It keeps behavior engine-independent (TD-01's lifecycle support differs between SeaweedFS, RustFS and managed S3) and testable end-to-end; a lifecycle rule can be added later as an ops improvement without changing app code. The staleness window N must exceed the expected time to resume an interrupted 10GB upload (suggested: 24h).
**Libraries:** —

### phase-03-upload-processing/TD-13

**Recommendation:** Processing takes seconds to minutes and only the uploader watches it, so polling's overhead is negligible while it fits the existing BFF and MSW testing patterns with zero new infrastructure.
**Libraries:** —

## Inherited Decisions Detail

### phase-01-configuracao-base/TD-01

**Recommendation:** Option A (@nestjs/config) — Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem: the factory function can be imported as a plain function by `data-source.ts` while also serving as a DI injection token inside NestJS. Building a custom module recreates solved functionality; third-party packages carry maintenance risk.

**Libraries:** `@nestjs/config@^4.x`

### phase-01-configuracao-base/TD-02

**Recommendation:** Option A (Joi) — First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring. Handles string-to-number coercion natively. Using a different tool for env validation vs. request validation is reasonable — env config is validated once at startup, DTOs are validated per-request. Zod is elegant but adds a third validation paradigm to the project.

**Libraries:** `joi@^17.x`

### phase-01-configuracao-base/TD-03

**Recommendation:** Option B (Namespaced/grouped with registerAs) — The project roadmap explicitly calls for auth, email, and storage in upcoming phases. Namespaced configs provide clear file boundaries per domain, typed injection via `ConfigType<typeof databaseConfig>`, and natural scalability. The `registerAs()` factory is dual-purpose: DI token inside NestJS and plain importable function for `data-source.ts`. Initial files for Phase 01: `src/config/database.config.ts`, `src/config/app.config.ts`.

**Libraries:** —

### phase-01-configuracao-base/TD-04

**Recommendation:** Option A (Shared registerAs factory) — Natural outcome of choosing `@nestjs/config` with `registerAs`. The factory is already callable by design. `data-source.ts` imports it, calls `dotenv.config()`, then calls the factory. Zero duplication, minimal code, no extra abstraction.

**Libraries:** `dotenv` (transitive via `@nestjs/config`)

### phase-02-auth/TD-01

**Recommendation:** Argon2id — For a greenfield project in 2026, Argon2id is the OWASP-recommended choice. The native build dependency is a one-time Docker setup cost. The project has no legacy constraints favoring bcrypt. OWASP minimum: 19MiB memory, 2 iterations.

**Libraries:** `argon2@^0.41.x`

### phase-02-auth/TD-02

**Recommendation:** Option A (@nestjs/passport) — The project plan includes only email/password auth for now, but the plugin architecture costs little and future phases may add social login. Aligns with official NestJS docs, making onboarding and maintenance easier.

**Note:** Decision deliberately diverged from the Recommendation during implementation — custom guards were preferred over `@nestjs/passport` to keep the dependency surface smaller; social login is not on the near-term roadmap, so the plugin-architecture benefit did not justify the extra abstraction layer.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-03

**Recommendation:** Option A (Refresh Token Rotation) — Provides the strongest security model with automatic theft detection. The DB write overhead is acceptable for a video platform (auth refresh is infrequent vs. video operations). PostgreSQL is already in the stack, so no new infrastructure needed. Race conditions can be mitigated with a short grace period for the old token.

**Libraries:** —

### phase-02-auth/TD-04

**Recommendation:** Option B (Random Opaque Tokens in DB) — Revocability is important: when a user requests a new password reset, previous tokens should be invalidated. The DB table is trivial to implement, and the tokens table can also serve future needs (e.g., API keys). Keeps email tokens decoupled from the JWT auth system.

**Libraries:** —

### phase-02-auth/TD-05

**Recommendation:** Option A (@nestjs-modules/mailer) — Best NestJS integration with minimal boilerplate. Supports SMTP (matching the architecture diagram), works with MailHog/Mailpit for local development without external dependencies, and scales to any SMTP provider in production. Template engine support (Handlebars) simplifies email formatting. No vendor lock-in.

**Libraries:** `@nestjs-modules/mailer@^2.x`, `handlebars@^4.x`

### phase-02-auth/TD-06

**Recommendation:** Option A (class-validator + class-transformer) — This is a backend-only project (no shared schemas with frontend), so Zod's single-source-of-truth advantage is less impactful. class-validator is the documented NestJS approach, and the project already uses decorators extensively (TypeORM entities, NestJS DI). Fewer integration surprises with NestJS 11.

**Libraries:** `class-validator@^0.14.x`, `class-transformer@^0.5.x`

### phase-02-auth/TD-07

**Recommendation:** Option A (Custom Domain Exception Filter) — Provides machine-readable error codes that the Next.js frontend can switch on, without the overhead of RFC 9457's URI-based type system. The project is single-consumer (first-party frontend), so a simple `{ statusCode, error, message }` format with domain codes balances clarity and simplicity. The custom filter cost is low — two small files.

**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** Option A (@nestjs/throttler) — Native NestJS integration is decisive: the guard system allows scoping rate limiting to `AuthModule` only via module-level `APP_GUARD`, with `@SkipThrottle()` for exemptions. The project is single-instance with no distributed requirements, so in-memory storage is sufficient. Using express-rate-limit would bypass NestJS's DI and guard lifecycle for no clear benefit.

**Libraries:** `@nestjs/throttler@^6.x`

### phase-02-auth/TD-09

**Recommendation:** Option B (Opaque) — Since DB lookup is mandatory (TD-03), JWT signature adds no security value. Opaque tokens are shorter, leak no data, and are simpler to generate.

**Note:** Decision deliberately diverged from the Recommendation — JWT was kept to reuse the access-token signing/verification infrastructure (`@nestjs/jwt`), trading token size and base64-readability for a single token format across the codebase.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-10

**Recommendation:** Option A — The platform is a video sharing service with URL-based channel handles. A strict `[a-z0-9_]` allowlist is the simplest and most portable choice: no extra dependencies, no edge cases around hyphen positioning, and the `user_<random>` fallback provides a valid handle even for extreme email prefixes. Hyphens can always be added in a future iteration if user feedback justifies it.

**Libraries:** —

### phase-02-auth-frontend/TD-01

**Recommendation:** Three reasons. (1) **Architectural fit.** The strict-BFF model in `next-frontend-config-base/TD-03` already nominates the Route Handler as the only NestJS caller; cookie-based sessions are the natural match, and Auth.js's framework adds layers between the BFF and the cookie that buy nothing because the backend is the auth authority — Auth.js's value (DB adapters, OAuth providers, magic-link, `getServerSession` helpers) is mostly unused in this configuration. (2) **Smaller blast radius.** A ~50-LOC session helper is grep-friendly, debuggable, and test-friendly via the existing MSW+BFF integration test pattern; a misconfigured Auth.js callback is a longer fault-isolation loop. (3) **Compatibility with Next.js 16 / React 19.** Built-in `next/headers` `cookies()` is the canonical primitive both runtimes already use; Auth.js v5 versions track Next.js majors with a lag, adding compatibility risk that Option A does not have. Option C is rejected as unsafe (`localStorage` for refresh tokens) and architecturally regressive (loses RSC personalization).
**Libraries:** —

### phase-02-auth-frontend/TD-02

**Recommendation:** Three reasons. (1) **Defense in depth on the cookie content** — `httpOnly` blocks JS, encryption blocks accidental log/proxy inspection; the marginal cost is one ~3KB dep. (2) **Single cookie to manage** simplifies logout (one `session.destroy()` call) and avoids the orphan-cookie failure mode of Option A. (3) **Room to carry minimal user metadata** (`userId`, `email`, `channelSlug`) lets `app/layout.tsx` RSC render the authenticated chrome (avatar, channel name) without a per-render `/auth/me` round-trip — Phase 04+ gains compound here. Option A is a viable downgrade if the team rejects `iron-session` for any reason; the migration A→B (or B→A) is a one-Route-Handler refactor with no test changes downstream because the BFF interface is unchanged. Option C is rejected: it solves a problem (server-side revocation) the project does not have at the cost of infrastructure the project does not own.
**Libraries:** iron-session

### phase-02-auth-frontend/TD-03

**Recommendation:** The single-flight detail is non-trivial and goes in the helper from day one — tested by MSW with a "two concurrent intercepted upstream calls; one refresh expected" assertion. Option B's client-driven pattern is rejected because it doesn't replace Option A (RSC still needs server-side refresh) — adopting B means doing both. Option C's pre-emptive timer is rejected because the failure modes (multiple tabs, sleep/wake) outweigh the latency saving and force a `"use client"` shell near the root.
**Libraries:** —

### phase-02-auth-frontend/TD-04

**Recommendation:** Three reasons. (1) **Decoupled from TD-05** — works with Route Handlers OR Server Actions; the form code does not change if TD-05 is revisited later. (2) **Aligned with shadcn's canonical form primitive** — the project already commits to `radix-nova` shadcn (`components.json`); `npx shadcn@latest add form` produces react-hook-form wrappers; choosing react-hook-form means using the supported primitive instead of hand-rolling around it. (3) **Zod-first developer ergonomics match the rest of the FE foundation** — `next-frontend-config-base/TD-01` chose Zod 4 for env; the same schemas-as-source-of-truth pattern carries to forms with zero new validator paradigm. Option B is rejected for impedance with shadcn's primitive and for over-investing in progressive-enhancement that the strict-BFF model does not require. Option C is rejected for the per-field boilerplate and the loss of client-side feedback on a project that values quick, type-safe form iteration.
**Libraries:** react-hook-form, @hookform/resolvers

### phase-02-auth-frontend/TD-05

**Recommendation:** Three reasons. (1) **Strict-BFF alignment.** `next-frontend-config-base/TD-03` named Route Handlers as the BFF surface; Option A keeps every mutation visible under `app/api/**`. (2) **Test scaffold already exists** — `next-frontend/CLAUDE.md` § Testing and `next-frontend-msw-foundation` were authored for Route-Handlers-as-functions; Option A reuses them with zero invention. (3) **Single mutation surface** — Phase 02 sets the precedent for Phases 03–07; uniformity beats per-mutation idiom-picking when the cost of inconsistency compounds (Option C). Option B has real ergonomic appeal for the simplest forms but fragments the BFF surface and forces test-pattern reinvention; if the team later wants progressive enhancement for specific forms, the migration A→B is per-form and doesn't require touching unrelated routes — A is the safer default and the cheaper baseline.
**Libraries:** —

### phase-02-auth-frontend/TD-06

**Recommendation:** Two reinforcing reasons. (1) **No first-render flicker, no round-trip** — the session is delivered in the same response as the page HTML; the Client Provider hydrates with the correct initial state; users never see "Login" briefly turn into their avatar. (2) **No new BFF endpoint** — the cookie is the source of truth, RSC reads it, the Provider broadcasts it; the BFF surface stays minimal. The `router.refresh()` requirement after mid-session mutations is a small price (one line in the relevant mutation handler) for the structural benefits. Option B is rejected for the double-read-and-flicker; Option C is dominated by Option B and rejected.
**Libraries:** —

### phase-02-auth-frontend/TD-07

**Recommendation:** Three reasons. (1) **First-paint-correct** — the user sees the right outcome on the first paint, no skeleton, no flicker. (2) **Single integration pattern across both flows** — confirmation is RSC-only; reset is RSC + Client form (TD-04, TD-05 patterns reused) — both share the "RSC owns the token, Client Component owns the input" split. (3) **Email-prefetch behavior** is solved at the backend's idempotent-confirmation level (a small note for `/plan-build` to confirm; not a separate TD). Option B's Route-Handler-as-link-target adds redirects for no clean gain. Option C is dominated.
**Libraries:** —

### next-frontend-openapi-typing/TD-01

**Recommendation:** **Option A (`openapi-typescript` + `openapi-fetch`)**. Three reinforcing reasons. (1) **Strict BFF makes the SDK surface valueless on the client.** Only Route Handlers ever call the upstream Nest; they already use `fetch` (Next 16's caching extensions sit on top of native `fetch`); a generated SDK adds a third client style to learn for zero functional gain. (2) **Types-first matches the rest of the FE foundation.** Env validation is Zod-derived types; component variants are `cva` types; both are TS-first with zero generated runtime. `paths` is the natural extension — one `.d.ts` file imported wherever the contract is touched. (3) **MSW typing is solved by the same `paths` symbol.** Hand-written handlers in `mocks/handlers.ts` type their resolver returns off `paths["/videos"]["get"]["responses"][200]`, giving the contract guarantee without orval/kubb's verbose generated handlers (which would be overridden per-test anyway). The marginal cost of adding `openapi-fetch` (~6KB, server-side only) is small enough that we recommend the **types + thin-client** pair, not types alone — `openapi-fetch` removes the `fetch(API_URL + path, { method, headers, body })` boilerplate in each Route Handler while staying within the BFF model. Options B/C/D may be revisited if (a) client-side data-fetching enters the stack with TanStack Query and per-endpoint hooks are wanted, or (b) the API grows beyond ~20 operations and per-call boilerplate becomes painful.
**Libraries:** openapi-typescript, openapi-fetch

### next-frontend-openapi-typing/TD-02

**Recommendation:** **Option B (committed local copy + repo-root sync script)**. Three reasons. (1) **Preserves the compose-stack independence** that `next-frontend-config-base/TD-03` Context calls out as the current architecture — neither subproject's compose file references the other. (2) **Drift is eliminated structurally when paired with TD-03's CI freshness check** — the check runs the sync script and asserts no diff on either `openapi.json` or `types.gen.ts`, so a backend PR that forgets to re-sync fails CI with a clear message. (3) **The committed local file is a real artifact in PR review** — reviewers see the contract change in `next-frontend/openapi.json`'s diff at the same time as the backend change, doubling the visibility (an `openapi.json`-only diff in a feature PR is a red flag for accidental drift). Option A is acceptable as a pre-CI fallback; Option C is rejected because the cross-stack file dependency in `docker-compose.yaml` introduces coupling that the current architecture explicitly avoids, and the "no drift" gain over B is small once TD-03 lands.
**Libraries:** —

### next-frontend-openapi-typing/TD-03

**Recommendation:** **Option C (committed + CI freshness check)**. It is the only option that makes contract drift _both_ visible (in PR diffs) _and_ impossible to merge accidentally (CI fail). The complexity premium over Option A is one CI step. Option B's "no committed artifacts" purity is poorly paid for in a monorepo where the cross-subproject build coupling becomes a real ergonomic cost, and it wastes the PR visibility that TD-02 Option B's committed `openapi.json` is specifically designed to deliver. Option A is acceptable as a temporary state until the CI pipeline lands; downgrading from C to A is reversible (just remove the CI step) but upgrading to C later requires explaining `types.gen.ts` history in a separate commit. Start at C. Apply the same script-and-check pattern to any future generated artifact (e.g., if `openapi-fetch` is wrapped, the wrapper file is hand-written; the only generated artifact remains `types.gen.ts`).
**Libraries:** —

### next-frontend-openapi-typing/TD-04

**Recommendation:** **Option A (single `lib/api/contracts.ts` with explicit aliases)**. It is the only option that (i) handles pass-through and reshape with the same mechanism, (ii) gives a single grep target for "what shape does the BFF expose", and (iii) decouples Component imports from App Router file paths (Components import `from "@/lib/api/contracts"`, not `from "@/app/api/videos/route"`). Option B is theoretically minimal but fragile against Next's actual RSC/Client/Route-Handler typing; Option C scatters the contract surface and creates drift opportunities. The "long file" concern is bounded — for the scope of StreamTube, the BFF will likely have <30 contract aliases at peak; sectioning by feature header comments is sufficient. Make `lib/api/contracts.ts` the only file that imports `paths` from `types.gen.ts` (lintable later); every other consumer imports from `contracts.ts`.
**Libraries:** —

### next-frontend-openapi-typing/TD-05

**Recommendation:** **Option A (hand-written, typed via `paths`)**. Reasons: (1) **Determinism over auto-generation** — BFF integration tests assert on specific values; randomized fixtures are anti-helpful. (2) **Coherence with TD-01 recommendation** — `openapi-typescript`'s `paths` type is the single contract anchor; reusing it in MSW handlers means "spec ↔ handler ↔ assertion" is one type chain. (3) **Scale fit** — Phase 02 introduces few endpoints; the manual cost is negligible at this stage. If the API grows to dozens of endpoints and authoring overhead becomes real, this TD can be superseded with a Kubb-or-hey-api MSW plugin without touching TD-01's `paths` import sites (the generator just produces additional handler files; the existing manual handlers stay valid). Option B locks the project into a heavier TD-01 choice for marginal mock-authoring savings; Option C is Option A with an unnecessary detour.
**Libraries:** —

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, validationOptions: ... _(from phase 01)_
- Config is injected into modules via `ConfigType<typeof xxxConfig>` and `@Inject(xxxConfig.KEY)`; the same factory is importable as a plain function... _(from phase 01)_
- `data-source.ts` loads `.env` via `import 'dotenv/config'` at the top, then imports `databaseConfig` and calls it as a plain function. _(from phase 01)_
- Database connection parameters (host, port, etc.) are sourced from a single `databaseConfig` factory — never duplicated between `AppModule` and... _(from phase 01)_
- `TypeOrmModule.forRootAsync` is used (not `forRoot`), with `imports: [ConfigModule]`, `inject: [databaseConfig.KEY]`, `useFactory` returning options... _(from phase 01)_

## Inherited Deferred Capabilities

| Capability | Status | Origin phase | Rationale |
|-----------|--------|--------------|-----------|
| Telas de frontend | deferred | phase-01-configuracao-base | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| Telas de cadastro, login, confirmação de conta e recuperação de senha | deferred | phase-02-auth | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| "Confirmação de conta via e-mail com link de ativação" | deferred | phase-02-auth-frontend | deferred_to_next_phase — UI landing screen de-scoped 2026-05-14; FE confirmation flow (TD-07) picked up by a future phase. BE side unchanged in `phase-02-auth`. |
| "Logout" | deferred | phase-02-auth-frontend | deferred_to_next_phase — logout button lives inside authenticated chrome (typically Phase 04). Phase 02 still implements POST `/api/auth/logout` (BFF route handler + `session.destroy()`) so the contract is ready when the chrome lands. |
| "Recuperação de senha (destination screen / set-new-password)" | deferred | phase-02-auth-frontend | deferred_to_next_phase — `/forgot-password` ships this phase sending the e-mail; the reset-password destination screen is absent from Figma → link destination remains a 404 until a later phase delivers the screen via `/screen-inventory` extension run. Documented as a known gap. |
| "Telas de cadastro, login, confirmação de conta e recuperação de senha" | deferred | phase-02-auth-frontend | a tela de confirmação da conta não será implementada nesta fase corrente, será adiada — the umbrella bullet's full coverage requires the confirmação and reset-password destination screens; both are deferred per Non-UI rows above. The 3 ship-this-phase telas (signup, login, forgot-password) are inventoried and covered by their own verbs; the umbrella bullet itself is deferred to the phase that lands the missing screens. |

## UI Inventory

**Source:** `docs/inventories/screen-inventory-phase-03-upload-processing.md`
**Screens in scope:** 2

### UI ↔ Capability Join

| Screen | Route | Verb | Capability | Covering Component |
|--------|-------|------|------------|-------------------|
| Tela de upload de vídeo | /studio/videos/new | Pré-cadastrar o vídeo como rascunho ao iniciar o upload do arquivo | "Pré-cadastro automático do vídeo como rascunho ao iniciar o upload" | VideoDropzone + SelectFileButton |
| Tela de upload de vídeo | /studio/videos/new | Enviar o arquivo de vídeo selecionado (até 10GB) em partes | "Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance" | VideoDropzone + SelectFileButton |
| Tela de upload de vídeo | /studio/videos/new | Armazenar o arquivo de vídeo enviado no armazenamento de objetos | "Serviço de armazenamento de arquivos (vídeos e thumbnails)" | VideoDropzone |
| Tela de upload e processamento do vídeo | /studio/videos/[id] | Enviar o arquivo de vídeo ao armazenamento acompanhando o progresso | "Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance" | UploadProgress |
| Tela de upload e processamento do vídeo | /studio/videos/[id] | Carregar o rascunho pré-cadastrado do vídeo (nome original do arquivo) | "Pré-cadastro automático do vídeo como rascunho ao iniciar o upload" | FilenameRow |
| Tela de upload e processamento do vídeo | /studio/videos/[id] | Acompanhar o status de processamento do vídeo | "Processamento automático do vídeo após upload (extração de duração e metadados)" | ProcessingStatus |
| Tela de upload e processamento do vídeo | /studio/videos/[id] | Exibir duração e qualidade extraídas do vídeo | "Processamento automático do vídeo após upload (extração de duração e metadados)" | VideoDuration + VideoQualityRow |
| Tela de upload e processamento do vídeo | /studio/videos/[id] | Exibir a thumbnail gerada automaticamente | "Geração automática de thumbnail a partir de um frame do vídeo" | ThumbnailPreview |
| Tela de upload e processamento do vídeo | /studio/videos/[id] | Exibir o link único do vídeo | "URL única por vídeo, sem conflito com outros vídeos" | VideoLinkField |
| Tela de upload e processamento do vídeo | /studio/videos/[id] | Reproduzir a prévia do vídeo enviado sem baixá-lo por completo | "Reprodução via streaming (sem necessidade de download completo)" | VideoPlayer |

### Server-connected Components

- `AppShell` (Tela de upload de vídeo) — `Reuse?: new`
- `SubscriptionsSection` (Tela de upload de vídeo) — `Reuse?: new`
- `VideoDropzone` (Tela de upload de vídeo) — `Reuse?: new`
- `SelectFileButton` (Tela de upload de vídeo) — `Reuse?: components/ui/button.tsx`
- `AppShell` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `SubscriptionsSection` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `UploadProgress` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `VideoPlayer` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `VideoDuration` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `VideoLinkField` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `FilenameRow` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `VideoQualityRow` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `ProcessingStatus` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `VideoDetailsForm` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `ThumbnailPreview` (Tela de upload e processamento do vídeo) — `Reuse?: new`
- `ChangeThumbnailButton` (Tela de upload e processamento do vídeo) — `Reuse?: components/ui/button.tsx`
- `SaveDraftButton` (Tela de upload e processamento do vídeo) — `Reuse?: components/ui/button.tsx`
- `PublishButton` (Tela de upload e processamento do vídeo) — `Reuse?: components/ui/button.tsx`

### Open Questions from Inventory

- **Upload em andamento e navegação:** o upload começa em `/studio/videos/new` e o progresso aparece em `/studio/videos/[id]`. Para o progresso não se perder na navegação client-side, a instância do Uppy (TD-03) precisa ficar acima das duas rotas (por exemplo, um provider no layout `/studio`). Num reload no meio do upload, o progresso é perdido. Decidir o comportamento:
  - (a) exibir "upload interrompido" a partir do estado do rascunho no servidor;
  - (b) oferecer retomada via re-seleção do arquivo, usando o multipart resumível do TD-02;
  - (c) aviso `beforeunload` durante o upload.
- **Estados de UI sem design:** faltam drag-over, erro de validação (tipo de arquivo ou mais de 10GB), cancelamento, processando, falha no processamento e thumbnail/duração/player indisponíveis. A lista de containers aceitos (TD-11) também não aparece na UI. Decidir se:
  - (a) inferir os estados no implement seguindo os padrões shadcn (`Alert`, `Progress`, skeletons);
  - (b) pedir variantes ao designer.
- **Link do vídeo:** o VideoLinkText (39:1873) aponta para `/v/[id]`, a página de watch da Fase 05, que ainda não existe. Decidir se, na Fase 03, renderiza como texto copiável (só o CopyLinkButton) ou como link para uma rota ainda inexistente.
- **Shell mínimo da Fase 03 (DG-1):** decidir o que fazer com os itens de fases futuras (busca, Home, Subscriptions/lista de canais, Liked videos, Your videos):
  - (a) omitir;
  - (b) renderizar como placeholders inertes;
  - (c) links para rotas ainda inexistentes.

  A SubscriptionsSection é Server-connected (Fase 06) e não deve fazer fetch na Fase 03.
- **Copy da tela de upload:** a copy está no plural ("video files", "Select files"), mas o upload é de um arquivo por vez. Ajustar para o singular na implementação, ou pedir a correção ao designer.
- **Fora do escopo, tarefa separada:** o `BrandLogo` vive em `components/auth/brand-logo.tsx`, mas passa a ser usado no header autenticado. Avaliar movê-lo para um path compartilhado (por exemplo `components/brand/`) numa tarefa de refactor própria.
- **Componentes planejados mas inexistentes (`Reuse?` com sufixo ` (new)`), gatilho para `phase-b.md` § B2.6:**
  - No escopo da Fase 03:
    - `components/layout/app-shell.tsx`
    - `components/layout/app-header.tsx`
    - `components/layout/app-sidebar.tsx`
    - `components/layout/sidebar-nav-item.tsx`
    - `components/layout/account-menu.tsx`
    - `components/ui/avatar.tsx`
    - `components/studio/video-dropzone.tsx`
    - `components/studio/upload-progress.tsx`
    - `components/ui/progress.tsx`
    - `components/video/video-player.tsx`
    - `components/studio/video-link-field.tsx`
    - `components/studio/processing-status.tsx`
    - `components/video/video-thumbnail.tsx`
  - Pertencem a fases futuras e não devem gerar SI de bootstrap na Fase 03:
    - `components/layout/search-bar.tsx` (Fase 07)
    - `components/layout/sidebar-subscriptions.tsx` (Fase 06)
    - `components/studio/video-details-form.tsx` (Fase 04)
    - `components/ui/textarea.tsx` (Fase 04)
    - `components/ui/select.tsx` (Fase 04)
    - `components/ui/radio-group.tsx` (Fase 04)

  Confirmar com o `plan-build`.

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|-----------|--------|-----------|---------|
| "Serviço de processamento em segundo plano (filas)" | non-ui | backend_service | phase-03-upload-processing/TD-04 |
| "Download do vídeo pelo usuário" | deferred | deferred_to_next_phase | phase-03-upload-processing/TD-09 |

## Testing Requirements

### nestjs-project

| Artifact type | Required layers |
|---------------|-----------------|
| Entity (`*.entity.ts`) | Integration: constraints, defaults, `select: false` |
| Service with branching + DB | Unit: branch logic (mock repo) + Integration: DB contract |
| Service with DB only (no branching) | Integration: DB contract |
| Service with configured lib (JWT, cache) | Unit: real lib with test config |
| Service with side-effect dep (email, storage) | Integration: real capture service (Mailpit) or local adapter |
| Module with configured imports | Unit: compilation test |
| Controller | E2E only — do NOT write unit tests |
| DTO | E2E: one validation wiring test per endpoint |
| Guard (delegates to service for business logic) | E2E + Unit if complex internal logic |
| Guard (simple, delegates to Passport) | E2E only |
| Strategy (Passport) | E2E via guard |
| Pipe (custom transformation/validation) | Unit |
| Interceptor (response transform, logging) | Unit and/or E2E |
| Exception Filter | Unit + E2E |
| Middleware | E2E |

_Guide also lists as worth testing: service-to-external-system contracts (storage uploads, queue publishing), module DI wiring for `BullModule.registerQueue()`, and race conditions on concurrent video uploads. External-system strategies (storage, queue) are in the guide's `references/external-systems.md`; queue-related artifact types not yet in the project are in `artifacts/future-types.md`._

### next-frontend

| Artifact type | Required layers |
|---------------|-----------------|
| Page — sync RSC, static, no logic | None at component level; cover only if part of a critical flow → `*.e2e-spec.ts` |
| Page — sync RSC composing client children | Test client children directly; cover rendered page via `*.e2e-spec.ts` |
| Page — async RSC (`async function Page()` with `await`) | `*.e2e-spec.ts` only — Vitest cannot render it |
| Layout (`layout.tsx`) | None unless it adds logic (auth gate, conditional render); else via E2E |
| Client component (`"use client"`) with state/handlers | `*.test.tsx` — RTL + `jsdom` docblock, mock `next/navigation`, MSW for fetch |
| Feature component (server, composes primitives) | Skip unit; cover via the page's E2E |
| shadcn UI primitive (`components/ui/*`) | None — trust the library; cover via consumers |
| Icon (`components/icons/*`) | None |
| `lib/` utility / boundary module with branching or shape assumptions | `*.test.ts` |
| Custom hook (`hooks/*`) | `*.test.ts(x)` with `renderHook`, `jsdom` docblock |
| Route handler (`app/api/**/route.ts`) — proxy or with branching | `*.integration.test.ts` with MSW (+ `*.test.ts` for extracted pure logic) |
| Server action / middleware / error-loading-not-found / metadata | See guide — depends on type |

_Guide's `references/external-systems.md` covers the Object Storage strategy alongside the NestJS upstream MSW boundary._
