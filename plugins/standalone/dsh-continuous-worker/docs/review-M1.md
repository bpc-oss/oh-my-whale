# M1 实现审查意见（独立审查员 4a984f8f）

## 结论：FAIL（1 Critical + 4 High + Medium/Low）

### Critical

**C1 — 心跳/周期 schedule 的 interval 语义在主线路径失效**
- 位置：`lib/pacemaker.js:99-131`。advanceHeartbeat 从未接入 tick，周期任务按 5s 基础节拍连发打满 maxRuns，而非按 intervalSeconds 触发；rule.everySeconds 从未被读取。
- 建议：tick 后按记录 interval 推进 scheduledAt（advanceHeartbeat / schedule 下次触发），不能每 tick 都 due。

### High

**H1 — FATAL 不闸停派发、backoffMs 死代码**
- 位置：`lib/pacemaker.js:94,137-143` + `lib/watcher.js:78-81`。达到 FATAL 后自动派发照常继续，失败重试无退避且 runCount 不推进，恰是 §9.1c 要防的无界空转。
- 建议：FATAL 后停止自动派发（仅心跳+呼救）；派发失败按 backoffMs 退避。

**H2 — 预算计量从未接入（恒传 0）**
- 位置：`lib/pacemaker.js:120,135,173`。预算闸永远放行、cw_status 预算恒 0，无回合后计量钩子。
- 建议：按实际 intent 规模估算入账，再判门；补回合后计量。

**H3 — M1 凭据策略是空壳**
- 位置：`lib/tools.js:128-146` + `lib/index.js:162-191`。无 cw_credential_declare、无 .credentials.yaml 读排除/白名单拦截（requireDeclaredRefs/denyDirectAccess 为死配置）、describe() 未接。
- 建议：实现白名单拦截点 + 凭据文件读排除 + describe() 接入。

**H4 — 未注入 sessionPersistence、无 resume、无 flush 屏障**
- 位置：`lib/index.js:35`。§1.3 成功标准 3（宿主重启续跑）在 M1 无法达成。
- 建议：按设计 H1 实现 agent-loop.resume + sessionPersistence 注入 + sessions.flush 屏障。

### 可信度要点

- 平台 API 全部逐行核验真实（无编造）；registry 折叠/三计数器纯逻辑正确且单测全绿；主要缺陷集中在 **pacemaker 集成路径——而该路径恰恰没有任何测试**。

### Medium/Low（摘要）

- M2-M4 越界上线、Config 与 §8 漂移、dispose 不等待等，详见完整报告（此处记录摘要，返修时以完整意见为准）。
