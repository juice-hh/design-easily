# Test Plan — Server WebSocket (01)

## Scope

`server/src/index.ts` 中的 WebSocket 消息路由逻辑：ping/pong、vscode:open、ai:chat。
`server/src/vscode.ts` 的 VS Code 跳转命令执行。
`server/src/fileReader.ts` 的源码上下文读取。

## Core Flows

1. 客户端发 `ping` → 服务端回 `pong`
2. 客户端发 `vscode:open {file, line}` → 调用 `code --goto` → 回 `vscode:opened`
3. 客户端发 `ai:chat {messages}` → 流式返回 `ai:chunk` → 最终 `ai:done`
4. 服务端 `/health` HTTP 端点返回 `{ ok: true }`

## Frontend Cases

N/A（纯服务端模块）

## API Cases

- `ping → pong` 正常收发
- `vscode:open` 合法路径 → exec 被调用，参数正确
- `vscode:open` 非法路径（包含注入字符）→ 不执行 exec
- `ai:chat` 正常 → onChunk 被多次调用，最后 onDone
- `ai:chat` API 错误 → `ai:error` 回给客户端
- `/health` 返回 200 + `{ ok: true }`
- 畸形 JSON 消息 → 静默忽略，不崩溃
- 同时多个客户端连接 → 消息不串扰

## Edge Cases

- WebSocket 连接断开中途 → 不抛出未捕获异常
- `vscode:open` 文件路径为空字符串 → 不执行 exec
- `ai:chat` messages 为空数组 → 不 crash，返回 error

## Out of Scope

- Chrome Extension UI 行为
- Playwright 浏览器自动化（在 05 覆盖）

## Recommended First Batch

```
tests/smoke/01-server-boot.spec.ts
  - 服务启动后 /health 返回 200

tests/api/01-server-ws.spec.ts
  - ping → pong
  - vscode:open 正常路径
  - 畸形 JSON 静默忽略
  - ai:chat 调用 streamAIResponse

tests/edge/01-server-ws-edge.spec.ts
  - vscode:open 空路径不 exec
  - ai:chat 空 messages 不 crash
```
