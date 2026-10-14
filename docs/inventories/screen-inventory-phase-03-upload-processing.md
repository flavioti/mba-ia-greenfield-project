# phase-03-upload-processing — Screen Inventory

> **Phase:** 03 — Upload e Processamento de Vídeos
> **Status:** Validated
> **Date:** 2026-10-13
> **Screens in scope:** 2

---

## Screen: Tela de upload de vídeo

**Route:** `/studio/videos/new`
**Figma:** https://www.figma.com/design/0RPjuDoEGx4nzxWjwqei6S/?node-id=39-1594 (node `0RPjuDoEGx4nzxWjwqei6S:39:1594`)
**Purpose (from project-plan.md):** "Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance".

### Component inventory

| Component (Figma node)                          | Type              | In DS? | Reuse?                                         | Notes |
|-------------------------------------------------|-------------------|--------|------------------------------------------------|-------|
| AppShell (39:1596)                              | Server-connected  | ✗      | `components/layout/app-shell.tsx (new)`        | Shell autenticado mínimo (DG-1). O route guard depende do estado de sessão no servidor e redireciona anônimos para /login |
| AppHeader (39:1597)                             | Presentational    | ✗      | `components/layout/app-header.tsx (new)`       | Contêiner do header. Os itens filhos estão listados abaixo |
| SidebarToggleButton "menu" (39:1605)            | Local-interactive | ✓      | `components/ui/icon-button.tsx`                | Ícone hambúrguer que abre e fecha o aside no cliente |
| BrandLogo (39:1606)                             | Presentational    | ✓      | `components/auth/brand-logo.tsx`               | StreamtubeIcon + wordmark "StreamTube". Se for envolvido em link para "/", vira navegação client-side |
| StreamtubeIcon (39:1619)                        | Presentational    | ✓      | `components/icons/streamtube-icon.tsx`         | Sub-componente do BrandLogo |
| SearchBar (39:1607)                             | Local-interactive | ✗      | `components/layout/search-bar.tsx (new)`       | Fora do escopo: Fase 07 (busca). Sem verbos nesta fase |
| Input "Search" (39:1621)                        | Local-interactive | ✓      | `components/ui/input.tsx`                      | Fora do escopo: Fase 07 (busca) |
| SearchButton (39:1622)                          | Local-interactive | ✓      | `components/ui/icon-button.tsx`                | Fora do escopo: Fase 07 (busca) |
| UploadNavButton "camera" (39:1608)              | Local-interactive | ✓      | `components/ui/icon-button.tsx`                | Atalho de upload no header. Navegação client-side (Next.js `<Link>`) para `/studio/videos/new` |
| AccountAvatarButton (39:1609)                   | Local-interactive | ✗      | `components/layout/account-menu.tsx (new)`     | Nesta fase só exibe o avatar da sessão já carregada (`components/auth/session-provider.tsx`). O menu de conta com logout é da Fase 04 (DG-1). Sem verbos nesta fase |
| Avatar img (39:1624)                            | Presentational    | ✗      | `components/ui/avatar.tsx (new)`               | Primitive de avatar ainda não existe no repo |
| AppSidebar (42:629)                             | Presentational    | ✗      | `components/layout/app-sidebar.tsx (new)`      | Contêiner do aside. Os itens estão listados abaixo |
| SidebarNavItem "Home" (42:631)                  | Local-interactive | ✗      | `components/layout/sidebar-nav-item.tsx (new)` | Next.js `<Link>`. Destino é da Fase 07. Sem verbos nesta fase |
| SidebarNavItem "Subscriptions" (42:637)         | Local-interactive | ✗      | `components/layout/sidebar-nav-item.tsx (new)` | Next.js `<Link>`. Destino é da Fase 06 (inscrições). Sem verbos nesta fase |
| Divider hr (42:643)                             | Presentational    | ✗      | new                                            | `<hr>` puro-DOM |
| SidebarNavItem "Your videos" (42:645)           | Local-interactive | ✗      | `components/layout/sidebar-nav-item.tsx (new)` | Next.js `<Link>`. Destino é da Fase 04 (painel). Sem verbos nesta fase |
| SidebarNavItem "Liked videos" (42:651)          | Local-interactive | ✗      | `components/layout/sidebar-nav-item.tsx (new)` | Next.js `<Link>`. Fase 06. O fundo #272727 (estado ativo) é artefato do mock, ver Observations |
| Divider hr (42:657)                             | Presentational    | ✗      | new                                            | `<hr>` puro-DOM |
| SubscriptionsSection (42:658)                   | Server-connected  | ✗      | `components/layout/sidebar-subscriptions.tsx (new)` | Lista de canais inscritos vinda do backend. Fora do escopo: Fase 06. Sem verbos nesta fase |
| Heading "Subscriptions" (42:659)                | Presentational    | ✗      | new                                            | `<h3>` puro-DOM. Fase 06 |
| SubscriptionChannelItem ×6 (42:661, 42:664, 42:667, 42:670, 42:673, 42:676) | Local-interactive | ✗ | `components/layout/sidebar-nav-item.tsx (new)` | Link para canal com avatar e nome. Fora do escopo: Fase 06 |
| ShowMoreButton "Show 12 more" (42:679)          | Local-interactive | ✗      | new                                            | Expande a lista de inscrições. Fora do escopo: Fase 06 |
| Main (39:1598)                                  | Presentational    | ✗      | new                                            | `<main>` puro-DOM, contêiner da página |
| Heading "Upload video" (39:1625)                | Presentational    | ✗      | new                                            | `<h1>` puro-DOM |
| VideoDropzone (39:1611)                         | Server-connected  | ✗      | `components/studio/video-dropzone.tsx (new)`   | Área drag-and-drop de um único arquivo. Ao soltar ou selecionar, pré-cadastra o rascunho (título = nome do arquivo sem extensão), inicia o upload multipart presigned direto ao storage via Uppy core + @uppy/aws-s3 (TD-02/TD-03) e navega para `/studio/videos/[id]` |
| UploadIconBadge (39:1626)                       | Presentational    | ✗      | new                                            | Círculo decorativo com ícone de upload (svg 39:1682) |
| Heading "Drag and drop video files to upload" (39:1627) | Presentational | ✗  | new                                            | `<h2>` puro-DOM. Copy no plural, ver Observations |
| HelperText "Your videos will be private until you publish them." (39:1629) | Presentational | ✗ | new                          | `<p>` puro-DOM |
| SelectFileButton "Select files" (39:1631)       | Server-connected  | ✓      | `components/ui/button.tsx`                     | Abre o seletor nativo (`<input type="file">` sem `multiple`). A seleção dispara o mesmo fluxo do VideoDropzone. Copy no plural, ver Observations |

