# dsh-continuous-worker v2 设计规格（方案 B）

> 状态：用户于 2026-08-20 明确认可方案 B。
> 本文是 v2 的产品与架构基线；旧版 `docs/02-design.md` 及各 M1-M5 文档仅作历史材料。
> 本阶段只在隔离 worktree 中开发和验证，不重启 DSH、不切换在线插件、不迁移现有数据。

## 1. 产品定义

v2 不是“会定时发消息的聊天会话”，而是 DSH 内的受治理 AI 员工运行时：

> **AI 员工 = 持久身份 + 长期职责 + 有界任务 + 隔离执行 + 明确权限 + 可验证结果 + 经批准的成长。**

员工可以长期存在，但每次工作都在一个新的、可追踪的 `Run` 中执行。连续性来自受控状态、交接物、记忆和技能版本，不依赖无限增长的聊天上下文。

### 1.1 用户首先感知的对象

1. **员工 Employee**：它是谁、负责什么、允许做什么、向谁汇报。
2. **任务 Assignment**：长期或一次性的工作约定，包含触发规则、完成标准、预算和工作区。
3. **执行 Run**：任务的一次具体尝试，具有独立上下文、状态、日志、证据和结果。
4. **审批 Approval**：对高风险动作、权限变更、人格变化和技能晋升的人工决定。
5. **成长提案 Proposal**：员工根据证据提出的记忆、技能、习惯或人格变更；提案不等于生效。
6. **团队 Team**：多个员工的有向无环协作图。数据模型先支持，编排在后续阶段开放。

### 1.2 核心用户旅程

#### 创建并入职

1. 用户先描述一项要 7x24 持续推进的工作。
2. 系统生成可编辑的员工身份、职责、边界和首批任务建议，而不是让用户先选固定角色模板。
3. 用户从受信任列表或系统目录选择器中选择工作区；不要求手输路径。
4. 员工复述使命、完成标准、权限和第一班计划。
5. 用户确认后任务才进入可调度状态。

#### 日常运营

1. Supervisor 只在任务到期且门禁通过时认领工作。
2. 每次 Run 创建隔离执行上下文，加载最小必要身份、任务、记忆和技能。
3. 执行器产生显式结构化结果；验证器在执行之后检查结果和证据。
4. 面板展示计划摘要、关键决策、工具动作、证据、成本、风险和最终结果，不展示原始思维链。
5. 失败、阻塞、等待审批和不确定副作用是正常且可见的状态，不被伪装成“完成”。

#### 成长

1. Run 可以提出记忆、技能、习惯或人格变更。
2. 提案绑定来源 Run、证据和可撤销版本。
3. 低风险事实也必须经过确定性校验才可晋升；人格、权限和治理规则必须人工批准。
4. 候选模型永远不能控制自己的评价、权限、预算、晋升、回滚或紧急停止。

## 2. 成功标准与非目标

### 2.1 v2 Core 成功标准

- 一个插件作用域只有一个 Supervisor；不会因打开多个聊天或根目录产生重复调度器。
- 员工身份持久，Run 隔离；Run 不能通过 `idle` 被误判为成功。
- 到期任务采用原子认领、有限租约和幂等键；两个 Supervisor 竞争时最多一个获得执行权。
- 宿主在执行前、执行后、外部副作用前后任一位置崩溃，都有确定的恢复状态。
- 外部副作用结果不明时进入 `uncertain`，默认不自动重试。
- 存储使用带 schema 版本、应用标识和启动校验的 SQLite；损坏或版本不兼容时拒绝启动 v2 写路径。
- 工作区路径先规范化再做边界检查，不能利用前缀、符号链接或大小写绕过。
- v1 数据只做只读发现和迁移预演；没有备份、哈希、预演结果和用户批准时不写入 v1 或激活 v2。
- 测试至少覆盖状态机、并发认领、租约过期、崩溃恢复、重复投递、取消、显式结果、路径边界和不确定副作用。

### 2.2 本阶段非目标

