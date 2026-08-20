# DSH Preset 融入员工设计 · 方案 v5（复审 FAIL → 两行修正闭环）

> 复审（4488d2df）FAIL 结论 + 2 处必改（一行动作）：§9 `agent.session.meta` → **`agent.session.header`**（Session 只暴露 header）；§12 变量名 `employee-memory` → **`employee_memory`**（变量名限 `[a-z][a-z0-9_]*`）。v5 已修。
> 复审确认：机制层面（官方字段、factory 透传、header 持久、变量值免二次扫描、排除时机在 WorkerRuntime 构造前）全部核实成立，补两行后**方案即真正闭环，复审无需再审机制**。

---

## 1-8（v2 已核实部分，保留）

见 v2 对应章节（映射表 / 运行模型 / M1 对照坑 / 运行时强制方向 / 验证记录）。核心不变：
- `agents.create` 程序化不自动 mount → setup 显式 `agentPresets.mount(agentCtx, id)`（dsh-agent-presets:159 已核实）
- preset=agent.cordis.yml 插件组合；model 走 agentOptions；persona 是 system-prompt text section
- limits 运行时强制走 per-employee pre-execute + budget ledger（不靠 prompt 文本）

---

## 9. P0-4 ownerCtx / roots 白名单（v4 修订：平台合法载体）

**问题**：插件自身 `agent/created` 处理器（lib/index.js:945）只过滤 `roots().includes(agent)`——员工经 `agents.create` 创建（自身 sessionId、插件 ctx 作 owner）在 registry 视角**就是 root** → 处理器会照常给员工装整套 WorkerRuntime，控制面重复必然发生。

**机制选型（v4 修正：载体用平台官方字段，非自定义 meta 键）**：
1. **载体 = `meta.agentPreset`**（官方字段，dsh-agent:85 / dsh-session:77，持久于 session 头，语义恰为员工类型 preset）——员工 agent 创建时 `meta: { cwd, agentPreset: "employee-ops" }`（员工类型 preset id 用 `employee-` 前缀统一命名）
2. 插件 `agent/created` 处理器（index.js:945 附近）加排除：
   ```js
   // Session 只暴露 header（无 meta 字段）——读 header.agentPreset
   const preset = agent?.session?.header?.agentPreset;
   if (typeof preset === "string" && preset.startsWith("employee-")) return; // 员工 agent：跳过 WorkerRuntime
   if (!roots().includes(agent)) return;                                    // 现有过滤保留
   ```
3. 员工运行时强制（budget/权限/红线）由**员工级 pre-execute + ledger** 承担（§11），不依赖 WorkerRuntime
4. 备选（若 session.meta 读取不便）：sessionId 命名约定（员工 sessionId 统一 `w-` 前缀），处理器按 id 前缀排除

**判定点**：`lib/index.js` 的 `agent/created` 监听器（现 L945 附近）。M2 实现时用 fixture 验证 `session.header.agentPreset` 可读、排除生效（§8 补验证条目）。

## 10. 放行⑥ per-employee 派发队列（复审：整项遗漏，补完整章节）

**每员工一个 FIFO 队列**，任务串行派发（员工同一时刻只干一个任务）：
```
workers/<id>/queue.json      # { pending: [taskId...], running: taskId|null }
```
- **入口**：instructEmployee / schedule 触发 → `enqueue(id, task)`
- **路由**：队列头 → 员工 agent（agents.create/resume）→ 完成后出队取下一个
- **超限/暂停**：员工 paused 或 budget 超限 → 队列挂起（不丢，恢复后续跑）
- **与 ledger 联动**：每任务执行前查 budget ledger（§11），超限则不派发
- **换型**：员工换 preset 类型 = 新 session（§2④），队列不中断（新 session 接管）

## 11. budget ledger + per-employee pre-execute（P0-3 落成可执行规格）

