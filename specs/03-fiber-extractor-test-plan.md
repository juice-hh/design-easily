# Test Plan — React Fiber 提取 (03)

## Scope

`extension/src/content/fiber.ts`：`extractFiberInfo()`、`getComponentBreadcrumb()` 函数。
需要 jsdom 环境模拟 DOM，并手动注入 `__reactFiber$xxx` 属性。

## Core Flows

1. 元素有 React fiber 且有 `_debugSource` → 返回 componentName + sourceFile + sourceLine
2. 元素有 React fiber 但无 `_debugSource` → 返回 componentName，source 为 null
3. 元素没有 fiber key → 返回全 null
4. `getComponentBreadcrumb` → 返回最多 5 个祖先组件名

## API Cases

- 函数组件 fiber（`type = function MyComp`）→ componentName = 'MyComp'
- `displayName` 存在时优先使用 displayName
- `forwardRef` fiber（`type.render = function`）→ 正确提取名称
- `_debugSource = { fileName, lineNumber }` → sourceFile 和 sourceLine 正确
- children prop 不出现在 props 结果中
- 函数 prop 不出现在 props 结果中
- `__` 开头的 prop 不出现在结果中
- 没有 fiber key 的普通元素 → 全部返回 null

## Edge Cases

- fiber key 存在但 type 为字符串（host element）→ componentName 为 null 或标签名
- fiber 链很深（>5 层）→ breadcrumb 最多返回 5 个
- `_debugSource` 存在但 fileName 为空 → sourceFile = null

## Out of Scope

- 实际 React 运行时渲染
- 浏览器 computed styles

## Recommended First Batch

```
tests/api/03-fiber-extractor.spec.ts
  - 无 fiber key 元素返回全 null
  - 函数组件提取 componentName
  - _debugSource 提取 sourceFile + sourceLine
  - children / 函数 prop 被过滤
  - getComponentBreadcrumb 返回祖先链（最多 5）

tests/edge/03-fiber-edge.spec.ts
  - fiber 链超过 5 层时 breadcrumb 截断
  - _debugSource.fileName 为空时 sourceFile = null
```
