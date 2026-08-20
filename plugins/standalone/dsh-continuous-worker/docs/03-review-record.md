# 独立审查记录 — dsh-continuous-worker 设计方案

> 本文件记录对 `docs/02-design.md` 的独立审查与返修轨迹。目标：**全体通过（无未决 Critical/High）**。

## 审查轮次总览

| 轮次 | 审查方式 | 日期/序 | 结论 | 返修数 | 备注 |
|---|---|---|---|---|---|
| R1 | 独立审查员（fresh 上下文，宿主源码逐行核对） | 2026-08-17 | FAIL（2 High，0 Critical） | 11 条全修 | 完整审查意见见下 |
| R2 | 独立复审员（fresh 上下文，逐条闭环核对 + 源码二次验证） | 2026-08-17 | **PASS**（无未决 Critical/High） | +3 Low +9 Nit 收尾修复 | 复审意见与收尾见下节 |
| R3 | 独立审查员（v0.4 打工人画像增量审查） | 2026-08-17 | **PASS**（无未决 Critical/High） | M1-M4 + L1-L4 + N1-N4 全修 | 审查对象：§13 新增 + 工具/配置/里程碑同步 |
| R4 | 独立审查员（v0.5 员工素养增量审查） | 2026-08-17 | **PASS**（无未决 Critical/High） | M-A/M-B/M-C + L-A~L-G 全修 | 审查对象：§13.7-13.10（probe/diagnose/report） |
| R5 | 独立审查员（v0.6 安全三角增量审查） | 2026-08-17 | **FAIL**（2 High：凭据直读防护缺失、供应链可被通用执行旁路） | H-A/H-B + M-A~M-D + Low/Nit 全修 | 审查对象：§13.11-13.15（凭据/供应链/监督矩阵） |
| R6 | 独立复审员（v0.6 返修闭环核对） | 2026-08-17 | **PASS**（无未决 Critical/High） | 1 Low + 2 Nit 收尾修复 | 验证 H-A/H-B/M-A~M-D 返修闭环 |

---

## R1 审查意见（独立审查）

# 独立审查意见：dsh-continuous-worker 设计方案

## 审查范围与方法

**审查对象**：`docs/02-design.md`（v0.2 草案，主审）；对照 `docs/01-evidence-dsh-native-capabilities.md`、`docs/02-external-research-summary.md`、`docs/03-evidence-plugin-packaging.md`、`docs/04-evidence-kimi-claw.md` 与 `~/.dsh/dsh-resident-agent-design-patterns.md`（调研全文）。

