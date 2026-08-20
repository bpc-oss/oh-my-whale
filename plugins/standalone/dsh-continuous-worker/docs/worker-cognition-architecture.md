# 员工认知架构 · 架构/工程优化方案

> 定位：对 `worker-cognition-design.md`（认知 7 系统）与 `worker-creation-design.md`（创建流程）的**架构/工程化打磨**。
> 核心决策（用户已定）：**员工角色不预设，最终由 PROMPT 定义**——"任务 → AI 生成员工 prompt → 这个 prompt 就是员工的灵魂"。
> 本方案回答：这个"灵魂"如何结构化、如何生成与版本化、七大认知系统如何落地为数据与代码、如何 7×24 常驻、如何多员工协作、与现有 lib/ 怎么对接、风险怎么防。
> 依据：`lib/workers.js`、`lib/index.js`、`lib/registry.js`、`lib/checkpoint.js`、`lib/memory.js`、`lib/skill.js`、`lib/persona.js`、`lib/waker.js`、`lib/pacemaker.js` 实测代码。

---

## 1. 员工 Prompt Schema（JSON 结构 + 生成流程 + 版本管理）

### 1.1 核心工程决策：JSON 定义 + 编译器，定义与渲染分离

"Prompt 是员工的灵魂"要落到运行时，必须拆成两个东西：

- **定义层（数据）**：一份结构化 JSON（`prompt.json`），是员工唯一的事实来源。UI 编辑它、引擎读取它、版本管理存它。
- **渲染层（文本）**：一个纯函数 `compilePrompt(promptJson, memoryBundle) → systemPrompt`，在**每次派发任务时**把 JSON 编译成注入给模型的系统提示词。

不把"prompt 文本"直接当定义。原因：文本无法被 UI 结构化编辑、无法被路由/权限引擎消费、无法做字段级 diff 与回滚。JSON 是给 LLM、UI、引擎三方共用的中间语言。

### 1.2 Schema（三段式：`soul` / `limits` / `meta`）

```
workers/<id>/prompt/current.json
```

```json
{
  "schemaVersion": 1,

  "soul": {
    "identity": {
      "name": "小七",
      "role": "运维工程师",
      "emoji": "🛠",
      "visual": { "hair": "blue", "outfit": "coverall" }
    },
    "description": "负责 7×24 监控服务器（磁盘/内存/进程/告警），异常自动处理并汇报，擅长 shell 脚本与日志分析",
    "mission": "让服务器稳定运行：提前发现、快速恢复、如实上报",
    "skills": [
      { "name": "服务器监控", "tools": ["read", "grep", "shell"], "keywords": ["监控", "磁盘", "内存", "进程"] },
      { "name": "日志分析", "tools": ["read", "grep"], "keywords": ["日志", "error", "排查"] }
    ],
    "persona": {
      "tone": "严谨",
      "style": ["先规划后执行", "异常即时报", "汇报用清单不用散文"],
      "quirks": "喜欢在日报里用 emoji 标注严重级别"
    },
    "workflow": {
      "planFirst": true,
      "reportFrequency": "daily",
      "escalation": "error-first",
      "maxAutonomy": "handle-routine-escalate-risk"
    },
    "values": ["安全 > 效率", "数据准确 > 速度", "不隐瞒异常"],
    "rules": ["不删除用户工作区之外的文件", "对外部系统操作前先请示"]
  },

  "limits": {
    "budget": { "dailyTokens": 200000, "dailyRuns": 50, "maxCostPerDay": 1.0 },
    "permissions": {
      "dangerTools": "ask",
      "network": "ask",
      "toolAllowlist": ["read", "grep", "shell", "write"]
    },
    "redLines": ["never-write-outside-workspace", "no-secret-leak", "no-unbounded-retry"]
  },

  "team": {
    "role": "dev",
    "mode": "pipeline",
    "upstream": null,
    "downstream": ["tester"],
    "peers": []
  },

  "meta": {
    "modelHint": "fast",
    "version": 3,
    "createdAt": "2026-08-19T10:00:00Z",
    "updatedAt": "2026-08-20T09:00:00Z",
    "source": "llm-generated",
    "generation": { "fromTask": "帮我 7×24 盯着服务器", "seedPrompt": "...", "model": "deepseek-v4" }
  }
}
```

**为什么这么组织（三方消费矩阵）**：

