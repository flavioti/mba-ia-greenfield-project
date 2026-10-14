# phase-03-upload-processing — Screen Inventory Progress

**Status:** completed
**Screens:** 2/2 completed

## Reconciled screen list

| # | Screen name                                | URL (fileKey:nodeId)            | Status   |
|---|--------------------------------------------|---------------------------------|----------|
| 1 | Tela de upload de vídeo                    | 0RPjuDoEGx4nzxWjwqei6S:39:1594  | completed |
| 2 | Tela de upload e processamento do vídeo    | 0RPjuDoEGx4nzxWjwqei6S:39:1642  | completed |

## Screens removed as out-of-scope

- ~~Tela de player/download do owner (inferida)~~ — user: download fica só no backend nesta fase; não há frame dedicado no Figma (player/download completos chegam com "Video show", Fase 05)
- ~~Edit/Publish Video (39:29), My videos list (39:652)~~ — Fase 04
- ~~Video show (39:1013)~~ — Fase 05
- ~~Home (Catalog Show) (39:379), Channel show (39:30), Channel Settings (39:1384), Account User Menu (39:1513)~~ — fases posteriores
- ~~User login, Create user account, Reset password~~ — já entregues na Fase 02
- ~~Left Menu (39:1294)~~ — componente compartilhado (shell), não tela

## Decisions log

- ✓ [DECISION: Status de processamento na própria tela de upload ou página separada?] — resolved: tela dedicada "Upload video processing" (39:1642), existente no Figma
- ✓ [DECISION: Formulário de detalhes (título, descrição, thumbnail, categoria, visibilidade, Save draft/Publish) na Fase 03?] — resolved: inventariar só a parte da Fase 03 (progresso, preview, link, filename, qualidade, checks); formulário fica para a Fase 04 (alinhado com AMB-3)
- ✓ [DECISION: Download com UI na Fase 03?] — resolved: só backend (URL assinada via TD-09); sem botão de download nesta fase
- ✓ [DECISION: Upload de um ou vários arquivos?] — resolved: um arquivo por vez
- ✓ [DECISION: Rotas das telas?] — resolved: `/studio/videos/new` (seleção) e `/studio/videos/[id]` (progresso + status)
- Token drift check: arquivo Figma sem variables (`get_variable_defs` vazio) — não aplicável
- ✓ [DECISION: AccountAvatarButton (39:1707) é Presentational ou Local-interactive?] — resolved: consolidação com a classificação da tela 1 (Local-interactive, `components/layout/account-menu.tsx (new)`; menu/logout na Fase 04)
- ✓ Validação cross-screen: "Serviço de processamento em segundo plano (filas)" e "Download do vídeo pelo usuário" sem UI direta — aceito (filas = infra backend, precedente da Fase 02; download = decisão do usuário)
