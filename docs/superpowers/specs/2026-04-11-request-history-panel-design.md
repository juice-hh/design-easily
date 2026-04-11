# 配置列表（MCP 请求历史）设计文档

## 目标

在现有「变更列表」底部面板中新增「配置」tab，展示本次页面会话内所有 Claude Code MCP 设计请求的历史记录。

## 背景

现有底部面板 `changesPanel.ts` 已有「全部/样式/文本/评论」四个 tab，记录用户手动编辑的样式/文本变更。本次扩展新增「配置」tab，展示通过 `design:request` WS 消息发起的 MCP 请求历史，数据仅存内存（刷新后清空）。

---

## 架构

### 数据流

`action` 和 `userMessage` 只在客户端发起请求时已知（`design:queued` 服务端响应仅含 `{ id }`）。因此由 `inspect.ts` 在收到 `design:queued` 时负责调用 `requestHistory.add()`，此时它已持有 `action` 和 `userMessage`。后续状态更新由 `index.ts` 统一处理。

```
用户点 [建议]/[开发]（inspect.ts）
  → WS: design:request { action, userMessage, element }

Server 返回 design:queued { id }（inspect.ts 的 onMessage 处理）
  → requestHistory.add({ id, action, userMessage, status: 'pending' })
  → inspect.ts 记录 pendingRequestId = id

design:processing { id }（index.ts 的 onMessage 处理）
  → requestHistory.update(id, { status: 'processing' })

design:done { id, action?, content?, summary?, changedFiles? }（index.ts）
  → requestHistory.update(id, { status: 'completed', content, summary, changedFiles })

design:failed { id, error }（index.ts）
  → requestHistory.update(id, { status: 'failed', error })

每次 add/update → requestHistory 触发 onChange → ChangesPanel 重新渲染
```

**WS 消息载荷说明（extension 侧 ServerMessage 类型已定义）：**
- `design:queued`：`{ id: string }`
- `design:processing`：`{ id: string }`
- `design:done`：`{ id, action?, content?, summary?, changedFiles? }`
- `design:failed`：`{ id, error: string }`

### 组件关系

```
index.ts
  ├── wsClient.onMessage() → design:processing/done/failed → requestHistory.update()
  └── new ChangesPanel()   → 订阅 requestHistory.onChange()

inspect.ts（已存在，新增）
  └── wsClient.onMessage() → design:queued → requestHistory.add()

requestHistory.ts  （新建）
  - 管理 DesignEntry[] 数组
  - 提供 add() / update() / getAll() / onChange() / pendingCount()
  - add()：若 id 已存在则静默忽略（幂等）
  - update()：若 id 不存在则静默 no-op，不触发 onChange

changesPanel.ts    （修改）
  - Filter 类型新增 'config'
  - renderItem() 新增 DesignEntry 渲染分支
  - Tab 徽标：pendingCount > 0 时显示蓝色数字
```

---

## 数据结构

### `DesignEntry`（新建于 `requestHistory.ts`）

```typescript
export interface DesignEntry {
  id: string
  action: 'suggest' | 'develop'
  userMessage: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  content?: string        // 建议模式完成时的文字
  summary?: string        // 开发模式完成时的摘要
  changedFiles?: string[] // 开发模式完成时的文件列表
  error?: string
  createdAt: number
}
```

---

## UI 规格

### 配置 Tab

- 与现有「全部/样式/文本/评论」tab 同样式
- 选中时：`background: rgba(0,122,255,0.1); color: #007AFF`（与其他 tab 一致）
- 有处理中请求时：tab 名右侧显示蓝色小徽标数字（`pendingCount`）；全部完成后徽标消失

### 每条记录布局（两层徽标 + 内容 + 复制按钮）

```
[类型徽章]  请求文字（truncated）          [复制]
[状态徽章]  结果摘要（truncated）
```

**类型徽章：**
- 建议：`background: rgba(88,86,214,0.1); color: #5856D6`
- 开发：`background: rgba(52,199,89,0.1); color: #1d8a3a`

**状态徽章：**
- 等待中 / 处理中：`background: rgba(255,149,0,0.1); color: #b86a00`
- 已完成：同类型颜色（建议紫 / 开发绿）
- 失败：`background: rgba(255,59,48,0.1); color: #FF3B30`

**结果摘要（第二行）：**
- 建议完成：显示 `content` 文字（截断）
- 开发完成：显示 `changedFiles.join(', ')` 或 `summary`（截断）
- 处理中：`Claude Code 处理中...`（橙色）
- 失败：显示 `error`（红色）
- 等待中：`等待 Claude Code...`（橙色）

**复制按钮：**
- 样式：次级小按钮，`border: 1px solid rgba(0,0,0,0.1); background: transparent; color: rgba(0,0,0,0.3)`
- 仅 status === 'completed' 时可点击；其他状态禁用（`opacity: 0.4`）
- 点击行为：
  - 建议模式：复制 `content`
  - 开发模式：`changedFiles` 非空时复制 `changedFiles.join('\n')`，否则复制 `summary ?? ''`

### 顶部工具栏按钮弱化

「导入 JSON / 导出 JSON / 复制 AI Prompt」改为文字次级样式：`background: transparent; color: rgba(0,0,0,0.35)`，无填充背景。

---

## 变更文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `extension/src/content/requestHistory.ts` | 新建 | DesignEntry store，add/update/getAll/onChange/pendingCount |
| `extension/src/content/changesPanel.ts` | 修改 | 新增 'config' filter；渲染 DesignEntry；tab 徽标；弱化顶部按钮 |
| `extension/src/content/index.ts` | 修改 | wsClient.onMessage 监听 design:processing/done/failed → requestHistory.update() |
| `extension/src/content/inspect.ts` | 修改 | wsClient.onMessage 收到 design:queued → requestHistory.add() |

---

## 测试

`tests/unit/requestHistory.spec.ts`（新建）：
- `add()` 新增条目，`getAll()` 返回
- `add()` 同一 id 重复调用 → 幂等，第二次静默忽略，`getAll()` 仍只有一条
- `update()` 修改状态和字段
- `update()` 不存在的 id → 静默 no-op，不抛出，不触发 onChange
- `pendingCount()` 返回 status 为 pending 或 processing 的条目数量
- `onChange()` 在 add 后触发回调
- `onChange()` 在 update（已存在 id）后触发回调
- `onChange()` 在 update（不存在 id）后不触发回调

`changesPanel.ts` 为 Chrome Extension Shadow DOM UI，依 `vitest.config.ts` 排除出覆盖率，通过 TypeScript 编译验证。

---

## 不在本次范围内

- 深色主题
- 跨会话持久化
- 删除单条记录
- 重新发起请求
