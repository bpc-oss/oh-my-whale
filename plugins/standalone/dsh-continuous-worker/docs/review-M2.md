# M2 实现审查意见（独立审查员 f581883f）

## 结论：FAIL（4 Critical + 4 High + Medium/Low）

### Critical

**C1 — 节拍路径从不推进 scheduledAt，schedule/heartbeat 间隔失效**
- 位置：`lib/pacemaker.js` tick 路径只追加 changeDispatch，未推进 scheduledAt；registry.js dispatch fold 也不改 scheduledAt。实测：dispatch 后仍 due，按 5s 底拍狂派发打满 maxRuns。
- 建议：tick 后按记录 interval 推进 scheduledAt（schedule 用 rule.everySeconds / heartbeat 用 advanceHeartbeat），下一触发需在 interval 之后。

**C2 — cw_run_once 对 heartbeat 三次记账，1 次派发 → runCount=3**
- 位置：`lib/tools.js` cw_run_once。实测复现：run_once 对 heartbeat 同时 append changeDispatch（fold 会 runCount+1）又 append changeUpdate(advanceHeartbeat)（runCount+1），加上 advance 内部 +1，共 3 次。
- 建议：run_once 与 advanceHeartbeat 二选一记账，避免重复；dispatch 与 update 走同一记账路径。

**C3 — 预算闸门全链路以 0 token 空转，faulted(budget)/降级路径不存在**
- 位置：`lib/watcher.js` chargeRunTokens / `lib/pacemaker.js:120,135,173`。runTokenSpent 永不复位（chargeRunTokens 累加但从不按 run 边界重置），预算恒 0 放行；faulted(budget) 状态与降级（§9.4b）未实现。
- 建议：按 run 边界记账（每次派发估算 token 入账 + 回合后计量），超限进入 faulted(budget) 并触发降级。

**C4 — 供应链拦截漏拦 npx / iwr|iex / apt-get / docker run，T4 阻断不可达；git 工具名误伤**
- 位置：`lib/guardrails.js` classifySupplyCall。实测漏拦：npx、PowerShell iwr|iex（本宿主默认终端）、apt-get、docker run；T4 阻断分支不可达；git 工具名匹配误伤全部 git 调用。
- 建议：补 npx/iwr|iex/apt-get/docker 模式；T4 需可达（如 verifyOnInstall 缺省时未验证即 T4 阻断）；git 工具名只拦 clone 类命令而非全部。

### High

- H1 供应链拦截绕过：cw_skill_use 或 shell 可绕过分级（与 M4 H-B 呼应）。
- H2 监督矩阵未接入 permissionPresets.set（任务类型→sandbox/approval 只是查询，未实际切换会话档位）。
- H3 checkpoint 无完整 verify-before-retry：begin 后未核验前置条件。
- H4 tools/pre-execute 钩子与 worker 会话档位不联动（供应链门独立于监督矩阵）。

### 通过项

- pre-execute 钩子签名与 {kind:'deny'} 契约符合 dsh-tools 平台契约；approval 用法回合内+fail-closed 符合平台源码；监督矩阵使用封闭词汇；凭据工具真不含值；注册表 fold fail-closed 质量高；创建时强制 maxRuns/interval/stepTokenBudget。
