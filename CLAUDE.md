# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
cd extension && npm run zip        # production build → design-easily.zip (for Chrome Web Store)

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
- Bridges the browser extension to Claude Code via MCP stdio server
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
- `content/index.ts` — boot, wires all modes together, keyboard shortcuts (Cmd+Shift+C = copy prompt, Cmd+Shift+E = export JSON); `design:destroy` event tears down all modes cleanly
- `content/changes.ts` — `ChangeTracker` singleton; `Change` type: `id`, `type` (`'style'|'text'|'comment'|'layout'`), `selector`, `componentName`, `sourceFile`, `sourceLine`, `property`, `oldValue`, `newValue`; dedup key = `selector::sourceFile:sourceLine::property` so same-selector components from different files don't collide; `Comment` type: `id`, `selector`, `componentName`, `text`, `timestamp`
- `content/fiber.ts` — React fiber walker; reads `__reactFiber$*` internals to get component name + `_debugSource` (file/line); only works in React dev mode
- `content/source-locator.ts` — async wrapper over `fiber.ts`; called by `inspect.ts` with an epoch counter to discard stale lookups when the inspected element changes mid-flight
- `content/ws.ts` — WebSocket client; auto-reconnect exponential backoff (1s → max 10s); `element` field in `design:request` accepts `null` for configPanel batch submits
- `content/requestHistory.ts` — tracks in-flight design requests (`DesignEntry`: pending/processing/completed/failed), updated by WS events
- `content/configPanel.ts` — right-side change list panel with tabs (全部/样式/文本/评论), undo per-item, batch-submit to Claude Code with `element: null`
- `content/edit/index.ts` — EditMode entry; coordinates overlay, resize, and property panel. Shift-click adds elements to `selectedEls` set for multi-select. "同步所有实例" checkbox (`syncComponent`) propagates style changes to all sibling elements sharing the same React component name (via `findSiblingInstances`) — only the primary element's change is recorded in `changeTracker`; sibling DOM updates are visual-only
- `content/edit/properties.ts` — Figma-style property panel split across `properties-styles.ts` (CSS rendering) and `properties-icons.ts` (SVG icons). `apply()` always updates the primary element and records the change; `notifyChange()` then triggers the sync callback in EditMode
- `content/edit/fonts.ts` — `getLocalFonts()` wraps Font Access API (`queryLocalFonts()`)
- `content/draggable.ts` — `makeDraggable(el, handleSelector)` utility; used by edit panel, config panel
- `content/ruler.ts` — `RulerMode`: hover shows dimensions + gaps to siblings; click to anchor, then hover to measure inter-element distance
- `content/comment.ts` — comment bubbles in Shadow DOM, dark frosted-glass style
- `content/tokens.ts` — shared design token constants (colors, spacing) referenced by all panels
- `content/styles.css` — base Shadow DOM reset injected into every panel host

**All extension UI uses Shadow DOM** (`attachShadow({ mode: 'open' })`) so styles don't leak into the host page. Extension elements are marked with `data-design-easily` attribute to exclude them from hover/click targeting.

### Server Architecture

```
Browser WS → app.ts (Express + WebSocketServer)
  design:request (action=develop) → queue.ts → runClaudeOnRequest() in claude-runner.ts
  design:request (action=suggest) → queue.ts (long-poll path via /api/next)
  GET /api/next?timeout=<ms> ← long-poll, claims request atomically
  POST /api/complete/:id    ← Claude Code writes back result
  WS push → design:processing / design:done / design:failed → browser
```

**`claude-runner.ts`** — spawns `claude -p <prompt>` as a subprocess for `action=develop` requests:
- Resolves workspace via `lsof` on the page URL port when `sourceFile` is unknown
- Pre-greps the workspace to find source files before spawning (avoids extra Claude round-trips)
- Uses `queue.complete()` (not `updateStatus`) to persist terminal state (summary, changedFiles, completedAt)
- Timeout defaults to 5 minutes; configurable via `CLAUDE_TIMEOUT_MS` env var
- `--max-turns` defaults to 15; configurable via `CLAUDE_MAX_TURNS` env var
- `settle()` guard ensures only the first of (close / error / timeout / cancel) fires

**MCP integration** (`mcp.ts`): stdio server exposing two tools:
- `watch_design_requests(timeout_ms)` — long-polls `/api/next`, returns `DesignRequest | null`
- `complete_design_request(id, status, summary, changedFiles, error, content)` — posts to `/api/complete/:id`

