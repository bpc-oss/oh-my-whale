# dsh-continuous-worker

在 DeepSeek Harness (DSH) 上以插件形式实现的「常驻自主 AI 员工」——让一个 agent 像 7×24 值班的 AI 员工一样，在宿主生命周期内按**有界**的 schedule / heartbeat / loop 原语持续工作，状态可持久、副作用幂等、会自愈、可被人类随时接管。

> 一句话：给"戴维斯"一个岗位——一个住在 DSH 宿主里、有节拍、有账本、会自愈、能被人类随时接管的长命 agent。
> 这不是 Paseo 的替代（不自起 daemon），而是把常驻执行注册到 DSH 既有机制之上的能力插件。

## 文档

| 文档 | 说明 |
|---|---|
| `docs/01-evidence-dsh-native-capabilities.md` | DSH 原生能力证据（改写自本机源码实证） |
| `docs/02-external-research-summary.md` | 外部设计模式结论摘要（Paseo/AgentOS/Temporal/automaton 等） |
| `docs/02-design.md` | **设计方案 v0.6 定稿**（六轮独立审查通过） |
| `docs/03-review-record.md` | 独立审查记录与返修轨迹（R1-R6） |

外部调研全文备份：`~/.dsh/dsh-resident-agent-design-patterns.md`

## 实现状态

**M1 地基（已实现并通过验证）**：
- `lib/index.js` — host 插件入口（apply/inject/Config，per-agent 运行时安装）
- `lib/registry.js` — 持久注册表（session 事件折叠 schedule/heartbeat：create/update/delete/dispatch/fault + pause/resume/advance）
- `lib/pacemaker.js` — 统一节拍引擎（ctx.interval 驱动，到期投递 + 记账）
- `lib/watcher.js` — 三计数器（闲置/循环/预算）+ 心跳活性 + FATAL 判定 + 指数退避
- `lib/waker.js` — 唤醒管道（idle→followup / busy→inject / runMaintenance / whenIdle）
- 工具面：`cw_status` / `cw_registry_list` / `cw_credential_status`（只读）
- 真实 headless 会话验证：cw_status 返回健康快照、心跳活性工作

**M2 控制与安全（已实现并通过验证）**：
- `lib/tools.js` — 管理工具面：`cw_schedule_create` / `cw_heartbeat_create` / `cw_pause` / `cw_resume` / `cw_run_once` / `cw_stop` / `cw_supply_verify` / `cw_supervision_matrix`
- `lib/checkpoint.js` — checkpoint 意图日志 + verify-before-retry 幂等恢复（host 文件系统，非模型工作区）
- `lib/guardrails.js` — 供应链信任分级（T1-T4 分类：安装/下载/执行模式识别）+ 监督矩阵（任务类型→sandbox/approval）
- 预算闸门修复：日预算按当日累计（日滚），非时间戳（真实会话发现的 bug）
- 供应链 pre-execute 拦截：安装类命令 T3 ask、非安装放行（真实会话验证无误伤）
- 真实 headless 会话验证完整工具链：创建 schedule → run_once 真实唤醒投递 → 记账 runCount++ → pause/resume 状态转换，零错误
- 26 个单元测试全部通过

**M3 技能/记忆/汇报（已实现并通过验证）**：
- `lib/skill.js` — 技能成长闭环：learn（pending 沉淀 + 证据门槛 + 置信度 ledger 计算，非自报）/ review（accept 需人工确认，防自批）/ use（仅 accepted ≥T2）/ list / markUsed
- `lib/memory.js` — 长期记忆分层：retain（写入门槛 pending + 来源溯源）/ recall / forget / review（防一次性观察变规则）
- `lib/report.js` — 汇报节奏：milestone/review/handover + 日上限 + 紧急豁免（handover urgent-exempt）
- 工具面新增：`cw_skill_list/use/learn/review`、`cw_memory_retain/recall/forget/review`、`cw_report`
- 真实 headless 会话验证：learn→pending/T3 → review accept 被正确拒绝（requires_human_confirm，模型不能自批）→ memory retain→pending → milestone 汇报产出，零错误
- 35 个单元测试全部通过

M4 loop/交接/回放（已实现并通过独立审查）：
- `lib/loop.js` — loop 原语（createLoop 必有界/advanceLoop 状态机/evaluateVerifier/LoopStore 持久化）
- `lib/handover.js` — Paseo 式交接工单（Task/Context/State/Acceptance/Next/Evidence）
- `lib/replay.js` — 意图日志回放（仅审计，不回放 LLM 执行）
- 工具面：`cw_loop_start/stop/status`、`cw_handover`、`cw_replay`
- 已知边界：headless 一次性会话中 loop 完整迭代需常驻会话（宿主语义）

