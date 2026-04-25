# Design Easily

一个浏览器插件 + 本地服务器组成的设计辅助工具，让开发者在浏览器里直接检查、评论、编辑 UI 元素，并通过 WebSocket 驱动 Claude Code 对源文件进行修改。

## 功能模式

| 模式 | 快捷键 | 说明 |
|------|--------|------|
| **检查**（Inspect） | `I` | 悬停高亮元素，查看标签/类名/样式/源文件位置；可输入描述直接发送给 Claude 修改源文件 |
| **编辑**（Edit） | `E` | 可视化调整元素属性，实时预览并写回源文件 |
| **评论**（Comment） | `C` | 在页面元素上添加评论气泡，向 Claude Code 发送开发请求 |
| **导出配置**（Config） | `G` | 导出设计 token 和元素配置 |
| **标尺**（Ruler） | `R` | 显示元素间距、对齐辅助线，支持锚点模式测量两元素距离 |

## 工作原理（开发流程）

```
浏览器插件 → WebSocket → HTTP 服务器 → MCP 工具 → Claude Code
                                                         ↓
浏览器插件 ← WebSocket ← HTTP 服务器 ← MCP 工具 ← （修改源文件，返回结果）
```

1. **发起请求** — 在检查模式或评论模式中输入描述，点击 **开发** 按钮
2. **入队** — 服务器收到请求，分配 ID，广播 `design:queued`
3. **处理** — Claude Code 通过 MCP 认领请求，定位源文件并修改
4. **回传** — 修改完成后上报结果，浏览器收到 `design:done` 展示变更

## 架构

| 组件 | 职责 |
|------|------|
| `extension/` | 浏览器插件，包含工具栏、检查/编辑/评论/标尺/配置各模块 |
| `server/` | Express HTTP 服务器 + WebSocket 消息中枢 + 内存请求队列 |
| `server/src/mcp.ts` | MCP stdio 服务器，向 Claude Code 暴露工具 |

**端口：** `3771`（HTTP + WebSocket，仅限本地访问）

## 环境要求

- Node.js 18+
- 支持 MCP 的 Claude Code
- Chrome / Edge 浏览器

## 安装

```bash
# 安装服务端依赖
npm install --workspace=server

# 构建服务端
npm run build --workspace=server
```

## 配置

复制 MCP 配置模板并填写你的项目路径：

```bash
cp .claude/settings.local.example.json .claude/settings.local.json
```

编辑 `.claude/settings.local.json`：

```json
{
  "mcpServers": {
    "design-easily": {
      "command": "node",
      "args": ["server/dist/mcp.js"],
      "cwd": "/你的项目绝对路径/design_easily"
    }
  }
}
```

## 启动

```bash
# 启动 HTTP/WebSocket 服务器（开发模式）
npm run dev --workspace=server

# 启动 HTTP/WebSocket 服务器（生产模式）
npm run start --workspace=server

# 启动 MCP 服务器（Claude Code 通过 settings.local.json 自动接入）
npm run start:mcp --workspace=server
```

## MCP 工具

Claude Code 通过 MCP 服务器使用以下两个工具：

### `watch_design_requests`

长轮询获取下一个待处理的开发请求，超时时返回 `null`。

```typescript
watch_design_requests({ timeout_ms?: number })  // 默认 30000，最大 60000
// → DesignRequest | null
```

### `complete_design_request`

将处理结果回传给浏览器。

```typescript
complete_design_request({
  id: string,
  status: 'completed' | 'failed',
  summary?: string,        // 变更说明
  changedFiles?: string[], // 修改的文件列表
  error?: string           // 失败时：错误原因
})
```

## HTTP 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 服务器健康检查 |
| `/api/next?timeout=<ms>` | GET | 原子性地认领下一个待处理请求（长轮询） |
| `/api/complete/:id` | POST | 上报完成或失败结果 |
| `/api/requests/:id` | GET | 按 ID 查询请求状态 |

## 请求生命周期

```
pending（待处理）→ claimed（已认领）→ completed（已完成）
                              ↘ failed（已失败）
```

- 请求超过 **5 分钟** 未被认领或处理将自动过期
- `completed` 为终态，不可覆盖
- 过期清理每 **1 分钟** 执行一次

## 开发与测试

```bash
# 运行单元测试
npx vitest run tests/unit/

# 运行 API 集成测试（需先启动服务器）
npx vitest run tests/api/

# 运行全部测试
npx vitest run
```

## 项目结构

```
design_easily/
├── server/
│   └── src/
│       ├── index.ts              # 服务器入口
│       ├── app.ts                # Express 应用 + WebSocket 处理
│       ├── mcp.ts                # MCP stdio 服务器
│       ├── queue.ts              # 内存请求队列
│       └── auth.ts               # Token 认证中间件
├── extension/
│   └── src/content/
│       ├── toolbar.ts            # 浮动工具栏（模式切换 + 标尺开关）
│       ├── inspect.ts            # 检查模式（悬停高亮 + 元素信息）
│       ├── inspect-panel.ts      # 检查面板 UI
│       ├── edit/                 # 编辑模式（属性调整）
│       ├── comment.ts            # 评论气泡
│       ├── ruler.ts              # 标尺与间距测量
│       ├── configPanel.ts        # 导出配置面板
│       ├── changes.ts            # 变更历史面板
│       └── ws.ts                 # WebSocket 客户端（自动重连）
├── tests/
│   ├── unit/
│   └── api/
└── .claude/
    ├── settings.local.example.json
    └── settings.local.json       # 已加入 .gitignore，每位开发者本地配置
```

## 注意事项

- 请求队列为**纯内存存储**，服务器重启后队列数据会丢失
- 服务器仅绑定 `127.0.0.1`，不对外网暴露
- WebSocket 客户端断线后自动重连，退避间隔从 1 秒增至最大 10 秒
- 元素源文件位置通过 React DevTools fiber 数据提取（需使用 React 开发构建）
- 服务器启动时生成 session token，写入 `~/.design-easily/session-token`，MCP 工具读取该文件完成鉴权