| 消费方 | 读哪段 | 用途 |
|---|---|---|
| **LLM** | `soul` 全段 + `limits` 摘要 + 记忆注入 | `compilePrompt` 渲染成 system prompt |
| **UI** | `soul.identity/persona/skills` + `team` + `meta` | 员工卡、就职档案编辑、团队视图、成长页 |
| **引擎** | `description`+`skills[].keywords`（路由）、`limits`（治理）、`team`（编排）、`meta.modelHint`（选型） | 派活匹配、权限/预算、协作、模型档位 |

**关键治理边界：`limits` 不进 prompt 生成**。`redLines`/`permissions`/`budget` 由引擎在编译时从**治理配置**（员工级治理策略，见 §2.2）合并进 prompt 并加盖"引擎戳"，**绝不接受 LLM 生成或员工自改**——防止"prompt 自我授权"。LLM 只能填写 `soul`（软约束），硬约束永远来自引擎。`soul.rules` 是软红线（注入提示词），`limits.redLines` 是硬红线（结构化执行，见 §2.2）。

**编译规则（compilePrompt 的固定节序）**：

```
[身份] identity → "你是 {name}，{role}。{description}。"
[使命] mission
[技能] skills（已接受技能名 + 一句话，详细步骤按需取）
[性格] persona → tone/style/quirks
[工作方式] workflow
[价值观] values
[软红线] rules
[团队] team 位置（我向谁交接/接收谁）
[记忆上下文] memoryBundle（见 §2.1.6，≤2000 tokens）
[治理声明] limits 摘要（引擎生成，只读）
[思维协议] 任务前写 PLAN / 决策写 DECISION / 完成后写 REFLECT（见 §2.3）
```

每次 dispatch 重新编译——因为记忆每时每刻在变。编译结果带版本号 `prompt.vN + memoryHash`，可审计"这次跑的是哪版灵魂"。

### 1.3 生成流程：模板 + LLM 混合 + 校验门

```
① 任务描述 ──► ② 模板草稿（确定性，即时）──► ③ LLM 精修（可选按钮）──► ④ 校验门 ──► ⑤ 用户编辑 ──► 版本 v1
```

- **② 模板层（引擎内确定性逻辑，零成本）**：任务文本 → 关键词分类器（运维/开发/测试/写作/数据/设计预设库，20 个以内预设角色模板）→ 产出带缺口的草稿 JSON（identity/skills 骨架 + 空白 persona/workflow/values/rules）。保证 100ms 内出结果、可离线。
- **③ LLM 精修（向导里"AI 生成"按钮触发）**：把 `草稿 + 任务原文 + schema + 填充指令` 发给 LLM，要求只填 `soul` 的空字段。**约束手段**：① schema 写进生成 prompt 并强制 JSON 输出；② 解析失败重试一次；③ 每个自由文本字段硬长度上限（persona 合计 ≤ 300 tokens、values ≤ 5 条、rules ≤ 8 条），防画像膨胀。
- **④ 校验门（生成质量保证，引擎强制）**：
  1. schema 校验（schemastery/zod，与 `prompt-schema.js` 同源）；
  2. `description` 非空且 ≤ 80 字（路由依据不能缺失）；
  3. 编译后 system prompt 的 `soul` 部分 ≤ 预算（如 1200 tokens），超了拒绝并提示精简；
  4. 敏感扫描：拒绝含密钥/路径模式/自我授权语（"可以访问任何系统"）的 rules；
  5. `rules` 与 `limits.redLines` 无冲突（如 rules 说"可删任何文件"但 redLines 禁删 → 拒绝）。
- **⑤ 用户编辑**：UI 表单直接改 JSON 字段（不是改文本），每次保存 = 新版本（见 1.4）。编辑过的字段标记 `editedByHuman: true`，后续自动演化不再覆盖该字段（防"你改完它又改回去"）。

**谁调生成**：生成器作为插件工具 `employee_prompt_generate(taskText, preset?) → {ok, promptJson, issues}` 暴露，向导（创建流程步骤②）调用；也支持"基于现有员工再生一版"（换任务时复用）。

### 1.4 版本管理：不可变快照 + 回滚 + 演化走草稿

```
workers/<id>/prompt/
  current.json          # 当前生效版本（软指针指向 versions 里某条）
  history.jsonl         # append-only：每行 {version, prompt, changedBy, reason, diff, at}
```

