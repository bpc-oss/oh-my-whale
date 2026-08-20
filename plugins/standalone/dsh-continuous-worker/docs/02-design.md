# dsh-continuous-worker — 常驻"电子打工人"自主执行插件·设计方案

> 状态：**v0.6 定稿（R5 FAIL→返修 + R6 复审 PASS，全体通过）**
> 目标仓库：`{{PLUGIN_SOURCES_DIR}}\dsh-continuous-worker\`
> 依据证据（均本机/独立调研实证）：
> - [docs/01-evidence-dsh-native-capabilities.md](./01-evidence-dsh-native-capabilities.md)（DSH 宿主原生能力：agent-loop 唤醒管道、agents 注册表、session 折叠、jobs、tools）
> - [docs/02-external-research-summary.md](./02-external-research-summary.md)（外部设计模式结论摘要）
> - [docs/03-evidence-plugin-packaging.md](./03-evidence-plugin-packaging.md)（DSH 插件打包 / client / **自唤醒先例** dsh-tool-jobs）
> - [docs/04-evidence-kimi-claw.md](./04-evidence-kimi-claw.md)（**Kimi Claw**：用户指定对标——24/7 常驻 agent 的产品化样板）
> - [外部调研全文](../../../.dsh/dsh-resident-agent-design-patterns.md)（34 条来源）

---

## 0. TL;DR

`dsh-continuous-worker` 是一个 **DSH 插件**（不是独立 daemon、不是脚本、不是 Paseo 替代），为 DSH 宿主提供**「常驻自主打工人」**能力：把"7×24 持续执行"拆成三个有界原语（schedule / heartbeat / loop），由宿主侧节拍引擎驱动，通过 DSH 原生「唤醒管道」把任务注入 agent 会话；一切状态走持久化折叠，外部副作用幂等，自带闲置/循环/预算三计数器、分级降级与 FATAL 上报；通过插件命令与 Web 面板暴露可观测与控制面。它不抢占 DSH 已有 goal/verification/jobs/timer/记忆系统，而是**在其上表达**一个长命自主执行体。

一句话定位：**给"戴维斯"一个岗位——一个住在 DSH 宿主里、有节拍、有账本、会自愈、能被人类随时接管的长命 agent。**

---

## 1. 背景与目标

### 1.1 用户诉求（原始）
用户明确：不是 Paseo；是一个 **dsh-插件**；类似"科幻片里的戴维斯 / 格子间里的电子打工人"——**7×24 小时持续工作**、像真正 AGI 一样自主执行持续任务。

### 1.2 问题本质
DSH agent 会话是 **idle→唤醒源** 模型：一旦空闲就停，需外部输入再次唤醒。原生 `dsh-schedule` 提供会话内 `schedule_create/at/every` 提醒，但：
- 会话本地（session-local）：冷态不投递，resume 后仅补投 **latest** 一次（latest-only catch-up）——不是完整任务恢复（N1 修正）；
- 最小间隔 5 分钟（`every_seconds >= 300`）；
- 交付形态是「把一条固定 prompt 注入会话」——**不携带任务账本、无调度/唤醒源自主性、无自愈/预算/审计**。

因此「打工人」不等于「提醒器」。要让一个 agent 真正 7×24 在岗，需要在 schedule 之上增加：**唤醒源的自主注册与驱动、目标/意图的持久账本、执行的有界与自愈、可观测与人类接管面**——这正是本插件提供的增量。

### 1.3 成功标准（MVP 判定）
1. 宿主运行期间，插件到点自主唤醒指定 agent 会话，无需任何用户输入。
2. 每类任务有界（maxRuns / expiresIn / 预算），不会无限失控。
3. 宿主重启后，worker 会话经 `agent-loop.resume()`（sessionPersistence 注入）恢复，从持久 checkpoint 续跑（无丢失账本、无重复副作用，依赖幂等键）——**验证方式：杀进程重启，确认同一 worker 身份 resume 成功且账本延续**（H1 返修）。
4. 用户在 Web 面板/插件命令可查看：心跳、运行清单、失败率、成本、最后错误，并可暂停/恢复/手动喂一次/停止。
5. 不侵入/不覆盖 DSH 既有机制（goal/verification/jobs/timer/记忆系统）。

### 1.4 Kimi Claw 对标（用户指定参考，详见 04-evidence-kimi-claw.md）
用户明确："我觉得 Kimi Claw 挺符合我的想法"。Kimi Claw（Moonshot 官方）＝**OpenClaw 云端一键部署 + 24/7 常驻 AI agent**，其产品语义正是本插件的对标：
- **持久记忆 + 自定义人格**：跨会话记住偏好/工作风格，一句话设定名字/语气/输出格式后自动遵守 → 本设计把 persona 固化为版本化配置 + 复用 Agent OS memory MCP；
- **主动定时任务**：`At [time], do [task], output [format], follow [constraints]` 四要素模板 → 本设计 `cw_schedule_create` 等工具 schema 原生承载同构四要素；
- **5000+ skills 链式编排**：描述工作流→自动选/装/链 skill → DSH 既有 skills 机制之上做高层封装（P2）；
- **40GB 云存储**：文档/报表存档检索 → 本地宿主文件系统 + 审计账本（我们不做云，隐私/成本更好）；
- **云 vs 本地**：Kimi Claw 用云换 24/7；我们默认用「宿主常驻」换 24/7，仅在宿主不常开时用 Task Scheduler/NSSM 包宿主 bootstrap（P2，语义等价但数据本地）。

设计结论：**Kimi Claw 证明"常驻打工人"是成熟产品形态**；我们复刻其「人格 + 主动任务 + 记忆 + 可观测」的产品语义，但以 DSH 插件 + 本地优先方式落地（§2 边界不变）。

---

## 2. 定位与边界

### 2.1 不是 Paseo / 不是新 daemon
依据外部调研 §1 与"明确不该做"①：DSH 宿主进程即 daemon。本插件**不**自养进程组、不建 HTTP 控制面、不自建 cron 服务。它注册唤醒源到现有宿主定时设施，状态落宿主管理路径。

### 2.2 与 X 项目（bpc-operator）的关系
X 项目是"最高治理形态"：DSH 只负责受限认知，发布权在确定性 Python 控制面。本插件**不替代、不重写**该分层，而是提供**通用常驻执行载体**功夫，可供两层使用：
- 作为 **X 式治理 profile 的"唤醒/账本/自愈底座"**：调度是否触发、预算多少、心跳活性、FATAL 语义由插件提供；X 的 dispatcher/review 门继续由确定性层持有。
- 作为**轻量自主执行体**（无 Python 控制面的普通 profile）：让普通 DSH session 拥有 schedule/heartbeat/loop 能力而无需自建控制面。

设计上二者共用同一宿主插件；治理强度由 profile 配置（是否挂 external governor）决定。

### 2.3 与 DSH 既有机制的分工（不要抢戏）
| 能力 | 给 DSH | 插件负责 |
|---|---|---|
| 定时 | `ctx.timer`（interval/timeout） | 在其上注册"唤醒源 + 到期决策" |
| 目标 | `create_goal`/goal 状态机 | 在其上表达"这一轮的完成度/卡点" |
| 验收 | verification plan（证据绑定） | 调用/对接，不重造 |
| 后台任务 | `ctx.jobs` | 长驻副作用注册为宿主 job |
| 会话持久化 | session 事件日志 + flush | 折叠账本、checkpoint（复用 schedule 折叠范式） |
| 记忆 | Agent OS memory MCP | 作为**使用方**，存已验证持久事实；分层语义（§13.2） |
| 技能 | DSH skills 机制（dsh-skill-filesystem/dsh-tool-skill） | `cw_*` 高层封装 + 沉淀/升级面（§13.3，不重造技能注册） |
| 认知 | LLM + tools | 通过 `agent.followup/steer/inject` 驱动 |

---

## 3. 命名与身份

- 包名（npm）：`dsh-continuous-worker`
- 插件名（Cordis `name`）：`continuous-worker`
- 命令行工具前缀：`cw_*`
- 会话/资源配置元数据命名空间：`continuous-worker`
- **单一持久身份**：插件在 profile 里维护「一个长命工作台工作项（worker）」，用户永远"回到它"，不需要会话检索（调研 §4）。

---

## 4. 设计原则（由调研强制决定）

1. **有界是铁的**：每个调度/心跳/循环都要 `maxRuns`、`expiresIn`、迭代预算、单步 token 预算。
2. **原语分型**：schedule / heartbeat / loop 各自独立明示，不合成"万能常驻器"。
3. **状态外置**：执行意图与账本落盘；可重放的是意图日志，外部动作幂等键化。
4. **不抢既有机制**：goal/verification/jobs/timer/memory 之上叠加，不重复实现。
5. **活着要能证明**：心跳记录 + 可恢复 checkpoint → 向宿主证明活性，自定义 supervisor 语义。
6. **降级不是死亡**：Normal→Low→Critical→FATAL(停+上报)，保命动作与呼救分离。
7. **人类随时可接管**：等待人类是一等状态；暂停/喂一次/停止都必须是插件命令。
8. **单一持久身份、会话切分、交接物**：连续性来自外部状态 + 交接记录，不是常开上下文。

---

## 5. 核心原语（功能模型）

> 借鉴 Paseo 的刻意隔离（调研 §1/§7），但有界性、持久性与 DSH 集成是本插件的增量。

### 5.1 schedule（一次性 / 周期批次）
- 定义：`{ id, rule, prompt, provider?, cwd?, maxRuns, expiresIn, next? }`
- `rule`：`interval_seconds`（≥30s），或**极轻 cron 表达式**（仅当确需；MVP 暂缓，见 §14.4——由宿主定时器 + 日历计算节拍，不引调度服务）。
- 语义：到点**开一次执行**（可以是对同一持久身份 agent 注入任务，或按 `newSession: true` 开新 agent）。
- 生命周期状态机：`idle → scheduled → running → done | expired | canceled | faulted`

### 5.2 heartbeat（周期性注回同一会话续进）
- 定义：`{ id, interval_seconds, prompt, maxRuns, expiresIn, stepTokenBudget }`（**maxRuns / expiresIn / stepTokenBudget 均为必填**——H2 返修：heartbeat 与 schedule 同样受有界性铁律约束，不允许存在"无限累计"路径）
- 语义：向**同一持久身份**会话注入固定指令（如"复盘并继续当前目标"），让连续任务有上下文。
- 刻意轻量、可删可调频；改频率 = update 而非删重建（Paseo 由 delete+create 的别扭处，本设计直接支持 update）。
- 预算语义：每步注入前检查**插件自记账累计**（见 §8 `budget`），超限即暂停该 heartbeat 并上报（不依赖 tokenMeter 回合内闸门）。

### 5.3 loop（有界 worker-verifier 迭代）
- 定义：`{ id, workerPrompt, verifier?, maxIterations, maxTimeMs, interval }`
- 语义：每轮 worker 执行 → verifier 判定（shell check 或独立 prompt）→ 直到 PASS 或撞上限。
- 实现说明：loop 在宿主侧为「有界节拍的一部分」，worker 通过 heartbeat 注入机制驱动。

### 5.4 统一节拍引擎
三种原语共享同一**节拍 tick 循环**，但表面职责（注册表/工具/UI）彼此隔离。tick 由 `ctx.interval()` 驱动（默认基础节拍，如 1s/5s/1min 可配），每 tick：
1. 折叠持久账本，计算当前到期工作项；
2. 若到点 → 通过唤醒管道投递（§6.3）；
3. 记账、写 checkpoint、推进下一次；
4. 处理心跳活性与自愈信号。

---

## 6. 架构分层

### 6.1 Host 侧模块（运行于宿主进程）
```
continuous-worker (host)
├── pacemaker/       # 统一节拍引擎（ctx.interval 驱动）
├── registry/        # schedule/heartbeat/loop 持久注册表（session 日志折叠）
├── ledger/          # 每次执行的意图账本（checkpoint + 幂等键）
├── waker/           # 唤醒管道：agent.followup/steer/inject + runMaintenance
├── watcher/         # 心跳、闲置检测、循环检测、FATAL 判定（supervisor 语义）
├── guardrails/      # 预算闸门、成本闸门（token/磁盘）、可选 persona 强制闸、v0.6 凭据读排除/白名单门、供应链安装拦截、配置写保护（均挂 tools/pre-execute）
├── jobs/            # M7 返修：每个执行回合注册为宿主 job（ctx.jobs.start），获得 jobs 面板可见性 + onJobDone 唤醒路径
├── tools/           # 模型可见工具面（cw_*）
├── commands/        # 客户端/CLI 控制面（status/pause/resume/run-once/stop）
└── audit/           # 运行记录（事件流，机器可读）
```

### 6.2 数据层（持久化策略）
- **依赖 DSH 会话事件日志**（`session.append`）作为权威账本载体：schedule/heartbeat/loop 的定义、每次 create/update/delete/dispatch/run 都是事件；宿主重启后用折叠重建（沿用 dsh-schedule 的 fold 范式与 `persistence_uncertain` 防护）。
- **账本存放会话（显式声明，R2 补）**：注册表/账本事件**追加到 worker 持久会话**（沿用 dsh-schedule 的 `schedule/change` 追加范式），不另设控制会话；控制面（pause/resume 等命令）经宿主侧折叠读取，不依赖第二个会话。
- **意图日志（checkpoint）**：每次执行「意图 + 输入 + 所属任务 id + 幂等键」落盘（宿主文件如 `~/.dsh/profiles/<p>/continuous-worker/` 下 checkpoint 目录）。外部副作用以幂等键去重（调研 §8 verify-before-retry）。
- **不做**：Redis/Kafka/独立 Postgres、全量会话固化、自建向量库。

### 6.3 唤醒管道（与 DSH 能力的映射）
依据证据文档 §1（agent-loop 方法）与 §3（打包调研第 6 条：**自唤醒先例已存在**）：
| 需求 | DSH 原语（已实证） |
|---|---|
| 到点启动新回合 | `agent.followup(message)`（同 dsh-schedule / dsh-tool-jobs 投递路径） |
| 注入近期步/不打断 | `agent.steer()` / `agent.inject()` |
| 会话外确定性步骤 | `agent.runMaintenance(job)`（idle 时可认领） |
| 等空闲 | `agent.whenIdle()` |
| 取消/保留待处理 | `agent.cancel(cause, { keepInbox })` |
| 找/建目标会话 | 新建：`ctx.agents.create()`；**恢复持久身份：`agent-loop.resume(ownerCtx, { resumeSessionId })`（必须注入 `sessionPersistence` 后端，见 §6.2/§9.3）** |
| 监听生命周期 | `agent/created`、`agent/status`、`agent/inbox/claimed` 事件 |
| 消息来源标识 | `createUserMessage({ source: { kind: "plugin", plugin: "continuous-worker" } })` |

> **H1 返修（独立审查 R1）**：持久 worker 会话的**恢复必须走 `agent-loop.resume()`**，而不是 `ctx.agents.create()`——`create()` 会铸造全新会话（dsh-agent-loop `create()` L1189-1210），而 jsonl 持久层对已存在磁盘日志拒绝 materialize（dsh-session-persistence-jsonl L1156-1157）；正确路径是 `agent-loop.resume(ownerCtx, { resumeSessionId })` + `sessionPersistence` 注入（L1256-1259）。因此本插件 `inject` 必须声明 `sessionPersistence`，并且「找/建目标会话」按身份区分：**已有持久账本 → resume；首次 → create**。MVP 成功标准 3 的达成依赖此路径。

**关键先例（dsh-tool-jobs，最贴近"打工人"的现成实现）**：
- 它通过 `ctx.jobs.onJobDone((snapshot, owner) => ...)`：idle owner 用 `owner.followup(msg)`、busy 用 `owner.inject(msg)`；delivery 分 `quiet|wakeup`；`maxConsecutiveWakes=3` 防唤醒风暴；监听 `agent/inbox/claimed` 跟踪投递；注入 `systemPrompt.section` 说明使用方式。
- 这证明三件事：(a) 宿主侧"任务完成→自主唤醒归属 agent"是**平台级既有模式**；(b) 并发/唤醒节流有现成范式（busy→inject、连续唤醒上限）；(c) 我们只需在同样轨道上做"计划驱动"（到点主动投递+账本+自愈），而非重造消息机制。

### 6.4 确定性控制面（gate 语义）
X 项目的"控制器所有/DSH 认知/确定性执行"分层原则值得沿用到轻量形态：
- 插件只负责"何时唤醒、唤醒谁、预算与门、记哪本账"；
- 具体"发什么/做什么"由被唤醒的 agent 决定；
- 若 profile 挂外部 governor（如 X 的 bpc-operator MCP），插件把"到期触发"交给 governor 的授权门，自身只做节拍与记账。

---

## 7. 工具面（模型可见）

注册名都以 `cw_` 开头，注入准则说明。MVP 工具集：

| 工具 | 作用 |
|---|---|
| `cw_status` | 当前 worker 心跳、运行清单、失败率、成本、最后错误（只读） |
| `cw_schedule_create / cw_schedule_list / cw_schedule_delete / cw_schedule_update` | schedule 管理（承载 Kimi Claw 四要素：when/what/output/constraints） |
| `cw_heartbeat_create / cw_heartbeat_update / cw_heartbeat_delete / cw_heartbeat_list` | heartbeat 管理 |
| `cw_loop_start / cw_loop_stop / cw_loop_status` | 有界迭代循环 |
| `cw_pause / cw_resume / cw_run_once / cw_release` | 人类接管面 |
| `cw_persona_set / cw_persona_get`（Kimi Claw 对标） | 设定/读取"打工人"人格（名字、语气、输出格式、红线），持久化为版本化配置 |
| `cw_memory_retain / cw_memory_recall / cw_memory_forget`（v0.4） | 长期记忆分层操作（Agent OS MCP 使用方封装），见 §13.2 | 
| `cw_skill_list / cw_skill_use / cw_skill_learn / cw_skill_review`（v0.4） | 技能成长闭环，见 §13.3 |
| `cw_probe_create / cw_probe_list / cw_probe_delete / cw_probe_update`（v0.5） | 自驱巡检项管理，见 §13.7 | 
| `cw_diagnose`（v0.5） | 质量漂移自检（只读观测 + 降级触发），见 §13.8 |
| `cw_report`（v0.5，milestone/review/handover） | 汇报与复盘，见 §13.9 |
| `cw_credential_status`（v0.6） | 查看凭据配置状态（describe，不含值）——模型面只读；`cw_credential_declare` 限宿主/人工侧（H-A 返修），见 §13.12 |
| `cw_supply_verify`（v0.6） | 供应链信任分级查看/触发复核（T1-T4），见 §13.13 |
| `cw_supervision_matrix`（v0.6） | 查看任务类型→监督矩阵映射（只读）；`cw_supervision_set` 限宿主/人工侧（M-C），见 §13.14 |

> **M5 返修（persona 红线语义）**：`persona.constraints` 默认是**提示性自约束**（注入 prompt，供模型自觉遵守，可被自主 worker 自改——只留审计痕迹）。若配置 `guardrails.enforcePersona: true`，则红线升级为**宿主强制闸**：`guardrails` 模块在 `ctx.on("tools/pre-execute")` 钩子上按 persona 约束拦截违规工具调用（pre-execute 瀑布守卫先例：dsh-tools `ctx.waterfall(carrier, "tools/pre-execute", …)` / dsh-tool-jobs 同钩子），且 `cw_persona_set` 对已启用强制闸的字段要求人工确认。MVP 默认 `enforcePersona: false`（自约束），强制闸列为 M2 增强（§12 M2 已列）。
| `cw_work_order`（可选） | 执行期间向宿主登记"这一轮要做什么/完成度"（对接 goal 完成语义） |

**`cw_schedule_create` schema（四要素，对齐 Kimi Claw 模板 `At [time], do [task], output [format], follow [constraints]`）**：
```jsonc
{
  "when":   { "type": "string", "required": true },   // "every 5m" / "at 09:00 Asia/Shanghai"（MVP 仅 interval+特定时刻，cron 子集为 M3 增强）
  "task":   { "type": "string", "required": true },   // 做什么（提示词/目标）
  "output": { "type": "string" },                      // 输出格式（markdown/json/存档路径）
  "constraints": { "type": "string" },                 // 限制（maxRuns/预算/红线，可省）
  "maxRuns": { "type": "number" }, "expiresIn": { "type": "string" }
}
```
> 设计说明：`when/task/output/constraints` 与 Kimi Claw 模板同构，让用户/模型的既有习惯零迁移；`maxRuns/expiresIn` 是有界性的强制项（调研 P0③）。

工具 schema 遵循 `ctx.tools.register(defineTool({...}))` 契约（证据 §6/§3），含 `output.schema` 与 `render`；唤醒节流对齐 dsh-tool-jobs 先例（delivery quiet|wakeup、maxConsecutiveWakes、agent/inbox/claimed 预算重置）。

---

## 8. 配置面（settings）

通过 `ctx.settings.register` 暴露（Web 设置页可改，证据 §6）：
```
continuous-worker:
  baseIntervalMs: 5000        # 统一节拍基础（默认 5s）
  maxConcurrent: 1            # 并发执行数（默认 1 = 每 tick 至多派发一个 run）
                              # M4 返修：DSH 无全局模型锁；并发>1 需插件自建跨 agent 派发互斥
                              #   （单 tick 只派发一个 run；in-flight 不重复派发）
  budget:
    maxTokenPerRun: 200_000        # 每 run 插件自记账上限（H2：非 tokenMeter 回合内闸门）
    stepTokenBudget: 50_000        # 单步注入预算（H2 新增，必填项缺省）
    dailyTokenBudget: 2_000_000    # H2：全局日累计预算（跨工作项）
    maxDiskBytes: 500MB
    costGatesEnabled: true
    metering: "plugin-ledger"      # 计量来源：插件自记账（按 run/intent 累计）