**ledger 结构**（workers/<id>/ledger.json）：
```json
{ "date": "2026-08-18", "tokensUsed": 35000, "runsUsed": 12,
  "dailyTokensLimit": 200000, "dailyRunsLimit": 50 }
```
- 每日重置（date 变化时清零）
- 每任务/每工具调用记账

**per-employee pre-execute 注册点**（复用 M1 已验证模式，lib/index.js:960-1058 为模板）：
- M1 现有模式：host-ctx 监听 + `exec.agent !== agent` 过滤（root-only）
- 员工版：**在员工 agent 的 agentCtx 注册 scoped 钩子**（不过滤 exec.agent，因为员工 agent 就是自己）：
  - `limits.permissions.toolAllowlist` → 白名单外工具拒绝（deny）
  - `dangerTools: "ask"` → shell/write/network 触发 work order 审批
  - `limits.redLines` → rules-engine 检查（工具名/路径模式）
  - `budget` 超限 → 拒绝 + 标记 paused

## 12. {{}} 插值处理选型（v4 修正：变量通道）

**平台事实（v3 论证错误已修正）**：`renderContextSections` 对 **contexts 同样调用 interpolate**——context 原文不是 substituted value，会被扫描；成对 `{{name}}` 未注册 → throw，已注册 → 误替换。仅"substituted values 不二次扫描"保护**变量值通道**。

**选型（v4）：记忆走变量通道，灵魂走 section**
- **灵魂（静态）** → `ctx.systemPrompt.section({ name: "employee-soul", order, text: compilePrompt(灵魂, {}) })`
- **记忆（动态外部）** → **变量通道**（变量名只允许 `[a-z][a-z0-9_]*`，用下划线）：
  ```js
  ctx.systemPrompt.variable("employee_memory", () => memoryBundleText); // bundle 作为变量值（注册在员工 agentCtx，scoped）
  // section 文本以 {{employee_memory}} 引用 → 变量值免二次扫描，含 {{literal}} 不崩
  ```
- 变量值经 interpolate 拼接后不回溯扫描（system-prompt:60/143）→ 外部记忆含成对 `{{}}` 安全
- M2 用含 `{{literal}}` 的记忆 fixture 实测（§8 补验证条目）

## 13. 其余修正（复审 5 项收尾）

1. **resume 路径 mount**：`ResumeAgentOptions.setup`（dsh-agent:139）同样显式 `agentPresets.mount`（create/resume 双路径，放行①）
2. **complete 语义修正**：complete 是 **PromptSection 字段**（system-prompt:68 "restores this exact section as the sole prompt section"），非 preset 属性 → 表述改为"**员工 preset 内任何 section 不得带 complete:true**"；删除 v2"或 soul 注入放 prompt sections 而非 text"的误导表述（平台无独立于 text 的 prompt sections 通道，唯一机制是 systemPrompt.section）
3. **换型自检说明**：recompose 的 blank 检查由 **CALLER 负责**（dsh-agent-presets:256-258）——员工插件绕过 Web select 流时须自建 blank 检查，不能假设平台强制
4. **preset 类型库发现**：插件内置 preset 包通过 `agent-presets` 配置的 roots（config.roots）注入 discovery，非运行时注册
5. **诚实标注**：§8 未勾项（pre-execute 注册点实测 / ledger 对接 / {{}} 通道）在 M2 实现时按 §11/§12 落地并实测

---

## 14. 复审 5 项必补 → 完成对照

| 复审必补 | v3 位置 | 状态 |
|---|---|---|
| 1. P0-4 ownerCtx 白名单机制 | §9（meta.workerId + host 排除） | ✅ |
| 2. per-employee 派发队列 | §10（queue.json + 串行 + 挂起） | ✅ |
| 3. budget ledger + pre-execute 规格 | §11（ledger.json + scoped 钩子模板） | ✅ |
| 4. {{}} 处理选型 | §12（灵魂走 section，记忆走**变量通道** employee_memory） | ✅ |
| 5. resume mount + complete 修正 + 换型自检 | §13 | ✅ |


