# Postmortem — 启动卡死：reconcile 全量重放阻塞主线程（O(n²) 裁剪 + 大文件同步处理）

- **日期**：2026-08-26（确认 2026-08-28 补充）
- **影响**：DSH Desktop 升级 0.1.1-rc.2 后，带历史账本启动即"卡死"（白屏 / HTTP 无响应 / CPU 单核 100%），账本数据被误判为损坏而反复清空，历史元数据丢失。
- **严重度**：P1（生产启动路径，数据有丢失风险）
- **结论先行**：`reconcileOnStartup` 触发的全量账单重建存在**两个独立阻塞问题**，叠加后导致启动卡死 20+ 分钟：
  1. **O(n²) 裁剪**：`record()` 的 `recent` 数组在满 `maxRecent` 后，每条事件都执行 `splice(0,1)`（O(maxRecent)），11 万事件 → 22 亿次元素移动 → 4.8s（纯裁剪基准，不含文件 IO/解压/算价）。
  2. **大文件同步处理**：`scanSessionUsageRecords` 对 63MB zstd 文件（解压后 177MB 文本，253k 行）的 `readFileSync` + `decompressSessionLog` + `split("\n")` + 逐行 JSON.parse 全部同步，单文件可卡 3-43s；多个大文件累积。

---

## 1. 时间线

| 时间 | 事件 |
|---|---|
| 08-26 12:31 | 历史上 OOM 崩溃（14G 内存压力），reconcileOnStartup 曾被禁用 |
| 08-26 02:53 | 提交 aec7d7a（v2.5.1）："streaming replay + low-memory + re-enable reconcileOnStartup"。**内存解决，事件循环阻塞未解决** |
| 08-26 20:22 | 首次观测 reconcile 超长运行：`durationMs:1309174`（**21.8 分钟**），`sessionsScanned:1015`，`usageEvents:111244` |
| 08-26 22:59 | 临时关闭 `reconcileOnStartup` → 启动正常（2ms HTTP） |
| 08-27 | DSH 正常使用，reconcile 关闭 |
| 08-28 17:00 | v2.5.2 代码（分片异步 + 进度日志）被同步到本地，配合 `reconcileOnStartup: true` → **仍卡死**（日志停在 230→240 文件 179s） |
| 08-28 17:16 | **定位 O(n²) 裁剪**：基准测试证实 4.8s → 3.3ms（1467x 提速），在 `lib/index.js` 打批量裁剪补丁 |
| 08-28 17:19 | 补丁后验证：reconcile 推进，大文件卡点 179s→43s，但仍有 240→250 卡 2min+ 无响应 → 大文件处理同步问题需 worker 化 |

## 2. 根因分析

### 2.1 触发条件

`reconcileOnStartup: true` → `reconcileInPlace()` → `resolveReconcileIds()` 从 3 个来源（bySession、detail 文件、共识会话集文件）取到 1015 个历史 session id → `buildReconciledLedger` 全量重放。

### 2.2 根因 A：O(n²) 裁剪（主因，占 80%+ 耗时）

`record()` 在 `lib/index.js:684-685`：

```js
this.recent.push(entry);
if (this.recent.length > this.maxRecent) this.recent.splice(0, this.recent.length - this.maxRecent);
```

当 `maxRecent=20000`（默认配置），recent 满 20000 后**每条事件**都：
1. `push(entry)` → 变 20001
2. `splice(0, 1)` → O(20000) 元素移动

**总复杂度：N × maxRecent = 113k × 20000 ≈ 22.6 亿次元素移动**

同样的问题在 `session.messages` 裁剪（`lib/index.js:707-711`）也存在，只是 maxMessagesPerSession=500，影响较小。

**基准测试**（113k 事件，maxRecent=20000）：

| 实现 | 耗时 | 加速比 |
|---|---|---|
| 当前（每条 splice） | 4805.4 ms | 1x |
| 批量裁剪 BATCH=1000 | 3.3 ms | **1467x** |
| 批量裁剪 BATCH=5000 | 0.9 ms | **5346x** |

### 2.3 根因 B：大文件同步处理（次因，占剩余阻塞）

- 最大文件：63MB zstd → 解压后 177MB 文本，253k 行，6330 条记录
- 第二个：55MB zstd → 157MB 文本，173k 行，4624 条记录
- `scanSessionUsageRecords` 的 `readFileSync` + `decompressSessionLog` + `text.toString("utf8")` + `split("\n")` 全部同步，单文件 3-43s
- v2.5.2 的逐行 `await yieldNow()` 让出有效，但**超大单行 JSON.parse** 或 **zstd 解压帧**仍可能原子阻塞数秒