**AI chat**: `ai.ts` (Anthropic streaming) and `openai.ts` (OpenAI streaming) share the same Chinese system prompt and callback interface (`onChunk`, `onDone`, `onError`). The `app.ts` WebSocket handler enriches AI chat with file context via `fileReader.ts` (reads source file snippets around the line number from fiber info).

**Server config** (`config.ts`): reads `PORT` (default 3771), `AI_PROVIDER` (`'claude'|'openai'`), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEFAULT_MODEL`. Copy `server/.env.example` to `server/.env` to configure.

Runtime-only env vars (not in config.ts, read inline):
- `CLAUDE_MODEL` — model for code edits (default `claude-sonnet-4-6`)
- `CLAUDE_TIMEOUT_MS` — subprocess timeout in ms (default 300000 / 5 min)
- `CLAUDE_MAX_TURNS` — max `--max-turns` for `claude -p` (default 15)
- `WORKSPACE_PATH` — fallback workspace root when lsof resolution fails

### WebSocket Message Protocol

Extension → Server: `design:request`, `design:cancel`, `ai:chat`, `vscode:open`, `ping`
Server → Extension: `design:queued`, `design:processing`, `design:done` (includes `noChanges?: boolean`), `design:failed`, `ai:chunk`, `ai:done`, `ai:error`, `pong`

`design:cancel` sends `{ type, id }` to kill the in-flight Claude subprocess. `design:done` with `noChanges: true` means Claude ran successfully but made no file edits (renders "未修改文件" state in inspect panel).

### Inspect Panel State Machine

`inspect.ts` `InspectPanel` has five states rendered via `renderPanel()`:
- `inspect` — default hover/click info view with textarea to submit a dev task
- `running` — shows spinner + `taskSnapshot` (elementLabel + userMessage); cancel button sends `design:cancel`
- `success` — shows summary + changed files list; "继续审查" returns to inspect state
- `no-changes` — Claude ran but made no edits; "继续审查" returns to inspect state
- `error` — shows error message; "重试" re-submits the same task

`hasTask()` returns true for running/success/no-changes/error — used by `index.ts` to keep the panel visible across mode switches.

`triggerDevelop()` checks `wsClient.isConnected()` before sending — if server is down it calls `showInlineError()` (4 s auto-dismiss red banner above textarea) and returns without clearing the textarea.

### Design Tokens (UI)

All extension UI uses dark frosted-glass design:
- Panel background: `rgba(28, 28, 30, 0.88)` with `backdrop-filter: blur(24px) saturate(180%)`
- Border: `rgba(255,255,255,0.1)`
- Text: `rgba(255,255,255,0.9)` primary, `rgba(255,255,255,0.4)` secondary
- Accent: `#8B5CF6` / hover `#7C3AED` (buttons, focus rings — purple); `#34C759` (connected status); `#FF453A` (delete/error)
- Tokens live in `content/tokens.ts` (`ACCENT`, `ACCENT_HOVER`, `ACCENT_RGB`, `PANEL_BG`, `TOOLBAR_BG`) — import from there, never hardcode

### Tests

Tests live in `tests/` at the root:
- `unit/` — pure logic (no DOM): queue, ruler, requestHistory
- `api/` — server HTTP/WS routes (some use jsdom): server-ws, change-tracker, fiber-extractor, ai-proxy, file-reader-vscode, openai-proxy, design-queue
- `smoke/`, `edge/`, `e2e/` — integration tests
- `helpers/` — `server-harness.ts` provides `startTestServer()`, `wsConnect()`, `wsSend()`, `waitForMessage()`

`vitest.config.ts` coverage thresholds: 80% lines/functions, 70% branches. Coverage collected only for `server/src/**`, `changes.ts`, `fiber.ts`, `requestHistory.ts` — browser-runtime files excluded from unit coverage, covered by E2E instead.

### Chrome Extension Manifest

manifest_version 3. Permissions: `activeTab`, `storage`, `scripting`. Host permissions: `localhost` and `127.0.0.1`. Content script runs at `document_idle` on all URLs.

### Build Notes

- Extension dev mode uses `vite build --watch` (not Vite dev server / HMR). After changes, reload extension in `chrome://extensions`.
- Server factory function in `app.ts` has no side effects at import, enabling test harness reuse.
- `tsconfig.base.json` shared config: ES2020 target, bundler module resolution, strict mode. Extension adds DOM libs + Preact JSX. Server uses NodeNext resolution.
