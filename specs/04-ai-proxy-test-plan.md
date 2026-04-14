# Test Plan — AI Proxy (04)

## Scope

`server/src/ai.ts`：`streamAIResponse()` 函数。
Anthropic SDK 必须完全 mock，禁止真实 API 调用。

## Core Flows

1. Claude 模型 + 有效 API key → 调用 Anthropic SDK stream，onChunk 多次触发，最后 onDone
2. 模型不匹配或无 API key → onError 回调被调用
3. SDK 抛出异常 → onError 被调用，包含错误信息

## API Cases

- `claude-sonnet-4-6` 模型 → 使用 Anthropic client
- stream 返回多个 `content_block_delta` → 每个触发 onChunk
- stream 完成后 onDone 调用
- `content_block_delta` 以外的 chunk 类型 → 被忽略（不触发 onChunk）
- 无 ANTHROPIC_API_KEY 时 → onError 调用，消息包含模型名

## Edge Cases

- SDK stream 中途抛出 Error → onError 被调用
- messages 为空数组 → 不 crash，传给 SDK 后由 SDK 决定
- onChunk 回调在 stream 结束前被调用至少一次（当有内容时）

## Out of Scope

- GPT / OpenAI 模型（当前实现只支持 Anthropic）
- 网络错误重试逻辑

## Recommended First Batch

```
tests/api/04-ai-proxy.spec.ts
  - 正常 stream → onChunk 多次 + onDone
  - non-text_delta chunk 被忽略
  - 无 API key → onError
  - SDK 抛出异常 → onError 含 message
```