- 不重启 DSH，不替换活动包，不修改 profile/global 配置。
- 不承诺 DSH 桌面完全关闭后仍运行。桌面宿主在线且机器不休眠时可常驻；真正闭桌面运行需要后续 headless/service 方案和单独授权。
- 不实现团队递归委派或嵌套团队。
- 不自动安装 Skill、MCP、CLI、模型或插件。
- 不自动修改员工人格、权限、预算、红线或控制面代码。
- 不在没有当前 DSH 实际界面截图的情况下拍板颜色、字体、圆角、卡片样式等视觉语言。

## 3. 架构

```text
Dedicated Workbench / API
          |
          v
  Application Service  -----> Approval / Policy Engine
          |                              |
          v                              v
   Single Supervisor ------------> Execution Adapter
          |                    fresh isolated DSH agent per Run
          v                              |
   SQLite Control Store <------- explicit finish_run envelope
          |
          +---- audit events / evidence / migration preview
```

依赖方向是单向的：领域契约不依赖 DSH；存储和策略实现领域端口；Supervisor 只编排端口；DSH Adapter 隔离宿主细节；HTTP/UI 只调用应用服务。旧版模块不能被 v2 核心反向调用。

### 3.1 建议目录

```text
lib/v2/
  domain/          # 枚举、状态转换、校验、错误与结果协议
  store/           # SQLite 打开、迁移、事务和仓储
  supervisor/      # due scan、lease、dispatch、recovery
  execution/       # 执行端口、DSH adapter、finish_run 捕获
  policy/          # 工作区、能力、预算、审批、副作用门
  migration/       # v1 只读发现、规范化、预演报告
  api/             # 与聊天 root 无关的 v2 应用服务/HTTP handler
  host/            # 单例装配与生命周期
test/v2/
  helpers/         # fake clock、fake executor、临时数据库
  *.test.mjs       # 行为、集成与故障注入测试
```

## 4. 领域模型

所有 ID 都是在控制面创建的不可变 UUID；外部输入不得直接决定数据库主键。

### 4.1 Employee

```text
Employee {
  id, name, status,
  identityPrompt, identityVersion,
  defaultWorkspaceId?, modelPolicyId,
  capabilityPolicyId, budgetPolicyId,
  createdAt, updatedAt, archivedAt?
}
```

状态：`draft | active | paused | archived`。员工被暂停后不能产生新 Run，但已有 Run 按取消策略收敛。

### 4.2 Assignment

```text
Assignment {
  id, employeeId, title, instruction,
  triggerKind, triggerSpec, timezone,
  acceptanceContract, outputContract,
  workspaceId, riskClass,
  maxAttempts, timeoutMs,
  concurrencyKey, enabled,
  nextDueAt?, createdAt, updatedAt
}
```

`triggerKind` 的 v2 Core 子集为 `manual | interval | once`。日历/cron 在 core 稳定后增加。触发规则、时区和下一次时间由确定性代码计算，模型不得自行解释时间后直接写队列。

### 4.3 Run

```text
Run {
  id, assignmentId, employeeId, attempt,
  idempotencyKey, state,
  leaseOwner?, leaseExpiresAt?,
  sessionId?, startedAt?, finishedAt?,
  resultEnvelope?, verification?,
  failureCode?, failureDetail?,
  createdAt, updatedAt
}
```

状态机：

```text
planned -> claimed -> executing -> verifying -> succeeded
                    |            |          \-> failed
                    |            \------------> blocked
                    |                         -> uncertain
                    \-------------------------> cancelled
claimed/executing --lease recovery-----------> planned | uncertain
```

约束：

- `succeeded` 只能从 `verifying` 进入，且必须同时存在有效 `resultEnvelope` 和 PASS 验证记录。
- `idle`、断开连接或空响应都不是终态证据。
- 已宣告外部副作用意图但缺少回执的 Run 恢复为 `uncertain`。
- 无副作用且没有开始证据的过期 claim 可以重排为 `planned`，同时增加恢复事件。
- 终态不可逆；重试生成新 Run/attempt，不回写旧 Run 为 `planned`。

### 4.4 ResultEnvelope