### Verbs of intent

| Verb                                                                  | Component                                              | Capability (project-plan.md) |
|-----------------------------------------------------------------------|--------------------------------------------------------|------------------------------|
| Pré-cadastrar o vídeo como rascunho ao iniciar o upload do arquivo    | VideoDropzone + SelectFileButton (39:1631)             | "Pré-cadastro automático do vídeo como rascunho ao iniciar o upload" |
| Enviar o arquivo de vídeo selecionado (até 10GB) em partes            | VideoDropzone + SelectFileButton (39:1631)             | "Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance" |
| Armazenar o arquivo de vídeo enviado no armazenamento de objetos      | VideoDropzone                                          | "Serviço de armazenamento de arquivos (vídeos e thumbnails)" |

### Observations

- **Copy no plural vs. escopo single-file:** o Figma diz "Drag and drop video files to upload" (39:1627) e "Select files" (39:1631), mas o escopo decidido é um arquivo por vez. Na implementação, a copy vai para o singular ("Drag and drop a video file to upload" / "Select file") e o input fica sem `multiple`.
- **Dropzone e botão compartilham os verbos:** VideoDropzone e SelectFileButton são Server-connected porque disparam o mesmo fluxo de I/O (pré-cadastro + upload). O botão só abre o seletor nativo, mas é ele que dispara a ação, como o SubmitButton da Fase 02.
- **Estados não desenhados:** o frame mostra só o estado idle do dropzone. Não há estado de drag-over, erro de validação (tipo inválido ou arquivo acima de 10GB), cancelamento, nem feedback entre a seleção e a navegação para `/studio/videos/[id]`.
- **Capabilities sem affordance aqui:** filas, processamento, thumbnail e URL única são efeitos server-side do upload; a cobertura visual delas está na tela de processamento. Streaming também aparece só lá. Download é só backend nesta fase (decisão do usuário).
- **Shell (DG-1):** entram apenas o shell autenticado mínimo e o route guard para /login. Itens de outras fases foram listados sem verbos: busca e Home (Fase 07), Subscriptions/canais/"Show 12 more"/Liked videos (Fase 06), Your videos e menu de conta/logout (Fase 04). A SubscriptionsSection (42:658) é Server-connected por natureza, mas pertence à Fase 06; ver Open questions.
- **AppShell sem verbo:** foi classificado como Server-connected por causa do route guard, que depende da sessão. Não tem verbo porque o comportamento foi herdado da Fase 02 ("Login e controle de sessão do usuário").
- **Destaque no aside é artefato do mock:** "Liked videos" (42:651) aparece ativo nesta tela, mas nenhum item do aside corresponde a `/studio/videos/new`. Não reproduzir o destaque.
- **UploadNavButton (39:1608):** o ícone de câmera foi tratado como atalho de navegação para esta mesma rota. O Figma não tem dropdown ("Upload video" / "Go live").
- **Avatar:** não existe primitive `avatar` no repo. Foi proposto `components/ui/avatar.tsx (new)`, reutilizável pelo header e pela lista de inscrições.
- **Completude do Figma:** todos os componentes visíveis no screenshot estão em `get_design_context`. Não há mapeamentos de Code Connect; os paths de Reuse? vêm da Fase 02 (herdados) e de propostas canônicas `(new)`.

