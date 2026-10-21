# Postmortem 2026-08-24：v2.5.0 settle 崩溃与账本空转事故

## 时间线与影响

| 时刻 | 事件 | 归属 |
| --- | --- | --- |
| 2026-08-23 12:31 | 启动后 ~9 分钟崩溃（V8 堆耗尽嫌疑）；同时写坏 `session_projcache.json` | 未确证；**高度嫌疑 = 启动自动全量对账（reconcileOnStartup，本插件）**：日志无该次 reconcile 完成记录，而空账本启动的后续重试（15:01 起）全部安全空转——只有"带全量账本 + 自动重放"的启动崩溃 |
| 12:31 崩溃后 | 排查清理 storages / projcache 期间，`web-billing.json` + `-detail.json` 被清空（磁盘只剩空账本；真实历史快照早先存于 `tmp/storages-bak-20260823/`：918 会话 / 80,441 条，integrity 校验过） | 外部清理操作（本插件无该清空路径——写盘始终原子 tmp+rename） |
| 15:01–16:25 | 五次启动，`reconcile done` 全部 `beforeCalls:0 / usageEvents:0 / sessionsScanned:0`——空账本启动 → 对账空转 1.4s | 本插件缺陷：reconcile 会话集只取内存 bySession，空账本无磁盘回退 → 空转（已修） |
| 2026-08-23 16:20 | **进程崩溃**：settle 定时器 `ledger.settle(true).then(...)` — `boolean.then is not a function`（日志堆栈 `index.js:1243 Timeout._onTimeout`）；连锁写坏 projcache → 重启白屏 100% CPU | **本插件（我）** |

## 根因（本插件侧）

1. **[致命] v2.5.0 settle API 契约破坏（我的错误）**：`settle()` 实现为同步（返回 `boolean`），但 `apply()` 定时器回调按 Promise 调用（`.then().catch()`）；`setInterval` 首次触发（默认 1h）即抛 `TypeError: ledger.settle(...).then is not a function`，未捕获的定时器异常杀死宿主进程。8-23 晚间外部排查修复（1243 行改同步 try/catch），本归档 + 契约回归测试。
   - 教训：方法同步/异步契约变化必须全量扫描调用点，且测试须覆盖定时器调用形态（此处单测只测过 `settle()` 本体，漏掉了 `.then` 调用形态）。

2. **[严重] reconcile 无防呆 + 无磁盘回退（我的错误）**：会话集只取内存 `bySession`；空账本启动返回 0 会话 → 对账空转，且曾把空结果 swap 进账本（若当时账本非空即二次清零）。已修：① ids 回退磁盘 detail 会话集；② 重建结果显著小于现网（<50%）时拒绝 swap 并报错；③ 空结果换入路径封死。

3. **[高风险] 启动自动全量对账（reconcileOnStartup: true，我在 profile patch 开设）**：宿主默认堆限制下重放 ~97k 事件 + 40MB 明细序列化，峰值与 12:31 崩溃时间线吻合（且日志无完成记录）。已修：profile patch 改回 `false`，改设置页手动触发（等价 POST /billing/reconcile）；schema 默认值本就是 false。

## 非本插件问题（转内核/其它仓库）

- `dsh-session-projection-cache`：16MB 缓存被崩溃写坏后加载无损坏检测/超时 → 启动死循环 100% CPU。需内核侧修复：解析加损坏检测 + 超时 + 优雅降级。
- `dsh-session-persistence`：id collision 只报错不自动清理 → 永久重试（已目录移出处理）。
- `@zseven-w/dsh-openpencil`：向 host-commands 部署桌面 exe 与壳所有权校验冲突（已移出；跟进是否重新部署）。
- `@bpc-oss/dsh-plugin-chrome-faithful`：MCP 子进程挂起 + failOnStartupError 无超时（projcache 修复后正常；建议 MCP 握手加超时）。

## 修复清单（本插件）

- `lib/index.js`：settle 定时器改同步 try/catch（外部修复，本归档）。
- `lib/reconcile.js`：ids 磁盘回退 + 空/萎缩结果拒绝 swap 防呆。
- `test/reconcile.test.mjs`：防呆回归（rebuilt 空 → 抛错、live 不动）。
- `test/ledger.test.mjs`：settle 同步契约回归。
- profile `cordis.patch.yml`：reconcileOnStartup 改 false。

## 恢复方案（必须在 DSH Desktop 关闭状态下执行）

真实历史快照：`%USERPROFILE%\.dsh\tmp\storages-bak-20260823\web-billing.reconcile.json`（918 会话 / 80,441 次 / 冻结 8-13/8-14/8-15）。

```powershell
Copy-Item "$env:USERPROFILE\.dsh\storages\web-billing.json" "$env:USERPROFILE\.dsh\storages\web-billing.json.bak-empty-20260824" -Force
Copy-Item "$env:USERPROFILE\.dsh\storages\web-billing-detail.json" "$env:USERPROFILE\.dsh\storages\web-billing-detail.json.bak-empty-20260824" -Force
Copy-Item "$env:USERPROFILE\.dsh\tmp\storages-bak-20260823\web-billing.reconcile.json" "$env:USERPROFILE\.dsh\storages\web-billing.json" -Force
Copy-Item "$env:USERPROFILE\.dsh\tmp\storages-bak-20260823\web-billing.reconcile-detail.json" "$env:USERPROFILE\.dsh\storages\web-billing-detail.json" -Force
```

损失窗口：2026-08-23 15:01 → 恢复时点（期间仅极少量 bai 使用，空账本前 9 条记录量级）。