- **版本语义**：每次变更（LLM 生成、用户编辑、演化批准）追加一条历史，`version+1`，`current.json` 原子替换。旧版本永不修改——行为可复现："这个员工在 v2 时干过什么"可回溯。
- **回滚**：UI 一键把 `current` 指回 vN → 下一次 dispatch 即用旧灵魂。回滚本身也是一次变更（记 reason: "rollback to v2"）。
- **变更来源分级**：
  - `human`（用户编辑）——直接生效；
  - `llm-generated`（创建时）——直接生效（创建向导已展示给用户确认）；
  - `evolution`（自我演化，见 §2.4）——**只能产生 draft**，人格字段（identity/persona/values/rules）必须用户批准才成为正式版本；低危的习惯类演化可自动小步生效并记 diff。
- **UI diff**：版本列表 + 字段级 JSON diff（哪个字段从什么变成什么、谁改的、为什么）。这是"可追溯"在 prompt 层的体现。
- **试运行（进阶，可选）**：演化 draft 批准前可开"shadow 模式"——新版本跑下 N 次任务，成功率低于旧版自动放弃。首版不做，列为 P2。

---

## 2. 七大系统的工程实现

### 2.1 多层记忆（数据 / 存储 / 时机 / 注入）

**存储布局**：每个员工从"单 JSON"升级为**一个目录**（见 §5 迁移）：

```
workers/<id>/
  employee.json        # 元数据（name/cwd/model/status + prompt 版本指针 + 治理）
  prompt/              # §1.4 版本库
  chat.jsonl           # 工作记忆（已有，加 taskId 字段）
  timeline.jsonl       # 情景记忆（结构化事件日志，新增）
  knowledge/           # 语义记忆（每条一个 JSON，复用 memory.js 模式，新增员工作用域）
  skills/              # 程序记忆（复用 skill.js 模式，员工级，新增）
  habits.json          # 习惯记忆（新增）
  thinking/            # 思维留痕（§2.3）
  growth.json          # 成长轨迹（派生，§2.4）
```

#### ① 工作记忆（会话内）
- **数据结构**：`{role, text, at, taskId?}`（现有 chat 条目加 `taskId` 关联当前任务）。
- **存储**：`chat.jsonl`。**写入时机**：每次指令/回复追加。
- **注入**：本身就是对话上下文。工程关键在**膨胀控制**：会话超过 N 条（如 60 条）时，旧段由引擎压缩为一段"会话摘要"（用低成本模型把 40 条压成 200 字摘要，存 timeline 的 `kind:"digest"` 条目），会话只保留最近 20 条 + 摘要。这就是 Ralph loop 模式下"新鲜上下文 + 持久摘要"的核心手段。

#### ② 情景记忆（timeline）
- **数据结构**：`{id, taskId, kind: "task"|"incident"|"milestone"|"digest"|"handoff", summary, result: "success"|"partial"|"failed", keyFacts: string[], durationMs, tokens, at, links[]}`。
- **存储**：`timeline.jsonl` append-only（每任务 +1 条，由反思阶段产出 summary/keyFacts）。
- **写入时机**：任务完成、异常事件、交接发生、会话摘要生成。
- **注入**：新任务到达时，引擎按"任务关键词 × timeline"做轻量匹配，取最近 K=3 条**相似任务**（每条 ≤ 80 词）+ 总是带上 timeline 尾部 5 条（最近干了什么，成本极低）。注入格式："上次类似情况：…（结果：成功/失败）"。

#### ③ 语义记忆（knowledge）
- **数据结构**：复用现有 `MemoryStore` 条目 `{id, fact, scope, source, state, expiresAt, tags[]}`，扩展 `tags`（检索键）与 `scope`（`profile` 全局 / `worker:<id>` 员工私有 / `project:<cwd>` 项目共享）。
- **存储**：`knowledge/` 每条目一文件（与 memory.js 一致，迁移复用）。
- **写入时机**：每次任务反思沉淀 0..2 条经验；用户反馈立即写入；工作区事实学习（低频可选项：扫描工作区生成项目知识）。
- **注入**：**起步用关键词/tag 轻量检索，不依赖向量库**——新任务描述 + 当前 prompt 的 description/skills 关键词 → 匹配 `tags` → top-5 注入（每条 ≤ 60 词）。为将来预留 `embeddingProvider` seam（可插拔向量检索，接口先定，实现后补）。
- **治理**：复用 `requireRetainReview` 的人审通道，但员工级知识默认按**置信度分级**：高置信（有明确结果 + 来源 + 重复观测）自动 active，低置信 pending 等人审——照搬 skill 的 `computeConfidence` 模式，避免每次沉淀都打扰用户。

