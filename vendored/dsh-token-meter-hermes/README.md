# dsh-token-meter-hermes

Hermes 风格上下文分解投影插件（DeepSeek Harness）。

参考 NousResearch/hermes-agent（`agent/model_metadata.py` + `agent/context_breakdown.py`）的
token 估算与上下文构成分析方法，移植为 DSH 的独立会话投影：

- **CJK 密度感知估算**：中文/韩文/假名逐字 ≈ 1 token，其余按 ~4 字符/token
  （ASCII 走 O(1) 快速路径）。DSH 现有 `estimate.ts` 一律 4 字符/token，
  中文会话会系统性低估 2–4 倍。
- **图片 flat cost**：每张图片按固定 1500 tokens（Anthropic 定价模型，可配置），
  不再按 base64/字节长度估算——一张 1MB 截图不会把上下文撑爆。
- **8 类 breakdown**：`system / rules / skills / memory / tools / mcp / subagent / messages`
  （Hermes 的 Cursor 风格分类，映射到 DSH 的 `<available_skills>`、
  `<system-reminder>`、`mcp_` 前缀工具、子代理工具族等可识别块）。

## 设计

| 项 | 值 |
|----|----|
| 投影 key | `contextBreakdownHermes` |
| stateVersion | 1 |
| 注册机制 | `ctx.inject(['sessionProjections'], …)`（与 dsh-token-meter 相同） |
| 影响现有投影 | 无——不碰 `contextPressure` / `contextBreakdown` / `tokenUsage` |
| 状态复杂度 | O(1)（surface 走 shadow-price 协议，可持久化 checkpoint） |

消息部分复用 token-meter 的 shadow-price 协议：`compaction/summary` 与
`compaction/prune` 事件携带被替换区间的估算价（`shadowedTokenCount`），
替换时按其折叠，压缩后总量正确收缩。

## 装载（web profile）

把本目录作为本地依赖接入 `{{USERPROFILE}}\.dsh\profiles\web`：

1. `package.json` 的 `dependencies` 增加：

   ```json
   "dsh-token-meter-hermes": "file:{{USERPROFILE}}/dsh-token-meter-hermes"
   ```

2. 在 profile 目录执行 `pnpm install`（生成 node_modules 链接）。

3. `cordis.patch.yml` 增加 insert 块：

   ```yaml
   - insert:
       - id: token-meter-hermes
         name: dsh-token-meter-hermes
         config:
           imageTokenCost: 1500   # 可选：覆盖单张图片 flat cost
   ```

4. 重启 dsh web（配置在启动时装载）。

## 客户端消费

`contextBreakdownHermes` 走与 `contextBreakdown` 相同的投影快照通道，
客户端 `useProjection('contextBreakdownHermes')` 即可订阅：

```ts
const breakdown = useProjection('contextBreakdownHermes')
// → { systemTokens, rulesTokens, skillsTokens, memoryTokens,
//     toolsTokens, mcpTokens, subagentTokens, messageTokens }
```

要在 ContextMeter 面板显示 8 段，需要把 ContextMeter 组件消费的 key 指向新投影
（`dsh-client-ui-conversation` 的 `ContextMeter.js` 中
`useProjection('contextBreakdown')` → `useProjection('contextBreakdownHermes')`），
或新增一个独立面板组件。

## 估算 API

`lib/estimate.js` 导出纯函数，可独立用于其它插件/工具：

- `estimateText(text)` — CJK 感知字符串估算
- `estimateContent(blocks)` / `estimateMessage(message)` — 内容块/消息估算
- `estimateSystemTokens(header)` / `estimateToolsTokens(header)` — envelope 估算
- `estimateToolTokens(tool)` — 单工具 schema 估算（name + description + parameters）
- `IMAGE_TOKEN_COST` / `CJK_DENSE_RE` — 常量

## 测试

```bash
node test/smoke.mjs
```
