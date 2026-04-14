# Test Plan — 变更追踪 (02)

## Scope

`extension/src/content/changes.ts`：`ChangeTracker` 类的全部方法及导出逻辑。

## Core Flows

1. 添加样式变更 → getChanges() 包含该条目
2. 添加评论 → getComments() 包含该条目
3. removeChange(id) → 该条目从列表移除
4. exportAIPrompt() → 包含所有变更和评论的 Markdown 字符串
5. exportJSON() → 合法的 JSON，结构包含 changes 和 comments
6. importJSON(json) → 恢复 changes 和 comments
7. reset() → 清空所有变更和评论
8. onChange 监听器 → 每次变更后被调用

## Frontend Cases

- 导出 AI Prompt 格式验证（包含 `##` 标题、变更明细）
- JSON 导出后再导入，数据完整还原
- 多次 addChange 累积，列表按时间序正确

## API Cases

- `addChange` 生成唯一 id（两次调用 id 不同）
- `addChange` 后 `getChanges()` 长度 +1
- `addComment` 后 `getComments()` 长度 +1
- `removeChange(id)` 后 `getChanges()` 长度 -1
- `removeComment(id)` 后 `getComments()` 长度 -1
- `reset()` 后 changes 和 comments 均为空
- `exportJSON()` 为合法 JSON 字符串
- `importJSON(exportJSON())` → 数据不变
- `onChange` 在 add/remove/reset 后各触发一次

## Edge Cases

- `importJSON` 传入非法 JSON → 抛出 Error
- `importJSON` 缺少 changes 字段 → 不 crash，默认空数组
- `removeChange` 传入不存在的 id → 无副作用
- `exportAIPrompt` 在 0 条变更时 → 返回非空字符串（含提示）

## Out of Scope

- DOM 操作和浏览器 API

## Recommended First Batch

```
tests/api/02-change-tracker.spec.ts
  - addChange / getChanges
  - addComment / getComments
  - removeChange
  - reset
  - exportJSON / importJSON 往返
  - exportAIPrompt 含变更内容
  - onChange 回调触发

tests/edge/02-change-tracker-edge.spec.ts
  - importJSON 非法 JSON 抛错
  - removeChange 不存在 id 无副作用
  - 0 条变更时 exportAIPrompt 非空
```
