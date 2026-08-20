# 证据笔记：Kimi Claw — 24/7 常驻 AI Agent 产品化对标（用户指定参考）

> 来源：https://www.kimi.com/resources/kimi-claw-introduction （Moonshot 官方，2026-06-06 发布，经 Exa 抓取正文）
> 用户原话："我觉得 Kimi Claw 挺符合我的想法"——这是「电子打工人」诉求的产品化样板，本设计以其为对标。

## 1. Kimi Claw 是什么
- **OpenClaw**：带人格（personality）与记忆（memory）的 AI assistant（本地运行形态）。
- **Kimi Claw**：一键把 OpenClaw 部署到云端的 24/7 AI Agent 服务：云端 7×24 在线、40GB 云存储、5000+ ClawHub skills、自动配置 Kimi K3 模型。
- 解决本地痛点：装依赖/配 key/机器常开/关笔记本就停/装 skill 繁琐/VPS 成本。

## 2. 核心能力（与本设计逐条对应）
| Kimi Claw 能力 | 对我们的 dsh-continuous-worker 的映射 |
|---|---|
| **持久记忆 + 自定义人格**：跨会话记住偏好/工作风格；一句话设定名字/语气/输出格式，之后自动遵守 | 复用 Agent OS memory MCP（已验证持久事实）+ persona 配置面（插件 settings 固化为版本化配置）；「tell once, apply forever」= 配置即人格 |
| **主动定时任务（proactive scheduled tasks）**：到点自动执行，无需手动触发；三要素模板 `At [time], do [task], output [format], follow [constraints]` | 正是 schedule / heartbeat 原语；工具面应支持同一「when/what/how/constraints」四要素 |
| **5000+ ClawHub skills 即时调用与链式编排**：聊天里描述工作流，自动选/装/链 skill | DSH 既有 skills 机制；插件作为使用方；「描述工作流→自动链 skill」可作为 cw 工具的高层封装（P2） |
| **40GB 云存储**：文档/报表/输出可存档、检索、版本历史、跨设备 | 宿主文件系统 + 意图账本；跨设备=非目标（本地插件），存档检索可作为增强 |
| **Pro 级搜索**：实时抓取金融/学术/新闻/技术文档 | 宿主既有 web 搜索/读取工具（modsearch 等） |
| **一键云部署、零硬件** | 我们的默认是「随宿主运行」；云部署=可选增强（非本插件默认，成本/隐私权衡） |

## 3. 产品语义对我们设计的 5 条启发
1. **「人格+记忆」是用户对"打工人"的第一感知**：设计要把 persona 配置（名字/语气/输出格式/红线）做成显式一等配置，而不是埋在 prompt 里。
2. **定时任务对用户暴露为「自然语言四要素」**：`At [时间/频率], do [任务], output [格式], follow [约束]`——我们的 `cw_schedule_create` 等工具 schema 应原生承载这四要素，降低心智负担。
3. **「主动」是关键卖点**：用户要的是"它自己到点干活、自己产出、自己存档"，不是"被问才答"——对应我们的「宿主节拍 + followup 唤醒 + 账本」。
4. **skills 链式工作流是增强路径**：先让 schedule/heartbeat 跑起来，再把「描述工作流→自动编排既有 skills」作为 P2 差异化能力。
5. **云 vs 本地是部署权衡，不是能力差**：Kimi Claw 用云换 24/7；我们默认用宿主常驻换 24/7（隐私/成本更好），仅在"宿主不常开"时考虑 Task Scheduler/NSSM 宿主 bootstrap。

## 4. 差异与边界（我们不做云）
- 不引入云端托管/计费/多租户（那是产品化方向，非插件本身）。
- 40GB 云存储/跨设备同步非目标；本地文件系统 + 审计日志即可。
- 若未来要"宿主未开也执行"，走 Task Scheduler/NSSM 包宿主（P2），与 Kimi Claw 的云托管在语义上等价（外部常驻载体），但保持数据本地。