执行上下文只通过控制面注册的 `finish_run` 协议提交终端候选结果：

```json
{
  "protocolVersion": 1,
  "runId": "uuid",
  "correlationToken": "one-use-secret-reference",
  "outcome": "completed | blocked | failed | needs_approval",
  "summary": "面向人的简短结果",
  "artifacts": [{ "kind": "file | url | record", "ref": "...", "sha256": "..." }],
  "evidence": [{ "kind": "command | test | observation | receipt", "ref": "..." }],
  "sideEffects": [{ "intentId": "uuid", "receiptRef": "...", "status": "confirmed | rejected | unknown" }],
  "proposals": [{ "kind": "memory | skill | habit | persona", "ref": "..." }]
}
```

校验要求：版本、Run ID、一次性关联令牌、枚举、大小上限、引用格式均通过；同一 Run 只接受第一个有效 envelope。`completed` 只是“执行器声称完成”，随后仍须进入 `verifying`。

### 4.5 Approval 与 SideEffectIntent

审批状态：`pending | approved | rejected | expired | consumed`。批准绑定员工、Run、动作摘要、精确参数哈希、风险类别、有效期和单次 nonce。参数、权限或策略版本变化会使批准失效。

副作用状态：`declared | executing | confirmed | rejected | unknown`。顺序固定为：

1. 在事务内写 `declared` 意图与参数哈希；
2. 检查审批、预算和幂等键；
3. 执行外部动作；
4. 写不可变回执引用并转为 `confirmed/rejected`；
5. 若 2 与 4 之间崩溃，恢复为 `unknown` 并要求对账或人工处理。

## 5. SQLite 控制存储

v2 使用插件自有 SQLite 文件，不把自定义高频事件写进 DSH 会话日志。建议文件名为 `continuous-worker-v2.sqlite3`，位于宿主为该插件提供的 profile 状态目录。

本机 DSH `@deepseek-ai/dsh-session-query-sqlite` 已提供可信先例：它动态导入 `node:sqlite`，检查 `application_id`/`user_version`/未知表，设置 journal mode，并在失败时关闭数据库后抛错。`dsh-storage-domain` 虽然提供单 domain 串行写和单 key 原子 `update`，但没有 v2 跨表状态转换所需的关系约束和多记录事务，因此不作为控制存储。

### 5.1 打开与启动门

- 生产运行要求 Node 22 的 `node:sqlite`；不提供退化为直接 JSON 写入的路径。
- `PRAGMA application_id = 1129797170`（ASCII `CWV2`）。
- `PRAGMA user_version` 表示 schema 版本；只允许逐版本、事务化、可重复验证的迁移。
- `journal_mode=WAL`、`foreign_keys=ON`、有限 `busy_timeout`、`synchronous=FULL`。
- 打开后执行 `quick_check`、应用标识、版本范围和关键表/索引校验。
- 文件为空可初始化；非空且 application_id 不匹配、版本过新、校验失败或迁移中断时，v2 写路径 fail closed。
- 关闭时 checkpoint WAL；不得把 checkpoint 成功当作整个运行时正确性的证明。

### 5.2 核心表

- `employees`
- `workspaces`
- `assignments`
- `runs`
- `run_events`（只追加，事件有单调 sequence）
- `run_results`
- `verification_records`
- `approvals`
- `side_effect_intents`
- `usage_ledger`
- `proposals`
- `schema_migrations`

关键唯一约束：`runs(idempotency_key)`、`run_results(run_id)`、`side_effect_intents(idempotency_key)`、`approvals(nonce)`。所有时间存 UTC 毫秒整数，展示层负责时区。

## 6. Supervisor 与恢复

Supervisor 是插件级单例，不以聊天 root、目录或 UI 页为生命周期边界。

### 6.1 Tick

每个 tick 在短事务中：

1. 确认实例没有被停止且存储健康；
2. 将到期 Assignment 物化为具有唯一幂等键的 `planned` Run；
3. 采用条件更新认领最多 `maxConcurrent - activeCount` 个 Run；
4. 提交事务后才调用执行器；
5. 记录 dispatch 事件和会话 ID；
6. 执行器结束后写候选结果并调用验证器；
7. 根据验证结果进入终态或有界重试。