**方法**：逐条核对设计引用的每个 DSH API 是否真实存在于宿主源码（`C:\Program Files\DeepSeek Harness\resources\host\node_modules\@deepseek-ai\` 下 dsh-agent-loop / dsh-agent / dsh-session / dsh-session-persistence-jsonl / dsh-schedule / dsh-tool-jobs / dsh-jobs / dsh-token-meter / dsh-home-paths / cordis-plugin-timer / dsh-headless，以及已装插件 dsh-bash-terminal）；核对设计内部一致性、安全有界性、持久化恢复语义与调研结论的一致性。以下每条发现均可指向文档位置或平台源码行号。

**验证结论速览**：设计引用的核心 API（`agent.followup/steer/inject/cancel/runMaintenance/whenIdle/status`、`ctx.agents.create/roots/get/enter/announce/requireInitiator/withInitiator`、`Session.append`、`ctx.sessions.flush`、`createUserMessage({source:{kind:"plugin"}})`、`ctx.interval`、`ctx.tools.register(defineTool())`、`ctx.settings.register`、`ctx.systemPrompt.section`、`ctx.jobs.onJobDone`、`tools/post-execute`）**全部真实存在**，与证据文档一致（dsh-agent-loop `lib/index.js` L396-465、L412-435、L460-465；dsh-llm `message.d.ts` L94-104；dsh-schedule `lib/index.js` L11/L403/L593-595/L628；dsh-tool-jobs `lib/index.js` L24-25/L175/L206-226）。dsh-schedule 的 300 秒下限、`persistence_uncertain`、MAX_TIMER_DELAY_MS、latest-only catch-up 也全部属实。**未发现引用了不存在的 API**。主要问题集中在**恢复路径、有界性完备性、FATAL/降级语义**三处。

---

## 发现（按严重度）

### Critical

无。

### High

**H1. 冷启动恢复路径缺失：`create()` 无法重建持久 worker 会话，设计未走 `resume()`**
- **位置**：设计 §6.3（"找/建目标会话 `ctx.agents.roots()` / `ctx.agents.create()`"）、§9.3（"插件 start 时折叠持久账本"）、§1.3 成功标准 3（"宿主重启后，从持久 checkpoint 恢复"）。
- **问题描述**：MVP 成功标准 3 直接依赖"重启后重建 worker 并折叠其会话事件账本"，但设计只给了两条路径：`roots()`（只列已 live 的根 agent）与 `create()`。平台语义是：`agents.create()` 走 `ctx.sessions.prepare(id)` **铸造全新会话**（dsh-agent-loop `lib/index.js` L1189-1210），而 jsonl 持久层对已存在磁盘日志的会话**拒绝 materialize**（`dsh-session-persistence-jsonl/lib/index.js` L1156-1157："refusing to materialize … a log already exists on disk (load/resume it instead)"）；即使不拒绝，seed=0 的新会话也会**丢失全部事件历史**，折叠得到的账本为空。正确的重建路径是 agent-loop 的 `resume()`（L1256-1259，**要求注入 `sessionPersistence`**），设计通篇未提及 resume 与持久化后端的依赖关系；且账本/注册表究竟落在"worker 会话事件"还是"独立控制会话"也未指明。
- **为什么是问题**：按文档现有描述实现，宿主重启后要么创建失败、要么账本清空——"无丢失账本"这一核心承诺不可达成，且是 M1/M2 边界内的地基缺陷，不是增强项。
- **建议修法**：在 §6.2/§6.3/§9.3 明确：worker 会话用 `agent-loop.resume()`（或持久层 `prepare`）从 `sessionPersistence` 恢复，`inject` 增加 `sessionPersistence`；指明注册表/账本事件写入哪个会话（建议独立控制会话与 worker 会话分离）；把 `create()` 限定为首次引导路径。

**H2. heartbeat 有界性不完整 + 成本闸门无可执行计量：存在无限 token 支出路径，违反设计自身 P0 铁律**
- **位置**：设计 §5.2（heartbeat 定义 `maxRuns?, expiresIn?` **两者皆可选**）、§8 budget（仅 `maxTokenPerRun: 200_000`、`maxDiskBytes`、`costGatesEnabled: true`——无累计/日预算上限、无计量来源）、§4 原则 1（"有界是铁的"）；对照外部调研摘要 P0③（"maxRuns / expiresIn / … / 单次 step token 预算，缺一不可"）。
- **问题描述**：(a) 作为"7×24"核心原语的 heartbeat，创建时可不带任何总上限，按 5s tick 每次唤醒 = 一次模型请求，累计 token 无封顶——正是调研点名的 agentic resource exhaustion（token 炸弹）。(b) `costGatesEnabled: true` 是声明性的：DSH 唯一计量面 `ctx.tokenMeter.measure(session)`（`dsh-token-meter/lib/types/index.d.ts` L38）是**会话累计、重放式、请求边界**度量，无法给出"本次 run 200k"的回合内读数，也没有中途中止手段（`agent.cancel` 是整回合中止，非预算节流）。(c) 调研要求的"单次 step token 预算"在 §8 缺失。
- **为什么是问题**：一个"默认随宿主常驻、到点自主唤醒"的组件，其核心原语存在无总量上限的路径，等于把 token 成本控制托付给模型自觉，违背设计自己抄来的全部外部共识。
- **建议修法**：heartbeat 强制 `maxRuns` 与 `expiresIn` 二选一（或增加"累计 token/日预算"全局闸）；明确成本闸计量实现（tokenMeter 快照差值 + 超限后 `agent.cancel`/降频）；补"单步 token 预算"配置；写明 budget 耗尽后的降级与 FATAL 行为。

### Medium

**M1. FATAL"回血"语义含糊，可能绕过"停止自动重启"**
- **位置**：设计 §9.1（"FATAL: 停自动重启 + 审计 + 上报"）与 §9.2（"仅保留心跳监听回血"）。
- **问题描述**："回血"未定义：心跳是**唤醒源**，若心跳仍能唤醒 agent 并重新派发此前 faulted 的工作，则自动重启事实上通过心跳路径继续，FATAL 不再终止；若心跳只监听不派发，则恢复触发条件（人工？预算恢复？）未定义。supervisor 语义（调研 §6）要求 FATAL 后**不再自动重启**。
- **建议修法**：明确定义 FATAL 后的状态迁移：faulted 工作项在 FATAL 下不得再被心跳派发；仅保留活性心跳与呼救；恢复只能经 `cw_resume` 人工或预算恢复判定。

**M2. 派发层失败无退避、未接入 faulted/FATAL 计数**
- **位置**：设计 §5.4（每 tick"折叠→投递→记账"）与 §9.1（`faulted → (按预算重试 | FATAL)`）。
- **问题描述**：`followup` 抛错（agent disposed）或 `runMaintenance` 被 busy 拒绝（dsh-agent-loop L413）时，5s tick 若立即重试，就是有界频率（5s/次）但**无界次数**的空转，且不计入 `fatalAfterConsecutiveFailures`（该计数只挂在 heartbeat 上）——与 supervisor"无限重启掩蔽真实故障"警示同构。
- **建议修法**：把派发/记账失败显式纳入 faulted 状态机与退避（指数退避、封顶重试、计入 FATAL 判定），并在 §13 风险清单补一条。

**M3. `useHostScheduleBackend` 设置不存在且语义未定义；与 dsh-schedule 并存策略不可落地**
- **位置**：设计 §13.3 与 §8 settings。
- **问题描述**：§8 的 settings 块中没有 `useHostScheduleBackend` 任何字段；`false` 时"绕过冲突"的具体行为（禁用自身 schedule？转投 host schedule 的每会话 300s 下限机制？）无机制可依——host schedule 是会话本地、分钟级、无账本，无法等价承接。
- **建议修法**：删除该占位设置或给出真实实现语义；并存策略改为"文档级声明：二者工具面互不冲突（`schedule_*` vs `cw_*`），业务上由用户选择其一"。

**M4. `maxConcurrent>1` 的跨 agent 准入机制未定义；"model lock 语义"在 DSH 与自身证据库中均无出处**
- **位置**：设计 §8（`maxConcurrent: 1 … 对齐 model lock 语义`）。
- **问题描述**：DSH 无全局模型锁（每 agent 自带串行 driver，多 agent 可并行跑，`dsh-agent-loop` 无跨 agent 互斥），外部调研全文与摘要也未出现 "model lock"。`maxConcurrent` 若大于 1，需要插件自建准入信号量/队列，文档未给机制。
- **建议修法**：删除无出处的"model lock"引用；若保留并发配置，明示由插件维护跨 agent 派发互斥（如单 tick 只派发一个 run、in-flight 不重复派发）。

**M5. persona"红线/自约束"不是安全闸：自主 worker 可自改自己的约束**
- **位置**：设计 §7（`cw_persona_set / cw_persona_get`）与 §8 persona.constraints。
- **问题描述**：`cw_persona_set` 是**模型可见工具**，常驻 worker 的任意一轮被劫持/跑偏后可直接改写自己的 persona（名字/语气/**红线**），随后所有运行在放松后的约束下执行。"版本化可审阅"只留审计痕迹，不构成控制。若红线承载任何安全意图，它需要宿主侧强制（如 `tools/pre-execute` 守卫按 persona 约束拦截），而非仅 prompt 注入。
- **建议修法**：明确红线语义为"提示性自约束"或"宿主强制闸"；若为强制闸，说明由哪个 host 模块（guardrails）在哪个钩子上执行、persona 变更是否需人工确认。

**M6. 优雅停机/收尾窗口缺失**
- **位置**：设计 §9.3 只覆盖"宕机后冷启动恢复"；无 dispose/drain 语义。对照调研 P1-14（n8n gracefulShutdownTimeout："宿主停机时给收尾窗口落 checkpoint 并标 in-flight 为可重试"）。
- **问题描述**：宿主退出时（cordis dispose）interval 随上下文释放，in-flight 回合被 agent 生命周期中止，半写 checkpoint/未标可重试的 in-flight 意图只能靠下一次冷启动猜——设计没定义"猜"的规则（§9.3 说了标可重试，但那是重启后的事，重启前无收尾）。
- **建议修法**：在 §9 增加 dispose 收尾：`whenIdle`/drain 窗口内落最终 checkpoint、把 in-flight 意图标为 retryable，并注明超时强杀仍可被冷启动折叠覆盖。

**M7. §2.3 分工表与架构不一致：声称用 `ctx.jobs` 承载长驻副作用，但 §6.1 无 jobs 模块、全文无一处注册 job**
- **位置**：设计 §2.3（"后台任务 | `ctx.jobs` | 长驻副作用注册为宿主 job"）vs §6.1 模块树（pacemaker/registry/ledger/waker/watcher/guardrails/tools/commands/audit，无 jobs）。
- **问题描述**：要么把"执行回合/长驻动作"注册为宿主 job（获得 jobs 面板可见性与 `onJobDone` 唤醒路径，减少自建观测），要么删掉分工表这一行；现状是承诺了不存在的集成。
- **建议修法**：在架构中明确 job 注册点（如每回合 `ctx.jobs.start` 承载派发与记账，或明确"插件节拍不注册 job，可观测走 audit 事件流"）。

### Low

**L1. 状态机缺 paused 态**：§5.1/§9.1 状态机（`idle/scheduled/running → done|expired|canceled|faulted`）无 paused，但 §7 有 `cw_pause/cw_resume`、§1.3 成功标准 4 要求暂停——暂停语义无处安放。建议补 `paused` 状态与迁移。

**L2. Web 面板 host→client 状态桥未指明**：§10 只说要 client 插件展示心跳/清单/成本，未说明宿主如何把状态推给浏览器端（dsh-better-sidebar 的 `provide/consume` 服务范式可复用，但需宿主侧有推送通道）。建议在 §10 写明服务契约与更新频率。

**L3. MVP 工具 schema 已暴露 cron 子集，与 §13.4"MVP 只支持 interval"矛盾**：`cw_schedule_create.when` 注释含"cron 子集"，而 §13.4 明确 MVP 仅 interval + 极轻形式。属轻度自相矛盾，建议 schema 注释与 MVP 范围对齐。

**L4. M3"时间旅行/回放"与调研"不该做 ④"相邻**：调研明确"不拿整段 LLM 输出当可重放执行单元"；若回放的是意图日志（checkpoint）则合规，若回放执行则踩雷。建议在 M3 明示"仅意图日志回放，用于审计"。

**L5. 唤醒节流参数未入配置面**：§7 说"唤醒节流对齐 dsh-tool-jobs 先例（delivery quiet|wakeup、maxConsecutiveWakes、agent/inbox/claimed 预算重置）"，但 §8 settings 无对应项（heartbeat 只有 failure/idle/loop 三计数器）。建议把 `maxConsecutiveWakes` 等放入 heartbeat 配置节。

**L6. §10 "具体实现并入第三路调研后细化"**：仓库实际只有两路外部调研（`02-external-research-summary` + 打包 + kimi-claw），无"第三路调研"，疑为残留引用。建议改为"并入实现阶段细化"或补文档。

**L7. 证据 01 §2 列出 `ctx.agents.remove`**：宿主源码无此方法（`dsh-agent/lib/types/index.d.ts` 仅有 `enter/announce/get/roots/requireInitiator/withInitiator`，`remove` 只存在于 inbox 与私有 detach 闭包）。设计正文未引用该方法，属证据文档瑕疵，建议修正以免误导实现者。

### Nit

**N1. §1.2 称 schedule"会话冷掉即冻结、不恢复"过度陈述**：dsh-schedule README 明确"a cold Session … processes an overdue record only after resume"，且 latest-only catch-up（README L111/L115）——冻结不投递属实，但 resume 后会补投，非"不恢复"。建议改为"冷态不投递，resume 后补投 latest"。

**N2. "model lock"一词无出处**（并入 M4，不再展开）。

**N3. 外部 arXiv 引用（2608.02645 / 2606.01416）本环境无法独立复核**：调研自述为"本会话直接抓取"，高置信声明合理；建议保留但标注复核日期，其余外部来源（Paseo/Temporal/n8n/systemd 等）均为官方一手文档，可溯源。

---

## 通过项（明确认可的设计决策）

1. **唤醒管道引用全部真实且逐行验证**：followup/steer/inject/cancel/runMaintenance/whenIdle 与 dsh-agent-loop 源码一致，`createUserMessage({source:{kind:"plugin",plugin:"continuous-worker"}})` 形状符合 dsh-llm `MessageSourceMap`（merge-extensible，插件可加 kind）。设计没有编造 API。
2. **边界立场正确**：不自养 daemon/HTTP/cron 服务、不重造 goal/verification/jobs/timer/记忆系统——与调研"明确不该做"逐条吻合，且 `cw_*` 前缀与 dsh-schedule 的 `schedule_*` 无工具名冲突。
3. **状态外置 + 意图日志 + 幂等键 + verify-before-retry 方向正确**：与 Temporal/n8n 的"执行状态入持久层、外部副作用幂等单元化"语义一致，且明确拒绝"整段 LLM 输出可重放"。
4. **吸收既有范式而非重造**：busy→inject / idle→followup / 唤醒预算 / `agent/inbox/claimed` 跟踪，直接复用 dsh-tool-jobs 先例（该先例描述准确，含自激链警示）。
5. **schedule/loop 的有界性落实到位**：maxRuns/expiresIn/maxIterations/maxTimeMs 齐备（缺陷只在 heartbeat，见 H2）。
6. **打包/安装路径全部实证**：`dsh.bundle.patch`/`dsh.client`/`exports["./client"]`/`files` 与 dsh-bash-terminal package.json 一致；`dsh plugin --profile <p> add` 与 CLI reconcile `dsh.profile.bundles` 属实。
7. **三计数器 + 降级阶梯 + 启动记账（supervisor startsecs 语义）方向正确**，且把"等待人类"作为一等状态、未引入 DB 轮询。
8. **单一持久身份 + 会话切分 + 交接物**的矛盾处理得当：§3 身份持久与 §4.8 会话切分并行不悖，符合调研 §4 结论。

---

## 结论：**FAIL**

存在 2 个 High，按审查规则判定 FAIL。

**必须修清单（进入返修轨道，逐条闭环后方可复审）：**
1. **H1**：§6.2/§6.3/§9.3 补全冷启动恢复路径——worker 会话经 `agent-loop.resume()`（注入 `sessionPersistence`）恢复，`create()` 仅用于首次引导；指明账本/注册表事件的存放会话；对应修改 §1.3 成功标准 3 的验证方式。
2. **H2**：heartbeat 强制总上限（`maxRuns` 与 `expiresIn` 至少其一）或全局累计 token/日预算；成本闸门给出计量实现（`ctx.tokenMeter` 快照差 + 超限 `agent.cancel`/降频）与"单步 token 预算"；写明预算耗尽后的降级/FATAL 行为。

Medium（M1-M7）建议同批返修；Low/Nit 可随实现阶段消化。复审时请附带本意见逐条对照的修订记录（即本文件下节"返修记录"）。

---

**审查方法声明**：本次审查全部基于会话内工具调用产生的证据（宿主源码 read/grep 共 20 余处、文档全文 6 份），未采信任何未经核验的转述；唯一无法在本环境复核的是两篇 arXiv 外部引用（N3），已在文中如实标注。

---

## 返修记录

| # | 严重度 | 审查意见摘要 | 处理 | 状态 |
|---|---|---|---|---|
| 1 | High (H1) | 冷启动恢复缺失 resume/sessionPersistence；create() 对已存在会话失败 | §6.3 唤醒管道表 + §9.3 + §1.3 成功标准 3：明确 `agent-loop.resume()` + `sessionPersistence` 注入，create() 仅首次引导；证据 01 §2 同步修正 | ✅ 已修 |
| 2 | High (H2) | heartbeat 无总量上限；成本闸门无计量来源/无单步 token 预算 | §5.2 maxRuns/expiresIn/stepTokenBudget 改必填；§8 budget 加 dailyTokenBudget + metering:"plugin-ledger"（tokenMeter 仅参考不作闸）；§9.4b 预算耗尽行为 | ✅ 已修 |
| 3 | Medium (M1) | FATAL 回血语义可绕过停止自动重启 | §9.1b：FATAL 后 faulted 工作项不得被任何唤醒源派发；回血仅 cw_resume 人工或预算恢复判定 | ✅ 已修 |
| 4 | Medium (M2) | 派发失败无退避、未计入 FATAL 计数 | §9.1c 指数退避 + 封顶重试计入 FATAL；§13.6 风险条目 | ✅ 已修 |
| 5 | Medium (M3) | useHostScheduleBackend 未定义且不在 §8 | 删除该伪配置；§13.3 改文档级并存声明 | ✅ 已修 |
| 6 | Medium (M4) | maxConcurrent>1 无准入机制；"model lock"无出处 | §8 删除 model lock，明确插件自建派发互斥（单 tick 一个 run、in-flight 不重复） | ✅ 已修 |
| 7 | Medium (M5) | persona 红线为模型可自改的提示性约束，非强制闸 | §7 注 + §8 guardrails：enforcePersona:false 默认自约束；true 时 tools/pre-execute 强制闸 + 变更需人工确认 | ✅ 已修 |
| 8 | Medium (M6) | 优雅停机 drain/收尾缺失 | §9.3b dispose 收尾：落最终 checkpoint、标 retryable、whenIdle 带超时 | ✅ 已修 |
| 9 | Medium (M7) | §2.3 声称用 ctx.jobs 但架构无 jobs 模块 | §6.1 加 jobs/ 模块，明确每回合注册宿主 job（ctx.jobs.start + onJobDone） | ✅ 已修 |
| 10 | Low (L1-L7) | 状态机缺 paused、面板状态桥、cron 矛盾、时间旅行语义、节流参数、第三路调研残留、agents.remove 证据瑕疵 | L1 §9.1 补 paused；L2 §10 host→client 服务桥；L3 §7 schema 注释对齐；L4 §12 仅意图日志回放；L5 §8 heartbeat 节流参数；L6 §10 残留清除；L7 证据 01 remove 修正 | ✅ 已修 |
| 11 | Nit (N1-N3) | schedule"不恢复"过度陈述、model lock 出处、arXiv 引用复核 | N1 §1.2 改"冷态不投递，resume 后补投 latest"；N2 并入 M4 已删；N3 保留并标注复核日期 | ✅ 已修/标注 |

> 返修对照：设计文档 v0.3 全量修订，审查意见每一条均可指向具体章节改动。

---

## R2 复审意见（独立复审员 f6d23440，fresh 上下文）

**结论：PASS — 无未决 Critical/High。H1、H2 两个 High 均已在平台源码语义层面真正闭环（非仅文字修饰）；M1-M7、L1-L7、N1-N2 全部闭环。** 唯一未闭环项 N3（Nit：arXiv 复核日期标注缺失）与 3 条 Low 新发现（§6.5 悬挂引用、persona 强制闸里程碑标签、账本存放会话未显式成句）及若干 Nit——已全部在定稿前修复（见下"收尾修复"）。

### R2 逐条核对摘要
- **H1 ✅ 已闭环**：resume 路径三处落位（§6.3/§9.3/§1.3 成功标准 3）；源码二次核对：create 铸造新会话（dsh-agent-loop L1189-1210）、jsonl 拒绝已有日志（L1157）、resume 需 sessionPersistence（L1256-1259）全部成立。
- **H2 ✅ 已闭环**：heartbeat maxRuns/expiresIn/stepTokenBudget 必填；成本闸门 = 插件自记账（tokenMeter 仅参考，有论证的等价替代）；预算耗尽行为定义（§9.4b，含计量时机）。
- **M1-M7 ✅ 全部闭环**：FATAL 回血唯一入口、派发退避、并存声明、派发互斥、persona 双轨、dispose 收尾、jobs 模块——均指向具体章节改动，无残留旧语义。
- **L1-L7 ✅ 全部闭环**；**N1-N2 ✅**；**N3 ❌→已修复**（复核日期标注补入 02-external-research-summary.md）。
- **通过项**：H1/H2 修法与平台源码逐条吻合、无编造 API；M1-M7 语义完整；返修记录 10/11 行"已修"声明与文档一致。

### R2 新发现问题 → 收尾修复（已应用）
| R2 发现 | 严重度 | 修复 |
|---|---|---|
| §6.5 悬挂章节引用（不存在 §6.5） | Low | 改"§6.2/§9.3" |
| persona 强制闸里程碑标签悬挂（§12 M2 未列） | Low | §12 M2 补 persona 强制闸条目 |
| 注册表/账本存放会话未显式成句 | Low | §6.2 补显式声明：账本追加到 worker 持久会话，不另设控制会话 |
| N3 arXiv 复核日期缺失 | Nit | 02-external-research-summary.md 补复核日期 2026-08-17 标注 |
| H2 计量时机未明示 | Nit | §9.4b 补"派发前/回合后检出，回合中不打断" |
| 证据 01 §1 旧语义 / §2 枚举不完整 | Nit | 补 resume 限定；改"无公开 remove 方法" |
| §5.1 cron 未挂 MVP 限定 | Nit | 补"（MVP 暂缓，见 §13.4）" |
| §9.2"回血"措辞 | Nit | 改"仅保留心跳活性监听与呼救" |
| M5 钩子先例引用不贴切 | Nit | 改引 dsh-tools/dsh-tool-jobs 的 pre-execute 瀑布守卫 |

---

## 最终结论

> **PASS（R2 复审）**：无未决 Critical/High。R1 的 2 High + 7 Medium + 7 Low + 3 Nit 全部闭环；R2 新发现的 3 Low + 若干 Nit 已全部修复。
> 验收标准 ac-review-pass 达成证据：本文件（R1 完整审查意见 + 返修记录 + R2 复审 + 收尾修复）与 docs/02-design.md v0.3（含全部返修）互相印证。
> **设计定稿：v0.3 通过全体审查。**

---

## R3 审查意见（独立审查员 2f3d7b16，v0.4 打工人画像增量审查）

**结论：PASS — 无未决 Critical/High。** v0.4 增量与 v0.3 既有设计无结构性矛盾，未引入不存在的平台 API，记忆四层载体真实。M1-M4（Medium）+ L1-L4（Low）+ N1-N4（Nit）建议返修。

### R3 发现摘要
- **M1**：§13.3 "随包分发 SKILL.md"与证据不符——宿主 skill 扫描根不含插件包（dsh-skill-filesystem roots() L150-188），需明确装入扫描根路径或显式标注开放问题。
- **M2**：技能 review 可被 worker 自批（R1 M5 同类）；autoLearnBelowConfidence 与 requireSkillReview 交互未定义；置信度来源未定义。
- **M3**：长期记忆 review 无落地面（无记忆审查工具）；规则与配置语义冲突；Agent OS memory MCP 存在旁路风险（worker 直呼 memory_retain）。
- **M4**：work_order "必留"无强制闭环、无存储位置、无 verification 状态读取路径——仍是提示性机制。
- **L1**：§5.1 "见 §13.4"因 v0.4 重编号断裂（应 §14.4）；**L2**：§13.2 依据行引用错位；**L3**：§2.3 分工表缺技能行；**L4**：§14 风险清单未扩展 v0.4 机制。
- **N1-N4**：§13.1 表缺成本意识行/计数不符；情景记忆载体引用错位；M2 里程碑隐含 M3 依赖；§13.6 配置与 §8 重复粘贴。
- **通过项**：未引入不存在 API（memory_recall/retain/forget、verification AC、dsh-tool-skill 均真实）；记忆四层载体真实；"低于阈值需 review"有出处；§13 与 v0.3 无矛盾；成本意识与 §9.4b 互补；里程碑标签一致。

### R3 返修记录（已应用）
| R3 发现 | 严重度 | 修复 |
|---|---|---|
| M1 技能注册机制与证据不符 | Medium | §13.3 step 1 补注册机制：插件启用时装入宿主扫描根（`~/.agents/skills/` 先例），否则显式标注"需手动复制" |
| M2 技能 review 防自批 + 阈值交互 + 置信度 | Medium | §13.3 防自批（requireSkillReviewConfirm 人工确认/移出模型面）；阈值互斥语义；置信度来源 ledger-stats |
| M3 记忆 review 落地 + MCP 旁路 | Medium | §13.2 写入语义收敛 + 记忆审查面（cw_memory_review）+ 声明 MCP 连接仅宿主侧持有 |
| M4 work_order 强制闭环 | Medium | §13.4 规则 1b 强制点：tools/post-execute 守卫自动登记 + audit 存储 + 自证边界 |
| L1 §5.1 引用断裂 | Low | 改"见 §14.4" |
| L2 §13.2 依据行错位 | Low | 改指调研全文 §2b/L72/L254 与来源 #11 |
| L3 §2.3 缺技能行 | Low | 补"技能 \| DSH skills 机制 \| cw_* 封装+沉淀面" |
| L4 §14 未扩展 v0.4 风险 | Low | 已补 §14.7-14.9（记忆污染/技能滥用/work_order 自证） |
| N1 成本意识缺行 | Nit | §13.1 表补"💰 成本意识"行，计数改六类 |
| N2 情景记忆引用 | Nit | 改"§6.2 + §12 M3" |
| N3 M2-M3 依赖 | Nit | §12 M2 注明"程序记忆载体随 M3 落地" |
| N4 §13.6 配置重复 | Nit | 改为"仅列与 §8 的 diff" |

---

## 最终结论（v0.4 定稿）

> **PASS（R1→R2→R3 全通过）**：三轮独立审查无未决 Critical/High。
> - R1（v0.3 基础）：2 High + 7 Medium + Low/Nit 全部返修；
> - R2（v0.3 复审）：无未决 Critical/High，收尾修复全部落地；
> - R3（v0.4 打工人画像增量）：PASS，M1-M4 + L1-L4 + N1-N4 建议项全部返修。
> **设计定稿：v0.4 通过全体独立审查。**

---

## R4 审查意见（独立审查员 d51b4916，v0.5 员工素养增量审查）

**结论：PASS — 无未决 Critical/High。** v0.5 增量（§13.7 cw_probe / §13.8 cw_diagnose / §13.9 cw_report / §13.10 diff）与 v0.3/v0.4 既有内容无自相矛盾，未引用不存在的平台能力。

### R4 发现摘要
- **M-A**：probe 自封"核心原语"却未纳入 §5/§5.4 统一节拍引擎与 §9.1 状态机；"独立低频节拍"与共享 tick 循环关系未定义。
- **M-B**：cw_diagnose 周期自检的触发主体与"自动降级"执行主体未定义（依赖 worker 自觉调用模型可见工具则不"自动"）。
- **M-C**：诊断检测项 1/4 无数据来源——意图账本不存输出/每轮结果度量，与 §13.2 情景记忆"结果如何"存在张力。
- **L-A**：§13.1 计数不符（表 10 行 vs 文字"九类"）；**L-B**：probe maxRunsPerDay 计数对象、独立巡检预算未入配置、与 dailyTokenBudget 叠加关系未定义；**L-C**：汇报送达通道未定义（inject 是 agent 唤醒语义，套用于人类通知属概念混用）、escalate 与 maxReportsPerDay 未协调；**L-D**：cw_report handover（M2）依赖 M3 交接模板，里程碑倒挂；**L-E**：§13.10 配置未并入 §8；**L-F**：FAAL 错别字 + §13.9 自引用；**L-G**：probe kind 无枚举、check/scope 形态未定义、面板无巡检/诊断视图。
- **通过项**：意图账本、busy→inject、dsh-tool-jobs delivery、tokenMeter 可观测投影均与既有设计与证据一致；probe/diagnose/report 与 schedule/heartbeat/work_order/§9.4 分工无冲突。

### R4 返修记录（已应用）
| R4 发现 | 严重度 | 修复 |
|---|---|---|
| M-A probe 未纳入统一节拍/状态机 | Medium | §13.7 明确共享 §5.4 统一节拍引擎、probe 项进入 §9.1 状态机、独立注册表与预算 |
| M-B diagnose 触发/降级主体未定义 | Medium | §13.8 明确宿主 watcher 定时触发（runMaintenance）+ 插件执行降级；cw_diagnose 模型面仅只读查询 |
| M-C 诊断检测项 1/4 无数据来源 | Medium | §13.8 每项补数据来源：意图账本扩展每轮质量签名（度量层，与情景记忆语义层互补） |
| L-A §13.1 计数 | Low | 改"十类"（七类基础 + v0.5 三类） |
| L-B probe 预算/计数对象 | Low | maxRunsPerDay 项级 + dailyBudgetTokens 全局巡检预算入 §8，独立核算不叠加 |
| L-C 汇报送达通道 | Low | §13.9 面向人类通知走宿主通知面（非 agent inject）；紧急级别豁免上限 |
| L-D handover 里程碑倒挂 | Low | §13.9 M2 最小交接（应急快照）/ M3 完整交接模板，不重叠 |
| L-E §13.10 配置重复 | Low | probe/diagnose/report 配置并入 §8 主块，§13.10 改指针 |
| L-F 错别字/自引用 | Low | FAAL→FATAL；§13.9 自引用改写 |
| L-G probe 形态/面板视图 | Low | kind 枚举（disk/cost/dependency/external）+ check 确定性表达式 + scope；§10 补巡检/诊断视图 |

---

## 最终结论（v0.5 定稿）

> **PASS（R1→R2→R3→R4 全通过）**：四轮独立审查无未决 Critical/High。
> - R1（v0.3 基础）：2 High + 7 Medium + Low/Nit 全部返修；
> - R2（v0.3 复审）：无未决 Critical/High，收尾修复全部落地；
> - R3（v0.4 打工人画像增量）：PASS，M1-M4 + L1-L4 + N1-N4 全部返修；
> - R4（v0.5 员工素养增量）：PASS，M-A/M-B/M-C + L-A~L-G 全部返修。
> **设计定稿：v0.5 通过全体独立审查。**

---

## R5 审查意见（独立审查员 6b11a641，v0.6 安全三角增量审查）

**结论：FAIL — 存在 2 个 High（§13.12 凭据防护强制点缺失 + 平台对齐夸大；§13.13 供应链分级可被通用执行工具旁路）。** v0.6 增量与 v0.3-v0.5 既有内容无自相矛盾、未引用不存在的平台 API，但安全三角的核心 fail-closed 承诺在当前描述下不可仅靠既有机制达成，须返修。

### 审查范围与方法

- 审查对象：`docs/02-design.md` v0.6 增量 §13.11-13.15（安全三角），对照 §13.1 总览、§7 工具面、§8 配置面、§12 里程碑、§14 风险与 §3（单一持久身份）/§6/§9 既有语义；逐条核对四个平台安全原语 README（宿主 node_modules 实测）；参考 `docs/03-review-record`（R1-R4 已闭环项，避免重复提）与 `docs/04-evidence-kimi-claw.md`。
- 方法：§13.12-13.14 每个"复用平台原语"的声称与 README 原文比对；每个 fail-closed / 防越权 / 禁自降级承诺追问"强制点在哪、由谁执行、能否绕过"；配置/工具/里程碑/风险编号一致性核对。环境实测：`$DSH_HOME = C:\Users\Administrator\.dsh` 即会话工作区根（PWD 相同），`$DSH_HOME\.credentials.yaml` 存在且位于工作区内（workspace-write 沙箱可读/可写）。

### 发现（按严重度）

#### Critical

无。

#### High

**H-A. §13.12 凭据防护的强制点缺失 + 平台对齐夸大："worker 不可直接触碰凭据值"在平台语义下不成立**
- **位置**：§13.12 边界 1（"凭据解析发生在宿主侧…模型只见'已授权/未授权'，不见 secret（对齐 dsh-credentials Model Experience：值永不进请求前缀）"）、表"最小权限"行（"未声明即 `resolve` 返回 undefined → fail-closed 防越权调用"）、§13.15 拟新增 `credentials.denyDirectAccess: true`。
- **问题**：(a) **对齐引用夸大**——dsh-credentials 的 Model Experience 明确限定于 LLM 适配器（README L38："Indirectly, through the consuming LLM adapters … the adapter owns every model-visible surface"；L42："credentials never enter a request prefix"），平台不保证"任意工具执行器内解析的凭据不进入模型视野"。(b) **存在真实直读路径**——dsh-credentials-local 把值存于 `$DSH_HOME/.credentials.yaml` 并叠加继承的进程环境变量（README L34），而 `$DSH_HOME` 恰为会话工作区根（本环境实测），且 dsh-sandbox-policy 只管文件效果、网络与进程策略在其词汇之外（README L68）。worker 经会话内 shell/文件工具（workspace-write 即可）直接读 `.credentials.yaml` 或打印环境变量，即绕过"模型不见 secret"承诺；设计未给出任何防直读机制（无环境变量擦除、无凭据存储文件排除、无工具面禁用）。(c) **"白名单"语义错位**——`resolve()` 对**未配置**引用返回 undefined 是平台自然行为（"empty stored value is absent"，README L11），不等于"任务未声明的凭据被拦截"：只要 store 已配置某引用（如全局 `DEEPSEEK_API_KEY`），worker 任务未声明它，`resolve` 依然返回值。要达成"未声明即 fail-closed"，插件必须在宿主侧有拦截点（guardrails pre-execute 扫描或包裹 resolve），设计未定义。且 `cw_credential_declare` 是模型可见工具（§7），worker 可自声明引用使白名单自授权，仅靠矩阵"管理动作"行兜底（该行通道未定义，见 M-C）。
- **建议**：限定 Model Experience 对齐范围为 LLM 适配器请求前缀；补"凭据不可直读"强制机制——把 `$DSH_HOME/.credentials.yaml` 与凭据环境变量排除出 worker 会话沙箱可读范围（或经 guardrails pre-execute 按路径/变量名单拦截读文件/环境变量类工具）；把"引用白名单"落地为宿主侧拦截点（定义钩子与主体）；`cw_credential_declare` 的声明写入限定为宿主/人工侧，或声明动作强制人工确认。

**H-B. §13.13 供应链信任分级可被通用执行工具旁路：T3/T4 安装审批与 T2 技能门槛只拦声明式路径**
- **位置**：§13.13 设计规则 1（"技能/依赖安装走审批：T3/T4 安装触发 `ctx.approval.request`（ask），T4 默认 `never` 直接拒绝"）、规则 4（"`cw_skill_use` 只允许调用 ≥T2 的技能"）、§13.14 矩阵（"内部推理 workspace-write + never"）。
- **问题**：信任分级只作用于 `cw_skill_use` 与"声明式安装"两个入口；worker 会话默认持有通用执行工具（shell/文件），在矩阵"内部推理/工作区写 = workspace-write + never"档下可直接 `npm install <pkg>` / `pip install` / `curl | bash` 安装或执行任意第三方代码，不经任何 T 级检查与审批——T4 fail-closed 与安装审批形同虚设；同理，"`cw_skill_use` 只允许 ≥T2"拦不住 worker 用 shell 手动复刻技能步骤（**worker 自写脚本绕过技能分级**）。设计未定义安装类命令/下载行为的检测点（§8 guardrails 目前只有 persona 强制闸 `enforcePersona`，无供应链规则；R1 M5 建立的 tools/pre-execute 瀑布守卫先例可复用但未扩展到安装模式）。对照风险 #14"一个恶意技能即可叛变打工人"——当前描述下该风险未真正封堵。
- **建议**：把供应链强制点挂到 guardrails：tools/pre-execute 对安装/下载/执行第三方代码类工具调用（npm/pip/curl|bash/克隆等模式）按 T 级 + approval 门拦截（复用 M5 的 pre-execute 瀑布守卫先例，先例：dsh-tools `ctx.waterfall(carrier, "tools/pre-execute", …)`）；明确 worker 会话中"可执行任意代码"的路径全部纳入分级；或收紧默认档位（默认去掉通用 shell / 默认 ask）并写明与"内部推理 workspace-write + never"档的取舍。

#### Medium

**M-A. §13.14 监督矩阵与平台词汇/语义不匹配："受限"档不存在、预设表进程级固定、单持久会话下逐任务换档机制未说明**
- **位置**：§13.14 矩阵（"外部副作用/管理动作 → 受限"）、实现 1（"矩阵行映射到 preset…平台已支持 per-session 生效与事件审计"）、§13.11 总览。
- **问题**：(a) sandbox 模式是封闭词汇（read-only / workspace-write / danger-full-access，dsh-sandbox-policy README L13/L23，`./invariant` 拒绝词汇外事件），矩阵"受限"档在平台无对应模式；且 SandboxMode 只管文件效果、网络与进程策略在其词汇之外（L68）——"外部副作用（发布/发信）"本质是网络/进程动作，挂 sandbox 列是概念错位，其实际闸门是 approval + work_order。(b) 预设表是进程级、插件生命周期内固定（dsh-permission-presets README L27："changing available presets requires reloading the plugin"），`custom` 只能派生、不能选择或持久（L26）——矩阵行要作为命名 preset 被 `set()` 选中，必须在插件装载时注册进表；"matrix: builtin 可被 reviewed 变更覆盖"若指改表，需插件重载，边界未说明。(c) 插件是"单一持久身份"（§3），worker 是一个持久会话；矩阵按任务类型实时换档需每派发 `permissionPresets.set(workerSession, preset)` 切换整会话档位（创建时固定的只是 Settings 默认，set() 可改），设计未说明切换时机、同一回合内多类型动作的档位归属、以及换档对会话内非插件工具（bash 等）的连带影响。
- **建议**：把"受限"映射为平台具体模式（read-only + 工具白名单）或删除；说明外部副作用由 approval + work_order 把关而非 sandbox；明确矩阵行须预先注册为命名 preset、运行期仅重映射任务类型→既有 preset；说明单持久会话下按派发切换 preset 的机制及其与并发互斥（maxConcurrent=1）的关系。

**M-B. "禁自降级/配置面"可被直写配置文件绕过：settings.yaml 位于工作区内，guardrails 无配置保护规则**
- **位置**：§13.14 实现 3（"不可自降监督：矩阵写入需人工确认…监督变更走 permissionPresets.set + 事件审计"）、§13.15 拟新增 `supervision.forbidSelfDowngrade: true`、`credentials.requireDeclaredRefs` 等。
- **问题**：插件配置（settings.yaml / cordis.yml）与凭据存储（`$DSH_HOME/.credentials.yaml`）均位于会话工作区根（$DSH_HOME = 工作区，本环境实测），workspace-write 沙箱的 worker 可经文件/编辑工具直写配置：把 `forbidSelfDowngrade` 改 false、把矩阵行改松、关掉 `requireDeclaredRefs`/`denyDirectAccess`——"矩阵写入需人工确认"与 permissionPresets 事件审计（log-only，README L7）都不构成写保护。guardrails 目前只有 persona 强制闸（§8 `enforcePersona`），无"插件自身配置/凭据存储不可由 worker 写"的规则。
- **建议**：把插件配置目录与凭据存储声明为 worker 会话的写排除区（sandbox 不可写 + guardrails pre-execute 拦截对 settings.yaml / cordis.yml / .credentials.yaml 的写与删改），或移出工作区根；配置变更统一走插件命令/面板（人工面），不进模型工具面。

**M-C. 「人工确认」通道未定义，而 §13.13/§13.14/§13.3/M5 多处依赖它**
- **位置**：§13.13 规则 1（T3/T4 安装触发 `ctx.approval.request`）、§13.14 实现 3（"矩阵写入需人工确认"）、§13.3 防自批（"`cw_skill_review` 接受需人工确认"）、§8 `guardrails.requirePersonaConfirm`。
- **问题**：`ctx.approval.request` 只限开轮次内有效——"Requests are valid only inside an open agent turn — an idle or between-turn caller throws before auditing"（dsh-user-approval README L59），且只有 one-shot 授权、无持久 grant/撤销（L60）、无内置 answerer（L62，无应答者时 fail-closed）。设计多处"人工确认"未指明通道：经 approval.request（须在 worker 回合内；宿主侧 out-of-turn 审批不可用）还是插件命令/Web 面板（§6.1 commands/，人工面）？若安装审批由宿主侧触发（非 worker 回合内）将直接抛错。
- **建议**：统一定义"人工确认"通道矩阵：回合内动作 → `ctx.approval.request`（ask 策略，fail-closed）；宿主侧/回合外动作 → 插件命令 + 面板确认（明确执行模块与确认结果回写路径）；说明 T4"人工审批后降级为 T2/T3"落在哪一侧。

**M-D. §13.15 配置未并入 §8 主块，违反既有「仅列 diff」约定**
- **位置**：§13.15 配置面新增（完整 YAML）vs §8（无 `credentials:`/`supplyChain:`/`supervision:` 节）、R3 N4 / R4 L-E 约定（"仅列与 §8 的 diff，完整配置以 §8 为准"；v0.5 的 probe/diagnose/report 已并入 §8 主块，§13.10 改指针）。
- **问题**：v0.6 三组配置只存在于 §13.15，§8 未并入；实现者以 §8 为准时会把 `requireDeclaredRefs`/`forbidSelfDowngrade` 等全部安全配置丢失，与 R4 L-E 确立的修复方向（并入主块、§13.x 改指针）不一致。
- **建议**：把 credentials / supplyChain / supervision 三节并入 §8 主配置块，§13.15 改为指针 + 仅列增量说明。

#### Low

**L-A. §13.12「旋转」行因果链表述错误：credentials/updated 的发布者是凭据服务而非插件 watcher，且环境变量轮换永不发事件**
- **位置**：§13.12 表"旋转"行（"外部轮换 → watcher 发布 `credentials/updated` → 下个操作生效"）。
- **问题**：dsh-credentials README L28——`credentials/updated` 由凭据服务在 provider-managed 源提交变更后发出（set/unset/存储侧外部编辑），进程环境变量变更"not observable and never emit"；插件 watcher 是消费方不是发布方。"下个操作生效"由"每次操作 resolve、不缓存"保证（L9），与事件无关（事件只服务配置 UI 徽章刷新）。
- **建议**：改为"外部轮换（存储侧可观测）→ 平台发 `credentials/updated` → 插件 watcher 消费（可选，刷新面板徽章）；下个操作经每次 resolve 自动生效，无需事件"。

**L-B. 白名单自授权风险仅由矩阵"管理动作"行兜底：cw_credential_declare 是模型可见工具**
- **位置**：§7 `cw_credential_declare`、§13.14 矩阵"管理动作（persona/技能/凭据）→ ask + 人工确认"。
- **问题**：worker 可自行声明任务所需凭据引用（自授权），"最小权限白名单"的防线退化为矩阵一行；该行通道未定义（见 M-C），且审批是 one-shot（dsh-user-approval README L60），"声明一次批准后长期有效"的边界未说明。
- **建议**：声明写入限定宿主/人工侧，或把每次"新增凭据引用"设为强确认动作并记 work_order（§13.4）。

**L-C. §13.13 规则 4 与 §13.3「越干越熟」闭环的交互未提示：learn 出的技能默认 T3，须人工提升后才能被 cw_skill_use 调用（≥T2）**
- **位置**：§13.13 规则 4、§13.3 闭环。
- **问题**：默认配置下 worker 每沉淀一个技能就需一次人工提升才能复用，"打工人越干越熟"的摩擦未被文档明示为有意设计；也未说明 T3 技能在提升前的受限执行形态（矩阵/沙箱如何体现"受限"）。
- **建议**：补一句交互说明（有意摩擦 + 提升通道），与 M-A 的"受限"档位定义一并落位。

#### Nit

**N-A. §13.12「写入」与泄露应急未指明动作主体**："set/unset 走 provider"与"宿主侧 unset/provider 轮换"应明示为人工/宿主侧操作（worker 不可），与边界 2（worker 不可触碰凭据值）自洽。
**N-B. §13.13 表 T3"受限执行（沙箱/审批/只读）"与 §13.14 矩阵"受限"为同一未定义档位**（并入 M-A）。

### 通过项

1. **§13.11 对四个平台原语的描述全部准确**：ctx.credentials（resolve 每次操作解析不缓存 / describe 不含值 / set·unset shadowing fail-loud，README L9/L23-26/L30）、ctx.approval（one-shot 结果词汇 allowed-once/rejected/cancelled/unavailable + fail-closed + ask|never，L5/L11）、ctx.permissionPresets（捆绑 sandbox+approval、默认 workspace-write+ask / danger-full-access+never，L5）、ctx.sandboxPolicy（每调用解析 mode+workspaceRoot，L18）——逐条与 README 一致，未夸大、未引入不存在的 API。
2. **§13.12 与既有设计不矛盾**：引用→provider 教义、describe 面板展示、"凭据不落记忆"（与 §13.2"不存密钥"一致）、work_order 记引用不记值（与 §13.4 一致）、泄露应急对齐 §9.1 FATAL 语义——一致。
3. **§13.13 与 §13.3 技能闭环衔接清晰**（learn 默认 T3、use 需 ≥T2、人工提升），来源入账本与 §13.4 work_order/审计流一致。
4. **§13.14 与 persona 强制闸（M5）关系成立**：矩阵"管理动作"行显式覆盖 persona/技能/凭据并引用 M5/M2，与 R1 M5 双轨（提示性/强制闸）不冲突。
5. **编号/引用/里程碑一致性**：§13.11-13.15 编号连续；§7 v0.6 工具行、§12 M1（凭据）/M2（供应链/监督）、§14 风险 #13/14/15 的交叉引用全部对应；§13.1 表 13 行 = 十类基础 + 三类安全，与"十三类"表述一致（R4 L-A 遗留计数问题未复发）。
6. **边界立场延续**：安全三角明确"复用平台原语、不自造安全机制"，与 §2.3 不抢戏、§4 原则一致；未引入 daemon/自建审批/自建沙箱。

### 结论：**FAIL**

存在 2 个 High（H-A 凭据防护强制点缺失与对齐夸大；H-B 供应链分级可被通用执行工具旁路），按审查规则判定 FAIL。其余 Medium（M-A~M-D）建议同批返修。

**必须修清单（进入返修轨道）：**
1. **H-A**：§13.12 边界 1 与"最小权限"行——限定 Model Experience 对齐范围（仅 LLM 适配器）；补"凭据不可直读"强制机制（凭据存储文件 + 凭据环境变量排除出 worker 沙箱可读/可写范围，或 guardrails 拦截）；把"引用白名单"落地为宿主侧拦截点（定义钩子与主体）；cw_credential_declare 声明写入限宿主/人工侧。
2. **H-B**：§13.13 把供应链强制点挂到 guardrails tools/pre-execute（安装/下载/执行第三方代码模式按 T 级 + approval 拦截，复用 M5 瀑布守卫先例）；明确通用执行工具路径全部纳入分级，或收紧默认档位并写明取舍。
3. **M-A**：矩阵"受限"映射为平台词汇；预设表进程级固定与"reviewed 变更"边界；单持久会话逐任务换档机制。
4. **M-B**：插件配置/凭据存储声明为 worker 写排除区（或移出工作区根）；guardrails 补配置保护规则。
5. **M-C**：统一"人工确认"通道（回合内 approval.request / 回合外命令+面板），说明 T4 降级审批所在侧。
6. **M-D**：credentials/supplyChain/supervision 配置并入 §8，§13.15 改指针。

Low（L-A~L-C）与 Nit（N-A~N-B）可随实现阶段消化。

---

## R6 复审意见（独立复审员 4bc54e0f，v0.6 返修闭环核对）

**结论：PASS — 无未决 Critical/High。** R5 的两个 High 均在平台语义层面真正闭环；M-A~M-D、L-A~L-C、N-A/N-B 全部闭环。

### R6 逐条核对摘要
- **H-A ✅ 闭环**：Model Experience 限定 LLM 适配器（dsh-credentials README L38/L42）；直读前提经 dsh-credentials-local L54 证实（workspace-write 只管变更不管读、无沙箱档位单列凭据文件）；白名单落地为 tools/pre-execute 宿主侧拦截点、旧"undefined≈拦截"表述已删；cw_credential_declare 限人工侧三处一致。
- **H-B ✅ 闭环**：pre-execute 安装模式门复用 M5 先例（dsh-tools L5/L57 证实拒绝门真实）；默认档不含通用 shell 已收紧；"自写脚本复刻"开放问题如实标注（§14#16）。
- **M-A~M-D / L-A~L-C / N-A/N-B ✅ 全部闭环**：必须修清单 6 条均有落点（§13.12/13.13/13.14/13.14b/13.15 + §8 配置键）。

### R6 新发现问题 → 收尾修复（已应用）
| R6 发现 | 严重度 | 修复 |
|---|---|---|
| §13.13"内部推理 workspace-write + never"与 §13.14 矩阵"read-only + never"矛盾（H-B 返修残留） | Low | §13.13 统一为 read-only + never（与矩阵一致） |
| §6.1 guardrails 模块描述未含 v0.6 职责 | Nit | 补凭据读排除/白名单门、供应链安装拦截、配置写保护 |
| §13.12 凭据读排除门启发式残差未显式标注 | Nit | 补"缓解而非绝对隔离"注 + §14 风险标注 |

---

## 最终结论（v0.6 定稿）

> **PASS（R1→R2→R3→R4→R5→R6 全通过）**：六轮独立审查无未决 Critical/High。
> - R1（v0.3 基础）：2 High + 7 Medium + Low/Nit 全部返修；
> - R2（v0.3 复审）：PASS；
> - R3（v0.4 打工人画像）：PASS；
> - R4（v0.5 员工素养）：PASS；
> - R5（v0.6 安全三角）：FAIL（2 High：凭据直读防护缺失、供应链可被通用执行旁路）→ 全部返修；
> - R6（v0.6 复审）：PASS，1 Low + 2 Nit 收尾修复。
> **设计定稿：v0.6 通过全体独立审查。**