#### ④ 程序记忆（skills）
- **数据结构**：复用现有 `SkillLibrary` 记录 `{name, steps[], evidenceRef, confidence, state, tier, useCount, successCount}`，加 `scope: "worker:<id>"`。
- **存储**：`skills/`（skill.js 加作用域参数即复用，无需重写）。
- **写入时机**：反思阶段识别"这个流程可复用"→ `learn`；同一流程证据重复 ≥ 3 次且 successRate 达标 → 置信度够 → 固化（判定逻辑见 §2.4）。
- **注入（关键工程决策：清单注入，步骤按需取）**：每次 dispatch 把**已接受技能清单**（名字 + 一句话）注入 prompt 的 `[技能]` 节；详细 steps **不**注入（省 token），模型需要时调用 `cw_skill_use` 按名取详细步骤。这样技能再多也不撑爆上下文。

#### ⑤ 习惯记忆（habits）
- **数据结构**：`habits.json`：`{ reportFrequency, tone, style[], scheduleHints[], feedbackLog: [{at, from, feedback, appliedTo}] }`。
- **写入时机**：用户显式反馈（"汇报太啰嗦"）→ 更新偏好 + 追加 feedbackLog；反思观测到稳定模式 → 低频写入（需确认）。习惯不是硬编码，是"程序记忆 + 反馈"的沉淀。
- **注入**：编译进 persona 节（≤ 3 条，低 token）。习惯演化同样走 prompt 版本管理兜底（可回滚）。

#### ⑥ 统一注入架构：MemoryBroker（所有层的汇合点）

```js
// memory-broker.js 核心：assemble(employee, task) → memoryBundle
{
  episodic: [ {summary, result}, ... ≤3 ],   // 相似任务
  semantic: [ {fact, tags}, ... ≤5 ],         // 匹配知识
  skills:   [ {name, oneLiner}, ... ≤8 ],     // 已接受技能清单
  habits:   [ {preference}, ... ≤3 ],
  working:  "会话摘要（如有）",
  budget:   { estimatedTokens, maxTokens: 2000 }
}
```

- `compilePrompt()` 把 memoryBundle 渲染成固定节 `## 记忆上下文`。
- **注入预算硬上限**（config 可配，默认 2000 tokens/次）；超预算按优先级裁剪：skills 名 > episodic > semantic > habits。
- 每层检索都是纯函数（输入 employee 快照 + task 文本 → 输出条目），可单测、可审计（谁检索了什么注入给了谁）。

**写入时机总表**：

| 触发点 | 写哪层 | 内容 |
|---|---|---|
| 任务完成 | timeline | +1 条（summary/result/keyFacts） |
| 每次反思 | knowledge + habits | +0..2 经验；可选偏好微调 |
| 同一流程成功 ≥3 次 | skills | learn → 固化判定 |
| 用户反馈 | habits + knowledge | 立即写，版本化 |
| 会话超长 | timeline (digest) | 旧段压缩为摘要 |

### 2.2 自控系统（与现有 cw 治理对接）

**现状**：预算/权限门/红线/自检全部是"每个 root agent 一个 runtime"的全局维度（watcher、workorder、guardrails、persona.enforce）。员工（v8）目前共享 root agent 载体，所以治理也是共享的。
**原则：双层治理**——全局层是"地板"（现有机制原样），员工层是"地板内的个性化"（来自 prompt.limits），**交集生效，员工永远不能比全局更宽**。

| 机制 | 全局层（现有，复用） | 员工层（新增） | 对接点 |
|---|---|---|---|
| **预算** | Watcher dailyTokenBudget / stepTokenBudget | 员工级 `{dayTokens, dayCost, maxRuns}` 计数，dispatch 前检查，超限 → 该员工 paused + 汇报 | `pacemaker.js` 加 per-employee 检查；`watcher.js` 的计数按 employeeId 归集 |
| **权限门** | WorkOrderStore（审批） | workorder 记录加 `workerId`；危险工具白名单由 `limits.permissions` 派生 | `workorder.js` 加字段；`tools/post-execute` 已有 auto-record 钩子，加员工维度 |
| **红线** | persona.enforce（子串匹配，太弱） | **rules-engine.js**：`redLines` 编译为结构化规则（工具名/路径模式/正则），走现有 `tools/pre-execute` 钩子 | 替换/升级 persona.enforce；规则引擎是插件侧纯函数，可单测 |
| **自检** | watcher FATAL / failure streak / diagnose 质量漂移 | 员工级健康记录：连续失败、同任务重试 >N 次（循环检测）、疲劳（连续活跃小时数） | 复用 watcher 计数按员工归集；循环检测可读 thinking log 判断重复步骤 |
| **供应链** | classifySupplyCall（supply-chain） | 员工不新增通道（T4 直接 block） | 原样复用 |