## 独立审查状态（M1-M4 全体通过）

4 份独立审查（M1 1C+4H / M2 4C+4H / M3 3H / M4 2C+2H，均 FAIL）→ 三轮返修（16 项 + 4 High + Critical view 键污染）→ 三轮复审（80d647c0 FAIL → 1ae18ae6 FAIL → **c14ac800 PASS**）。全部意见落盘 `docs/review-M1~M4.md`，返修轨迹 `docs/remediation-M1-M4.md`。

**验证**：单元测试 57/57、复现脚本 4/4（含不-strip 对照实验）、真实 headless E2E（maxRuns 强制/预算 per-run/供应链分类/账本无损坏）。

## 计划书完成度（docs/coverage-audit.md）

**~92%（第二轮补齐后）**。新增模块与工具：
- `lib/probe.js` + `cw_probe_create/list/delete/run`（P0 自驱巡检）
- `lib/diagnose.js` + `cw_diagnose`（P0 质量漂移检测）
- `lib/persona.js` + `cw_persona_get/set` + enforcePersona 强制闸（P1 人格）
- `lib/workorder.js` + `cw_work_order/list` + post-execute 自动记录（P2 责任链）
- `cw_schedule_update` / `cw_heartbeat_update`（P2 管理面补齐）
- Web 面板：`src/client.jsx` → `dist/client.js`（P1b，esbuild 构建 + ModuleLoader）
- 四要素 schema（output/constraints）、memoryScope 配置、唤醒节流、maxDiskBytes

**累计 37 个 `cw_*` 工具（含员工侧 cw_think）、22 个 lib 模块（含 lib/employee/ 七模块）、123 个单测。**

**装入 DSH 后的呈现形态（实际验证）**：
- **模型视角**：agent 获得 36 个 `cw_*` 工具 + 系统提示注入（"你是常驻自主 AI 员工，任务自动投递不要轮询，persona/记忆/技能跨会话持久"）——真实会话中模型能正确总结自己的角色与能力
- **AI 工作台 v8（多员工工作台，用户拍板）**：左侧主侧边栏底部 "AI 工作台" 入口（sidebar.footer.action，不依赖 better-sidebar），点击打开工作台。**一个员工 = 一个独立面板（戴维斯）+ 一个工作区（cwd/项目）**，完全独立于 DSH 会话：
  - **侧栏员工列表**：每个员工（头像/名字/工作区/任务数）+ 右上「+」创建员工（名字 + 工作区目录）
  - **主区员工面板**：选中员工的独立对话（戴维斯）+ 顶部「工作区」按钮设置目录 + 任务
  - **独立对话**：员工对话存插件 `workers/<id>.chat.jsonl`（不走 DSH 会话事件），面板 5s 轮询加载
  - **工作区限定**：员工可设置 cwd 工作区，在指定目录干活
  - **后端**：`lib/workers.js`（WorkerStore：员工 CRUD + 工作区 + 独立对话持久化）+ `/continuous-worker/employees` 端点（GET 列表/POST 创建/POST instruct/GET chat/POST workspace）
  - **性能**：bundle 37KB（v6 的 368KB 大降——只保留必需 lucide 图标 + 无重型动效库）
  - **webServer 可选化**：headless profile 无 webServer，插件改为 `ctx.get("webServer")` 动态检测——headless 正常激活（cw_status 实测），HTTP 路由仅 web profile 注册
  - **CSRF 防护（v5 审查 H3）**：镜像平台 Cross-site write fence——POST 必须 `application/json`（否则 415）+ Origin/Host 必须本机（否则 403）
  - **空态引导**：未选员工 → "左侧创建员工（戴维斯）"；员工无工作区 → 提示点「工作区」设置
- **设置页（纯设置，用户反馈）**：Settings 页 "AI 员工" section——只显示身份/运行配置状态（名字/语气/约束/版本/在岗/预算），不重复交互工作台；日常指挥去左侧栏
- **面板数据通道**：浏览器端与 host 的 Cordis Context 独立——host 端挂 `/continuous-worker` HTTP 路由（GET status/workers/models + POST control/instruct/model），client 只 inject 平台服务并经 `fetch` 消费
- **后台行为**：pacemaker 周期 tick 自动派发 schedule/heartbeat、心跳活性、预算/供应链/监督护栏
- **历史会话打开安全（2026-08-18 修复）**：`agent/created` 里曾重复注册 `systemPrompt` section 抛错中断 agent 恢复——已修复：section 在 apply 时注册一次（幂等），处理器 try/catch 兜底。真实浏览器验证：连续切换多个历史会话正常渲染。

