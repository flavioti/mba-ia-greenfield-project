---
kind: phase
name: phase-03-upload-processing
status: clean
issue_count: 0
sources_mtime:
  docs/phases/phase-03-upload-processing/context.md: "2026-10-13T10:45:07-03:00"
  docs/decisions/technical-decisions-phase-03-upload-processing.md: "2026-10-13T10:44:09-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-13T08:32:05-03:00"
issues:
  - id: IC-1
    status: resolved
    summary: "TD-03 (Scope: Frontend) orphaned — UI Inventory is deferred"
    resolved_by: clarification
  - id: AMB-4
    status: resolved
    summary: "Identifier in /studio/videos/[id]: internal UUID or public short ID (TD-10)?"
    resolved_by: clarification
  - id: OQ-14
    status: resolved
    summary: "Inventory: upload progress across /new → /[id] navigation and on reload"
    resolved_by: clarification
  - id: OQ-15
    status: resolved
    summary: "Inventory: UI states without design (errors, processing, drag-over, cancel)"
    resolved_by: clarification
  - id: OQ-16
    status: resolved
    summary: "Inventory: video link as copyable text or link to Phase 05 /v/[id]"
    resolved_by: clarification
  - id: OQ-17
    status: resolved
    summary: "Inventory: future-phase items in the minimal Phase 03 shell"
    resolved_by: clarification
  - id: OQ-18
    status: resolved
    summary: "Inventory: plural copy on upload screen vs single-file scope"
    resolved_by: clarification
  - id: OQ-19
    status: resolved
    summary: "Inventory: move BrandLogo to a shared path (separate task)"
    resolved_by: clarification
  - id: OQ-20
    status: resolved
    summary: "Inventory: which (new) components bootstrap in Phase 03"
    resolved_by: clarification
  - id: UIG-1
    status: resolved
    summary: "'Serviço de processamento em segundo plano (filas)' has TD but no verb"
    resolved_by: non_ui_capability
  - id: UIG-2
    status: resolved
    summary: "'Download do vídeo pelo usuário' has TD but no verb"
    resolved_by: deferred_capability
  - id: AMB-1
    status: resolved
    summary: "'sem impacto na performance' has no measurable acceptance criterion"
    resolved_by: clarification
  - id: AMB-2
    status: resolved
    summary: "Who may stream/download a draft video in Phase 03 (publish is Phase 04)"
    resolved_by: clarification
  - id: AMB-3
    status: resolved
    summary: "Which metadata the draft pre-registration collects vs. Phase 04 editing"
    resolved_by: clarification
  - id: DG-1
    status: resolved
    summary: "Upload screen needs authenticated chrome/route guard deferred to Phase 04"
    resolved_by: clarification
  - id: OQ-1
    status: resolved
    summary: "TD-01 pending — Object Storage Engine"
    resolved_by: phase-03-upload-processing/TD-01
  - id: OQ-2
    status: resolved
    summary: "TD-02 pending — Upload Protocol for Files up to 10GB"
    resolved_by: phase-03-upload-processing/TD-02
  - id: OQ-3
    status: resolved
    summary: "TD-03 pending — Browser Upload Client Library"
    resolved_by: phase-03-upload-processing/TD-03
  - id: OQ-4
    status: resolved
    summary: "TD-04 pending — Background Job Queue Technology"
    resolved_by: phase-03-upload-processing/TD-04
  - id: OQ-5
    status: resolved
    summary: "TD-05 pending — Video Worker Topology"
    resolved_by: phase-03-upload-processing/TD-05
  - id: OQ-6
    status: resolved
    summary: "TD-06 pending — Video Lifecycle State Model"
    resolved_by: phase-03-upload-processing/TD-06
  - id: OQ-7
    status: resolved
    summary: "TD-07 pending — FFmpeg Invocation and Binary Sourcing"
    resolved_by: phase-03-upload-processing/TD-07
  - id: OQ-8
    status: resolved
    summary: "TD-08 pending — Streaming Delivery Format"
    resolved_by: phase-03-upload-processing/TD-08
  - id: OQ-9
    status: resolved
    summary: "TD-09 pending — Media Access Strategy"
    resolved_by: phase-03-upload-processing/TD-09
  - id: OQ-10
    status: resolved
    summary: "TD-10 pending — Unique Public Video ID (URL slug)"
    resolved_by: phase-03-upload-processing/TD-10
  - id: OQ-11
    status: resolved
    summary: "TD-11 pending — Accepted Input Formats and Playback Normalization"
    resolved_by: phase-03-upload-processing/TD-11
  - id: OQ-12
    status: resolved
    summary: "TD-12 pending — Abandoned Upload Cleanup"
    resolved_by: phase-03-upload-processing/TD-12
  - id: OQ-13
    status: resolved
    summary: "TD-13 pending — Processing Status Updates to the Frontend"
    resolved_by: phase-03-upload-processing/TD-13