**降级/暂停语义**：员工级预算超限 → 员工 `status: "paused"`（现有 status 字段复用），恢复需用户 resume 或次日自动复位（日预算滚动）。全局 FATAL 仍优先（员工不能逃过全局熔断）。

### 2.3 思维可追溯（thinking log）

- **数据结构**：`thinking/<taskId>.jsonl`，每行 `{seq, ts, kind: "plan"|"decision"|"reflect"|"step"|"tool", content, meta?}`。
- **写入时机（双通道，不依赖模型自觉）**：
  1. **自动通道**：`tools/post-execute` 钩子把每次工具调用自动记为 `kind:"tool"`（工具名 + 参数摘要 + 结果摘要）——推理骨架自动留痕；
  2. **自觉通道**：`compilePrompt` 注入"思维协议"（任务前 `cw_think("plan", ...)`、关键决策 `cw_think("decision", 三问结论)`、完成后 `cw_think("reflect", ...)`），模型主动补上规划/反思文本。
- **注入**：thinking log **不进常规 prompt**（token 浪费），只做两件事：① UI 可查（"它为什么这么做"）；② 反思阶段把**本次任务自己的 thinking 摘要**喂给反思循环（见 2.4）。
- **与 checkpoint 的关系（不重叠）**：checkpoint = 外部副作用意图账本（幂等、防重放，安全面）；thinking log = 内部推理留痕（可解释性面）。一个管"它动过什么外部世界"，一个管"它为什么这么想"。

### 2.4 自我进化（反思循环 + 成长轨迹）

**进化核心循环**：`执行 → 反思 → 沉淀 → 应用 → 更强执行`。

**反思调度（两级，控制成本）**：
- **任务后反思（每次任务完成，微成本）**：输入 = 本次 thinking 摘要 + 任务结果 → 产出 `{经验沉淀(0..2), 可复用流程(0..1), 习惯微调(0..1)}` → 写入 knowledge/habits + 触发技能固化判定。使用快档模型（复用 `meta.modelHint: "fast"`）。
- **定时深反思（复用 probe 节拍，每天 1 次或每 N 任务）**：输入 = 本周 timeline/knowledge/skills → 产出 `成长总结`（写 growth.json）+ **prompt 演化提案**（人格字段 draft，需用户批准）→ 更新成长轨迹。

**技能固化判定（"重复 3 次"的工程化）**：
- 触发条件：同一流程 `evidenceRef` 重复出现 ≥ 3 次（引擎在 timeline 里折叠统计，非模型自报）且成功 ≥ 2 次 → 调用 `skills.learn`；
- 置信度 = 现有 `computeConfidence`（evidenceStrength/reproductions/successRate 由 ledger 统计，插件算）；
- 落地状态：置信度 ≥ 阈值且 `requireSkillReview=false` 才自动 accepted，否则 pending 等人审（照搬现有 skill.js 语义）。

**成长轨迹（growth.json，纯派生可重建）**：
```
{ employeeId, taskCount, activeDays,
  skillsCount, acceptedSkills,
  experienceCount, successRate(近N任务),
  trajectory: [ {at, skills, exp, successRate}, ... ] }   // 每次反思/深反思追加
```
由 timeline/knowledge/skills 折叠计算（幂等，可从存储重建），UI 成长页直接读。**进化全链路可审计**：每个沉淀/固化/演化都带 evidenceRef（意图账本引用）。

**进化与 prompt 的关系（关键防线）**：记忆进化（knowledge/skills/habits）自动、低危、有 review 门；**人格进化（prompt 的 identity/persona/values/rules）员工只能"提案"**——`evolution` 来源的 draft 必须用户批准才成为正式版本（§1.4）。**员工永远不能直接改自己的灵魂**。

### 2.5 能力 / 交互（简述）

- **能力系统**：`soul.skills` → 工具映射表（该员工可见工具集，与 `limits.permissions.toolAllowlist` 同源）；模型档位由 `meta.modelHint` + 任务复杂度自动选（复用现有 getModels/setModel 与 installModelSelection）。
- **交互系统**：汇报/请示/审批复用现有 report + workorder 通道（加员工维度）；同事协作见 §4。

---

## 3. 常驻循环与跨会话记忆加载

### 3.1 员工 = 独立后台 agent（模式 B 为主）

