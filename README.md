# agmon-plugins

Open-source [AGMon](https://github.com/thanhdevapp/agent-factory) plugins, one folder per plugin. Every plugin here is free, MIT-licensed, and runs inside the AGMon Zero-Trust plugin sandbox (opaque-origin iframe with `sandbox="allow-scripts"`, no `allow-same-origin`, `connect-src none`, no `unsafe-eval`, or Zero-JS declarative `execution: "data"` packs).

## Plugins (32 total)

| Plugin | Folder | Execution | What it does |
| --- | --- | --- | --- |
| Git Log | [`plugins/git-log`](plugins/git-log) | `sandboxed-ui` | Git history for the workspace: branch tree, lane graph, filters, changed files and commit details |
| Agent Control Room, Inbox & Pitwall HUD | [`plugins/agent-control-room`](plugins/agent-control-room) | `sandboxed-ui` | Unified Agent Inbox, Decision Gate queue, live Subagent DAG, Pitwall token/cost HUD, and Skill & MCP usage analytics. |
| Archive, Font, Audio & Trace Inspector | [`plugins/archive-media-inspector`](plugins/archive-media-inspector) | `sandboxed-ui` | Inspect ZIP/JAR/APK archives without extracting, preview fonts (TTF/OTF/WOFF2), play audio files, and inspect VCD/Chrome trace files offline. |
| Ayu & Night Owl Pack | [`plugins/ayu-night-owl-theme`](plugins/ayu-night-owl-theme) | `data` | Ayu (Dark, Mirage, Light) and Night Owl / Light Owl palettes tuned for long sessions. |
| Catppuccin Themes | [`plugins/catppuccin-theme`](plugins/catppuccin-theme) | `data` | Soothing pastel Catppuccin palettes (Mocha, Macchiato, Frappe, Latte) with matching terminal tokens. |
| Context Ballast, Hygiene & Test Queue | [`plugins/context-hygiene-doctor`](plugins/context-hygiene-doctor) | `sandboxed-ui` | Inspect AGENTS.md/CLAUDE.md/skills context token weight, detect stale doc path references and dirty worktrees, and coordinate machine-wide Test Queue leases. |
| DB Query & HTTP/GraphQL Workbench | [`plugins/db-api-workbench`](plugins/db-api-workbench) | `sandboxed-ui` | SQL query workbook (PostgreSQL, MySQL, SQLite, Redis, MongoDB templates) plus .http and GraphQL collection composer persisted per workspace. |
| Offline Dev Toolbox | [`plugins/dev-toolbox`](plugins/dev-toolbox) | `sandboxed-ui` | Offline developer utilities in AGMon's sidebar: JWT decoder, Base64 codec, JSON formatter, Regex tester, UUID generator, Docker run to Compose, and WCAG contrast checker. |
| Diagram & Architecture Studio | [`plugins/diagram-studio`](plugins/diagram-studio) | `sandboxed-ui` | Offline read-write editor for Excalidraw, Draw.io, Mermaid, BPMN, Event Storming, Business Model Canvas, and Obsidian JSON Canvas diagrams with save conflict protection. |
| Dracula & Gruvbox Pack | [`plugins/dracula-gruvbox-theme`](plugins/dracula-gruvbox-theme) | `data` | Classic Dracula dark plus Gruvbox Dark Hard and Gruvbox Light retro palettes. |
| Fleet & OS Vitals Monitor | [`plugins/fleet-os-vitals`](plugins/fleet-os-vitals) | `sandboxed-ui` | Live bounded OS vitals (CPU cores, 1/5/15m load averages, RAM usage bar, uptime) in the sidebar and status bar without high-frequency ps polling. |
| Line Blame & PR Diff Breakdown | [`plugins/git-blame-pr-tour`](plugins/git-blame-pr-tour) | `sandboxed-ui` | GitLens-style line blame inspector and structured commit/PR tour grouped by runtime, tests, docs, and config using zero-lock Git history RPC. |
| GitHub & Solarized Pack | [`plugins/github-solarized-theme`](plugins/github-solarized-theme) | `data` | GitHub Dark Dimmed, GitHub Light Default, Solarized Dark, and Solarized Light. |
| Image & SVG Markup | [`plugins/image-svg-markup`](plugins/image-svg-markup) | `sandboxed-ui` | Annotate images and SVGs offline with highlight boxes, arrows, numbered steps, and solid-box PII/secret redaction, then export a copy. |
| Inspo & Agent Assets Board | [`plugins/inspo-assets-board`](plugins/inspo-assets-board) | `sandboxed-ui` | Pin design references, color swatches, and agent-generated artifact links in a compact sidebar board persisted per plugin. |
| JSON Graph, OpenAPI & HAR Waterfall | [`plugins/json-openapi-har-viewer`](plugins/json-openapi-har-viewer) | `sandboxed-ui` | Interactive JSON/YAML collapsible tree explorer, OpenAPI 3 endpoint browser, and HAR HTTP network waterfall viewer. |
| Japanese Language Pack | [`plugins/lang-ja`](plugins/lang-ja) | `data` | Zero-JS Japanese localization pack for AGMon Workbench navigation, Market, and status controls. |
| Tieng Viet Language Pack | [`plugins/lang-vi`](plugins/lang-vi) | `data` | Goi ban dia hoa giao dien Tieng Viet Zero-JS cho AGMon Workbench, Market, Cai dat va Bang lenh. |
| Material Color File Icons | [`plugins/material-icons`](plugins/material-icons) | `data` | Colorful Material-inspired SVG file and folder icons for dark and light themes. |
| Minimal Monochrome Icons | [`plugins/minimal-icons`](plugins/minimal-icons) | `data` | Crisp monochrome SVG file and folder icons inheriting active theme colors with zero JavaScript. |
| Rich Docs, LaTeX & Office Viewer | [`plugins/office-rich-docs`](plugins/office-rich-docs) | `sandboxed-ui` | Editable split-preview for MDX, LaTeX, AsciiDoc, and Fountain plus read-only Word (.docx) and PowerPoint (.pptx) document inspection. |
| Pomodoro & Offline Sidequest Arcade | [`plugins/pomodoro-sidequest`](plugins/pomodoro-sidequest) | `sandboxed-ui` | Status-bar Pomodoro timer plus an offline Snake & Endless Runner canvas game in the sidebar that automatically pauses when any agent needs your attention. |
| AI Council, Prompt Enhancer & Snippets | [`plugins/prompt-snippets-council`](plugins/prompt-snippets-council) | `sandboxed-ui` | 5-level project-aware prompt enhancer, reusable command/prompt snippets library, and Blind Multi-Model Council roundtable rubric composer. |
| Rose Pine & True OLED Pack | [`plugins/rose-pine-oled-theme`](plugins/rose-pine-oled-theme) | `data` | Rose Pine (Main, Moon, Dawn) plus pitch-black True OLED theme for OLED monitors. |
| Docker, K8s & Sandbox VM Recipes | [`plugins/sandbox-recipes-infra`](plugins/sandbox-recipes-infra) | `sandboxed-ui` | Generate disposable workspace isolation recipes (Docker DevContainer, Multipass VM, Lima VM, Fly Sprites, Firecracker, Kubernetes Pod spec) and export directly. |
| Audio Alerts & Presence Configurator | [`plugins/sound-presence-bridge`](plugins/sound-presence-bridge) | `sandboxed-ui` | Offline Web Audio API sound alert packs on agent completion/waiting plus opt-in Stream Deck & Discord Presence state payload generator. |
| Spec-Kit, OpenSpec & Beads Board | [`plugins/spec-beads-kanban`](plugins/spec-beads-kanban) | `sandboxed-ui` | Unified sidebar board detecting .specify/, openspec/, .beads/, and plans/ directories alongside live AGMon 5-lane Kanban tasks. |
| Spreadsheet & SQLite/Parquet Studio | [`plugins/spreadsheet-data-studio`](plugins/spreadsheet-data-studio) | `sandboxed-ui` | Edit CSV/TSV spreadsheets with =SUM/=AVG formulas, row editing, filter, and save-in-place; inspect SQLite, Parquet, and Excel structures offline. |
| Essential Syntax Grammars Pack | [`plugins/syntax-essentials`](plugins/syntax-essentials) | `data` | Declarative syntax declarations for Prisma, HTTP/REST, Nix, LaTeX, systemd/Quadlet, GraphQL, Godot GDScript, and Jsonnet. |
| Tokyo Night Suite | [`plugins/tokyo-night-theme`](plugins/tokyo-night-theme) | `data` | Tokyo Night, Tokyo Night Storm, and Tokyo Night Day palettes with matching terminal backgrounds. |
| Coding Worklog & Activity Calendar | [`plugins/wakatime-worklog`](plugins/wakatime-worklog) | `sandboxed-ui` | Track daily human + AI agent coding minutes per project/model, show today's total in the status bar, and export daily Markdown standup worklogs. |
| Worktree Notes, Scratchpad & TODOs | [`plugins/worktree-notes-todos`](plugins/worktree-notes-todos) | `sandboxed-ui` | Per-workspace Markdown notes, global scratchpad, and prioritized TODO list stored safely in plugin storage without polluting git status. |

## Install

In AGMon, open **Extensions -> Market** and click **Install** on any plugin.

Each catalog entry pins:
- this repository (`thanhdevapp/agmon-plugins`) and owner ID (`10144700`),
- an exact 40-character Git commit SHA,
- the plugin subdirectory (`plugins/<slug>`), and
- the exact SHA-256 tree hash of that directory.

AGMon verifies the repository owner, extracts safely without symlinks or path traversal, checks the tree hash and manifest permissions against user consent, and refuses to install if anything differs.

## Develop & Test

```bash
npm test
```