模型调用、工具执行和网络 I/O 不得占用 SQLite 写事务。

### 6.2 Lease

- claim 写 `leaseOwner` 和 `leaseExpiresAt`，并通过 `WHERE state='planned'` 保证原子性。
- 正在执行的适配器按固定比例续租；续租只能由当前 owner 完成。
- Supervisor 停止后不再续租；下一实例按恢复矩阵判断，而不是直接完成或盲目重跑。
- 实例 ID 是进程启动生成的随机值，不作为员工或 Run 身份。

### 6.3 恢复矩阵

| 观察到的状态 | 副作用证据 | 恢复结果 |
|---|---|---|
| `claimed` 且无 dispatch/session | 无 | 过租约后重新排队 |
| `executing` 且 session 未启动 | 无 | 过租约后重新排队 |
| `executing` 且 session 已启动 | 无副作用意图 | 取消旧 session，生成新 attempt |
| `executing/verifying` | 有 `declared/executing` 且无回执 | `uncertain`，禁止自动重试 |
| `verifying` | 有完整 result envelope | 重新运行确定性验证器 |
| 任意终态 | 任意 | 保持终态，仅允许对账/查看 |

## 7. DSH 执行适配器

`ExecutionPort` 的最小接口：

```js
start(runContext, { signal, onLeaseHeartbeat, onEvent })
  -> Promise<{ sessionId, envelope }>
cancel(sessionId, reason)
reconcile(sessionId)
  -> Promise<{ status: 'running' | 'stopped' | 'missing', envelope? }>
```

适配器职责：

- 每个 Run 创建新的隔离 agent/session，不复用员工聊天上下文。
- 编译最小 system context：员工身份版本、Assignment、工作区策略、预算、允许能力、相关记忆摘要、结果协议。
- 注册只对当前 Run 有效的 `finish_run` 工具或等价受控结果通道。
- 将 token/tool/elapsed 使用量写入真实 usage ledger；不能用“工具调用次数”冒充 token。
- 捕获 abort、timeout、transport error 和宿主停止；保持它们与业务 `failed/blocked` 不同。
- 绝不因 agent 变为 idle 自动构造 `completed`。

本机 DSH rc.7 接口支持这条路径：`ctx.agents.create({ sessionId, meta, agentOptions, setup })` 在公开 agent 前完成 scoped setup；setup 可在 `agentCtx.tools` 注册只属于该 Run 的工具和单调 guard；返回的 `AgentHandle.dispose()` 会停止并排空 loop、注销 agent/session 并回收 scope。DSH 自己明确说明 `whenIdle()` 只表示整个 agent 暂时静止，不能识别某条消息的完成，因此 v2 仅把它用于排空/清理，不用于业务成功判定。

如果本机 DSH API 无法可靠地回收显式 envelope，适配器保持未支持并阻止激活；不能退化为 idle 推断。

## 8. 策略、工作区与能力

### 8.1 工作区

- 工作区由控制面登记为 ID + 规范化真实路径；用户界面选择已登记项或调用宿主选择器。
- Windows 路径比较处理盘符、分隔符、大小写和 UNC 语义；WSL/Windows 映射在登记时固化。
- 使用真实路径/最终路径处理符号链接和 junction，再做组件级 containment；字符串 `startsWith` 不可作为边界判断。
- 不存在、不可访问、位于禁止根或发生路径漂移时拒绝 dispatch。

### 8.2 能力与审批

- 每个工具调用同时受员工能力策略、Assignment 风险策略、工作区范围、Run 预算和宿主原生权限约束。
- `deny` 优先；未知工具、未知风险分类、策略解析失败一律拒绝。
- 文件写、命令执行、网络、消息发布、账号动作、安装、凭据、配置、删除分别记为显式能力，而不是一个宽泛“自动工作”开关。
- 高风险动作要求参数哈希绑定的一次性批准。批准不能被模型生成、延长或复用。