---

## Screen: Tela de upload e processamento do vídeo

**Route:** `/studio/videos/[id]`
**Figma:** https://www.figma.com/design/0RPjuDoEGx4nzxWjwqei6S/?node-id=39-1642 (node `0RPjuDoEGx4nzxWjwqei6S:39:1642`)
**Purpose (from project-plan.md):** "Processamento automático do vídeo após upload (extração de duração e metadados)", com o acompanhamento do upload em andamento ("Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance").

### Component inventory

| Component (Figma node) | Type | In DS? | Reuse? | Notes |
|------------------------|------|--------|--------|-------|
| AppShell (39:1694) | Server-connected | ✗ | `components/layout/app-shell.tsx (new)` | see screen: Tela de upload de vídeo |
| AppHeader (39:1695) | Presentational | ✗ | `components/layout/app-header.tsx (new)` | see screen: Tela de upload de vídeo |
| SidebarToggleButton "menu" (39:1703) | Local-interactive | ✓ | `components/ui/icon-button.tsx` | see screen: Tela de upload de vídeo |
| BrandLogo (39:1704) | Presentational | ✓ | `components/auth/brand-logo.tsx` | see screen: Tela de upload de vídeo |
| StreamtubeIcon (39:1719) | Presentational | ✓ | `components/icons/streamtube-icon.tsx` | see screen: Tela de upload de vídeo |
| SearchBar (39:1705) | Local-interactive | ✗ | `components/layout/search-bar.tsx (new)` | see screen: Tela de upload de vídeo (Fase 07) |
| Input "Search" (39:1723) | Local-interactive | ✓ | `components/ui/input.tsx` | see screen: Tela de upload de vídeo (Fase 07) |
| SearchButton (39:1724) | Local-interactive | ✓ | `components/ui/icon-button.tsx` | see screen: Tela de upload de vídeo (Fase 07) |
| UploadNavButton "camera" (39:1706) | Local-interactive | ✓ | `components/ui/icon-button.tsx` | see screen: Tela de upload de vídeo |
| AccountAvatarButton (39:1707) | Local-interactive | ✗ | `components/layout/account-menu.tsx (new)` | see screen: Tela de upload de vídeo (menu/logout na Fase 04) |
| Avatar img (39:1728) | Presentational | ✗ | `components/ui/avatar.tsx (new)` | see screen: Tela de upload de vídeo |
| AppSidebar (42:572) | Presentational | ✗ | `components/layout/app-sidebar.tsx (new)` | see screen: Tela de upload de vídeo |
| SidebarNavItem "Home" (42:574) | Local-interactive | ✗ | `components/layout/sidebar-nav-item.tsx (new)` | see screen: Tela de upload de vídeo (Fase 07) |
| SidebarNavItem "Subscriptions" (42:580) | Local-interactive | ✗ | `components/layout/sidebar-nav-item.tsx (new)` | see screen: Tela de upload de vídeo (Fase 06) |
| Divider hr (42:586) | Presentational | ✗ | new | see screen: Tela de upload de vídeo |
| SidebarNavItem "Your videos" (42:588) | Local-interactive | ✗ | `components/layout/sidebar-nav-item.tsx (new)` | see screen: Tela de upload de vídeo (Fase 04) |
| SidebarNavItem "Liked videos" (42:594) | Local-interactive | ✗ | `components/layout/sidebar-nav-item.tsx (new)` | see screen: Tela de upload de vídeo (Fase 06; destaque ativo é artefato do mock) |
| Divider hr (42:600) | Presentational | ✗ | new | see screen: Tela de upload de vídeo |
| SubscriptionsSection (42:601) | Server-connected | ✗ | `components/layout/sidebar-subscriptions.tsx (new)` | see screen: Tela de upload de vídeo (Fase 06) |
| Heading "Subscriptions" (42:602) | Presentational | ✗ | new | see screen: Tela de upload de vídeo (Fase 06) |
| SubscriptionChannelItem ×6 (42:604, 42:607, 42:610, 42:613, 42:616, 42:619) | Local-interactive | ✗ | `components/layout/sidebar-nav-item.tsx (new)` | see screen: Tela de upload de vídeo (Fase 06) |
| ShowMoreButton "Show 12 more" (42:622) | Local-interactive | ✗ | new | see screen: Tela de upload de vídeo (Fase 06) |
| Heading "Upload video" (39:1708) | Presentational | ✗ | new | `<h1>` puro DOM |
| Card do painel de upload (39:1710) | Presentational | ✓ | `components/ui/card.tsx` | Container principal da página |
| UploadProgress (39:1752) | Server-connected | ✗ | `components/studio/upload-progress.tsx (new)` | Progresso do upload multipart direto browser → storage via Uppy core + @uppy/aws-s3, com UI shadcn própria (TD-02/TD-03). Um único arquivo |
| FileIcon (39:1796) | Presentational | ✗ | new | Ícone SVG de arquivo |
| UploadFileName "my_awesome_video_final_v2.mp4" (39:1824) | Presentational | ✗ | new | Nome do arquivo em envio, recebido via props do UploadProgress |
| UploadPercentText "Uploading... 84%" (39:1825) | Presentational | ✗ | new | Percentual recebido via props do UploadProgress |
| UploadStatusLabel "Uploading" (39:1772) | Presentational | ✗ | new | Rótulo do estado do upload, controlado pelo UploadProgress |
| ProgressBar (39:1758 / 39:1773) | Presentational | ✗ | `components/ui/progress.tsx (new)` | Primitive do DS ainda não criada. Recebe `value` via props |
| VideoMediaPanel (39:1754) | Presentational | ✓ | `components/ui/card.tsx` | Container lateral com player, link, filename e qualidade |
| VideoPlayer (39:1792) | Server-connected | ✗ | `components/video/video-player.tsx (new)` | MP4 progressivo via HTTP Range com URL GET pré-assinada de curta duração; acesso só do dono enquanto for rascunho (TD-08/TD-09). Inclui ícone placeholder (39:1812) e ícone play (39:1816) |
| VideoDuration "0:00" (39:1815) | Server-connected | ✗ | new | Duração extraída pelo worker após o upload |
| VideoLinkField (39:1819) | Server-connected | ✗ | `components/studio/video-link-field.tsx (new)` | URL única do vídeo: short ID base62 de 11 caracteres (TD-10) |
| VideoLinkText "streamtube.com/v/tech2024" (39:1873) | Presentational | ✗ | new | Estilizado como link. O destino `/v/[id]` (watch) é da Fase 05; ver Open questions |
| CopyLinkButton (39:1862) | Local-interactive | ✓ | `components/ui/icon-button.tsx` | Copia para a área de transferência no cliente, sem I/O com o backend |
| FilenameRow "my_awesome_tech_review_final_v2.mp4" (39:1821) | Server-connected | ✗ | new | Nome original do arquivo, persistido no rascunho pré-cadastrado. Precisa sobreviver a reload de `/studio/videos/[id]` |
| VideoQualityRow "1080p HD" (39:1823) | Server-connected | ✗ | new | Resolução extraída pelo worker |
| ProcessingStatus "Checks complete. No issues found." (39:1755) | Server-connected | ✗ | `components/studio/processing-status.tsx (new)` | Reflete `processing_status` (TD-06), atualizado por short polling via BFF (TD-13). Inclui ícone de check (39:1765) |
| VideoDetailsForm (39:1759 + 39:1760 + 39:1761 + 39:1763) | Server-connected | ✗ | `components/studio/video-details-form.tsx (new)` | Fora do escopo: Fase 04 |
| Heading "Details" (39:1774) | Presentational | ✗ | new | Fora do escopo: Fase 04 |
| Label "Title (required)" (39:1827) | Presentational | ✓ | `components/ui/label.tsx` | Fora do escopo: Fase 04 |
| Input "Title" (39:1828) | Local-interactive | ✓ | `components/ui/input.tsx` | Fora do escopo: Fase 04 |
| Label "Description" (39:1829) | Presentational | ✓ | `components/ui/label.tsx` | Fora do escopo: Fase 04 |
| Textarea "Description" (39:1830) | Local-interactive | ✗ | `components/ui/textarea.tsx (new)` | Fora do escopo: Fase 04 |
| Heading "Thumbnail" + helper (39:1777 / 39:1779) | Presentational | ✗ | new | Fora do escopo: Fase 04 |
| ThumbnailPreview (39:1831) | Server-connected | ✗ | `components/video/video-thumbnail.tsx (new)` | No escopo só como exibição da thumbnail gerada pelo worker, servida por URL GET pré-assinada (TD-09). A troca de thumbnail é da Fase 04 |
| ChangeThumbnailButton (39:1803) | Server-connected | ✓ | `components/ui/button.tsx` | Fora do escopo: Fase 04 |
| Heading "Category" + helper (39:1782 / 39:1784) | Presentational | ✗ | new | Fora do escopo: Fase 04 |
| CategorySelect (39:1804 + chevron 39:1809) | Local-interactive | ✗ | `components/ui/select.tsx (new)` | Fora do escopo: Fase 04 |
| Divider (39:1762) | Presentational | ✗ | new | `<hr>` puro DOM |
| Heading "Visibility" + helper (39:1787 / 39:1789) | Presentational | ✗ | new | Fora do escopo: Fase 04 |
| VisibilityRadioGroup (39:1791: "Public" 39:1810, "Unlisted" 39:1811) | Local-interactive | ✗ | `components/ui/radio-group.tsx (new)` | Fora do escopo: Fase 04 |
| SaveDraftButton (39:1769) | Server-connected | ✓ | `components/ui/button.tsx` | Fora do escopo: Fase 04 |
| PublishButton (39:1770) | Server-connected | ✓ | `components/ui/button.tsx` | Fora do escopo: Fase 04 |

