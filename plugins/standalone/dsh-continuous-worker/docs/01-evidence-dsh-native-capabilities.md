# 证据笔记：DSH 原生能力（已实测）——支撑"常驻打工人"插件的事实基础

> 本文档记录从 DSH 宿主 checkout 与实际已装插件源码中**直接读到**的 API 证据。
> 所有结论均带来源路径，方案必须建立在下列真实能力之上。
> 生成时间：本会话 round 早期。供设计论证与独立审查核对使用。

## 1. 宿主侧"自主唤醒 agent"管道（决定性发现）

来源：`C:\Program Files\DeepSeek Harness\resources\host\node_modules\@deepseek-ai\dsh-agent-loop\lib\index.js`
（ReactLoopAgent 上的方法，约第 396-465 行）

Agent 实例公开下列宿主侧方法，**插件可调用它们主动驱动 agent，完全不需要用户输入**：

- `agent.send(message, target, wakeup)` — 向 inbox 注入消息；`target` 为 `next-turn` / `next-step`；`wakeup` true 时唤醒 driver
- `agent.followup(input)` — `send(input, "next-turn", true)`：入队下一轮并唤醒（与 dsh-schedule 到点投递同一路径）
- `agent.steer(input)` — `send(input, "next-step", true)`：近期步边界
- `agent.inject(input)` — `send(input, "next-step", false)`：入队暂不唤醒
- `agent.runMaintenance(job)` — **仅 idle 时可认领**，执行一段不受模型回合约束的宿主逻辑，结束后若 inbox 有 pending 则自动 `wakeDriver()`
- `agent.whenIdle()` — 等待 agent 完全空闲
- `agent.cancel(cause, opts)` — 取消当前活动（可保留 inbox）
- `agent.status` — `idle` / `running`（maintenance 视为 idle 状态位）

### 含义
"常驻打工人"插件的宿主端**不需要** hack 或轮询：可以直接：
1. 用 `ctx.agents.roots()` / `createAgent()` 找到/创建目标会话（**注：已有持久身份的会话应走 `agent-loop.resume()`，见 §2**——create 铸造全新会话，对已存在磁盘日志的会话会失败）；
2. 到期时 `agent.followup({...})` 投递一条「任务指令」消息，自动唤醒并开启新回合；
3. 需要固化状态时走 `agent.session.append(type, data)` 持久化事件（见 §3）；
4. 需要在会话外做确定性决策（预算、授权、gate）时用 `agent.runMaintenance(...)` + `whenIdle()`。

## 2. Agent 注册表服务（ctx.agents）

来源：`C:\Program Files\DeepSeek Harness\resources\host\node_modules\@deepseek-ai\dsh-agent\lib\types\index.d.ts`

- `ctx.agents.create(options: CreateAgentOptions): Promise<AgentHandle>` — 创建新会话/agent，返回 owned handle（**铸造全新会话**；已有磁盘日志的会话应走 `agent-loop.resume()`，见下）
- `ctx.agents.roots(): Agent[]` — 列出主机根 agent
- `ctx.agents.get(id)`、`ctx.agents.enter/announce` — 生命周期管理（**注：注册表无公开 `remove` 方法**，L7 修正：`dsh-agent/lib/types/index.d.ts` 的公开面含 create/resume/register/list/roots/get/enter/announce/requireInitiator/withInitiator 等，但没有 remove）
- `ctx.agents.requireInitiator()` — 拿到当前 act 的 agent（agent-loop 内部亦用此）
- `ctx.agents.withInitiator(agent, fn)` — 以某 agent 为发起者执行
- **恢复持久会话**：`agent-loop.resume(ownerCtx, { resumeSessionId })`（要求 `sessionPersistence` 注入；jsonl 后端对已存在磁盘日志的会话拒绝 create/materialize，正确路径是 resume）
- 事件：`agent/created`、`agent/status`、`agent/inbox/*`、`agent/session-start@Scoped<Agent>` —— 插件可监听（dsh-schedule 正是监听 `agent/created` 后在运行时根上安装）

## 3. 持久化：会话事件日志 + schedule 模式

来源：`@deepseek-ai/dsh-schedule`（lib 与 README）已读全量

- `agent.session.append(type, data)` — 向持久会话日志追加事件（schedule 用它追加 `schedule/change`）
- `session.events` + fold 模式 — schedule 通过 fold 事件流重建状态；**打工人插件应沿用同一持久折叠范式**（不信任内存态，崩溃后从日志重建）
- `ctx.sessions.flush(session)` — 持久化屏障确认；成功才承认变更，失败返回 `persistence_uncertain`
- inbox 自身是**持久化的**：`agent/inbox/spliced` 事件落日志——宿主投递的消息冷会话后仍可恢复，恢复时按序处理
- `fork` 只折叠 `seedLength` 之后的事件，不继承父会话 reminder——这是平台既定策略