## 9. 验证器

验证在执行完成之后运行，并与执行器隔离。

验证层次：

1. **协议验证**：ResultEnvelope 完整、相关、未重放。
2. **确定性验证**：文件存在/哈希、命令退出码、schema、测试或专用 checker。
3. **策略验证**：预算、审批、工作区和副作用回执一致。
4. **语义验证**：只有 AcceptanceContract 明确需要时才使用独立模型；其输出仍只是验证记录，不能改控制面。

`succeeded` 要求所有 MUST 条件 PASS。证据不足得到 `blocked` 或 `failed`，不是乐观成功。

## 10. API 与工作台信息架构

v2 API 以插件作用域资源为中心，不接受聊天 root 作为必需路由参数：

- `GET/POST /continuous-worker/v2/employees`
- `GET/PATCH /continuous-worker/v2/employees/:id`
- `GET/POST /continuous-worker/v2/assignments`
- `POST /continuous-worker/v2/assignments/:id/run`
- `GET /continuous-worker/v2/runs`、`GET /continuous-worker/v2/runs/:id`
- `POST /continuous-worker/v2/runs/:id/cancel`
- `GET/POST /continuous-worker/v2/approvals`
- `GET /continuous-worker/v2/health`
- `POST /continuous-worker/v2/migration/preview`

所有写请求要求严格 Content-Type、同源/可信 Origin、anti-CSRF token 或宿主等价机制、body 上限、schema 校验和审计 actor。主机校验解析 IP/hostname 后做精确 loopback 判断，不用后缀或子串匹配。

### 10.1 工作台（后续 UI 阶段）

固定信息架构：

- 左侧 DSH 独立入口“AI 员工”。
- 总览：谁在工作、谁被阻塞、下一次执行、今日成本、待审批、健康异常。
- 员工页：身份/职责、任务、最近 Runs、预算、能力、记忆与成长版本。
- Run 页：时间线、计划摘要、动作、证据、结果、验证、失败/不确定原因。
- 审批中心：动作、参数差异、影响范围、过期时间、批准/拒绝。
- 设置页只放设置，不承载日常运营。

本机 DSH 已暴露原生目录选择能力：`ctx.directoryPicker.capability()` 返回 `native`（OS 目录选择器）或 `browse`（宿主侧目录列表/创建），客户端已有 `dsh-client-ui-workspace` 和 native/browse flow。v2 UI 必须复用该能力，未知 capability 时隐藏选择入口并拒绝手工绕过，而不是另造文本路径框。

视觉实现必须先捕获当前 DSH 实际界面及同类页面，沿用宿主设计系统，再制作和对比原型；历史 PNG 不能作为当前界面证据。

## 11. v1 兼容与迁移

迁移分四个彼此独立的阶段：

1. **Discover**：只读扫描 v1 worker/schedule/checkpoint 文件，记录路径、大小、mtime、哈希和解析错误。
2. **Normalize**：将可识别数据映射为 v2 候选对象；不写数据库。
3. **Preview**：输出新增、冲突、丢失字段、危险路径和无法迁移项；结果绑定源哈希。
4. **Apply**：未来经用户明确批准后，先做可恢复备份并验证哈希，再在一个新 v2 数据库事务中导入。绝不原地改写 v1。

旧 API 在过渡期只能提供明确标注的 legacy 读取；v2 核心不能同时写 v1 与 v2，避免双写分叉。

## 12. 可观测性

- `health` 分开报告 store、supervisor、executor、verifier、migration 和 host adapter 状态。
- 每次状态转换写不可变 `run_events`，包含 actor、旧/新状态、reason code、时间和相关证据引用。
- 日志默认脱敏；敏感参数只存哈希或安全引用。
- 队列深度、claim 延迟、Run 时长、失败率、uncertain 数、审批等待、token/费用按员工与 Assignment 统计。
- “在线”表示 Supervisor 心跳新鲜；“正在工作”表示存在有效租约的 Run；两者不得混用。

## 13. 验证阶梯

每一级只证明自己的范围：

