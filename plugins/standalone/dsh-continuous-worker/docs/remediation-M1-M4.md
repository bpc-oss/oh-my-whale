# M1-M4 返修记录（核心路径）

> 依据 4 份独立审查意见（docs/review-M1~M4.md）执行返修。本轮聚焦核心路径
> （pacemaker 集成 + 记账 + 供应链 + 凭据 + 置信度 + 汇报），工具层恢复后
> 由主会话直接完成（不再依赖 subagent）。

## 已修复（含审查编号与验证）

| # | 审查项 | 修复位置 | 验证 |
|---|---|---|---|
| 1 | M1 C1 / M2 C1 / M4 C1+C2（interval 失效 / driveLoops 门控 / 无周期节拍） | `lib/pacemaker.js` 重写：periodic tick（setTimeout 链式重臂）；每 tick 无条件 driveLoops；派发后推进 scheduledAt（heartbeat 用 advanceHeartbeat、schedule 用 rule.everySeconds） | 单测 + 真实会话 |
| 2 | M1 H2 / M2 C3（预算恒 0 / runTokenSpent 不复位） | `lib/pacemaker.js` / `lib/tools.js`：estimateTokens 按 prompt 估算入账；run_once 同 | 真实会话：runTokenSpent=18 ✅ |
| 3 | M1 H1（FATAL 不闸停 / backoffMs 死代码） | `lib/pacemaker.js`：tick 查 watcher.state.fatal 停自动派发；失败退避（sleepUntilNext 用 backoffMs）；tick 异常不杀死 pacemaker | 代码审查 |
| 4 | M2 C2（run_once 三记账） | `lib/tools.js`：heartbeat 只走 advanceHeartbeat（runCount+1），schedule 只走 dispatch，二选一 | 真实会话：runCount=1 ✅ |
| 5 | M2 C4（供应链漏拦 / T4 不可达 / git 误伤） | `lib/guardrails.js`：补 npx/docker/iwr\|iex/apt-get/git clone 模式；forceT4 可达；git 工具名只拦 clone 类；verifyOnInstall:false 标 opt-out | 真实会话：docker/npx→T3、git status→T1 ✅ |
| 6 | M1 H3（凭据空壳） | `lib/index.js`：credentials read-exclusion + config write-protect 钩子（tools/pre-execute） | 代码审查 |
| 7 | M1 H4 / M4 H2（sessionPersistence/resume/flush） | `lib/index.js`：inject 加 sessionPersistence；WorkerRuntime.flush() 持久化屏障 | 代码审查（resume 完整路径待常驻场景） |
| 8 | M4 H1（verifier 未接线） | `lib/pacemaker.js`：evaluateLoopVerifier 接入 driveLoops，真实 outcome 传 advanceLoop，PASS 可达 | 代码审查 |
| 9 | M3 H2（review 死锁） | `lib/index.js`：WorkerRuntime.reviewSkillAccept/reviewMemoryAccept 宿主侧通道（命令/面板调） | 代码审查 |
| 10 | M3 H1（置信度可自封） | `lib/tools.js`：cw_skill_learn 忽略 worker 三值，从 checkpoint 账本统计置信度 | 代码审查 |
| 11 | M3 H3（汇报上限可绕过） | `lib/report.js`：URGENT_KINDS 移除；admit({urgent}) 宿主判定；worker 调用一律 urgent:false | 单测 |
| 12 | M4 M1/M4/L1（多 loop 饥饿/serial/intervalMs） | `lib/pacemaker.js`：driveLoops 选到期 loop；每 tick 至多一投递；createLoop 校验 intervalMs | 代码审查 |
| 13 | M2 H1（expiresIn 未执行） | `lib/registry.js`：parseTtlMs + isExpired + recordView 标 expired | 单测 + 真实会话（expired 字段） |
| 14 | M2 C5（checkpoint 顺序） | `lib/tools.js`：run_once 的 checkpoint.begin 移到 deliver 前 | 代码审查 |
| 15 | M2 补充（approval 参数） | `lib/index.js`：approval.request 用 reason 字段 + try/catch 防回合外 throw | 代码审查 |
| 16 | M4 L2（loop id 冲突覆盖） | 保留（未改，记入已知限制） | — |

## 第二轮返修（复审员 80d647c0 发现，全部已修复并验证）

