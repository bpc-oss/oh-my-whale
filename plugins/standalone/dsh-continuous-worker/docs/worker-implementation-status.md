# dsh-continuous-worker · 实现状态总览（2026-08-18）

> 员工认知架构 M1-M5 全审查 PASS（123/123 单测），三 preset 独立审查 P0 全闭环。
> 本文档记录当前实现状态、已知边界与下一步。

---

## 1. 已实现（全部审查 PASS）

### 后端核心（lib/）

| 模块 | 状态 | 说明 |
|---|---|---|
| `lib/registry.js` | ✅ | schedule/heartbeat 注册表（fold 幂等 + 坏事件跳过 + id 校验） |
| `lib/pacemaker.js` | ✅ | 节拍引擎（预算门 + loop verifier shell 白名单） |
| `lib/watcher.js` | ✅ | 心跳/FATAL/降级状态机 |
| `lib/checkpoint.js` | ✅ | 意图账本（坏行容错 + probe begin/complete 成对） |
| `lib/workers.js` | ✅ | 员工目录化存储（老格式迁移保 chat + appendChat 追加写） |
| `lib/employee/prompt-schema.js` | ✅ | Prompt 三段式 + 校验门（自我授权扫描抗变体） |
| `lib/employee/prompt-store.js` | ✅ | 灵魂版本管理（不可变 + 回滚 + evolution 草稿审批 + limits 引擎强制） |
| `lib/employee/prompt-compiler.js` | ✅ | compilePrompt（治理节前置 + 记忆预算裁剪 + CJK 估算） |
| `lib/employee/agent-runner.js` | ✅ | agents.create（preset mount + 灵魂 section + 记忆变量通道 + scoped 守卫 + cw_think） |
| `lib/employee/budget.js` | ✅ | ledger（每日重置）+ employeeToolGuard（白名单/danger/redLines，cw_ 放行） |
| `lib/employee/queue.js` | ✅ | per-employee 派发队列（{taskId,text,instruction} 串行 + 重启恢复） |
| `lib/employee/memory-broker.js` | ✅ | 三层记忆（timeline/knowledge/skills/habits）+ assemble + renderBundle |
| `lib/employee/evolution.js` | ✅ | 反思循环（经验去重 + 技能固化 + growth 串行 + activeDays 跨天） |
| `lib/employee/thinking.js` | ✅ | 思维留痕（时间戳 seq + taskId 白名单 + 递归脱敏 + 坏行跳过） |
| `lib/memory.js` | ✅ | MemoryStore（MCP recall await 修复） |
| `lib/tools.js` | ✅ | 37 个 cw_* 工具（update 校验镜像 create + probe checkpoint 成对） |
| `lib/index.js` | ✅ | host 集成（路由 id 提取 [2] + 面板 run_once 预算闸 + 员工队列恢复 + credential 读写都拒 + resume_all 只处理 paused） |

### 前端（src/）+ 预设（presets/）

| 模块 | 状态 |
|---|---|
| `src/client.jsx` | ✅ service 15 方法（growth/thinking/feedback/createEmployee 带 prompt） |
| `src/Dashboard.jsx` | ✅ 员工仪表盘（成长卡 + 思维卡）+ 创建向导（任务→AI 生成灵魂→创建） |
| `presets/employee-ops/agent.cordis.yml` | ✅ 员工类型 preset（自动进 DSH home 扫描根） |

### 测试
- **123/123 单测**（`node test/unit.mjs`，exit 0，389 条真断言）
- **端到端实测**（VERIFIER）：createWorker→prompt→compile→assemble→reflect→growth→thinking→guard 全链路闭环；构建 dist/client.js 成功；老格式迁移通过

---

## 2. 已知边界（非阻断，如实记录）

| 边界 | 影响 | 缓解 |
|---|---|---|
| heartbeat TTL 滑动不过期 | `advanceHeartbeat` 前移 scheduledAt，间隔<TTL 的记录永不 expired | maxRuns 兜底；如需硬 TTL 改锚点 |
| 日预算/日报告内存计数 | watcher/report 状态重启清零 | 7×24 常驻下重启罕见；可持久化 |
| 员工仪表盘部分系统状态来自 root agent | 任务看板/预算/待审批是宿主的，与员工实体错位 | 需 getStatus 按员工隔离（下一步） |
| skill/memory accept 通道默认不可达 | requireSkillReviewConfirm 默认 true，review 工具拒绝 accept | 用模型 cw_skill_review 或改配置 |
| credential guard substring 匹配 | 通配/展开可糊弄（shell 展开后 pre-execute 看不到） | 主防线是平台 denyDirectAccess |
| 面板 run_once 缺 applySupervision | 与工具面 supervision 不一致（预算闸已对齐） | 工具面为准 |
| appendChat 内存 cap 仅内存级 | 文件无限增长（追加写已消除 O(n²)） | 需文件轮转 |
| 员工工作区 fs cwd | preset 内 fs-local cwd=宿主 cwd（员工工作区经 meta.cwd） | 运行时 cwd 生效，preset 内为兜底 |

---

## 3. 审查历程（全部 PASS）

| 里程碑 | 审查轮次 | 结论 |
|---|---|---|
| M1 灵魂地基 | 初审 FAIL → 返修 → 复审 FAIL(2) → 修复 → 复审 PASS | ✅ 123 测试 |
| M2 运行载体 | 初审 FAIL(4) → 3 轮返修 → 复审 PASS | ✅ |
| M3 记忆系统 | 初审 FAIL(2) → 返修 → 复审 PASS | ✅ |
| M4 进化系统 | 初审 FAIL(2) → 2 轮返修 → 复审 PASS | ✅ |
| M5 思维留痕 | 初审 FAIL(2) → 2 轮返修 → 复审 PASS | ✅ |
| UI+向导 | 初审 FAIL(P0 路由) → 修复 → 复审 PASS | ✅ |
| 三 preset 全插件 | DEV FAIL / DEV REVIEWER FAIL(3P0) / VERIFIER PASS → P0 全修 → 复审中 | ✅ P0 闭环 |

---

## 4. 下一步（建议）

1. **员工仪表盘数据隔离**：getStatus 支持 workerId（员工自身状态，非 root）
2. **日预算持久化**：watcher/report 落盘（重启不清零）
3. **skill/memory accept 通道**：HTTP 端点补人工批准
4. **heartbeat TTL 锚点**：改 scheduledAt → lastRun 或记录原始创建
5. **浏览器验收**（需 DSH 运行）：成长卡/思维卡/向导真实渲染