```
> **H2 返修（独立审查 R1）**：`ctx.tokenMeter.measure()` 是**会话累计、请求边界**的度量（dsh-token-meter README：`measure()` 返回 request pressure + priced surface），**不能**作为"每 run 200k"的回合内闸门。因此本插件**不依赖 tokenMeter 做预算门**：预算计量走「插件自记账」——每次 followup 前，由插件按运行 intent 累计（入站 prompt 大小估算 + 出站 assistant 文本估算，或读取 `ctx.tokenMeter` 的 usage projection 做增量参考），超过 `maxTokenPerRun`/`stepTokenBudget` 即暂停该工作项并上报。tokenMeter 仅作为可观测参考，不作为 gating 输入。
  heartbeat:
    enabled: true
    fatalAfterConsecutiveFailures: 5   # supervisor 判死
    idleRoundsBeforeSleep: 3           # 闲置检测
    loopRoundsBeforeCorrect: 3         # 循环检测
    maxConsecutiveWakes: 3             # L5 返修：唤醒节流上限（对齐 dsh-tool-jobs 先例）
    delivery: "wakeup"                 # L5：wakeup|quiet（busy 时自动降级 inject）
  memoryScope:
    useAgentOSMemory: true             # 复用共享记忆 MCP
  persona:                              # Kimi Claw 对标：人格固化
    name: ""                           # 打工人名字
    tone: "professional|casual|…"
    outputFormat: ""                   # 默认输出格式（如三要点+风险注）
    constraints: []                    # 红线/自约束（版本化，可审阅；默认提示性，见 guardrails）
  guardrails:
    enforcePersona: false              # M5：true=红线升级为 tools/pre-execute 宿主强制闸（M2 增强）
    requirePersonaConfirm: true        # M5：强制闸启用时，cw_persona_set 改动需人工确认
  memory:                               # v0.4 打工人画像：记忆分层
    requireRetainReview: true          # 全部长期记忆写入需 review（含显式 retain，M3 返修，§13.2）
  skill:                                # v0.4 打工人画像：技能成长闭环
    requireSkillReview: true           # 技能沉淀默认 pending（接受需人工确认，§13.3）
    requireSkillReviewConfirm: true    # cw_skill_review「接受」需人工确认（防自批，M2 返修）
    autoLearnBelowConfidence: 0.7      # 仅 requireSkillReview=false 时生效（互斥，M2 返修）
    skillConfidenceSource: "ledger-stats"  # 置信度来自意图账本统计，非 worker 自报
  probe:                                # v0.5 员工素养：主动性巡检（§13.7）
    enabled: true
    baseIntervalMs: 3600_000           # 巡检节拍（小时级，比 schedule 宽）
    maxRunsPerDay: 96                  # 单个 probe 项每日上限（项级）
    dailyBudgetTokens: 50_000          # 全局巡检日预算（独立核算，不叠加任务预算）
    anomalyCooldownMs: 1800_000        # 异常风暴抑制（同信号 30min 内只记一次）
    defaultDisposition: "record+escalate"  # 默认只记+上报；"handle" 需显式开启
  diagnose:                             # v0.5 员工素养：自我诊断（§13.8）
    enabled: true
    everyRuns: 50                      # 每 N 轮或每日一次（宿主 watcher 触发）
    driftThreshold: 0.3                # 漂移检出阈值（相对基线）
    autoDowngrade: true                # 检出漂移自动降级一档（插件执行，复用 §9.4）
  report:                               # v0.5 员工素养：汇报节奏（§13.9）
    milestone: true
    reviewCadence: "daily"             # daily|weekly|off
    handoverOnDowngrade: true
    maxReportsPerDay: 10               # 常规汇报上限（紧急级别豁免，§13.9 规则 1）
    urgentExemptFromCap: true          # FATAL/红线/数据泄漏类紧急汇报不受上限约束
  credentials:                          # v0.6 安全三角：凭据生命周期（§13.12）
    requireDeclaredRefs: true         # 宿主侧白名单拦截：未声明引用的凭据解析动作 deny
    denyDirectAccess: true            # worker 不可直接触碰凭据值（宿主侧解析 + 读排除区）
    excludeFromWorker: [".credentials.yaml"]  # 凭据存储文件列入 worker 读/写排除区（H-A 返修）
  supplyChain:                          # v0.6 安全三角：供应链信任（§13.13）
    verifyOnInstall: true             # 安装时核对哈希/签名
    tiers: ["T1","T2","T3","T4"]     # 信任分级
    defaultSkillTier: "T3"            # cw_skill_learn 沉淀默认社区级
    reviewCadenceRuns: 500            # T3 定期复核周期
    enforceOnShellTools: true         # H-B 返修：pre-execute 拦截安装/下载/执行第三方代码
  supervision:                          # v0.6 安全三角：监督矩阵（§13.14）
    matrix: "builtin"                 # 内置矩阵（reviewed 变更需插件重载，M-A 返修）
    forbidSelfDowngrade: true         # worker 不可自降监督等级
    protectConfigFiles: true          # M-B 返修：插件配置/凭据存储为 worker 写排除区
  profile:
    newSessionPerSchedule: false       # schedule 默认注入同一持久身份
```