**现状问题**：v8 员工执行复用 root agent 的 followup（`instructEmployee` → `deliver(this.agent, "[员工 X] ...")`）。这导致：员工间上下文互相污染、无法并行、每员工的 prompt/记忆无法独立注入。
**目标架构**：每员工一个独立后台 agent（`ctx.agents.create({ meta: { cwd } })`——代码注释里已预留"员工独立后台 agent 为后续增强"），每个员工 agent 配自己的 `WorkerRuntime`：

- 每员工 agent 的 system prompt = `compilePrompt(员工 prompt, memoryBundle)`——**"prompt 定义员工"在运行时就是"每个员工 agent 的 system prompt 各不相同"**；
- 每员工一个 Pacemaker 实例（复用现有类，加 employeeId 上下文）；
- 共享载体（模式 A）保留为降级路径（员工少 / 平台限制 agents.create 时）。

### 3.2 7×24 驱动（与现有 registry 对接）

1. **registry 扩展**：schedule/heartbeat 记录加可选键 `employee`（照 `OPTIONAL_RECORD_KEYS` 的 project/task 先例加 `employee`，decode 向前兼容）——**fold/dispatch/expire 机制零改动**；
2. **创建绑定**：给员工建任务（"盯服务器"）→ 创建 heartbeat 记录并 `employee: <id>`；
3. **派发**：pacemaker 折叠 ledger → due 记录 → 查 `employee` → 找到该员工 agent → `deliver(employeeAgent, taskPrompt)`（复用 waker.js，idle→followup / busy→inject / 串行 maxConcurrent=1）；
4. **员工级预算闸**：dispatch 前查员工日预算（§2.2），超限不派发、置 paused。

### 3.3 跨会话记忆加载（Ralph loop 模式落地）

每次派发都是"fresh turn（或 fresh session）+ 持久 workspace"，记忆恢复靠**启动管线**（`assembleRuntime(employeeId)`）：

```
① 读 workers/<id>/employee.json        → 员工是谁、prompt 版本指针、治理
② 读 prompt/current.json               → compilePrompt 的灵魂部分
③ MemoryBroker.assemble(employee, task) → memoryBundle（timeline/knowledge/skills/habits/会话摘要）
④ 读 workers/<id>/resume.json          → 进行中任务断点（如断电前任务做到第几步）
⑤ 组装 system prompt = compilePrompt(soul, memoryBundle) + [恢复提示: 上次任务进行到…]
⑥ 创建/复用员工 agent，注入 → 开工
```

要点：
- **文件系统就是长期记忆**（Ralph loop 的 workspace-as-memory）：每次 fresh session 通过 ②③④ 恢复"它是谁 / 它知道什么 / 上次干到哪"——不依赖会话历史；
- `resume.json` 是任务级断点（非会话级），与 checkpoint 意图账本配合：checkpoint 保证副作用不重放，resume 保证"进行中任务"不丢失；
- 现有 `resumeIdentity`（store-recovery）逻辑可复用为员工 agent 的冷启动兜底。

---

## 4. 多员工协作落地

### 4.1 团队定义

```
teams/<projectId>/team.json
{ name, mode: "pipeline"|"parallel"|"role-parallel",
  employees: [ {id, role, upstream: [id|null], downstream: [id], peers: [id] } ],
  graph: "DAG" }          // 创建时校验流水线图必须无环
```
每员工的 `prompt.team` 段声明其在团队中的位置（§1.2），`compilePrompt` 把"我向谁交接 / 接收谁"注入 prompt——协作是灵魂的一部分。

### 4.2 任务流转（handoff 即情景记忆的传递）

- **流水线（sequential）**：A 任务完成 → A 的反思阶段产出**交接物** `teams/<projectId>/handoffs/<taskId>.json`：
  ```
  { taskId, from, to, summary, artifacts: [path...], acceptance: "测试通过才算完",
    context: { timelineRefs, keyFacts } , at }
  ```
  交接物 ≤ 500 tokens（预算计入 B 的任务预算）→ 引擎把交接物作为新任务 dispatch 给 B（作为 B 的工作记忆注入 + 存 B 的 timeline `kind:"handoff"`）→ 链尾员工完成即任务闭环。
- **并行（parallel）**：orchestrator（宿主或指定主员工）拆分任务 → 各员工独立 dispatch（每员工独立 agent 天然并行）→ 结果写 `teams/<projectId>/results/<taskId>/<employeeId>.json`（`{summary, artifacts, metrics, next?}`）→ orchestrator 聚合汇总。
- **角色并行（role-parallel）**：同一输入派给多个员工（各带 role 视角：安全审查/性能审查/可维护性审查）→ 结果合并对比（可选加一个 reviewer 员工做裁决）。