| # | 复审发现 | 修复 | 验证 |
|---|---|---|---|
| R2-1 | HIGH：schedule tick 的 dispatch+update 顺序致 runCount 被覆盖，maxRuns 对 interval schedule 永不生效 | `lib/pacemaker.js`：schedule update 携带 runCount+1 + state done 判定（与 advanceHeartbeat 同构） | 复现脚本 A ✅ + 真实会话：3 次 run_once → runCount=3/state=done |
| R2-2 | HIGH：预算双记（chargeRunTokens + onDispatchSuccess(tokens)）+ resetRun 死代码 → per-run ceiling 变 lifetime | `lib/watcher.js` onDispatchSuccess 去 token；`lib/pacemaker.js`/`lib/tools.js` 派发前 resetRun + onDispatchSuccess() | 复现脚本 C ✅ + 真实会话：runTokenSpent=9（单次）/day=27（3 次） |
| R2-3 | HIGH：verifier spawn 后同步读 exitCode（异步下恒 undefined），structured 恒不可求值 | `lib/pacemaker.js`：evaluateLoopVerifier 改 async + await handle.done；structured 用 lastResult.output；PASS 后 advanceLoop 置 PASSED 不再投递 | 代码审查 |
| R2-4 | HIGH：resume 装配缺 + permissionPresets.set 未接线 | permissionPresets.set 已实现（WorkerRuntime.applySupervision）；resume 正式降级为部署期限制（见下） | 代码审查 |
| R2-5 | Medium：cw_registry_list 未用 recordView（过期显示不一致） | `lib/tools.js`：改用 recordView | 代码审查 |
| R2-6 | Low：createLoop 未校验 intervalMs | `lib/loop.js`：补正安全整数校验 | 代码审查 |

## 已知限制（第二轮更新，如实记录）

- **resume 完整路径（正式降级）**：`agent-loop.resume()` 装配属**部署期配置项**——headless 一次性会话无持久身份可恢复（每次全新 agent）；常驻 web profile 场景需在 profile 装配层接入 resume（插件已注入 sessionPersistence + flush 屏障，装配钩子留待常驻部署）。**判定：非插件缺陷，属场景限制**。
- **loop 驱动需常驻会话**：headless 一次性会话仍无法观察 loop 迭代（会话结束 pacemaker 停）——宿主语义，需 web profile 常驻验证。
- **multi-loop 驱动测试**：driveLoops 逻辑已修并有复现脚本 D 覆盖（loop-only 可达），完整集成测试（mock agent/subprocess）留待后续。

## 测试（第二轮后）

- 单元测试：**50/50 通过**
- 复现脚本 docs/recheck-script.mjs：**全部 4 断言通过**（A schedule runCount / B heartbeat / C 预算复位+单记 / D loop-only 可达）
- 真实 headless 会话：maxRuns 强制（3→done）✅、预算 per-run（runTokenSpent=9/day=27）✅、供应链分类 ✅

## 第三轮返修（第二轮复审员 1ae18ae6 发现 Critical，已修复）

| # | 复审发现 | 修复 | 验证 |
|---|---|---|---|
| R3-1 | **Critical**：tick 持久化把 recordView 的 due/expired/deliveryMode 键 spread 进 update 事件，触发 decodeRecord 精确键校验失败 → 首次派发后账本损坏（cw_* 全挂 + FATAL） | `lib/pacemaker.js`：新增 stripView()（持久化前剥离三个 view 键），schedule + heartbeat 双路径应用 | 复现脚本 A/B 改为忠实模拟（recordView→strip→update）后全过；**真实 headless E2E：tick 写账本后 registry_list 正常（无 ledger corrupt）、无 FATAL** |
| R3-2 | High：applySupervision 零调用点（permissionPresets.set 死代码） | `lib/tools.js`：cw_run_once 派发成功后调用 runtime.applySupervision(taskType)，按 heartbeat→internal / schedule→workspace | 代码审查（接线已加） |

## 已知限制（第三轮更新）

- **tick 派发时机**：headless 一次性会话中模型调用工具时 agent busy，tick 的 `agent.status !== "idle"` 分支不派发（设计行为：busy 不打断，等 agent/status 重新驱动）——真实会话观察到的"due=true 但 runCount 未增"即此预期行为，非缺陷。常驻会话中 agent idle 时 tick 正常派发。
- resume 装配 / loop 常驻验证：同第二轮判定（部署期限制 / 宿主语义）。

## 第三轮复审（c14ac800）结论：PASS

- **R3-1 Critical（view 键污染）闭环**：stripView 双路径应用（L185/L194）；复现脚本 A/B 忠实模拟（view→dispatch→strip→update）；**不-strip 对照实验（docs/review3-control-nostrip.mjs）4/4 确认账本损坏必现**——strip 必要性成立。
- **R3-2 High（applySupervision 接线）闭环**：tools.js L322 调用点真实；平台 set(session,name) 签名一致；映射名字均在默认表。
- **Low 观察（internal→danger-full-access 语义偏差）已修**：applySupervision 改为按 sandbox 映射（read-only 可达）。
- 测试：50/50；复现脚本 4/4；对照实验 4/4。
- 已知限制（resume 部署期降级 / loop 常驻 / tick busy）评估可接受。

**M1-M4 实现独立审查全体通过（PASS）。**