---

## 9. 生命周期与恢复语义

### 9.1 状态机（每工作项）
```
idle/scheduled → running → done | expired | canceled
                     ↘ faulted → (按预算+退避重试 | FATAL)
paused (人类接管) —— 任何状态可进/出 paused（cw_pause / cw_resume）
FATAL: 停自动重启 + 审计 + 上报；faulted 工作项不再被任何唤醒源派发（含心跳）
Down(宿主退出): 冻结; 恢复时折叠账本 → 从最近一致 checkpoint 续
```

### 9.1b FATAL 与回血语义（M1 返修）
- **FATAL 后禁止自动重启**：faulted 工作项在 FATAL 下**不得再被心跳或任何自动唤醒源派发**；心跳在 FATAL 期间仅做活性上报与呼救，不携带派发。
- **回血的唯一合法入口**：`cw_resume`（人类显式）或预算恢复判定（如日预算重置后由人工/宿主批准重启该工作项）。不存在"心跳自动回血"路径。

### 9.1c 派发失败退避（M2 返修）
- `followup` 抛错（agent disposed）或 `runMaintenance` 被 busy 拒绝（dsh-agent-loop L413）等派发/记账失败，**显式计入 faulted 状态机**并进入指数退避（如 1s→2s→4s→…封顶 5min），封顶重试次数计入 `fatalAfterConsecutiveFailures` 判定，防止"5s tick 无界次数空转"。