1. 领域单元测试：状态机、schema、时间和策略。
2. SQLite 集成测试：迁移、约束、事务、WAL、并发认领。
3. Fake-host 故障测试：任意断点崩溃、取消、重复消息、迟到结果、租约失效。
4. DSH adapter contract 测试：创建隔离 session、显式结果、abort/reconcile。
5. 构建测试：客户端和插件入口。
6. 非活动副本 smoke：加载 v2 但不调度真实工作。
7. 单员工单任务 canary：经用户批准后在活动宿主执行无副作用任务。
8. 重启恢复与长时 soak：经用户批准后验证真实重启、睡眠/唤醒和连续运行。
9. UI 视觉/交互验收：实际浏览器截图、同视口对比和核心流程操作。

只有 1-5 通过时，结论是“源码/适配器候选可用”；不能称为已上线或真正 7x24。

## 14. 分阶段交付

### Phase 1 — v2 Core（当前）

领域契约、SQLite store、Supervisor/lease/recovery、policy/approval/side-effect、显式结果协议、执行端口、最小 v2 API、v1 迁移预演、fake-host 故障测试。与旧入口并存但默认不激活。

### Phase 2 — DSH Adapter 与安全 canary

接入本机实际 DSH agent lifecycle、工具门和 usage 信号；先在非活动副本验证，再申请单任务 canary。任何无法获得显式结果的路径保持 fail closed。

### Phase 3 — 工作台重设计

在捕获当前 DSH 设计系统后实现独立入口、总览、员工/任务/Run/审批页面，并完成真实浏览器 QA。

### Phase 4 — 记忆、技能与成长

实现证据绑定的提案、校验、批准、版本化、回滚和保留策略；控制面冻结在候选模型之外。

### Phase 5 — 团队 DAG

提供 sequential/parallel/role-review 编排、结构化交接物和并发预算；禁止递归委派。

### Phase 6 — 迁移与常驻部署

执行哈希绑定迁移、活动副本切换、restart/soak 验证；若用户需要桌面关闭后仍运行，再单独设计和授权 headless/service。

## 15. 关键决策与放弃项

- 选择插件内部重写而非继续修补 v1：v1 的调度、员工队列、结果和安全链路结构性分离。
- 选择 SQLite 而非 JSON/JSONL 主状态：需要原子认领、约束、并发与可验证迁移。
- 选择“持久员工 + 临时 Run”而非永生会话：降低上下文污染、恢复歧义和跨任务权限泄漏。
- 选择显式结果 + 后置验证而非 idle 推断：状态可审计且不会假成功。
- 选择单 Supervisor 而非每 root pacemaker：消除重复调度和重复审批。
- 暂不做 cron 全集、团队编排、自动技能安装和闭桌面服务：先证明最小可信闭环。

## 16. 参考产品原则

- Hermes Cron：隔离的新会话、明确 attempt 状态、`unknown` 不自动重跑、脚本型 watchdog。
- Hermes Security：人工批准、文件沙箱、凭据过滤和跨会话隔离。
- Claude Subagents：独立上下文、定制 prompt/tools/permissions。
- Claude Agent Teams：团队能力仍有限，且不支持嵌套团队，说明 core 不应依赖递归委派。
- Grok 类后台任务：可借鉴后台执行和 hooks，但安全关键 hook 必须 fail closed。

参考链接：

- https://hermes-agent.nousresearch.com/docs/user-guide/features/cron
- https://hermes-agent.nousresearch.com/docs/user-guide/security
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-teams

本机接口证据：

- `@deepseek-ai/dsh-session-query-sqlite/lib/index.js:35-68,81-116`
- `@deepseek-ai/dsh-storage-domain/lib/types/domain.d.ts:1-8,36-77`
- `@deepseek-ai/dsh-agent/lib/types/index.d.ts:65-117,142-195,280-296`
- `@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:39-45,74-97`
- `@deepseek-ai/dsh-tools/lib/types/index.d.ts:598-622`
- `@deepseek-ai/dsh-host-directory-picker/lib/types/index.d.ts:1-22,58-81,107-125`