### 2.4 空账本为什么没事

空账本/首次启动时 `resolveReconcileIds` 的 3 个来源全为空 → `sel` 命中 0 文件 → 循环空转 1.7s → 正常。**一旦共识文件或账本有数据，问题必现**。

## 3. 现场证据

### 3.1 日志

- 20:22：`reconcile done: durationMs: 1309174`（21.8 分钟）
- 17:04-17:08：`replay 230/1756 → 240/1756` 间隔 179s（**卡在大文件 + O(n²) 叠加**）
- 补丁后：`replay 230→240` 间隔 43s（**仅剩大文件处理**）

### 3.2 基准验证

```
CURRENT (splice every record):  4805.4ms  -> len=20000
BATCH=1000 (trim every 1000 recs):  3.3ms  -> len=20908  (1467.2x faster)
```

### 3.3 复现率

**必现**：放回任何含 bySession/共识文件的账本 → 启动即满载卡死；移走账本 → 恢复正常。

## 4. 修复

### 4.1 已应用（批量裁剪补丁，lib/index.js）

在 `record()` 的 recent 和 messages 裁剪处加批量阈值：

```js
// recent 裁剪 — 改为超出上限 + 1000 才裁，摊销 O(1)
this.recent.push(entry);
if (this.recent.length > this.maxRecent + 1000) this.recent.splice(0, this.recent.length - this.maxRecent);

// session.messages 裁剪 — 同理 +200
if (session.messages.size > this.maxMessagesPerSession + 200) {
  const oldest = [...session.messages.keys()].slice(0, session.messages.size - this.maxMessagesPerSession);
  for (const key of oldest) session.messages.delete(key);
}
```

语义不变：recent 保留最近 maxRecent 条，裁剪延迟 ≤1000 条不影响正确性（UI 展示"最近流水"多几行无害）。

**补丁位置**：`lib/index.js`（junction 指向源仓库 `E:/ai-files/dsh-web-billing`，`node --check` 语法验证通过，备份为 `index.js.bak-20260828`）

### 4.2 本机降级配置（`reconcileOnStartup: false`，保留账本数据）

因大文件处理问题未解决，保持 `reconcileOnStartup: false`。实时记账靠 `record` 事件累计，数据不丢。需重建历史时可手动 `POST /billing/reconcile`。

## 5. 建议作者修复（分两阶段）

### 5.1 第一阶段：合并批量裁剪补丁（已验证，安全）

把 `maxRecent + 1000` / `maxMessagesPerSession + 200` 的批量裁剪合入主分支。这是无争议的性能修复，零副作用。

### 5.2 第二阶段：大文件处理 worker 化（根治）

**问题**：`scanSessionUsageRecords` 的 `readFileSync` + zstd 解压 + `split("\n")` + JSON.parse 在单线程下无法让出，超大文件（63MB→177MB）**必然**阻塞主线程数秒到数十秒。

**建议方案**：

1. **方案 A（推荐，改动小）**：`decompressSessionLogAsync` 中按帧解压，每帧解压后 `await yieldNow()`。当前已有帧级让出（`if (k % 32 === 31) await yieldNow()`），但 `zstdDecompressSync` 本身是同步阻塞——改为 `zstdDecompress` 的流式解压（chunk by chunk），每 chunk 让出。
2. **方案 B（彻底）**：把 `scanSessionUsageRecords` 整体移到 `worker_threads`，主线程 await 结果。但序列化开销大。
3. **方案 C（务实的 80% 解）**：检测文件大小 > 30MB 时跳过该扫描 —— 账单重放从 session.jsonl.zstd 是辅助手段（不是唯一来源），跳过超大文件最多丢失部分历史消息的费用，不影响主账本完整性。

### 5.3 配置契约

- `reconcileOnStartup` 默认保持 `false`，直到大文件处理问题解决。
- 文档注明：打开后启动时会对全部历史会话做重放，期间 UI 可能卡顿；超大文件（>30MB）会被跳过。

## 6. 经验教训

1. **O(n) 在循环里就是 O(n²)**。`recent` 数组的 `splice(0,1)` 在满容量后每条事件都触发，11 万事件 × 20000 元素移动 = 22 亿次操作。任何"循环内对数组头部操作"都要警惕。
2. **分片让出 ≠ 不阻塞**。即使每行让出，单个 JSON.parse 或 zstd 解压帧仍可原子阻塞数秒。文件级重活必须 worker 化。
3. 空账本路径正常 ≠ 无问题。任何"只在有数据时触发"的路径都要用带数据的现场做回归。