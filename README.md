# Design Easily

A browser extension + local server tool that lets developers inspect, comment on, edit, and measure UI elements directly in the browser — and drive Claude Code to modify source files via WebSocket.

## Modes

| Mode | Shortcut | Description |
|------|----------|-------------|
| **Inspect** | `I` | Hover to highlight elements and view tag / class / styles / source location; type a description and click Develop to send directly to Claude for editing |
| **Edit** | `E` | Visually adjust element properties with live preview, written back to source |
| **Comment** | `C` | Pin comment bubbles on elements and send develop requests to Claude Code |
| **Config** | `G` | Export design tokens and element configuration |
| **Ruler** | `R` | Show spacing guides and alignment overlays; anchor mode measures distance between two elements |

## How It Works (Develop Flow)

```
Browser Extension → WebSocket → HTTP Server → MCP Tools → Claude Code
                                                               ↓
Browser Extension ← WebSocket ← HTTP Server ← MCP Tools ← (edits source files, returns result)
```

1. **Request** — In Inspect or Comment mode, type a description and click **Develop**
2. **Queue** — Server receives the request, assigns an ID, broadcasts `design:queued`
3. **Process** — Claude Code claims the request via MCP, locates and edits the source file
4. **Result** — Claude reports completion; browser receives `design:done` and shows the diff

## Architecture

| Component | Role |
|-----------|------|
| `extension/` | Browser extension — toolbar, inspect / edit / comment / ruler / config modules |
| `server/` | Express HTTP server + WebSocket hub + in-memory request queue |
| `server/src/mcp.ts` | MCP stdio server exposing tools to Claude Code |

**Port:** `3771` (HTTP + WebSocket, localhost only)

## Prerequisites

- Node.js 18+
- Claude Code with MCP support
- Chrome or Edge browser

## Installation

```bash
# Install server dependencies
npm install --workspace=server

# Build the server
npm run build --workspace=server
```

## Configuration

Copy the MCP settings template and fill in your project path:

```bash
cp .claude/settings.local.example.json .claude/settings.local.json
```

Edit `.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "design-easily": {
      "command": "node",
      "args": ["server/dist/mcp.js"],
      "cwd": "/absolute/path/to/design_easily"
    }
  }
}
```

## Running

```bash
# Start the HTTP/WebSocket server (development)
npm run dev --workspace=server

# Start the HTTP/WebSocket server (production)
npm run start --workspace=server

# Start the MCP server (Claude Code picks this up via settings.local.json)
npm run start:mcp --workspace=server
```

## MCP Tools

### `watch_design_requests`

Long-polls for the next pending develop request. Returns `null` on timeout.

```typescript
watch_design_requests({ timeout_ms?: number })  // default 30000, max 60000
// → DesignRequest | null
```

### `complete_design_request`

Reports the result of a processed request back to the browser.

```typescript
complete_design_request({
  id: string,
  status: 'completed' | 'failed',
  summary?: string,        // description of changes made
  changedFiles?: string[], // list of modified files
  error?: string           // failure reason
})
```

## HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health check |
| `/api/next?timeout=<ms>` | GET | Atomically claim next pending request (long-poll) |
| `/api/complete/:id` | POST | Report completion or failure |
| `/api/requests/:id` | GET | Look up request status by ID |

## Request Lifecycle

```
pending → claimed → completed
               ↘ failed
```

- Requests expire after **5 minutes** if unclaimed or abandoned
- `completed` is a terminal state (cannot be overwritten)
- Stale cleanup runs every **1 minute**

## Development & Testing

```bash
# Run unit tests
npx vitest run tests/unit/

# Run API integration tests (requires server running)
npx vitest run tests/api/

# Run all tests
npx vitest run
```

## Project Structure

```
design_easily/
├── server/
│   └── src/
│       ├── index.ts              # Server entry point
│       ├── app.ts                # Express app + WebSocket handlers
│       ├── mcp.ts                # MCP stdio server
│       ├── queue.ts              # In-memory request queue
│       └── auth.ts               # Token auth middleware
├── extension/
│   └── src/content/
│       ├── toolbar.ts            # Floating toolbar (mode switcher + ruler toggle)
│       ├── inspect.ts            # Inspect mode (hover highlight + element info)
│       ├── inspect-panel.ts      # Inspect panel UI
│       ├── edit/                 # Edit mode (property adjustments)
│       ├── comment.ts            # Comment bubbles
│       ├── ruler.ts              # Ruler and spacing measurement
│       ├── configPanel.ts        # Config export panel
│       ├── changes.ts            # Change history panel
│       └── ws.ts                 # WebSocket client (auto-reconnect)
├── tests/
│   ├── unit/
│   └── api/
└── .claude/
    ├── settings.local.example.json
    └── settings.local.json       # gitignored, per-developer config
```

## Notes

- The queue is **in-memory only** — lost on server restart
- The server binds to `127.0.0.1` only (not exposed to the network)
- WebSocket clients reconnect automatically with exponential backoff (1s → 10s)
- Element source location is extracted from React DevTools fiber data (requires React dev build)
- A session token is generated at server startup and written to `~/.design-easily/session-token`; the MCP server reads this file to authenticate requests
