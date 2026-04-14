# Test Plan — Server 集成测试 (05)

## Scope

启动真实本地服务（测试端口），通过 WebSocket 客户端发送消息，验证完整链路。
AI Proxy 使用 mock，VS Code exec 使用 mock，文件读取可使用真实临时文件。

## Core Flows

1. 服务启动 → /health 200 → WS 连接成功 → ping → pong
2. vscode:open → exec 被调用 → vscode:opened 回复
3. ai:chat（含源文件引用）→ 文件上下文被读取注入 → AI 调用被 mock → chunk 流回

## Integration Cases

- 服务启动时端口被占用 → 进程以非 0 退出（或抛出错误）
- 多个 WS 客户端同时发 ai:chat → 各自收到独立的 requestId 响应，不混淆
- ai:chat 引用存在的源文件 → enrichWithFileContext 读取文件并注入 snippet
- ai:chat 引用不存在的文件 → 不注入，消息不变，不 crash

## Edge Cases

- WS 连接断开后服务端不 crash
- 高频 ping（100次/秒）→ 服务不崩溃

## Out of Scope

- Chrome Extension UI（需要真实浏览器）
- 生产环境部署

## Recommended First Batch

```
tests/smoke/01-server-boot.spec.ts
  - 服务启动 /health 返回 200

tests/e2e/05-server-integration.spec.ts
  - 完整 WS 连接 + ping/pong
  - vscode:open 完整链路（exec mock）
  - ai:chat 含文件引用的完整链路（AI mock）
  - 多客户端并发不混淆 requestId
```
