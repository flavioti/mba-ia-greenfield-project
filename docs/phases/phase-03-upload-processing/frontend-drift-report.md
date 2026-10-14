---
kind: drift-report
phase: phase-03-upload-processing
plan_mtime: "2026-10-13T13:44:58Z"
---

# phase-03-upload-processing — Drift Report

## Screen: upload-video — audited at SI-03.11.0 (2026-10-13)

Figma: `0RPjuDoEGx4nzxWjwqei6S:39:1594`. Sidebar, search bar and subscriptions list in the frame are out of scope (OQ-17) and were not audited. Copy is singularised per OQ-18 ("Drag and drop a video file to upload", "Select file").

**Quick scan:** 9 components (3 alinhado, 2 drift menor, 1 drift relevante, 3 ausente)

**TOC:**
- `components/layout/app-shell.tsx` — AppShell — componente ausente → create
- `components/layout/app-header.tsx` — AppHeader — componente ausente → create
- `components/auth/brand-logo.tsx` — BrandLogo — drift menor → exception
- `components/icons/streamtube-icon.tsx` — StreamtubeIcon — alinhado → skip
- `components/ui/icon-button.tsx` — UploadNavButton — drift menor → exception
- `components/layout/account-menu.tsx` — AccountAvatarButton — alinhado → skip
- `components/ui/avatar.tsx` — Avatar — alinhado → skip
- `components/studio/video-dropzone.tsx` — VideoDropzone — componente ausente → create
- `components/ui/button.tsx` — SelectFileButton — drift relevante → exception

---

### components/layout/app-shell.tsx — AppShell

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: Figma 39:1596 (page body) — header (56px) + main area on `bg-background`; sidebar (42:629) omitted per OQ-17. Created in SI-03.10.
- **Prior:** _(none)_

### components/layout/app-header.tsx — AppHeader

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: Figma 39:1597 — 56px header, `border-b border-border`, logo left, upload shortcut + avatar right; menu toggle and search omitted (OQ-17). Created in SI-03.10.
- **Prior:** _(none)_

### components/auth/brand-logo.tsx — BrandLogo

- **Status:** `drift menor`
- **Decision:** `exception`
  - reason: Figma wordmark is 20px/700 and icon 30px tall; `size="md"` renders `text-h2` (20px/600) and a 32px icon. Same token family; changing `text-h2` weight would alter the Phase 02 auth screens that also use BrandLogo.
- **Prior:** _(none)_

### components/icons/streamtube-icon.tsx — StreamtubeIcon

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** _(none)_

### components/ui/icon-button.tsx — UploadNavButton

- **Status:** `drift menor`
- **Decision:** `exception`
  - reason: Figma 39:1608 is a 50×40 pill filled `#272727`; it is an unbound frame (no component properties), so no byte-literal variant name exists for an additive `auto-Edit`. The shortcut uses `iconButtonVariants({ variant: "ghost", size: "lg" })` until the header becomes a Figma component (Phase 07 navbar).
- **Prior:** _(none)_

### components/layout/account-menu.tsx — AccountAvatarButton

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** _(none)_

### components/ui/avatar.tsx — Avatar

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** _(none)_ — installed via `shadcn add` in SI-03.10 and reconciled to project tokens (typography utilities, no `dark:` blend override). Figma shows a photo; the session has no avatar URL, so the fallback initial is rendered.

### components/studio/video-dropzone.tsx — VideoDropzone

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: Figma 39:1611 — `bg-card`, 2px dashed `border-border`, `rounded-[var(--radius-4)]`, 400px tall; 128px `bg-background` circle with 36px UploadIcon (`text-muted-foreground`); title `text-h2`, helper `text-body-md text-muted-foreground`.
- **Prior:** _(none)_

### components/ui/button.tsx — SelectFileButton

- **Status:** `drift relevante`
- **Decision:** `exception`
  - reason: Figma 39:1631 fills the button with raw `#ff0000` (primitive `red-600`) on an unbound frame — no component property to name a new variant after, and the DS has no brand-CTA semantic token. Kept on the default `primary` variant, consistent with the Phase 02 CTAs. Follow-up: add a semantic CTA token/variant to the DS.
- **Prior:** _(none)_

## Screen: upload-processing — audited at SI-03.12.0 (2026-10-13)

Figma: `0RPjuDoEGx4nzxWjwqei6S:39:1642`. Phase 04 blocks in the frame (Details form, Thumbnail change, Category, Visibility, Save draft / Publish) are out of scope (OQ-20) and were not audited.

