# M4 实现审查意见（独立审查员 5f25ee4d）

## 结论：FAIL（2 Critical + 2 High + 7 Medium + 7 Low + Nit）

### Critical

**C1 — driveLoops 在注册表无到期记录时不可达，loop 完全无法起步/推进**
- 位置：`lib/pacemaker.js:107-113`（`if (due.length === 0) { … return; }` 提前返回）；`driveLoops` 只在同函数 `:151-153` 被调用（位于该 return 之后）。loop 不在 registry（仅 schedule/heartbeat；loop 走独立 LoopStore），因此 loop-only 配置下 tick 永远到不了 driveLoops。
- 建议：把 loop 驱动从 schedule/heartbeat 派发块解耦——每 tick 无条件执行 driveLoops，或在 due.length===0 分支同样调用。

**C2 — 节拍引擎并非周期 tick，"有界"在静默场景不成立**
- 位置：`lib/pacemaker.js:85-90` driveLoop 是 while(requested) 一次 tick 后退出；requestDrive 调用源仅 index.js:196（agent/status idle）与 start。全仓无 ctx.interval/setInterval。
- 问题：引擎是"每个 idle 事件驱动一次"而非 §5.4 的 ctx.interval 周期节拍。agent 空闲且无事件时，pacemaker 睡 5s 后退出，loop 迭代与 maxTimeMs 无人判定 → loop 无限挂起。
- 建议：在插件生命周期挂宿主定时器周期 requestDrive（ctx.interval），并让 driveLoops 每 tick 执行。

### High

**H1 — verifier 从不被求值，PASS 状态在运行期不可达**
- 位置：`pacemaker.js:178` 每轮硬编码 outcome={passed:false}；evaluateVerifier 在驱动路径零调用（grep 证实）。tools.js:612 接受 verifier 参数但无人消费。
- 建议：在 driveLoops 投递前/后接入 verifier 求值，把真实 outcome 传入 advanceLoop。

**H2 — 持久 worker 会话恢复未实现（设计 H1 返修缺失）**
- 位置：index.js:35 inject 无 sessionPersistence；无 agent-loop.resume()/resumeSessionId 调用；pacemaker 生命周期=agent 会话生命周期。
- 建议：按设计 H1 实现 agent-loop.resume(ownerCtx,{resumeSessionId}) + sessionPersistence 注入；pacemaker 装配改为"按持久 worker 身份"。

### Medium

- M1 多 loop 饥饿（最老未到期 loop 阻塞其他）；M2 loop 预算闸门形同虚设（token 恒 0）；M3 cw_handover 工单不持久化无降级/重启自动触发；M4 serial 语义被突破（单 tick 可投递 2 条）；M5 LoopStore 重写式持久化非追加非原子无恢复语义。

### Low

- L1 intervalMs 无校验；L2 cw_loop_start 指定已存在 id 静默覆盖；L3 TIMEOUT 用 > 而非 >=；L4 cw_handover 自由文本无敏感信息护栏；L5 replay 时间窗参数 NaN 静默空结果；L6 replayRegistry 只回放 active 记录；L7 FAULTED 状态永不设置。

### Nit

- N1 pacemaker.js:117 两分支恒等死代码；N2 tools.js:594 foldFor 调用 3 次；N3 M4 测试零覆盖核心驱动（无 Pacemaker/driveLoops 测试）。

### 通过项

- createLoop 强制 maxIterations/maxTimeMs 为正安全整数（定义层有界正确）；advanceLoop 纯折叠状态机正确；evaluateVerifier 纯函数正确（问题在未接线）；LoopStore 跨实例持久化正确；回放符合"仅意图日志不回放 LLM 执行"；交接工单忠实 Paseo 式；工具均经 requireOwner 限定；单测全绿。

### 范围外观察

- pacemaker.js:129 tick 只追加 changeDispatch 未推进 scheduledAt → interval 型 schedule/heartbeat 首次到期后每 tick 都 due（M1/M2 范围缺陷），掩盖了 loop 驱动问题。