### 4.3 上下文交接规则

- 交接只走**结构化文件**（handoff/results），不走会话透传——隔离各员工上下文，防止污染（§6 风险）；
- 交接物本身就是"情景记忆的传递"：B 收到后其 timeline 自动 +1 条 handoff，成为 B 的长期记忆；
- 并发控制：每员工同一时刻单任务（pacemaker 已保证）；团队层防活锁 = 创建时 DAG 校验 + dispatch 死锁检测（任务在链上停留超时 → 上报）。

---

## 5. 模块划分与现有代码对接

### 5.1 复用 vs 新增总表

| 现有模块 | 处置 | 改动 |
|---|---|---|
| `workers.js` WorkerStore | **改造** | 单 JSON → 员工目录 `workers/<id>/`；加 prompt 指针/治理字段；老格式 `<id>.json` 读取时迁移 |
| `registry.js` | **微扩** | 记录加可选键 `employee`（沿用 OPTIONAL_RECORD_KEYS 模式，decode 向前兼容） |
| `checkpoint.js` | **原样复用** | 员工任务同样走意图账本（副作用幂等） |
| `waker.js` | **复用 + 变体** | `deliver(agent, text)` 原样；加 `deliverEmployee(employeeAgent, taskPrompt)`（含记忆注入装配） |
| `pacemaker.js` | **扩展** | 加 employeeId 上下文 + 员工级预算闸 + 员工健康归集 |
| `watcher.js` | **复用** | 计数按员工归集（全局 FATAL 仍优先） |
| `memory.js` | **扩展** | 加 `tags`/`scope: worker:<id>`；迁移进员工目录 |
| `skill.js` | **扩展** | 加 `scope` 参数；迁移进员工目录 |
| `persona.js` | **被吸收** | enforce 升级为 rules-engine；persona 字段并入 prompt.soul |
| `guardrails.js` | **原样复用** | 全局地板（supply-chain/credentials/supervision） |
| `workorder.js` | **微扩** | 加 `workerId` 字段 |
| `probe.js` | **复用** | 定时深反思挂 probe 节拍 |
| `report.js` / `loop.js` / `handover.js` / `replay.js` | **原样复用** | — |

### 5.2 新增模块

```
lib/employee/
  prompt-schema.js     # prompt JSON schema + 校验（schemastery，与生成器同源）
  prompt-compiler.js   # JSON → system prompt（含 memoryBundle 注入点 + 治理戳）
  prompt-store.js      # 版本管理（current + history.jsonl + rollback + draft/approve）
  prompt-generator.js  # 任务描述 → prompt JSON（模板 + LLM 混合 + 校验门）
  memory-broker.js     # 跨层检索汇总 → memoryBundle（token 预算裁剪）
  timeline.js          # 情景记忆（结构化事件日志）
  knowledge.js         # 语义记忆（薄封装 memory.js，加 tags/scope）
  habits.js            # 习惯记忆
  thinking.js          # 思维留痕 + cw_think 工具注册
  evolution.js         # 反思循环 + 技能固化判定 + 经验沉淀
  growth.js            # growth.json 派生计算（幂等可重建）
  team.js              # 团队编排（handoff/results/orchestrator/DAG 校验）
  rules-engine.js      # 员工红线结构化执行（替代 persona.enforce 子串匹配）
```

### 5.3 分层与实施顺序（增量，每步可独立验收）

```
┌─ UI（像素工作台）── HTTP /continuous-worker/employees/*（扩展路由）────────┐
├─ Runtime 层：每员工一个 WorkerRuntime（agents.create 独立 agent）
│    ├─ 调度：Pacemaker(employeeId) + registry(employee) + waker
│    ├─ 认知：MemoryBroker + Thinking + Evolution + Growth
│    └─ 治理：员工级 Budget + WorkOrder(workerId) + RulesEngine + 全局 Guardrails
├─ 存储层：workers/<id>/ {prompt/, chat, timeline, knowledge/, skills/, habits, thinking/, growth.json}
└─ 平台：agents.create + session 事件日志（registry fold 原样）
```

| 步 | 内容 | 验收 |
|---|---|---|
| 1 | WorkerStore 目录化 + prompt-schema/store | 老员工零丢失迁移；prompt 版本可建可回滚 |
| 2 | prompt-compiler + dispatch 时注入 | 员工 system prompt 随任务变化；治理戳生效 |
| 3 | MemoryBroker + timeline/knowledge/habits | 记忆按预算注入；写入时机全触发 |
| 4 | thinking + evolution + growth | 反思沉淀/技能固化/成长页数据可见 |
| 5 | team + handoff/results | 流水线/并行/角色并行三模板可跑通 |
| 6 | 员工级治理（预算/红线/workorder） | 员工 A 超预算不影响员工 B；红线按员工执行 |

