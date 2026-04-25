# Design Easily

一个浏览器插件 + 本地服务器组成的设计辅助工具，让开发者在浏览器里直接检查、评论、编辑 UI 元素，并通过 WebSocket 驱动 Claude Code 对源文件进行修改。

## 快速开始

```bash
# 1. 克隆并安装依赖
git clone https://github.com/juice-hh/design-easily.git
cd design-easily
npm install

# 2. 构建
npm run build

# 3. 配置环境变量（在 server/ 目录下新建 .env）
ANTHROPIC_API_KEY=your_api_key_here

# 4. 配置 MCP
cp .claude/settings.local.example.json .claude/settings.local.json
# 编辑 settings.local.json，填入项目绝对路径

# 5. 启动服务器
npm run dev:server

# 6. 在 Chrome 中加载扩展（见下方说明）
```

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
- Claude Code（需支持 MCP）
- Chrome / Edge 浏览器

## 安装

```bash
npm install
npm run build
```

## 环境变量

核心功能（元素检查、发送修改请求给 Claude）**不需要配置 API Key**，直接调用本地已安装的 Claude Code CLI。

如有需要，可在 `server/` 目录下创建 `.env` 文件覆盖默认值：

```env
# 可选配置
PORT=3771                           # 服务端口（默认 3771）
WORKSPACE_PATH=/path/to/your/app   # 目标项目根路径（元素无源文件时使用）
EXTENSION_ID=your_extension_id     # 生产环境锁定扩展 ID（开发时不需要）
CLAUDE_BIN=claude                   # Claude CLI 路径（默认 claude）
CLAUDE_MODEL=claude-sonnet-4-6     # 使用的 Claude 模型
CLAUDE_TIMEOUT_MS=300000           # Claude 超时时间（默认 5 分钟）
CLAUDE_ALLOW_BASH=true             # 允许 Claude 使用 Bash 工具（默认关闭）
```

## 安装 Chrome 扩展

1. 在终端运行：
   ```bash
   npm run build
   ```

2. 打开 Chrome，地址栏输入：
   ```
   chrome://extensions
   ```

3. 开启右上角 **开发者模式**

4. 点击 **加载已解压的扩展程序**，选择项目中的 `extension/dist/` 目录

5. 扩展图标出现在工具栏后即安装成功

## MCP 配置

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
# 同时启动服务器和扩展构建监听（开发模式）
npm run dev

# 仅启动服务器
npm run dev:server

# 生产模式
npm run start --workspace=server
```

## 常见问题

**扩展连接不上服务器？**
- 确认服务器已启动（`npm run dev:server`）
- 确认端口 `3771` 未被占用
- 检查 Chrome 控制台是否有 WebSocket 错误

**Claude 收不到请求？**
- 确认 `.claude/settings.local.json` 中的 `cwd` 路径正确
- 重启 Claude Code 让 MCP 配置生效
- 在 Claude Code 中运行 `/mcp` 确认 `design-easily` 已连接

**元素找不到源文件？**
- 确认目标项目使用 React 开发构建（需要 fiber 信息）
- 或设置 `WORKSPACE_PATH` 环境变量指向目标项目根路径

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

## 开发与测试

```bash
npx vitest run tests/unit/    # 单元测试
npx vitest run tests/api/     # API 集成测试（需先启动服务器）
npx vitest run                # 全部测试
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