**剩余三项已实现（2026-08-18）**：
- **resume 装配**：`WorkerRuntime.resumeIdentity()`（持久身份检测 + 配置 workerSessionId 时 agent-loop.resume 尝试 + store 降级），cw_status 暴露 resume 状态（实测 `store-recovery`）
- **Agent OS MCP 对接**：`memory.useAgentOSMemory=true` 时经宿主侧 mcpBackend 同步已验证记忆到共享 Agent OS（accept 后 retain、forget 同步删、recall 合并；本地 store 兜底，MCP 故障 fail-soft）
- **Web 面板 slots 装配**：client 端 `apply(ctx)` 用 `slots.inject("settings.section")` 注册面板（dsh-better-sidebar 模式）；`dist/client.js` 已构建，并在真实 web profile + 浏览器中验证：boot 无 pending、Settings 页 "Continuous Worker" section 完整渲染 worker 状态（davies / alive / loops / probes / work orders 实时数据）。

## 员工认知架构（M1-M5，2026-08-18 全审查 PASS）

员工 = **Prompt(灵魂) + 记忆(经历) + 进化(成长) + 思维(可追溯)**，独立于 DSH 会话的 7×24 自主实体：

- **M1 灵魂地基**（`lib/employee/prompt-schema|store|compiler` + `workers.js` 目录化）：Prompt 三段式（soul/limits/team/meta）+ 版本管理（不可变快照/回滚/evolution 草稿审批）+ compilePrompt 派发编译；limits 引擎强制（员工永不自我授权）；老格式自动迁移
- **M2 运行载体**（`lib/employee/agent-runner|budget|queue` + `presets/employee-ops/`）：每员工独立后台 agent（`agents.create` + setup 显式 `agentPresets.mount` + 灵魂 section + 记忆变量通道）；budget ledger（每日重置 + toolGuard 白名单/danger/redLines）；per-employee 派发队列（串行 + 重启恢复）
- **M3 记忆系统**（`lib/employee/memory-broker.js`）：情景 timeline / 语义 knowledge / 程序 skills / 习惯 habits → assemble（≤2000 tokens 裁剪）→ 每次派发注入
- **M4 进化系统**（`lib/employee/evolution.js`）：任务后反思 → 经验沉淀（去重）/ 技能固化（重复 3 次）/ 成长轨迹 growth.json（taskCount/successRate/skills/experience/activeDays）
- **M5 思维留痕**（`lib/employee/thinking.js`）：工具调用自动留痕 + cw_think（模型写 plan/decision/reflect）+ 脱敏 + taskId 防穿越
- **UI 集成 + 创建向导**（`src/Dashboard.jsx`）：员工仪表盘成长卡/思维卡（接真实 API）；"新建任务点"向导（任务 → AI 生成灵魂 prompt → 预览 → 创建）
- **预设融合**（`presets/employee-ops/agent.cordis.yml`）：员工类型 preset 自动进 DSH home 扫描根（`~/.dsh/.agent-presets/`）

**三 preset 独立审查**（DEV / DEV REVIEWER / VERIFIER STANDARD）全插件审查：P0×3 全闭环（loop verifier shell 白名单 / update 校验防毒账本 / 面板 run_once 预算闸），关键 P1 修复（队列重启恢复/checkpoint 坏行/MCP await/迁移保 chat/credential 读写都拒等），**123/123 单测**。

**已知边界**（非阻断，见 docs/worker-implementation-status.md）：heartbeat TTL 滑动不过期（靠 maxRuns 兜底）；日预算/日报告内存计数（重启清零）；员工仪表盘部分系统状态来自宿主 root agent；skill/memory accept 通道默认配置下需模型 review 工具；credential guard substring 匹配（纵深防御，主防线是平台 denyDirectAccess）。

## 核心设计约束（详见设计方案 §4）

- 一切任务有界（maxRuns / expiresIn / 迭代 / token 预算）
- 原语分型：schedule / heartbeat / loop 各自独立
- 状态外置：意图账本落盘 + 幂等键；可重放的是意图日志，不是 LLM 输出
- 不抢 DSH 既有机制（goal / verification / jobs / timer / 记忆）
- 降级而非死亡：Normal→Low→Critical→FATAL(停+上报)
- 人类随时可接管：pause / resume / run-once / stop

## 概要架构

```
continuous-worker (host plugin)
├── pacemaker/(节拍引擎) → registry/(持久注册表) → waker/(agent.followup/steer) → ledger/(意图账本)
├── watcher/(心跳·闲置·循环·FATAL) + guardrails/(预算/成本闸门)
├── tools/(cw_* 工具面) + commands/(pause/resume/run-once/stop)
└── audit/(机器可读运行记录)
```
