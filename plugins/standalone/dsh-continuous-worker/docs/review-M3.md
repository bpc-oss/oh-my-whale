# M3 实现审查意见（独立审查员 dd9e6ab1）

## 结论：FAIL（3 High + 4 Medium + Low/Nit）

### High

**H1 — 置信度"非自报"被工具参数击穿，防污染门槛可被 worker 自封（§13.3 M2 返修违约）**
- 位置：`lib/tools.js:431-434`（cw_skill_learn schema 直接收 evidenceStrength/reproductions/successRate 三参数）；`lib/skill.js:85-89, 194-202`（computeConfidence 无条件信任这三值并参与 state 判定）；`lib/checkpoint.js`（意图账本根本没有成功率/复现次数统计，evidenceRef 也从未被核验）。
- 问题：设计 §13.3 明文"置信度不由 worker 自报——由插件从意图账本统计计算"。实现却是 worker 自填三值 → 插件只做加权求和。requireSkillReview:false 时 worker 传 (1,10,1) 即得 confidence=1.0 → 直接 ACCEPTED，可被 cw_skill_use 调用——自动沉淀门槛整体可绕过。
- 建议：插件侧从 checkpoint 账本按 evidenceRef/recordId 统计再算置信度；worker 传入的三值一律忽略；evidenceRef 至少做账本存在性核验。

**H2 — 默认配置下 review 闭环死锁：pending 技能/记忆永无 accepted 通道（§13.14b 人工面缺失）**
- 位置：`lib/tools.js:468-470`（requireSkillReviewConfirm 时 accept 一律 requires_human_confirm）、`lib/tools.js:552-554`（requireRetainReview 时 cw_memory_review accept 同样拒绝）；全库无任何宿主侧 accept 路径（无 commands/、无面板、pacemaker/index 均不调用 review(accept)）。
- 问题：设计 §13.14b 规定 review 的"接受"走"插件命令 + Web 面板确认"。实现里唯一能 accept 的是模型工具，而它在默认配置下拒绝 accept。后果：默认配置下每条 learn 永久 pending（cw_skill_use 永远拒绝）、每条 retain 永久 pending（recall 默认不含 pending）。只堵不疏。
- 建议：实现宿主侧确认通道（命令/面板直调 review(..., reviewer:"human")）；或提供 config 关闭项并在文档明示。

**H3 — 汇报上限可被 worker 无界绕过：handover 恒为紧急豁免 + 汇报完全 worker 自发（§13.9 违约）**
- 位置：`lib/report.js:17`（URGENT_KINDS = Set(["handover"])）、`lib/report.js:35-48`（urgent 不计上限）、`lib/tools.js:578-599`（cw_report 是 worker 工具）；`lib/pacemaker.js` 无任何 report 调用。
- 问题：设计 §13.9 紧急豁免对象是 FATAL/红线/数据泄漏类，handover 是宿主侧触发。实现把豁免挂在 kind 上且该 kind 由 worker 自选——worker 可无限次 cw_report handover，每条绕过 10/日上限，存在无限触发路径。
- 建议：紧急判定移入宿主侧——仅 watcher/pacemaker 的 fatal/downgrade 路径可产生 urgent 汇报；worker 可调的 cw_report 一律按常规计入上限。

### Medium

- **M1** — "无旁路"仅停留在注释：memory/skill 是本地 JSON 存储，shell 权限 worker 可直接读写绕过 pending 门（§13.2 规则 3 未落地）。建议接入 Agent OS memory MCP seam 或将数据目录纳入 worker 读写排除区。
- **M2** — 汇报超限被静默丢弃而非排队（§13.9 规则 1"静默排队"）。建议加内存/账本队列，下个节拍重试。
- **M3** — 配置键与设计 §8/§13.6 不对应：skill.skillConfidenceSource、report.{milestone,reviewCadence,handoverOnDowngrade,urgentExemptFromCap}、memoryScope.useAgentOSMemory 均无对应键。
- **M4** — ReportBudget 日计数仅内存态，宿主重启清零。

### Low

- L1 review 汇报不带证据引用；L2 cw_report handover 对同一事件日志折叠三次；L3 expiresAt/scope 无校验；L4 cw_skill_use 的 success 默认 true 成功率可自报；L5 置信度不随使用更新、rollback/remove 无工具面。

### Nit

- N1 记忆无限增长无去重；N2 checkpointRoot 可配置进模型工作区；N3 retain fact 无长度上限；N4 skill.review 无状态前置校验。

### 通过项

阈值互斥语义、写入门槛、工具面防自批、computeConfidence 数学、状态机、ReportBudget 日滚、持久化在工作区外、工具作用域均正确；单测全绿。