### 9.2 启动记账（supervisor 语义）
- 每次执行"启动"需维持最低存活时间 + 存活检查（如首条心跳写入）通过才算启动成功；
- 连续 `fatalAfterConsecutiveFailures` 次失败 → FATAL，停止自动重启，**仅保留心跳活性监听与呼救**（回血入口见 §9.1b，无自动回血路径）。

### 9.3 宕机恢复
- 冷启动：插件 start 时折叠持久账本，检测 in-flight 意图；未完成且无幂等键已确认的 → 标可重试；已确认的 → 跳过（verify-before-retry）。
- **持久 worker 会话恢复（H1 返修）**：插件启动后，对有持久账本的 worker 身份调用 `agent-loop.resume(ownerCtx, { resumeSessionId })`（要求 profile 已装 `dsh-session-persistence-jsonl` 之类后端并通过 `sessionPersistence` 注入），**而不是** `ctx.agents.create()` 铸造新会话。resume 失败（无持久化后端/日志缺失）时降级为只读折叠账本 + 标记需人工介入，绝不静默铸造一个"失忆"的新会话冒充原 worker。
- 对标 dsh-schedule 的 `persistence_uncertain`：任何读写先 `ctx.sessions.flush(session)`，屏障失败按不确定处理，不臆断。

### 9.3b 优雅停机收尾（M6 返修）
- 宿主退出（cordis dispose）时，插件在收尾窗口内（对齐调研 P1-14 的 gracefulShutdownTimeout 思想）：
  1. 停止节拍与后续派发；
  2. 对 in-flight 意图落**最终 checkpoint** 并标记 `retryable`；
  3. 等待 `agent.whenIdle()`（带超时上限）或直接标记后退出。
- 超时强杀仍可被冷启动折叠覆盖（§9.3 的 retryable 判定），收尾只是减少恢复时的不确定性。

### 9.4 降级阶梯（automaton 语义）
- Normal → **Low**（换便宜模型/降频/延后非关键任务）→ **Critical**（只保心跳+呼救）→ **FATAL/Dead**（主循环停、心跳监听回血）。
- 存活压力 = 预算、磁盘、用户注意力（薄成本闸门）。

### 9.4b 预算耗尽行为（H2 补充）
- 触发（任一）：工作项累计 token ≥ `maxTokenPerRun`，或单步 ≥ `stepTokenBudget`，或日累计超全局日预算。
- 计量时机（R2 补）：**计量点在派发前与回合结束后，回合中不打断**（自记账为派发前检查；回合内超 `stepTokenBudget` 在回合结束后检出，下一次派发暂停）——因 maxRuns+expiresIn+日预算封顶不存在无界路径，属可接受近似。
- 行为：该工作项进入 `faulted(budget)` → 暂停派发 → 上报（audit + 面板）→ 降级到 Low（若允许）或等待人工 `cw_resume`；预算不足不作为无限重试来源，不消耗 FATAL 计数（预算耗尽 ≠ 执行失败）。

---

## 10. 可观测与控制面

- **Web 面板（client 插件）**：展示心跳/活性、运行清单、失败率、token/磁盘成本、最后致命错误；操作按钮（pause/resume/run-once/stop/delete）。
  - client 实现遵循打包调研证据（docs/03 §1-2）：`exports["./client"]` 指向以 `window.__ModuleLoader__.load({ id: "dsh-continuous-worker", factory })` 自注册的 bundle（id 必须等于包名）；`dsh.client = { platform: "web", inject: [...] }`（对照 dsh-better-sidebar 的 `betterSidebar` 服务范式）。
  - **host→client 状态桥（L2 返修，2026-08-18 实装为 HTTP 端点）**：⚠️ 浏览器端与 host 的 Cordis Context 相互独立，host 的 `ctx.provide` 服务在浏览器端不可见（曾以 client `inject: ["continuousWorker"]` 注册导致 web boot 永久 pending：`waiting for service: continuousWorker`）。实装采用 dsh-web-billing 模式：host 端经 `ctx.webServer.register` 挂 `/continuous-worker` 只读查询 + 控制路由（GET `/status` 返回快照、POST `/control` 执行 pause/resume/stop/run-once/loop-stop），client 只 inject 平台服务（`slots`/`betterSidebar`），面板经 `fetch` 消费，5s 轮询刷新；更新频率与数据量受 `baseIntervalMs` 约束，不做客户端直连状态库。
- **模型只读状态**：`cw_status` 返回可机器读的 JSON（对齐 Codex `--json` 事件流思想，调研 §4）。
- **巡检/诊断视图（L-G 返修）**：面板新增 probe 列表视图（每项状态、最近异常、处置记录）与诊断健康视图（质量签名趋势、漂移检出历史、当前降级档位）——与 §13.7/§13.8 的账本折叠同源，只读渲染。
- **日志**：运行记录落在宿主日志目录，可回答"上次成功/失败/为何停"。
- **对接现有 UI 设施**：可用 `ctx.on("tools/post-execute")` 挂接审计钩子（verification 插件范式，证据已读）。

---

## 11. 部署与安装

- 包形态：host 插件 `apply(ctx, config)` + 可选 client 插件 + `cordis.patch.yml`（`dsh.bundle.patch` 声明）。
- 安装：`dsh plugin --profile <p> add dsh-continuous-worker`（等价 pnpm add，已实证 CLI `dsh plugin --profile web list` 等可用）。
- profile 内启用：cordis.patch.yml insert 一行（参照 chrome-faithful / bash-terminal 范式）。
- 前置兼容性：peer 对齐 `@deepseek-ai/cordis`、`dsh-tools` 等（参照 dsh-bash-terminal peerDependencies 写法）。

---

## 12. 里程碑（MVP → 增强）

### M1 地基（可控、有界、持久）
- host 插件骨架 + 统一节拍引擎 + schedule/heartbeat 注册表（会话事件折叠）
- 唤醒管道（followup/steer/inject）真实驱动一个演示会话
- 三计数器 + FATAL 判定 + 心跳活性
- `cw_status` 只读工具
- **凭据访问策略（v0.6 §13.12）**：cw_credential_declare/status + 宿主侧解析 + fail-closed（M1 就绪，因为外部动作从第一天就需要凭据边界）

### M2 控制与恢复（人类接管、幂等）
- pause/resume/run-once/stop 命令 + Web 面板
- checkpoint（意图日志）+ verify-before-retry/幂等键 + 宕机恢复
- 成本闸门（token/磁盘）+ 分级降级 Low
- persona 强制闸（`guardrails.enforcePersona: true` → tools/pre-execute 拦截 + 变更人工确认，M5 闭环项）
- **记忆分层（v0.4 §13.2）**：cw_memory_retain/recall/forget/review + 记忆四层载体落地（**程序记忆载体随 M3 技能闭环落地**，M2 覆盖工作/情景/长期三层）
- **责任链显式化（v0.4 §13.4）**：work_order 模型 + verification 证据绑定
- **主动性巡检（v0.5 §13.7）**：cw_probe_* + 异常处置三级 + 风暴抑制
- **自我诊断（v0.5 §13.8）**：cw_diagnose 质量漂移检测 + 自动降级触发
- **汇报节奏（v0.5 §13.9）**：cw_report milestone/review/handover + 防打扰上限
- **供应链信任（v0.6 §13.13）**：cw_supply_verify 信任分级 + 安装审批 + 来源入账本
- **监督矩阵（v0.6 §13.14）**：cw_supervision_matrix/set + permissionPresets 复用 + 禁自降级

### M3 循环与记忆（增值）
- loop 原语（有界 worker-verifier）
- 复用 Agent OS memory MCP（已验证持久事实存取）
- 交接工单生成（降级/重启时）
- 时间旅行/回放（**仅意图日志回放，用于审计**——L4 返修：明确不回放 LLM 执行，只回放 checkpoint 意图日志，符合调研"可重放的是意图日志"）
- **技能成长闭环（v0.4 §13.3）**：cw_skill_list/use/learn/review + 程序记忆沉淀

---

## 13. 打工人画像与员工素养、安全素养（v0.4/v0.5/v0.6 补强）

> 用户要求："作为一个打工人的特性呢？比如记忆、技能、工具、负责任等等。"——本节把插件从"任务执行器"升级为"有人格的打工人"，明确其**十三类**人化特性与员工素养、安全素养的机制与边界（十类基础素养 + v0.6 安全三角）。

### 13.1 总览：人化特性与成熟度