### Verbs of intent

| Verb | Component | Capability (project-plan.md) |
|------|-----------|------------------------------|
| Enviar o arquivo de vídeo ao armazenamento acompanhando o progresso | UploadProgress (39:1752) | "Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance" |
| Carregar o rascunho pré-cadastrado do vídeo (nome original do arquivo) | FilenameRow (39:1821) | "Pré-cadastro automático do vídeo como rascunho ao iniciar o upload" |
| Acompanhar o status de processamento do vídeo | ProcessingStatus (39:1755) | "Processamento automático do vídeo após upload (extração de duração e metadados)" |
| Exibir duração e qualidade extraídas do vídeo | VideoDuration (39:1815) + VideoQualityRow (39:1823) | "Processamento automático do vídeo após upload (extração de duração e metadados)" |
| Exibir a thumbnail gerada automaticamente | ThumbnailPreview (39:1831) | "Geração automática de thumbnail a partir de um frame do vídeo" |
| Exibir o link único do vídeo | VideoLinkField (39:1819) | "URL única por vídeo, sem conflito com outros vídeos" |
| Reproduzir a prévia do vídeo enviado sem baixá-lo por completo | VideoPlayer (39:1792) | "Reprodução via streaming (sem necessidade de download completo)" |

### Observations

- **Escopo da Fase 03 nesta tela:** progresso do upload, nome do arquivo, player de prévia, link do vídeo, qualidade, status de processamento e exibição da thumbnail gerada. O formulário "Details" (Title, Description, troca de thumbnail, Category, Visibility) e os botões "Save draft" e "Publish" são da Fase 04 ("Edição das informações do vídeo", "Fluxo de rascunho → publicação") e foram listados sem verbos.
- **Título padrão (AMB-3):** o título do rascunho tem como padrão o nome do arquivo sem extensão. O Input "Title" (39:1828) mostra "My Awesome Video", que não deriva do filename. A edição é da Fase 04, mas o valor padrão nasce no pré-cadastro da Fase 03.
- **Filename inconsistente no mock:** o UploadProgress (39:1824) mostra "my_awesome_video_final_v2.mp4" e o FilenameRow (39:1848) mostra "my_awesome_tech_review_final_v2.mp4". Na implementação, os dois vêm da mesma fonte.
- **Estados não desenhados:** o design mostra ao mesmo tempo "Uploading 84%" e "Checks complete. No issues found." com "1080p HD" preenchido. Faltam os estados intermediários: upload em andamento, processando, falha no processamento, thumbnail/duração indisponíveis e player sem fonte. O mapeamento de `processing_status` (TD-06) para mensagens e ícones fica para o plano.
- **Progresso não sobrevive a reload:** o UploadProgress só tem dados enquanto a sessão de upload do Uppy (TD-03) está viva no cliente, e o servidor não consegue reconstruí-lo. Reload, retomada e upload interrompido não estão desenhados; ver Open questions.
- **Sem download na UI:** não há affordance de download na tela. "Download do vídeo pelo usuário" fica só no backend nesta fase (decisão do usuário).
- **Infra sem affordance direta:** "Serviço de armazenamento de arquivos (vídeos e thumbnails)" e "Serviço de processamento em segundo plano (filas)" são infraestrutura. Ficam cobertas indiretamente pelo upload, pelo status de processamento e pela exibição de mídia.
- **Link do vídeo:** o VideoLinkText (39:1873) tem estilo de link, mas o destino `/v/[id]` é da Fase 05; ver Open questions. O CopyLinkButton só usa a área de transferência no cliente.
- **Thumbnail:** o ThumbnailPreview (39:1831) fica dentro da seção "Thumbnail" da Fase 04. Só a exibição da thumbnail gerada entra na Fase 03; o botão "Change Thumbnail" (39:1803) não entra.
- **Shell consolidado:** o shell (AppShell, AppHeader, AppSidebar) é idêntico ao da Tela de upload de vídeo, e as linhas foram consolidadas com `see screen:`. O sub-agente marcou o AccountAvatarButton (39:1707) com `[DECISION: Presentational | Local-interactive]`; ele foi resolvido pela consolidação com a classificação da tela 1 (Local-interactive, menu e logout na Fase 04).
- **BrandLogo fora do contexto de auth:** o header usa o BrandLogo de `components/auth/`. Mover para um path compartilhado é uma tarefa separada, fora do escopo; ver Open questions.
- **Completude do Figma:** todos os componentes visíveis no screenshot estão em `get_design_context`.

