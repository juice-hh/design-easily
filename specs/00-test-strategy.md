# Test Strategy — Design Easily

## 项目概述

Design Easily 是一个 Chrome Extension + 本地 Node.js 服务的开发者工具，提供可视化 UI 编辑、元素检查、AI 辅助编码和变更追踪功能。

## 测试目标

- 覆盖率目标：新增代码 **≥ 80%**
- 零 CRITICAL / HIGH 安全问题上线
- Server 端核心路径 100% 有测试保护

## 测试工具链

| 工具 | 用途 |
|------|------|
| **Vitest** | Server 和 Content Script 纯逻辑单元测试 |
| **Playwright** | E2E 集成测试（Chrome Extension + 本地服务） |
| `@vitest/coverage-v8` | 覆盖率报告 |
| `msw` (如需) | HTTP mock |

## 测试分层

```
tests/
├── smoke/      # 冒烟：关键路径验证，< 1min
├── e2e/        # 端到端：Chrome Extension + Server 联调
├── api/        # API/单元：Server 各模块纯逻辑
└── edge/       # 边界：异常、并发、格式错误
```

## 模块清单

| 编号 | 模块 | 优先级 |
|------|------|--------|
| 01 | Server WebSocket 消息路由 | P0 |
| 02 | 变更追踪（changes.ts） | P0 |
| 03 | React Fiber 提取（fiber.ts） | P1 |
| 04 | AI Proxy（ai.ts） | P1 |
| 05 | Server 集成测试 | P2 |

## Mock 约定

- **Anthropic SDK** — 必须 mock，不允许真实 API 调用进入 CI
- **child_process.exec** (VS Code) — 必须 mock，测试中不启动外部程序
- **fs/promises** — 用 vi.mock 或 memfs
- **WebSocket 连接** — 使用 `ws` 测试服务端

## 文件命名

```
tests/api/01-server-ws.spec.ts
tests/api/02-change-tracker.spec.ts
tests/api/03-fiber-extractor.spec.ts
tests/api/04-ai-proxy.spec.ts
tests/smoke/01-server-boot.spec.ts
tests/e2e/05-server-integration.spec.ts
tests/edge/02-change-tracker-edge.spec.ts
```

## 通过标准

- 所有 smoke 测试通过
- API/单元测试覆盖率 ≥ 80%
- 无 `console.error` 泄漏在测试输出中
- 无硬编码 API Key 或真实凭证
