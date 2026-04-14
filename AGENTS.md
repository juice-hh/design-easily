# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 个人偏好

- 改动前先说明方案，等我确认再执行
- 不确定需求时直接问，不要自己猜
- TypeScript 严格模式
- 错误处理要显式，不要吞掉异常
- commit message 格式：`feat/fix/chore: xxx`
- 新功能开新分支，不直接提交 main

## Commands

```bash
# Root (runs both workspaces concurrently)
npm run dev          # dev:server + dev:ext in parallel
npm run build        # build extension + server
npm test             # vitest run (all tests)
npm run test:watch   # vitest interactive watch
npm run test:coverage

# Extension only
cd extension && npm run dev        # vite build --watch (not HMR)
cd extension && npm run type-check # tsc --noEmit

# Server only
cd server && npm run dev   # tsx watch src/index.ts
cd server && npm run build # tsc --project tsconfig.build.json
cd server && npm run start:mcp # stdio MCP server

# Run a single test file
npx vitest run tests/unit/ruler.spec.ts

# Run tests by directory
npx vitest run tests/api/
```

## Architecture Overview

Chrome Extension + local Node server that gives any webpage a Figma-like editing experience.

### Two packages (npm workspaces)

**`extension/`** — Chrome extension (Vite + @crxjs/vite-plugin, Preact for popup)
- `src/content/` — content script injected into every tab
- `src/popup/` — extension popup UI (Preact, jsx via preact/jsx-runtime)

**`server/`** — Local Node.js service (Express + WebSocket on port 3771)
- Bridges the browser extension to Codex via MCP stdio server
- Supports both Anthropic and OpenAI providers (configurable via `AI_PROVIDER` env)

### Content Script Data Flow

```
User clicks element
  → toolbar.ts (mode state machine: inspect | edit | config | null)
  → inspect.ts | edit/index.ts | comment.ts | ruler.ts
  → changes.ts (ChangeTracker singleton — source of truth for all edits)
  → configPanel.ts (right-side panel, subscribes via changeTracker.onChange())
  → ws.ts (WSClient, auto-reconnect) → server port 3771
```

**Key files:**
- `content/index.ts` — boot, wires all modes together, keyboard shortcuts (Cmd+Shift+C = copy prompt, Cmd+Shift+E = export JSON)
- `content/changes.ts` — `ChangeTracker` singleton; `Change` type has fields: `id`, `type` (`'style'|'text'|'comment'|'layout'`), `selector`, `componentName`, `sourceFile`, `sourceLine`, `property`, `oldValue`, `newValue`; `Comment` type: `id`, `selector`, `componentName`, `text`, `timestamp`; key methods: `getChanges()`, `getComments()`, `addChange()`, `addComment()`, `removeChange()`, `removeComment()`, `exportAIPrompt()`, `exportJSON()`, `onChange(listener)`
- `content/fiber.ts` — React fiber walker; reads `__reactFiber$*` internal properties to get component name + `_debugSource` (file/line); only works when target page uses React dev mode
- `content/ws.ts` — WebSocket client; auto-reconnect with exponential backoff (1s → max 10s); sends `design:request`, `ai:chat`, `vscode:open`; receives streaming AI chunks
- `content/requestHistory.ts` — tracks in-flight design requests (`DesignEntry` with status: pending/processing/completed/failed), updated by WS events
- `content/configPanel.ts` — right-side change list panel with tabs (全部/样式/文本/评论), undo per-item, export prompt + submit to Codex
- `content/edit/properties.ts` — Figma-style right-side property panel (Shadow DOM, font/color/size/spacing/flex/ruler controls)
- `content/edit/fonts.ts` — `getLocalFonts()` wraps Font Access API (`queryLocalFonts()`)
- `content/ruler.ts` — `RulerMode`: hover shows dimensions + gaps to siblings; click to anchor, then hover to measure inter-element distance
- `content/comment.ts` — comment bubbles in Shadow DOM, dark frosted-glass style

**All extension UI uses Shadow DOM** (`attachShadow({ mode: 'open' })`) so styles don't leak into the host page. Extension elements are marked with `data-design-easily` attribute to exclude them from hover/click targeting.

### Server Architecture

```
Browser WS → app.ts (Express + WebSocketServer)
  design:request → queue.ts (in-memory queue, 5-min stale auto-fail)
  GET /api/next?timeout=<ms> ← long-poll, claims request atomically
  POST /api/complete/:id    ← Codex writes back result
  WS push → design:processing / design:done / design:failed → browser
```

**MCP integration** (`mcp.ts`): stdio server exposing two tools:
- `watch_design_requests(timeout_ms)` — long-polls `/api/next`, returns `DesignRequest | null`
- `complete_design_request(id, status, summary, changedFiles, error, content)` — posts to `/api/complete/:id`

**AI chat**: `ai.ts` (Anthropic streaming) and `openai.ts` (OpenAI streaming) share the same Chinese system prompt and callback interface (`onChunk`, `onDone`, `onError`). The `app.ts` WebSocket handler enriches AI chat with file context via `fileReader.ts` (reads source file snippets around the line number from fiber info).

**Server config** (`config.ts`): reads `PORT` (default 3771), `AI_PROVIDER` (`'Codex'|'openai'`), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEFAULT_MODEL`. Copy `server/.env.example` to `server/.env` to configure.

### WebSocket Message Protocol

Extension → Server: `design:request`, `ai:chat`, `vscode:open`, `ping`
Server → Extension: `design:queued`, `design:processing`, `design:done`, `design:failed`, `ai:chunk`, `ai:done`, `ai:error`, `pong`

### Design Tokens (UI)

All extension UI uses dark frosted-glass design:
- Panel background: `rgba(28, 28, 30, 0.88)` with `backdrop-filter: blur(24px) saturate(180%)`
- Border: `rgba(255,255,255,0.1)`
- Text: `rgba(255,255,255,0.9)` primary, `rgba(255,255,255,0.4)` secondary
- Accent: `#007AFF` (links/focus), `#34C759` (connected status), `#FF453A` (delete/error)

### Tests

Tests live in `tests/` at the root:
- `unit/` — pure logic (no DOM): queue, ruler, requestHistory
- `api/` — server HTTP/WS routes (some use jsdom): server-ws, change-tracker, fiber-extractor, ai-proxy, file-reader-vscode, openai-proxy, design-queue
- `smoke/`, `edge/`, `e2e/` — integration tests
- `helpers/` — `server-harness.js` provides `startTestServer()`, `wsConnect()`, `wsSend()`, `waitForMessage()`

`vitest.config.ts` coverage thresholds: 80% lines/functions, 70% branches. Coverage collected only for `server/src/**`, `changes.ts`, `fiber.ts`, `requestHistory.ts` — browser-runtime files excluded from unit coverage, covered by E2E instead.

### Chrome Extension Manifest

manifest_version 3. Permissions: `activeTab`, `storage`, `scripting`. Host permissions: `localhost` and `127.0.0.1`. Content script runs at `document_idle` on all URLs.

### Build Notes

- Extension dev mode uses `vite build --watch` (not Vite dev server / HMR). After changes, reload extension in `chrome://extensions`.
- Server factory function in `app.ts` has no side effects at import, enabling test harness reuse.
- `tsconfig.base.json` shared config: ES2020 target, bundler module resolution, strict mode. Extension adds DOM libs + Preact JSX. Server uses NodeNext resolution.