---

## Reconciliation summary

| Capability (project-plan.md) | Covered by | Screens |
|------------------------------|------------|---------|
| "Serviço de armazenamento de arquivos (vídeos e thumbnails)" | VideoDropzone (indireto: o upload grava no storage); mídia exibida por VideoPlayer e ThumbnailPreview | /studio/videos/new, /studio/videos/[id] |
| "Serviço de processamento em segundo plano (filas)" | (backend; side-effect do upload concluído, observável via ProcessingStatus) | — (capability backend; sem UI direta) |
| "Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance" | VideoDropzone + SelectFileButton; UploadProgress | /studio/videos/new, /studio/videos/[id] |
| "Pré-cadastro automático do vídeo como rascunho ao iniciar o upload" | VideoDropzone + SelectFileButton; FilenameRow | /studio/videos/new, /studio/videos/[id] |
| "Processamento automático do vídeo após upload (extração de duração e metadados)" | ProcessingStatus; VideoDuration + VideoQualityRow | /studio/videos/[id] |
| "Geração automática de thumbnail a partir de um frame do vídeo" | ThumbnailPreview | /studio/videos/[id] |
| "URL única por vídeo, sem conflito com outros vídeos" | VideoLinkField | /studio/videos/[id] |
| "Reprodução via streaming (sem necessidade de download completo)" | VideoPlayer (prévia do dono) | /studio/videos/[id] |
| "Download do vídeo pelo usuário" | — (sem UI nesta fase, por decisão do usuário; URL GET pré-assinada via TD-09) | — (capability backend; sem UI direta) |

## Open questions

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