---

# phase-03-upload-processing — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

_None._

### Missing Decisions

_None._

### Dependency Gaps

_None._

### Inherited Constraint Conflicts

_None._

### Unresolved Open Questions

_None._

### UI Coverage Gaps

_None._

## Resolved Issues

- **IC-1** _(resolved_by clarification)_ — TD-03 (Scope: Frontend) orphaned — UI Inventory is deferred. Resolved via option (b): `/screen-inventory phase-03-upload-processing` produced a validated inventory (2 screens) and `/plan-context` re-ran with an active `## UI Inventory`; TD-03 now renders in the UI Contracts of the upload screens.
- **AMB-1** _(resolved_by clarification)_ — 'sem impacto na performance' has no measurable acceptance criterion. Clarified: video bytes never traverse the Next.js BFF or the NestJS API (browser → storage direct per TD-02); the API handles only small JSON orchestration calls, so its memory footprint and the latency of other endpoints stay flat during a 10GB upload. Tests assert that no orchestration request carries a file body.
- **AMB-2** _(resolved_by clarification)_ — Who may stream/download a draft video in Phase 03. Clarified: owner only — streaming, download and thumbnail access to a draft are restricted to the owning channel's user; any other caller (including anonymous) receives 404. "Pelo usuário" in the download bullet means the owner in Phase 03; Phase 04 opens access to published videos. Enforced via TD-09 (presigned GET issued only to authorized callers).
- **AMB-3** _(resolved_by clarification)_ — Which metadata the draft pre-registration collects. Clarified: the draft is created with title = original filename without extension, empty description, and the uploader's channel; editing title/description remains in Phase 04 ("Edição das informações do vídeo").
- **DG-1** _(resolved_by clarification)_ — Upload screen needs an authenticated shell. Clarified: in scope for Phase 03 — the phase delivers a minimal authenticated page shell plus a route guard that redirects anonymous users to `/login`, sufficient for the upload/processing-status screen. Phase 04 extends it with logout and the channel admin chrome.
- **OQ-1** _(resolved_by phase-03-upload-processing/TD-01)_ — TD-01 pending — Object Storage Engine. Decided: A (SeaweedFS).
- **OQ-2** _(resolved_by phase-03-upload-processing/TD-02)_ — TD-02 pending — Upload Protocol for Files up to 10GB. Decided: A (S3 multipart with presigned part URLs).
- **OQ-3** _(resolved_by phase-03-upload-processing/TD-03)_ — TD-03 pending — Browser Upload Client Library. Decided: A (Uppy core + @uppy/aws-s3, custom UI).
- **OQ-4** _(resolved_by phase-03-upload-processing/TD-04)_ — TD-04 pending — Background Job Queue Technology. Decided: A (BullMQ on Redis/Valkey).
- **OQ-5** _(resolved_by phase-03-upload-processing/TD-05)_ — TD-05 pending — Video Worker Topology. Decided: A (same codebase, separate entrypoint + compose service).
- **OQ-6** _(resolved_by phase-03-upload-processing/TD-06)_ — TD-06 pending — Video Lifecycle State Model. Decided: A (two orthogonal fields).
- **OQ-7** _(resolved_by phase-03-upload-processing/TD-07)_ — TD-07 pending — FFmpeg Invocation and Binary Sourcing. Decided: A (system FFmpeg + spawn wrapper).
- **OQ-8** _(resolved_by phase-03-upload-processing/TD-08)_ — TD-08 pending — Streaming Delivery Format. Decided: A (progressive MP4 over Range, faststart).
- **OQ-9** _(resolved_by phase-03-upload-processing/TD-09)_ — TD-09 pending — Media Access Strategy. Decided: A (private bucket + presigned GET).
- **OQ-10** _(resolved_by phase-03-upload-processing/TD-10)_ — TD-10 pending — Unique Public Video ID. Decided: A (random base62, 11 chars).
- **OQ-11** _(resolved_by phase-03-upload-processing/TD-11)_ — TD-11 pending — Accepted Input Formats. Decided: A (remux when compatible, else transcode to H.264/AAC).
- **OQ-12** _(resolved_by phase-03-upload-processing/TD-12)_ — TD-12 pending — Abandoned Upload Cleanup. Decided: B (scheduled cleanup job only).
- **OQ-13** _(resolved_by phase-03-upload-processing/TD-13)_ — TD-13 pending — Processing Status Updates. Decided: A (short polling via BFF).
- **AMB-4** _(resolved_by clarification)_ — Identifier in `/studio/videos/[id]`. Clarified: owner-facing studio routes, BFF and API paths use the internal UUID; the TD-10 short ID appears only in the public URL (`/v/{shortId}`) and in the "Video link" field.
- **OQ-14** _(resolved_by clarification)_ — Upload progress across navigation and reload. Clarified: the Uppy instance lives in a client provider at the `/studio` layout so progress survives `/studio/videos/new` → `/studio/videos/[id]`; a `beforeunload` warning is shown while an upload is in flight; after a reload, the processing screen shows "upload interrompido" derived from the server-side draft state (no automatic resume in Phase 03).
- **OQ-15** _(resolved_by clarification)_ — UI states without design. Clarified: `/implement` infers drag-over, validation error (type / >10GB), cancel, processing, processing failure and media-unavailable states using shadcn patterns (`Alert`, `Progress`, skeletons) consistent with existing screens.
- **OQ-16** _(resolved_by clarification)_ — Video link rendering. Clarified: rendered as copyable text (full URL + CopyLinkButton), not a clickable link, until the Phase 05 watch page exists.
- **OQ-17** _(resolved_by clarification)_ — Future-phase items in the shell. Clarified: omitted. The Phase 03 shell renders logo, upload shortcut and avatar in the header, and only functional items in the aside; search, Home, Subscriptions/channel list, Liked videos and Your videos are added by their owning phases. No SubscriptionsSection fetch in Phase 03.
- **OQ-18** _(resolved_by clarification)_ — Plural copy. Clarified: implement in the singular ("Drag and drop a video file to upload" / "Select file"); file input without `multiple`.
- **OQ-19** _(resolved_by clarification)_ — BrandLogo location. Clarified: reused from `components/auth/brand-logo.tsx` as-is in Phase 03; moving it to a shared path is a separate refactor task (out of scope per CLAUDE.md Scope Limits).
- **OQ-20** _(resolved_by clarification)_ — Bootstrap scope for `(new)` components. Clarified: only the 13 Phase 03 components get bootstrap SIs (app-shell, app-header, app-sidebar, sidebar-nav-item, account-menu, avatar, video-dropzone, upload-progress, progress, video-player, video-link-field, processing-status, video-thumbnail); search-bar, sidebar-subscriptions, video-details-form, textarea, select, radio-group stay with Phases 04/06/07. Note: with OQ-17 = omit, sidebar-nav-item may be unused in Phase 03 — `/plan-build` may drop it if the aside has no functional item.
- **UIG-1** _(resolved_by non_ui_capability)_ — "Serviço de processamento em segundo plano (filas)" marked non-ui. Rationale: backend_service.
- **UIG-2** _(resolved_by deferred_capability)_ — "Download do vídeo pelo usuário" marked deferred. Rationale: deferred_to_next_phase.