---

## 6. 风险与防护

| 风险 | 场景 | 防护（工程手段） |
|---|---|---|
| **画像漂移** | 自我进化把 persona 越改越偏 | 人格进化只能"提案"，必须人批准（§1.4/§2.4）；版本化可回滚；漂移检测：定期对比当前 prompt 与初始版/上一版语义差异（LLM 对比或 embedding 距离），超阈值告警 |
| **prompt 被改坏** | LLM 生成 / 演化产出坏 prompt | 四道门：schema 校验 → 编译后 token 预算检查 → 敏感/自我授权扫描 → 新旧成功率 shadow 对比（P2）；`limits` 永不接受模型填写（引擎合并） |
| **记忆膨胀** | timeline/knowledge 无限增长 | 注入预算硬上限 + 分层裁剪（§2.1.6）；timeline 滚动归档（>500 条压缩为月摘要）；knowledge 过期（expiresAt + 引用计数）；磁盘闸门按员工分摊（现有 maxDiskBytes） |
| **成本失控** | 7×24 自主循环烧钱 | 员工级日预算（token/成本/次数，超限 paused）；反思/深反思用快档模型；交接物 ≤500 tokens 计入接收方预算；成本看板（按员工归集） |
| **循环/死锁** | 任务反复失败重试 | 复用 watcher failure streak + FATAL；员工级"同任务重试上限"；循环检测（thinking log 同一步出现 N 次 → 上报） |
| **上下文污染** | 多员工共享会话互相干扰 | 模式 B 独立 agent 隔离；交接只走结构化文件，不透传会话（§4.3） |
| **权限越权** | prompt 自我授权危险操作 | `limits` 引擎强制（来自治理配置，非 prompt）；员工权限与全局取交集；workorder 审批兜底 |
| **秘密泄漏** | 记忆/反思里存了密钥 | 复用 credential guard；knowledge/thinking 写入时扫敏感模式（token/密码/路径）拒绝或打码 |
| **进化失衡** | 某技能过度使用 / 经验互相矛盾 | 技能置信度 + review 门（照 skill.js）；knowledge 矛盾检测（同 tag 相反事实 → 标 pending 待审） |
| **多员工预算互相蚕食** | 共享预算被一个员工烧完 | 员工级预算独立计数（§2.2），全局预算仍是总闸 |

---

## 7. 你认为最该改的 5 件事（按优先级）

1. **员工目录化存储 + Prompt Schema/版本管理（地基）**：现在 `workers/<id>.json` 单文档装不下认知系统。一切（记忆/思维/成长/协作）都挂在员工目录上，prompt 版本化是"灵魂可控"的前提——先做这一步，后面全部受益。
2. **每员工独立后台 agent + dispatch 时 prompt 编译注入（灵魂生效）**：把"prompt 定义员工"落到运行时（每员工 system prompt 各不相同），同时解锁并行与上下文隔离。模式 A（共享载体）只作过渡。
3. **MemoryBroker 统一记忆注入（常驻记忆生效）**：fresh session 下记忆唯一生效途径 = 每次派发把 timeline/knowledge/skills/habits 组装成有 token 预算的 memoryBundle 注入 prompt。这是 Ralph loop 模式"workspace 即记忆"的工程实现，也是 7×24 连贯性的命门。
4. **反思循环 + growth 计算（进化闭环最小可用版）**：任务后反思 → 经验沉淀 → 技能固化判定（复用 computeConfidence）→ 成长轨迹可查。全部带 evidenceRef 可审计；人格演化只提案、不直改。
5. **员工级治理下沉（预算/红线/workorder 按员工）**：否则一旦多员工上线，共享预算互相蚕食、红线无法按角色差异化。双层治理（全局地板 + 员工个性化交集）是"多员工 + 自主进化"能安全并存的前提。

> 与现有设计的关系：本方案不推翻 `worker-cognition-design.md` 的七大系统与内在一致性框架，而是把每个系统落成"数据结构 + 存储路径 + 写入时机 + 注入方式"四件套，并把"Prompt 即灵魂"确立为唯一事实来源；`worker-creation-design.md` 的创建流程里"自动生成角色描述"升级为"自动生成整份结构化 prompt（模板+LLM+校验门）"，团队模板落地为 `team.js` 的 DAG 编排。