**Quick scan:** 14 components (7 alinhado, 0 drift menor, 0 drift relevante, 7 ausente)

**TOC:**
- `components/layout/app-shell.tsx` — AppShell — alinhado → skip
- `components/layout/app-header.tsx` — AppHeader — alinhado → skip
- `components/auth/brand-logo.tsx` — BrandLogo — alinhado → skip
- `components/icons/streamtube-icon.tsx` — StreamtubeIcon — alinhado → skip
- `components/ui/icon-button.tsx` — UploadNavButton / CopyLinkButton — alinhado → skip
- `components/layout/account-menu.tsx` — AccountAvatarButton — alinhado → skip
- `components/ui/avatar.tsx` — Avatar — alinhado → skip
- `components/ui/card.tsx` — Card / VideoMediaPanel — componente ausente → create
- `components/studio/upload-progress.tsx` — UploadProgress — componente ausente → create
- `components/ui/progress.tsx` — ProgressBar — componente ausente → create
- `components/video/video-player.tsx` — VideoPlayer — componente ausente → create
- `components/studio/video-link-field.tsx` — VideoLinkField — componente ausente → create
- `components/studio/processing-status.tsx` — ProcessingStatus — componente ausente → create
- `components/video/video-thumbnail.tsx` — ThumbnailPreview — componente ausente → create

---

### components/layout/app-shell.tsx — AppShell

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** "create at SI-03.11.0" honored

### components/layout/app-header.tsx — AppHeader

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** "create at SI-03.11.0" honored

### components/auth/brand-logo.tsx — BrandLogo

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** "exception at SI-03.11.0 — 'Figma wordmark is 20px/700 …'" (same header node; demand reproduced)

### components/icons/streamtube-icon.tsx — StreamtubeIcon

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** "skip at SI-03.11.0" honored

### components/ui/icon-button.tsx — UploadNavButton / CopyLinkButton

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** "exception at SI-03.11.0 — 'unbound pill frame …'" (header demand reproduced). CopyLinkButton (39:1862) is a 16px icon-only control → `variant="ghost" size="sm"`.

### components/layout/account-menu.tsx — AccountAvatarButton

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** "skip at SI-03.11.0" honored

### components/ui/avatar.tsx — Avatar

- **Status:** `alinhado`
- **Decision:** `skip`
- **Prior:** "skip at SI-03.11.0" honored

### components/ui/card.tsx — Card / VideoMediaPanel

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: the existing Card primitive (`bg-card`, `rounded-[var(--radius-2)]`) is reused as-is for the outer panel (39:1710, `shadow-card`) and the media panel (39:1764); only composition is new (status code "ausente" refers to the composite, not the primitive file).
- **Prior:** _(none)_

### components/studio/upload-progress.tsx — UploadProgress

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: Figma 39:1752 — inner card with FileVideoIcon (`text-blue-500`), filename `text-label-md`, "Uploading… N%" `text-helper text-muted-foreground`, state label `text-blue-500`, 6px Progress bar.
- **Prior:** _(none)_

### components/ui/progress.tsx — ProgressBar

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: `shadcn add progress` in SI-03.10, reconciled: 6px track `bg-muted`, indicator `bg-blue-500` (Figma `#3ea6ff`), `rounded-[var(--radius-full)]`.
- **Prior:** _(none)_

### components/video/video-player.tsx — VideoPlayer

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: Figma 39:1792 — 16:9 black area, centered PlayIcon placeholder, duration badge bottom-right; native `<video controls>` when `video_url` exists (TD-08).
- **Prior:** _(none)_

### components/studio/video-link-field.tsx — VideoLinkField

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: Figma 39:1819 — "Video link" label `text-helper text-muted-foreground`, URL in `text-link`, CopyIcon button; rendered as non-clickable text (OQ-16).
- **Prior:** _(none)_

### components/studio/processing-status.tsx — ProcessingStatus

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: Figma 39:1755 — CheckCircleIcon (`text-success-text`) + "Checks complete. No issues found." `text-helper text-muted-foreground`; other states (uploading / processing / failed / interrupted) inferred per OQ-15.
- **Prior:** _(none)_

### components/video/video-thumbnail.tsx — ThumbnailPreview

- **Status:** `componente ausente`
- **Decision:** `create`
  - source: Figma 39:1802 — 240×135 frame, `border-border`, `rounded-[var(--radius-1-5)]`, ImageIcon placeholder until `thumbnail_url` exists.
- **Prior:** _(none)_