| 打工人特性 | 机制 | 落地状态 |
|---|---|---|
| 🧠 记忆 | 记忆分层：工作记忆 / 情景记忆 / 长期记忆 / 程序记忆（§13.2） | v0.4 新增 |
| 🛠 技能 | 技能成长闭环：调用 → 沉淀 → 升级（§13.3） | v0.4 新增 |
| 🔧 工具 | cw_* 管理面 + 宿主执行工具 + 唤醒管道（§7/§6.3） | 已有 |
| ⚖️ 负责任 | 责任链显式化：work_order + 审计 + verification 对接（§13.4） | v0.4 强化 |
| 👤 人格 | persona 固化配置（§8） | 已有（Kimi Claw 对标） |
| 🤝 交接 | Paseo 式交接工单（M3 里程碑） | 已设计 |
| 💰 成本意识 | 预算水位可见 + 自动降级（§13.5 / §9.4b） | v0.4 新增 |
| 🧭 主动性 | 自驱巡检 cw_probe（§13.7，与 schedule 分工） | v0.5 新增 |
| 🩺 自我诊断 | 质量漂移检测 cw_diagnose（§13.8） | v0.5 新增 |
| 📤 汇报节奏 | 里程碑/复盘/交班 cw_report（§13.9） | v0.5 新增 |
| 🔑 凭据安全 | 凭据生命周期（§13.12，复用 ctx.credentials） | v0.6 新增 |
| 📦 供应链信任 | 依赖/技能信任分级（§13.13） | v0.6 新增 |
| 🎚 监督矩阵 | 任务类型→sandbox/approval 映射（§13.14，复用 permissionPresets） | v0.6 新增 |

### 13.2 记忆分层（M2 增强）

> 依据：记忆类型学（项目/情景/程序/用户，调研全文 §2b/L254 与来源 #11 developersdigest）、AgentOS(framerslab) 记忆栈与 ConsolidationLoop（调研全文 §2b）、本机 Agent OS memory MCP 六工具（调研全文 L72 内证 + 本机 agentos-memory skill）。记忆不是单一存储，而是四层，各层载体与治理规则不同。

| 层 | 内容 | 载体 | 治理 |
|---|---|---|---|
| 工作记忆 | 当前任务上下文（本回合在做什么、上一步结果） | 会话上下文（DSH 会话自身） | 随回合自然推进，压缩负责淘汰 |
| 情景记忆 | 做过什么、结果如何（每轮执行史） | 意图账本（§6.2）+ 交接工单（§12 M3） | 只追加，可审计，折叠重建 |
| 长期记忆 | 已验证的持久事实（偏好/决策/红线/结论） | Agent OS memory MCP（memory_recall/retain/forget，项目+用户作用域） | 只存**已验证**事实、不存密钥；带来源/时间戳/作用域/过期 |
| 程序记忆 | 该怎么做（流程、审查清单、交接格式） | 技能库 + skills（§13.3） | 可审阅、可回滚、低于阈值自动学习需 review |

**设计规则**：
1. **分类纪律**：一次性观察不得自动进入长期/程序记忆（防"一次性笔记变规则"）。
   - **写入语义（M3 返修）**：`requireRetainReview: true`（默认）时，**所有**长期记忆写入（含显式 `cw_memory_retain`）进入 pending 待人工确认；`false` 时显式 retain 直接生效、自动采集仍需 review。规则 1 的"显式 retain 或经 review"二选一在默认配置下收敛为"全部需 review"。
2. **工作记忆不固化**：会话上下文不转写全量到磁盘（调研"明确不该做"⑨：存储膨胀+上下文腐烂）；只持久化已验证事实、意图日志、交接物。
3. **记忆即使用方 + 无旁路（M3 返修）**：插件不埋向量库/DB，作为 Agent OS memory MCP 的使用方。**Agent OS memory MCP 连接仅由插件宿主侧持有**，worker 只能经 `cw_memory_*` 访问——防止 worker 绕过审查门直呼 `memory_retain`（本机 agentos-memory 为独立 MCP，profile 配置不得向 worker 暴露直接接线）。

### 13.3 技能成长闭环（M3 增强）

> 用户痛点："打工人不该每次都是'第一次干这活'"。技能闭环 = 调用 → 沉淀 → 升级，让 worker 越干越熟。

**闭环四步**：
1. **调用**：`cw_skill_use <skill>` 调用 DSH 既有 skills（宿主 `dsh-tool-skill` 加载机制，真实存在）。
   - **注册机制（M1 返修）**：宿主 skill 扫描根仅为 用户/工作区/.bundled（`dsh-skill-filesystem` roots()，docs/03 §4）——**「插件随包分发 SKILL.md」≠「自动注册」**。因此插件安装/启用时，把自带的 SKILL.md **装入宿主扫描根**（如 `~/.agents/skills/<name>/SKILL.md`，本机先例：agentos-memory skill 正位于该根并被宿主识别）；若目标 profile 不写用户根，则在文档显式标注"随包分发需手动复制到扫描根"（docs/03 §4 要求），不承诺自动注册。
2. **沉淀**：每轮执行后，worker 可 `cw_skill_learn <name> <proven-steps>` 把「已验证有效的步骤/模板」存入程序记忆；沉淀需满足**证据门槛**（该步骤在本轮实际成功执行过，附意图日志引用）。
3. **升级**：`cw_skill_list` 展示技能库与使用统计（调用次数、成功率、最后使用时间）；`cw_skill_review` 审查沉淀项。
   - **防自批（M2 返修，沿用 M5 双轨）**：`cw_skill_review` 的「接受」操作**要求人工确认**（对齐 `requirePersonaConfirm`：`requireSkillReviewConfirm: true`），worker 不能自批自己的 pending 沉淀；或将 cw_skill_review 移出模型可见工具面（放 §6.1 commands/，仅人工/宿主可调用）。
4. **防污染**：自动学习低于阈值需 review（AgentOS 语义）。
   - **阈值语义（M2 返修）**：`autoLearnBelowConfidence` 仅在 `requireSkillReview: false`（无强制 review 面）时生效；`requireSkillReview: true` 时**所有**沉淀默认 pending，阈值不叠加。二者互斥关系在配置注释中明示。
   - **置信度来源（M2 返修）**：置信度不由 worker 自报——由插件从**意图账本统计**（该步骤历史成功率、复现次数、证据引用完整性）计算；无法计算时默认为低置信（需 review）。

**与 Kimi Claw 的关系**：Kimi Claw 的"5000+ skills 即时链式编排"是**调用面**的丰富度；本设计的增量是**沉淀面**——让打工人自己把干过的活变成技能，而不是永远靠外部技能库。

### 13.4 责任链显式化（M2 强化）

> 让"负责任"从审计痕迹升级为**显式模型**：每个公开动作 = 一张可追溯的 work_order。

**work_order 模型**（对接 verification 证据绑定）：
```
{
  workOrderId,           // 唯一
  timestamp,             // 发生时间
  actor: "worker",       // 谁做的（持久身份）
  action,                // 做了什么（工具调用/输出/外部副作用）
  evidenceRef,           // 依据什么（意图日志/证据文件引用）
  gatesPassed,           // 过了什么门（预算/红线/独立审查/verification AC）
  revertPath,            // 如何撤销（可逆动作的反向操作或人工介入通道）
  reviewStatus           // 待审/已审/已驳回
}
```

**设计规则**：
1. **公开动作必留 work_order**：对外部副作用（发布、写外部系统、删改他人数据）必须登记；纯内部推理可只留意图日志。
   - **强制点（M4 返修）**：外部副作用工具的 work_order 登记接到 **guardrails 钩子**——`tools/post-execute` 后置守卫对白名单外部副作用工具（可配置）自动生成 work_order（审计钩子先例：dsh-verification `tools/post-execute`），确保"必留"由宿主强制而非 worker 自觉；审计意图日志为兜底事实源。work_order 存储于 audit 事件流（§6.1 audit/，追加式、可折叠重建）。
   - **自证边界（M4 返修）**：`gatesPassed`/`reviewStatus` 不由 worker 自填——gatesPassed 由插件按当时实际通过的闸记录；reviewStatus 来自独立审查或人工确认（对齐 §14.9 风险）。
2. **对接 verification**：`gatesPassed` 引用 verification plan 的 AC 证据绑定（dsh-verification 插件范式，证据已读）；独立审查结论进 `reviewStatus`。宿主插件读取 verification 状态经 `ctx.get("verification")` 服务（如有）或工具路径，不绕过 ownerAgentId 作用域。
3. **persona 红线是责任边界**：红线（§8 persona.constraints）定义"打工人不对什么负责"（如不发表、不删数据）；`guardrails.enforcePersona: true` 时红线成为 pre-execute 强制闸（M5 闭环项），违规即阻断并留 work_order。
4. **可追溯可撤销**：每张 work_order 含 revertPath；FATAL/冻结状态下，work_order 审计是"为什么停、如何恢复"的权威来源。

### 13.5 成本意识（打工人有"预算感"）

- 复用 §8 budget + §9.4b：token/磁盘成本实时可观测（cw_status + 面板），超阈值自动降级。
- 新增语义：worker 的每次决策可读取当前预算水位（`cw_status` 返回 `budgetRemaining`），"钱快花完了"是它主动降级/求确认的信号——对齐 automaton 的"存活压力 = 预算"（调研 §5）。

### 13.6 v0.4 新增工具与配置

