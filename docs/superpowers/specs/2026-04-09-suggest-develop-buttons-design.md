# [建议][开发] 双按钮 & 统一 MCP 流 设计文档

## 目标

将 inspect 面板的单个发送按钮改为 [建议][开发] 两个按钮，移除直接 Anthropic API 流，所有请求统一通过 Claude Code MCP 处理。

## 背景

现有系统有两条并行路径：
1. `ai:chat` — 直接调用 Anthropic SDK 流式返回，在 inspect 面板聊天区展示
2. `design:request` → MCP queue → Claude Code 处理 → `complete_design_request`

新设计废弃路径 1，统一走路径 2，通过 `action` 字段区分「建议」和「开发」两种模式。

---

## 架构

### 消息流

**建议模式（suggest）：**
```
用户点 [建议]
  → WS: design:request { action: 'suggest', element, userMessage }
  → Server: 入队，返回 design:queued { id }
  → Claude Code: watch_design_requests 拿到请求
  → Claude Code: 分析元素，生成文字建议
  → Claude Code: complete_design_request { id, status: 'completed', content: '...' }
  → Server: design:done { id, content, action: 'suggest' }
  → Extension: 在聊天区显示建议文字
```

**开发模式（develop）：**
```
用户点 [开发]
  → WS: design:request { action: 'develop', element, userMessage }
  → Server: 入队，返回 design:queued { id }
  → Claude Code: watch_design_requests 拿到请求
  → Claude Code: 直接修改源文件
  → Claude Code: complete_design_request { id, status: 'completed', summary: '...', changedFiles: [...] }
  → Server: design:done { id, summary, changedFiles, action: 'develop' }
  → Extension: 在聊天区显示「已修改 X 个文件」
```

---

## 变更清单

### 1. `server/src/queue.ts`

- `DesignRequest` 新增字段：`action: 'suggest' | 'develop'`（可选，默认 `'develop'`）
- `CompletePayload` 新增字段：`content?: string`（建议模式返回的文字内容）
- `enqueue()` 参数新增 `action`
- `complete()` 存储 `content`

### 2. `server/src/app.ts`

- `ClientMessage` 中 `design:request` 新增 `action?: 'suggest' | 'develop'`
- `design:request` handler 透传 `action` 给 `queue.enqueue()`
- `POST /api/complete/:id`：接收 `content` 字段并存储
- `design:done` WS 推送新增 `content` 和 `action` 字段
- `ServerMessage` 新增 `design:processing`、`design:done`（扩展字段）、`design:failed`

### 3. `server/src/mcp.ts`

- `complete_design_request` 工具 inputSchema 新增 `content` 属性
- 描述更新：建议模式用 `content`，开发模式用 `summary` + `changedFiles`

### 4. `extension/src/content/ws.ts`

- `ClientMessage` 中 `design:request` 新增 `action?: 'suggest' | 'develop'`
- `ServerMessage` 新增：
  - `design:queued { id }`
  - `design:processing { id }`
  - `design:done { id, action?, content?, summary?, changedFiles? }`
  - `design:failed { id, error }`
- 移除 `ai:chunk`、`ai:done`、`ai:error`（或保留类型定义但 inspect 不再使用）

### 5. `extension/src/content/inspect.ts`

- 移除 `ai:chat` 发送逻辑（`sendMessage()` 不再调用 `ai:chat`）
- 移除对 `ai:chunk`、`ai:done`、`ai:error` 的监听
- 新增 `sendDesignRequest(action: 'suggest' | 'develop')` 方法
- 新增对以下 WS 消息的监听：
  - `design:queued` → 显示「⏳ 已发送，等待 Claude Code...」
  - `design:processing` → 显示「⚙️ Claude Code 处理中...」
  - `design:done` (suggest) → 显示 `content` 文字内容
  - `design:done` (develop) → 显示「✅ 已修改：file1.tsx, file2.tsx」
  - `design:failed` → 显示「❌ 处理失败：{error}」
- UI：将输入框旁的单个 `↑` 按钮替换为 [建议] [开发] 两个按钮，竖向排列
- 同一时间只允许一个 pending 请求（两按钮禁用直到收到结果）

### 6. 测试

- `tests/unit/queue.spec.ts`：新增 `action` 字段测试、`content` 字段测试
- `tests/api/06-design-queue.spec.ts`：新增 `action` 透传测试、`content` 返回测试

---

## 不在本次范围内

- 配置列表面板（历史记录）
- 深色主题
- `ai:chat` 相关服务端代码的删除（保留但不从 extension 调用）