### 关键局限（必须写进方案的设计约束）
- Schedule/session 均为**会话本地**：会话冷掉（进程退出/未恢复）= 不执行。
- 官方 `ctx.appExit` 由启动器持有：headless profile 在 `dsh` 启动器外会报错。

## 4. 定时能力：cordis-plugin-timer（ctx.timer）

来源：`@deepseek-ai/cordis-plugin-timer\src\index.ts`（已读全量）

- `ctx.timeout(cb, delay)` / `ctx.interval(cb, delay)` / `ctx.throttle` / `ctx.debounce` — 挂进 Cordis effect，随上下文释放
- 定义于 module augmentation：`Context extends Pick<TimerService, ...>`
- 打工人插件的宿主调度器（秒级/分钟级 tick）可直接用 `ctx.interval()` 实现，销毁自动挂钩 context 生命周期

## 5. 后台任务注册表：ctx.jobs

来源：`@deepseek-ai/dsh-jobs\README.md`

- `ctx.jobs.start(spec)` → JobId；spec 含 `owner`（可挂某个 agent）与 `run()` 生产器
- `get/list/read/kill/wait/onJobDone/onJobsChanged`
- 宿主插件可在自己作用域内启动、让打工人任务拥有自己的后台任务 UI（jobs 面板）
- 已知局限：契约仅进程内（跨进程需自建持久后端）

## 6. 模型工具注册：ctx.tools + defineTool（已装插件实证）

来源：`{{DSH_USER_HOME}}\profiles\web\node_modules\dsh-bash-terminal\`

- 宿主插件 `apply(ctx, config)` 内用 `ctx.tools.register(defineTool({ name, description, parameters, output, execute, presentCall, presentResult }))`
- `inject: ["tools", "systemPrompt", "shellEnv", "subprocess", "settings", "sandbox", ...]`
- `ctx.systemPrompt.section({ name, order, text })` 向模型注入使用说明
- `ctx.settings.register(namespace, schema, { base })` 注册可配置项（用户可在设置页改）
- `ctx.get("jobs")` 取注册表、`ctx.subprocess.spawn(...)` 起子进程
- Cordis `apply` 插件写法 + `export const name` + `inject`；插件名唯一

## 7. 插件打包/分发元数据

来源：`dsh-bash-terminal/package.json` 与 `cordis.patch.yml`

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "platform": "web",
    "immediately": true,
    "inject": ["@deepseek-ai/dsh-client-runtime", "..."]
  }
}
```

- Host 插件 = `lib/index.js` 导出 `apply`；客户端插件 = `dist/client.js`（esbuild 打包）
- bundle patch：`- insert: - id: tool-bash-terminal name: 'dsh-bash-terminal'`
- 安装到 profile：`dsh plugin --profile <p> add <pkg>`（或 pnpm pack + tarball）
- 目录：`cordis.patch.yml`、`lib/`、`dist/`（client）、`src/`、`package.json`（`dsh.bundle.patch` 声明）

## 8. X 项目（治理强度最高的现有参照）

来源：`{{PLUGIN_SOURCES_DIR}}\X\deploy\dsh-profile\cordis.patch.yml`（已读全量）

- bpc-operator profile = "DSH 认知受限 + 确定性 Python 控制面主导发布"的最高治理形态
- MCP stdio 桥：`@deepseek-ai/dsh-mcp-client` 拉起 `bpc_operator.mcp_server`，`failOnStartupError: true`
- schedule：`everySeconds: 300` 配置注入固定 prompt（调 `operator_status` + claim 一个 work item）
- goal：`@deepseek-ai/dsh-goal` + round driver 驱动长目标
- X 的架构结论：**调度决定"何时可以发布"，DSH 决定"发什么"，Python 决定"是否真的发布"**。我们的打工人插件应复用同一"控制器所有/DSH 认知/确定性执行"分层，而不是覆写它。
- X 的 AGENTS.md 明确：Schedule 是 session-local、非冷恢复；leader 会话冷掉即冻结——插件需设计冷启恢复/冻结语义。

## 9. 本会话环境事实（为部署 section 用）

- 用户 profile：`web`（GUI 正在用的 profile）、`bpc-operator`、`headless`、`verify`、`litkit-test`
- 本地模型：`dgx-spark-vllm` → `deepseek-v4-flash-0731-ablit`（settings.yaml），另有 Qwen3-VL 视觉
- `web` profile 已装：chrome-faithful、dsh-bash-terminal、dsh-better-sidebar、dsh-plugin-manager、dsh-web-billing、verification 全家、Agent OS bundle、vision-toolkit、modsearch/modlens、genui
- headless profile 的 cordis.patch 为空（可用作"打工人插件必须自带清醒/常驻编排"的干净宿主）

## 待调研确认项（交给两路外部调研）
- 外部项目（Paseo/AgentOS/worker 平台）的可移植机制与必避误区
- n8n/Windmill/Temporal 的持久队列、幂等 attempt、恢复语义
- DSH 插件生态里"宿主侧持续执行"的最佳实践与已踩的坑