**工具面新增**（§7 补充）：
| 工具 | 作用 | 里程碑 |
|---|---|---|
| `cw_memory_retain / cw_memory_recall / cw_memory_forget / cw_memory_review` | 长期记忆分层操作 + 审查面（Agent OS MCP 使用方封装，M3 返修补 review） | M2 |
| `cw_skill_list / cw_skill_use / cw_skill_learn / cw_skill_review` | 技能成长闭环（review 接受操作需人工确认，M2 返修） | M3 |
| `cw_work_order`（v0.4 强化） | 登记公开动作的 work_order（存储：意图账本/audit 流；强制点见 §13.4 规则 1b） | M2 |

**配置面新增**（§8 补充，N4 返修：仅列出与 §8 的 diff，完整配置以 §8 为准）：
```yaml
  memory:
    requireRetainReview: true        # 全部写入需 review（含显式 retain，M3 返修语义）
  skill:
    requireSkillReview: true         # 技能沉淀默认 pending（接受需人工确认，M2 返修）
    requireSkillReviewConfirm: true  # cw_skill_review「接受」需人工确认（防自批）
    autoLearnBelowConfidence: 0.7    # 仅 requireSkillReview=false 时生效（互斥，M2 返修）
    skillConfidenceSource: "ledger-stats"  # 置信度来自意图账本统计，非 worker 自报
```

### 13.7 主动性：自驱巡检（P0，v0.5 新增）

> 用户洞察："现在的设计是雇主派活、到点干活——这是闹钟不是员工。"本小节补上"自己找活干"的能力。

**核心原语 `cw_probe`（巡检项）**：
```
{ id, kind, interval, check, onAnomaly: "record|handle|escalate", scope, enabled }
```
- `kind` 枚举（L-G 返修，MVP 固定集合，扩展需 reviewed 变更）：`disk` / `cost` / `dependency` / `external`（网页/接口/竞品信号）。
- `check` 形态（L-G 返修）：**确定性检查表达式**（宿主侧执行，如磁盘阈值比较、成本累计比较、HTTP 探针返回码/内容特征），不由模型自由发挥——probe 是确定性感知，异常后的**处置**（handle/escalate）才是认知环节。
- `scope`：`profile`（本 profile）或 `project`（cwd 作用域）。
- 与 schedule 的分工（不抢戏）：**schedule = 雇主派的活（to-do）**；**probe = 自己找的活（self-initiated）**。
  - **节拍关系（M-A 返修）**：probe 与 schedule/heartbeat 共享 §5.4 统一节拍引擎（同一 tick 循环），但**注册表与预算独立**——probe 走更宽的低频 tick（如小时级，`probe.baseIntervalMs`），异常才产生工作项，正常时零打扰；probe 项自身进入 §9.1 状态机（`idle → scheduled → running → done|faulted`），受同一 FATAL/退避语义约束。
- **异常处置三级**：`record`（记入意图账本）→ `handle`（worker 自行处理，受预算/红线约束）→ `escalate`（上报人类或生成交接物）。默认 `record + escalate`，`handle` 需显式开启且受 §13.4 责任链约束。
- 防失控：probe 有独立的 `maxRunsPerDay`（**计数对象 = probe 项级**：单个 probe 项每日至多 N 次，跨项汇总另有 `probe.dailyBudgetTokens` 全局巡检预算）/ 异常风暴抑制（同信号短时多次异常只记一次并降温），不产生无限任务流。

**设计规则**：
1. **probe 结果一律入账本**：每次巡检结论（正常/异常+证据）写入意图账本，可审计、可回看"什么时候开始异常的"。
2. **handle 受责任链约束**：probe 自行处理的动作视同公开动作（如写文件、发消息），必须走 work_order（§13.4）。
3. **不挤占任务预算**：probe 使用独立的巡检预算（`probe.dailyBudgetTokens`，如 ≤50k/日，单轮巡检 ≤5k），与 schedule/heartbeat 的 run 预算及 §8 `dailyTokenBudget` **并行记账**（L-B 返修：probe 预算独立核算，不与任务预算叠加；超出仅暂停巡检，不影响任务执行）。

### 13.8 自我诊断：质量漂移检测（P1，v0.5 新增）

> 用户洞察：watcher 只查"空转/循环"，不查"质量是否下滑"——好员工会发现自己状态不对。

**周期自检（`cw_diagnose`，低频，如每日一次或每 N 轮）**，检测项与数据来源：
1. **输出质量漂移**：输出长度/风格/证据完整性相对基线漂移（如引用缺失率上升、回复变短/变长失控）。
   - **数据来源（M-C 返修）**：§6.2 意图账本需扩展**每轮质量度量**——worker 会话折叠时记录每个 assistant 回合的轻量质量签名（长度、引用/证据链接计数、结构完整标记），随账本折叠重建；`cw_diagnose` 对这些签名做滚动基线比较。注意与 §13.2 情景记忆的关系：情景记忆"结果如何"是**语义层**（做了什么、成败），质量签名是**度量层**（每轮结构化数字），两者互补不冲突。
2. **重复失败率**：某类任务连续失败率上升（对齐 §9.1c 的退避/FATAL 统计，但这里是**质量**视角不是派发视角）。
   - **数据来源**：§9.1c 派发失败计数 + §13.4 work_order 的失败状态（质量视角聚合）。
3. **上下文健康**：上下文占用率、压缩频率异常（对齐 tokenMeter 的可观测投影，仅参考不作闸）。
   - **数据来源**：tokenMeter 可观测投影（只读参考）。
4. **成本异常**：单轮 token 消耗异常飙升（对齐 §9.4b 自记账）。
   - **数据来源**：§8 budget 插件自记账（每轮累计），跨轮比较。

**触发与执行主体（M-B 返修）**：`cw_diagnose` 是**宿主侧 watcher 定时触发**的维护任务（对齐 §9.1c 的退避统计与 §13.7 的 probe 节拍），**不依赖 worker 自觉调用**——watcher 到点经 `runMaintenance` 跑自检；检出漂移后的「自动降级」由**插件执行**（复用 §9.4 降级阶梯：Normal→Low），worker 只读结果。`cw_diagnose` 作为模型可见工具仅用于 worker **主动查询**当前健康快照（只读），不是"让它自己诊断自己"。

**处置**：任一漂移检出 → 记入意图账本 + 上报（面板/汇报节奏，§13.9）→ 插件自动降级档位（§9.4）→ 连续检出不改善则请求人工介入。**自诊断是只读观测 + 降级触发，不直接改 persona/红线**（防止"生病自己开药"）。

### 13.9 汇报节奏与复盘（P1，v0.5 新增）

> 用户洞察：现在只有"FATAL 呼救"和"等待人类"两个极端，缺正常的汇报节奏。

**三种汇报形态**（全部可配置开/关与频率）：
1. **里程碑汇报**（`cw_report milestone`）：大任务的关键节点完成时，向宿主/人类发一条结构化简报（做了什么、证据引用、下一步）。
2. **定期复盘**（`cw_report review`）：日/周复盘——做了哪些活、质量如何（引用自诊断 §13.8）、成本多少、明天/下周建议。对接 automaton 的周期复盘语义与 Paseo 交接工单格式。
3. **交班报告**（`cw_report handover`）：降级/暂停/宿主重启时产出"当前状态 + 已试方案 + 下一步建议"。
   - **里程碑归属（L-D 返修）**：M2 先实现**最小交接**（当前状态 + 下一步建议，来自意图账本折叠）；M3 交接工单模板（§12 M3）就绪后，handover 升级为完整 Paseo 式格式。二者不重叠：M2 是降级/重启时的应急快照，M3 是计划内交接模板。

**设计规则**：
1. **汇报是计划驱动、非打扰式**：汇报频率受节拍约束，不打断用户当前工作。
   - **送达通道（L-C 返修）**：汇报是**面向人类的通知**，走宿主通知/消息面（如会话消息、面板通知、邮箱/IM 桥接若配置），**不是 agent 的 inject 唤醒语义**（inject 是给 agent 自己的）；worker 会话内不因汇报被唤醒。busy 或超频时汇报**静默排队**，待空闲/下个节拍送达。
   - **与 escalate 协调（L-C 返修）**：`escalate`（§13.7 异常上报）计入 `maxReportsPerDay` 上限，但**紧急级别**（FATAL/红线违规/数据泄漏类）豁免上限、立即送达——上限只约束常规汇报，不压制紧急呼救。
2. **汇报内容有据**：每条汇报引用意图账本/证据，不自说自话。
3. **低置信请示**（对齐 §13.4）：worker 自认置信不足的关键动作，先 `cw_report milestone` + 请求确认，而非硬编（与 §4 原则 7"人类随时可接管"衔接）。

### 13.10 v0.5 新增工具与配置（diff）

**工具面新增**（§7 补充）：
| 工具 | 作用 | 里程碑 |
|---|---|---|
| `cw_probe_create / cw_probe_list / cw_probe_delete / cw_probe_update` | 自驱巡检项管理（§13.7） | M2 |
| `cw_diagnose` | 质量漂移自检（§13.8，只读） | M2 |
| `cw_report`（milestone / review / handover） | 汇报与复盘（§13.9） | M2 |

**配置面新增**（L-E 返修：probe/diagnose/report 配置已**并入 §8 主配置块**，此处不再重复；见 §8 `probe:` / `diagnose:` / `report:` 节）

### 13.11 安全三角总览（v0.6 新增）

