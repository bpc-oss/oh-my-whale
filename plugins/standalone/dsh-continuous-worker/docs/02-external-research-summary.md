# 证据笔记：外部设计模式调研结论（来自独立调研子代理 bfa8a809，已核验来源）

> 完整原文：`{{DSH_USER_HOME}}\dsh-resident-agent-design-patterns.md`
> 以下为与本设计直接相关的核心结论摘录（供设计文档引用，独立审查可溯源到原文）。

## 1. 最高优先级设计铁律（P0）
1. **节拍引擎用宿主的**：用 DSH 宿主定时设施（`ctx.interval/timeout/throttle/debounce`，cordis-plugin-timer）——绝不自养后台进程组 / 自建 HTTP 控制面。
2. **原语分型**（借鉴 Paseo 刻意隔离）：`schedule`（到点开新 agent 批处理）｜`heartbeat`（周期性注回同一会话续进）｜`loop`（有界 worker-verifier 迭代）。绝不混成一个万能常驻器。
3. **一切任务有界**：maxRuns / expiresIn / max-iterations / max-time / 单次 step token 预算，缺一不可；无界循环 = agentic resource exhaustion（token 炸弹）。
4. **状态持久化 + checkpoint 恢复**：执行意图与账本落盘，宿主重启后从最近一致点续；外部副作用封装为「可重试 + 幂等键」单元，而非把 LLM 输出当可重放单元。
5. **闲置/循环/预算三计数器**：连续无产出→sleep；连续同工具→注入纠偏；无界循环→框架拦截。
6. **可观测最小面**：合成心跳 + 最近运行清单 + 失败率 + token/磁盘成本 + 最后致命错误。
7. **「等待人类/事件」是一等状态**：用宿主事件驱动语义，禁止 DB 轮询热循环。
8. **会话切分 + 交接物**：单一持久身份 + 有界会话 + 降级/重启时产出 Paseo 式交接工单。

## 2. 明确不该做（与 DSH 既有机制冲突）
1. 不自起第二套 daemon/调度服务（宿主即 daemon）。
2. 不用 while(true) 让会话永热（会话是 idle→唤醒源模型；常驻 = 注册唤醒源 + 状态可恢复）。
3. 不重复造 supervisor/systemd 重启树（向宿主证明活性 + 可恢复状态）。
4. 不拿整段 LLM 输出当可重放执行单元。
5. 不引入 Redis/Kafka/独立 Postgres（单机桌面宿主，队列落文件系统/宿主 job）。
6. 不再造记忆/向量库（复用已有跨客户端 Agent OS memory MCP）。
7. 无界重试/loop。
8. 「等待人类」用 DB 轮询实线。
9. 固化/转写全量会话（存储膨胀 + 上下文腐烂）。
10. 与宿主 goal/verification 系统抢戏（在既有完成/验收模型上表达完成度）。
11. 每轮盲目开全新 agent 做连续性工作（需交接工单否则次次陌生）。
12. 向用户/GUI 索要秘密（凭据走 keyring/env）。
13. 把「每 20 分钟 spawn 一次 CLI」当成常驻（那是无状态批次）。

## 3. 自愈语义（systemd/supervisor 借鉴）
- 被监督者向监督者发心跳（WATCHDOG=1 语义）；宿主当监督者、插件当被监督者。
- 启动记账：维持最低存活时间/检查通过才算启动成功；连续失败判 FATAL（停止自动重启并上报）。
- verify-before-retry + idempotency key（arXiv 2608）；按预算分级恢复并验证（arXiv 2606）。
- Windows 独立自启仅当「脱离宿主运行」才用 NSSM/Task Scheduler；默认随宿主。

## 4. 连续性来源
- 多来源一致：连续性来自「外部持久状态 + 会话切分 + 交接物」，不是常开上下文；~35 分钟可靠性悬崖（第二手引用）。
- 单一持久身份（用户永远"回到它"，不需要会话检索）。
- 轻量 heartbeat 刻意可控（可删、可调频），不是无脑保活。

## 5. 降级而非死亡（automaton 语义）
- heartbeat daemon 独立于干活循环；闲置检测（连续 3 轮只读→sleep）；循环检测（连续 3 次同工具集→注入纠偏）。
- survival tiers：Normal→Low compute（便宜模型/降频）→Critical（保命+呼救）→Dead（主循环停、心跳仍监听回血）。
- 死不是终点而是状态；存活压力 = 预算、磁盘、用户注意力（薄成本闸门）。

## 6. 来源（原文 §9 全清单，此处列设计引用所需核心）
- Paseo: paseo.sh/docs/schedules, github.com/getpaseo/paseo
- AgentOS(framerslab): docs.agentos.sh/features/memory-system-overview
- 记忆类型学: developersdigest.tech/blog/agent-memory-benchmarks-not-enough
- Temporal: docs.temporal.io/encyclopedia/architecture/how-temporal-works
- n8n queue mode: docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode
- Codex: developers.openai.com/codex/noninteractive
- Claude headless: code.claude.com/docs/en/headless
- Conway automaton: github.com/Conway-Research/automaton
- LangGraph checkpointers: docs.langchain.com/oss/python/langgraph/checkpointers
- systemd watchdog: freedesktop.org/software/systemd/man/latest/sd_watchdog_enabled.html
- Supervisor: supervisord.org/configuration.html
- verify-before-retry arXiv: arxiv.org/html/2608.02645v1（复核日期：2026-08-17；本环境无法独立复核，采信调研子代理抓取声明）
- self-healing arXiv: arxiv.org/html/2606.01416（复核日期：2026-08-17；本环境无法独立复核，采信调研子代理抓取声明）
- 长时程 agent: tianpan.co/blog/2025-10-28-async-ai-agents-long-horizon-tasks; tianpan.co/blog/2026-04-30-agents-as-cron-jobs-scheduled-vs-conversational
