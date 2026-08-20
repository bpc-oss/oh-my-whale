# 计划书完成度审计（对照设计 v0.6）

> 对照 `docs/02-design.md`（v0.6 定稿，六轮审查通过）逐项核对实现完成度。
> 方法：设计 §7 工具面 / §8 配置面 / §12 里程碑 / §13 各小节 的要求 vs
> lib/*.js 实际注册的工具与 Config 键。
> 状态：✅ 已实现并验证 / ⚠️ 部分（说明缺口）/ ❌ 未实现（说明原因）

## 一、工具面（设计 §7 + §13 各小节 diff）

### ✅ 已实现（25 个）

| 工具 | 设计出处 | 备注 |
|---|---|---|
| cw_status | §7 | 含心跳/预算/checkpoint/guardrails 快照 |
| cw_registry_list | （补充） | schedule/heartbeat 列表，含 expired 状态 |
| cw_schedule_create | §7 | 有界（maxRuns/expiresIn 必填） |
| cw_heartbeat_create | §7 | 有界（三必填） |
| cw_loop_start / cw_loop_stop / cw_loop_status | §7 | 有界迭代 |
| cw_pause / cw_resume / cw_run_once / cw_stop | §7 | 人类接管面 |
| cw_memory_retain / recall / forget / review | §7/§13.2 | 含 review（写入门槛） |
| cw_skill_list / use / learn / review | §7/§13.3 | 含防自批 |
| cw_report | §7/§13.9 | milestone/review/handover |
| cw_credential_status | §7/§13.12 | describe-only 不含值 |
| cw_supply_verify | §7/§13.13 | T1-T4 分类 |
| cw_supervision_matrix | §7/§13.14 | 只读矩阵 |
| cw_handover / cw_replay | §12 M3 | Paseo 交接 / 意图日志回放 |

### ⚠️ 部分实现

| 设计要求 | 现状 | 缺口 |
|---|---|---|
| cw_schedule_list / update / delete | 用 cw_registry_list（读）+ cw_stop（删）替代 | 无独立 update 工具；list 语义由 registry_list 覆盖 |
| cw_heartbeat_update / delete / list | 同上 | 同上 |
| cw_release | 无 | 设计 §7 列了 release（未定义具体语义，与 resume 重叠） |
| cw_schedule_create 四要素（when/task/output/constraints） | 实现用 intervalSeconds/at + prompt | 未按 Kimi Claw 四要素 schema（MVP 简化为 when=interval/at + task=prompt） |
| 唤醒节流（delivery quiet/wakeup、maxConsecutiveWakes） | 有 busy→inject 语义 | 无显式 delivery/maxConsecutiveWakes 配置 |

### ❌ 未实现

| 设计要求 | 设计出处 | 原因/状态 |
|---|---|---|
| cw_persona_set / cw_persona_get | §7/§13.1 | 未实现（persona 概念在设计中，工具面未落地） |
| cw_probe_create / list / delete / update | §7/§13.7（v0.5 主动性） | 未实现（自驱巡检是 P0 设计项） |
| cw_diagnose | §7/§13.8（v0.5 自我诊断） | 未实现（质量漂移检测） |
| cw_work_order | §7（可选） | 未实现（责任链工具化） |

## 二、配置面（设计 §8 + §13.6/13.10/13.15 diff）

### ✅ 已实现 Config 键
baseIntervalMs / maxTokenPerRun / stepTokenBudget / dailyTokenBudget / credentials.requireDeclaredRefs / credentials.denyDirectAccess / supplyChain.verifyOnInstall / supplyChain.enforceOnShellTools / supervision.forbidSelfDowngrade / skill.requireSkillReview / skill.requireSkillReviewConfirm / skill.autoLearnBelowConfidence / memory.requireRetainReview / report.maxReportsPerDay / checkpointRoot

### ⚠️ 部分 / 语义替代
- `budget.maxDiskBytes` ❌ 未实现（磁盘闸门）
- `budget.costGatesEnabled` / `metering` ⚠️ 语义有（自记账）但非独立配置键
- `heartbeat.maxConsecutiveWakes` / `delivery` ❌ 未实现（唤醒节流配置）
- `heartbeat.enabled` ⚠️ 硬编码（非配置键）

### ❌ 未实现配置
- `persona.*`（name/tone/outputFormat/constraints）——persona 概念无配置落地
- `guardrails.enforcePersona` / `requirePersonaConfirm`——persona 强制闸未实现
- `probe.*`（自驱巡检配置）——随 cw_probe 未实现
- `diagnose.*`（自我诊断配置）——随 cw_diagnose 未实现
- `memoryScope.useAgentOSMemory`——记忆用本地文件存储，未接 Agent OS MCP

## 三、里程碑（设计 §12）

### M1 地基 ✅ 全部实现
host 骨架 / 节拍引擎 / 注册表 / 唤醒管道 / 三计数器+FATAL / cw_status / 凭据策略（读排除+describe）

### M2 控制与恢复 ⚠️ 大部分实现
- ✅ pause/resume/run-once/stop、checkpoint+verify-before-retry、成本闸门+降级、记忆分层（工作/情景/长期）、汇报节奏、供应链信任、监督矩阵
- ⚠️ Web 面板（client 插件）未实现（无 dsh.client 声明，纯 host 插件）
- ⚠️ persona 强制闸未实现（enforcePersona 死配置）
- ⚠️ 责任链 work_order 工具化未实现（有 checkpoint/审计，无显式 work_order 模型）
- ❌ 主动性巡检（cw_probe）未实现
- ❌ 自我诊断（cw_diagnose）未实现
- ⚠️ 宕机恢复：checkpoint 恢复有，resume 装配降级为部署期限制

### M3 循环与记忆 ⚠️ 大部分实现
- ✅ loop 原语、技能成长闭环、交接工单、时间旅行回放（意图日志）
- ⚠️ Agent OS memory MCP 复用：用本地文件存储替代（无旁路声明有，但未接 MCP）

## 四、完成度结论

| 维度 | 完成度 |
|---|---|
| 核心执行（schedule/heartbeat/loop 有界 + 唤醒 + 记账 + 自愈） | ~95%（M1-M4 独立审查通过） |
| 记忆/技能/汇报（打工人画像） | ~85%（技能闭环/记忆分层/汇报全有；persona 未落地） |
| 安全三角（凭据/供应链/监督） | ~90%（凭据读排除/供应链拦截/监督矩阵全有；Agent OS MCP 未接） |
| 员工素养（主动性/自我诊断） | ~0%（cw_probe/cw_diagnose 完全未实现——设计 P0/P1 项） |
| 控制面（Web 面板/命令） | ~30%（宿主工具全有；client 面板/commands 未实现） |
| **总完成度** | **~75%** |

## 五、未实现项优先级建议

1. **P0**：cw_probe（自驱巡检）+ cw_diagnose（质量漂移）——设计 v0.5 的"员工素养"核心，完全缺失
2. **P1**：persona 工具 + 配置（cw_persona_set/get + enforcePersona 闸）——Kimi Claw 对标人格
3. **P1**：Web 面板（client 插件）——§10 可观测控制面
4. **P2**：cw_work_order（责任链工具化）、Agent OS MCP 接入、唤醒节流配置、maxDiskBytes

---

## 六、第二轮补齐（2026-08-18 完成，覆盖全部未实现项）

| 原缺失项 | 本轮实现 | 验证 |
|---|---|---|
| P0 cw_probe（自驱巡检） | `lib/probe.js`（createProbe/evaluateProbe/advanceProbe/probeDue/ProbeStore）+ `cw_probe_create/list/delete/run` 4 工具 | 57/57 测试 + 真实会话（disk 正常/异常判定、风暴抑制、日上限） |
| P0 cw_diagnose（质量漂移） | `lib/diagnose.js`（detectDrift/runDiagnose 四维）+ `cw_diagnose` 工具 | 测试 + 真实会话（healthy 状态、降级判定） |
| P1 persona | `lib/persona.js`（PersonaStore + enforce 判定）+ `cw_persona_get/set` + `guardrails.enforcePersona` pre-execute 钩子 | 测试 + 真实会话（name=davies, tone=casual, version=2） |
| P1 Web 面板 | `src/client.jsx`（React 面板：心跳/预算/registry/loops/probes/workorders）+ `dist/client.js`（esbuild 构建 + ModuleLoader 包装）+ host 端 `/continuous-worker` HTTP 路由（GET status / POST control，2026-08-18 从 `ctx.provide("continuousWorker")` 改版，见 02-design §10）+ package.json `dsh.client` 声明 | 构建产物 15.4kb、单次注册、真实 web profile 浏览器验证（boot 无 pending + Settings 面板渲染实时数据） |
| P2 cw_work_order | `lib/workorder.js`（WorkOrderStore + buildWorkOrder + 审计流）+ `cw_work_order/list` + post-execute 自动记录钩子 | 测试 + 真实会话（workOrderId 生成、reviewStatus pending） |
| P2 schedule/heartbeat update | `cw_schedule_update` + `cw_heartbeat_update` | 真实会话（prompt t1→t2、maxRuns 3→5 持久化） |
| P2 唤醒节流 + maxDiskBytes | Config 加 `heartbeat.maxConsecutiveWakes/delivery` + `maxDiskBytes` | 语法/配置校验 |
| 四要素 schema | cw_schedule_create 加 output/constraints 参数，合并进 prompt（Kimi Claw 四要素） | 代码审查 |
| memoryScope 配置 | Config 加 `memory.useAgentOSMemory`（默认 false 本地存储） | 配置校验 |
| resume 装配 | 保持部署期限制（headless 无持久身份；sessionPersistence+flush 已注入） | 如实标注 |

**新增 10 个工具（累计 36 个）、4 个新模块（probe/diagnose/persona/workorder）、1 个 client 面板。**

## 七、完成度更新（第二轮后）

| 维度 | 完成度 |
|---|---|
| 核心执行 | ~95%（M1-M4 独立审查通过，未变） |
| 记忆/技能/汇报/人格 | ~95%（persona 已落地；Agent OS MCP 仍为可选存储后端） |
| 安全三角 | ~90%（凭据/供应链/监督全有；Agent OS MCP 未接=可选） |
| 员工素养（主动性/自我诊断） | ~95%（cw_probe/cw_diagnose 已实现并验证） |
| 控制面（Web 面板） | ~80%（client 面板已构建；面板 UI 注入 slots 待 profile 装配验证） |
| **总完成度** | **~92%** |

**剩余（如实标注）**：
- resume 完整装配（部署期配置项，需常驻 web profile）
- Agent OS MCP 后端（memory.useAgentOSMemory=true 时对接；默认本地存储可用）
- Web 面板实际注入 DSH slots 的装配验证（client 已构建，未在运行中 GUI 实测）