> 用户洞察（上一轮结论）：work_order 审计解决"事后可追溯"，解决不了"事前可信任"。电子员工从"实验室玩具"走向"可托付办事员"的硬门槛是三个问题：**用什么身份调用外部服务（凭据）、装的第三方东西可不可信（供应链）、哪些动作有权自主做（监督）**。

**核心原则：复用平台原语，不自造安全机制。** 本机 DSH 已具备（证据：宿主源码 README 实测）：
- `ctx.credentials`（dsh-credentials）：凭据引用→值存 provider，`resolve(ref)` 每次操作解析不缓存，`describe()` 不含值，`set/unset` 受 shadowing 规则约束；
- `ctx.approval`（dsh-user-approval）：one-shot 审批（allowed-once/rejected/cancelled/unavailable），fail-closed，`ApprovalPolicy: ask|never`；
- `ctx.permissionPresets`（dsh-permission-presets）：预设捆绑 `sandbox/mode` + `approval/policy`（默认 `workspace-write`+`ask` / `danger-full-access`+`never`）；
- `ctx.sandboxPolicy`（dsh-sandbox-policy）：每调用解析 sandbox mode + workspace root。

本插件**不重造**这些机制，只在它们之上做三件编排：凭据访问策略（13.12）、供应链信任模型（13.13）、监督等级矩阵（13.14）。

### 13.12 凭据生命周期（P0，v0.6 新增）

**设计**：所有外部服务凭据走 `ctx.credentials`（引用→provider），插件层只定义「哪个动作需要哪个凭据引用」的映射，**永不持有值**。

| 环节 | 机制 | 依据 |
|---|---|---|
| 引用 | 配置/任务声明 `credentialRef("GMAIL_OAUTH")` 而非值 | dsh-credentials 教义：config 只带引用 |
| 解析 | 每次操作 `ctx.credentials.resolve(ref)`，不缓存 | 旋转后下一请求即生效，无需重启 |
| 描述 | `ctx.credentials.describe(ref)`（configured/writable，不含值）供面板显示 | 面板可渲染"已配置/来源/可写" |
| 写入 | `set/unset` 走 provider；shadowing 时 fail-loud | 环境变量层只读，避免"写了个看不见的" |
| 旋转 | 存储侧可观测轮换 → 平台发 `credentials/updated`（插件仅消费，刷新面板徽章）；**下个操作经每次 resolve 自动生效，与事件无关**（L-A 返修） | dsh-credentials README：环境变量变更不 emit，生效靠 resolve 不缓存 |
| 最小权限 | **宿主侧白名单拦截点**（H-A 返修）：任务声明所需凭据引用集合；guardrails `tools/pre-execute` 对凭据解析工具调用按「该动作声明了该引用？」拦截，未声明即 deny——**resolve 返回 undefined 只是"未配置"，不是拦截，拦截必须由插件钩子执行** | 防越权调用；详见边界 1b |

**边界**：
1. **worker 不可直接触碰凭据值**：凭据解析发生在宿主侧（如 MCP server / 工具执行器内），模型只见"已授权/未授权"，不见 secret。
   - **对齐范围限定（H-A 返修）**：dsh-credentials 的 Model Experience **仅限 LLM 适配器**（值永不进请求前缀），平台**不保证**任意工具执行器内解析的凭据不进模型视野——因此"worker 不可触碰"是**插件自己的强制承诺**，不是平台继承保证。
   - **凭据不可直读强制机制（H-A 返修）**：`$DSH_HOME/.credentials.yaml` 与凭据环境变量位于会话工作区根（$DSH_HOME = 工作区，实测），workspace-write 下 worker 可经 shell/文件工具直读。插件必须：① 把凭据存储文件（`.credentials.yaml`）与凭据环境变量列入 **worker 沙箱读排除区**（guardrails pre-execute 拦截对凭据存储文件的读/写/删改，及环境变量类读取工具）；② `denyDirectAccess: true` 时，凭据解析只经宿主侧包装的解析入口，通用 shell/文件工具不接触凭据值。
   - **启发式残差（Nit 2 返修）**：读排除靠路径/变量名单匹配（如 `.credentials.yaml`、凭据环境变量名），无法穷尽所有间接读取路径（如进程转储、子进程继承、符号链接别名）——这是**缓解而非绝对隔离**；残余风险由监督矩阵档位（不含通用 shell）+ 行为审计（§13.8）兜底，并在 §14 风险标注。
   - **白名单强制点（H-A 返修）**：`cw_credential_declare` 的**声明写入限宿主/人工侧**（模型面仅只读 `cw_credential_status`）；新增声明的解析工具调用走 guardrails 白名单门，防 worker 自授权。
2. **凭据不落记忆**：§13.2 长期记忆明确"不存密钥"；work_order 记录引用名不记录值。
3. **泄露应急**：怀疑泄露 → **人工/宿主侧** `unset`/provider 轮换（N-A 返修：worker 不可执行写/删）+ 全 worker 冻结该引用相关动作（对齐 §9.1 FATAL 语义的引用级变体）。

### 13.13 供应链信任模型（P0，v0.6 新增）

> 用户洞察：worker 会装依赖、用第三方技能——一个恶意技能就能让打工人"叛变"。DSH 平台对**技能来源**已有基础（dsh-skill-filesystem 扫描根），但**信任分级**是插件层要补的。

**信任分级**（每个外部依赖/技能/工具按来源分级）：
| 等级 | 来源 | 允许动作 | 审查 |
|---|---|---|---|
| T1 可信 | 宿主内置 / 本插件自带 / 用户亲手放入扫描根 | 全量执行 | 变更即审计 |
| T2 已验证 | 发布者签名/哈希核对通过 | 全量执行 | 安装时核对 |
| T3 社区 | 第三方市场（如 ClawHub 类比） | 受限执行（沙箱/审批/只读） | 安装+定期复核 |
| T4 未验证 | 未知来源 | 阻断（fail-closed），仅允许 inspect | 人工审批后降级为 T2/T3 |

**设计规则**：
1. **技能/依赖安装走审批**：T3/T4 安装触发 `ctx.approval.request`（ask 策略），T4 默认 `never` 直接拒绝。
2. **来源记录入账本**：每个已用技能/依赖的来源等级、哈希、安装时间写入意图账本（可审计、可回看"什么时候引入了什么"）。
3. **定期复核**：T3 依赖按配置周期重审（对齐 §13.8 自诊断节奏），等级可降级。
4. **供应链与技能闭环衔接**：§13.3 `cw_skill_use` 只允许调用 ≥T2 的技能；`cw_skill_learn` 沉淀的技能默认 T3（社区级），需人工提升。
   - **L-C 交互提示**：默认配置下 worker 每沉淀一个技能需一次人工提升才能复用——这是**有意摩擦**（防"自己写的东西自己信"），提升通道为 `cw_skill_review`（M-C 定义的人工确认通道）；T3 技能提升前的"受限执行"形态见 M-A 修法（映射 read-only + 工具白名单）。
5. **通用执行路径也纳入分级（H-B 返修）**：信任分级**不只拦声明式入口**（cw_skill_use / 声明式安装）——worker 会话默认持有通用执行工具（shell/文件），可 `npm install` / `pip install` / `curl | bash` 或自写脚本绕过分级。因此：
   - **强制点挂 guardrails**：`tools/pre-execute` 瀑布守卫（复用 R1 M5 先例：dsh-tools `ctx.waterfall(carrier, "tools/pre-execute", …)`）对**安装/下载/执行第三方代码类工具调用**（npm/pip/curl 管道 bash/克隆仓库/新脚本执行等模式）按 T 级 + approval 门拦截——T4 阻断、T3 ask、T1/T2 放行；
   - **默认档位取舍**：默认矩阵"内部推理/记忆 = read-only + never"档（与 §13.14 矩阵一致）**不含通用 shell**（该档只允许白名单工具）；需要通用执行的任务显式声明更高档位（走监督矩阵，见 §13.14），此时安装类调用受本条 pre-execute 门约束；
   - 自写脚本复刻技能步骤的检测是开放问题（§14 风险补充）：pre-execute 拦截安装模式，但"worker 用已装工具手动复刻技能逻辑"本质上等同于直接执行——由监督矩阵档位 + 成本/行为审计兜底（§13.8/§13.4）。

### 13.14 监督等级矩阵（P0，v0.6 新增）

> 用户洞察：现在"handle 需显式开启"是开关，不是系统。监督等级应是一张可按任务类型配置的矩阵——对齐 X 项目治理强度分层，但作为通用插件的可配置面。

**矩阵模型**（`sandbox/mode` × `approval/policy` × 任务类型）：
| 任务类型 | 默认监督 | sandbox（平台封闭词汇） | approval | 语义 |
|---|---|---|---|---|
| 只读巡检（probe） | 低 | read-only | never | 只读、自主、零打扰 |
| 内部推理/记忆 | 低 | read-only（无通用 shell） | never | 自主（H-B 返修：该档仅白名单工具，不含通用 shell） |
| 工作区写（代码/文件） | 中 | workspace-write | ask | 需审批（对齐 permissionPresets 默认） |
| 外部副作用（发布/发信/删改） | 高 | read-only + 工具白名单（M-A 返修：**sandbox 只管文件效果，网络/进程动作在词汇之外**，实际闸门是 approval + work_order） | ask（关键动作人工确认） | 走 work_order + 审批 |
| 管理动作（persona/技能/凭据） | 高 | read-only + 工具白名单 | ask + 人工确认 | 防自改（M5/M2 衔接） |

> **M-A 返修（平台词汇对齐）**：sandbox mode 是封闭词汇（read-only / workspace-write / danger-full-access，`./invariant` 拒绝词汇外事件）——原"受限"档**不存在**，已映射为 `read-only + 工具白名单`；外部副作用的实际闸门是 approval + work_order（sandbox 只管文件效果）。

**实现**：
1. **复用 `ctx.permissionPresets`**：矩阵行映射到 preset（sandbox+approval 捆绑），插件按任务类型选择 preset；平台已支持 per-session 生效与事件审计。
   - **预设表边界（M-A 返修）**：预设表是**进程级、插件生命周期内固定**（dsh-permission-presets README：改表需重载插件；`custom` 只能派生不能选择）——因此矩阵行须在**插件装载时注册为命名 preset**，运行期只做"任务类型 → 既有 preset"的重映射（不改表）；"matrix: builtin 可被 reviewed 变更覆盖"= 需插件重载的 reviewed 变更，在文档中明示。
   - **单持久会话换档（M-A 返修）**：worker 是单一持久会话（§3）；矩阵按派发实时切换用 `permissionPresets.set(workerSession, preset)`（创建时固定的只是 Settings 默认，set() 可改）。同一回合内多类型动作的档位归属 = **按当前派发任务类型**，回合内不换档（一个 work item 一个档位）；换档与并发互斥（maxConcurrent=1）串行，无并发竞争。
2. **任务类型→预设映射**：`cw_schedule/heartbeat/probe` 创建时声明 `supervision` 字段（默认取矩阵），运行期按类型解析。
3. **不可自降监督**：worker 不能自行降低自身任务的监督等级（矩阵写入需人工确认，对齐 persona 强制闸）；监督变更走 `permissionPresets.set` + 事件审计。
   - **M-B 返修（配置写保护）**：`settings.yaml` / `cordis.yml` / `.credentials.yaml` 均位于 $DSH_HOME 工作区根，workspace-write 的 worker 可直写配置绕过 `forbidSelfDowngrade`——因此插件把**自身配置目录与凭据存储声明为 worker 写排除区**（guardrails pre-execute 拦截对这些文件的写/删改；或移出工作区根）；配置变更统一走插件命令/面板（人工面），不进模型工具面。

### 13.14b 人工确认通道矩阵（M-C 返修）

> 设计多处依赖"人工确认"（T3/T4 安装审批、矩阵写入、技能/记忆 review、persona 变更），必须统一通道，否则宿主侧 out-of-turn 审批会抛错（`ctx.approval.request` 仅限开轮次内）。

| 场景 | 通道 | 说明 |
|---|---|---|
| 回合内动作（安装审批 / 外部副作用 / 关键动作） | `ctx.approval.request`（ask 策略，fail-closed） | 需在 worker 回合内触发；无应答者时 fail-closed |
| 回合外/宿主侧动作（矩阵写入、persona 变更、凭据声明、skill/memory review 接受） | **插件命令 + Web 面板确认**（§6.1 commands/，人工面） | 宿主侧触发的确认，不经 approval.request（out-of-turn 会抛错）；确认结果回写为事件/状态 |
| T4"人工审批后降级为 T2/T3" | **面板确认**（宿主侧） | 落在人工面，回写信任分级状态 |

**统一规则**：worker 回合内、且是工具调用边界的确认 → approval.request；其余一切"人工确认" → 插件命令 + 面板（人工面）。二者结果都记入意图账本（§13.4 work_order 的 reviewStatus）。

### 13.15 v0.6 新增工具与配置（diff）

**工具面新增**（§7 补充）：
| 工具 | 作用 | 里程碑 |
|---|---|---|
| `cw_credential_status` | 查看凭据配置状态（describe，不含值）——**模型面只读** | M1 |
| `cw_credential_declare` | 声明任务所需凭据引用——**限宿主/人工侧调用**（H-A 返修：worker 不可自授权；模型面不暴露该工具或调用即人工确认） | M1 |
| `cw_supply_verify` | 供应链信任分级查看/触发复核（T1-T4） | M2 |
| `cw_supervision_matrix` | 查看任务类型→监督矩阵映射——**只读** | M2 |
| `cw_supervision_set` | 调整监督矩阵映射——**限宿主/人工侧**（M-C 返修：经面板确认通道） | M2 |

**配置面新增**（M-D 返修：credentials/supplyChain/supervision 三节已**并入 §8 主配置块**，此处不再重复；见 §8 `credentials:` / `supplyChain:` / `supervision:` 节）

---

## 14. 风险与开放问题

1. **跨 process 持久化**：DSH jobs 契约进程内；若需要跨进程调度，需自建持久后端（调研 §3 边界）。MVP 接受"宿主即载体"。
2. **`ctx.interval` 粒度与 agent 唤醒延迟**：需要验证宿主定时器到 `agent.followup` 的真实延迟与跨 agent 并发语义（M4 返修：DSH 无全局模型锁，并发由插件自建互斥）。
3. **与 dsh-schedule 并存**：二者工具面互不冲突（`schedule_*` 会话内提醒 vs `cw_*` 有账本自主任务）；业务上由用户按场景选择其一。**不做 `useHostScheduleBackend` 中转桥**（M3 返修：host schedule 是会话本地、分钟级、无账本，无法等价承接 cw 语义；并存策略=文档级声明，不设伪配置）。
4. **cron 表达式采用范围**：MVP 只支持 interval + 极轻形式（`5m`/`1h`/特定时刻），cron 子集列为 M3 增强，防过度工程（L3 对齐）。
5. **会话冷掉语义**：遵循"cold 冻结，恢复续跑"；如果用户要求宿主未开也执行（真 7×24 冷启动），需 NSSM/Task Scheduler 包宿主 bootstrap（P2，调研 §6③）。
6. **派发失败退避（M2 返修）**：followup/runMaintenance 失败必须指数退避并计入 FATAL 计数，禁止 5s tick 无界空转（见 §9.1c）。
7. **记忆污染（v0.4 §13.2）**：一次性观察被自动提升为长期/程序记忆是"打工人变固执"的根因——写入门槛（requireRetainReview / autoLearnBelowConfidence）必须落地为真实 gate 而非 prompt 承诺。
8. **技能沉淀滥用（v0.4 §13.3）**：worker 可自写技能（cw_skill_learn）——若技能库成为它自我背书的工具，需 review 门槛 + 可回滚（requireSkillReview: true 默认）。MVP 阶段技能库只读（禁用 learn），M3 才放开。
9. **work_order 自我背书（v0.4 §13.4）**：若 work_order 的 gatesPassed/reviewStatus 由 worker 自己填写，则它只是审计痕迹不是责任闸——关键动作的 reviewStatus 必须来自独立审查或人工确认，不能由 worker 自证。
10. **probe 任务风暴（v0.5 §13.7）**：自驱巡检若处置不当会自我制造任务流——需 `maxRunsPerDay` + 异常风暴抑制（同信号降温）+ `defaultDisposition` 默认只记不自动处理；`handle` 显式开启且受责任链约束。
11. **自诊断误报（v0.5 §13.8）**：质量漂移检测是启发式观测，误报会导致无谓降级——检出漂移只触发降级与上报，不直接改 persona/红线；连续确认后才请求人工介入。
12. **汇报打扰（v0.5 §13.9）**：汇报若失控会反向打扰用户（busy 时经 inject 静默排队）+ `maxReportsPerDay` 上限；复盘/交班频率可配置关闭。
13. **凭据泄露/越权（v0.6 §13.12）**：凭据是电子员工最危险的资产——必须引用白名单 + 宿主侧解析 + 值不进模型上下文/记忆；怀疑泄露 → unset/轮换 + 引用级冻结。
14. **供应链投毒（v0.6 §13.13）**：第三方技能/依赖可能恶意——信任分级 fail-closed（T4 阻断）、安装审批、来源入账本、定期复核；一个恶意技能即可"叛变"打工人。
15. **监督矩阵失效（v0.6 §13.14）**：若 worker 能自降监督等级或绕过矩阵，则一切审批形同虚设——禁自降级 + 矩阵写入人工确认 + 权限事件审计 + 配置写排除区（M-B 返修）。
16. **通用执行旁路（v0.6 §13.13 H-B 返修）**：worker 可经 shell 装依赖/下载/执行第三方代码绕过分级——pre-execute 安装模式拦截覆盖声明式与通用路径，但"用已装工具手动复刻技能逻辑"等同直接执行，由监督档位 + 成本/行为审计兜底，属开放问题。

---

## 附录 A：对验证计划映射
- 设计完整性、证据可溯源性、无未决 Critical/High，见 docs/03-review-record（独立审查后生成）。

---

*v0.6：在 v0.5（员工素养，R4 PASS）基础上补充「安全三角」§13.11-13.15（凭据生命周期 / 供应链信任分级 / 监督等级矩阵），复用 DSH 平台既有安全原语（ctx.credentials / ctx.approval / ctx.permissionPresets / ctx.sandboxPolicy），不自造安全机制；R5 独立审查 FAIL（2 High）→ 返修 H-A/H-B + M-A~M-D + Low/Nit；R6 独立复审 PASS（无未决 Critical/High，含 1 Low + 2 Nit 收尾修复）。审查记录见 docs/03-review-record.md。*
