# j-space-standard — 推荐设置 + J-Space 预设

DSH agent preset：在 **anchored-standard 推荐基线**（DeepSeek V4 干净首轮条件）之上叠加
**J-Space 持续计算治理**。报告《DeepSeek V4 × J-Space Capability Realization Report》§5.3
的分层结论是「入口条件 + 持续治理」互补：本预设把两层装进一个可选组合里。

## 组成

| 层 | 机制 | 说明 |
|---|---|---|
| 入口 | `context-gate.mjs` | 首轮零自动注入（仅放行用户 skill 手势），第二轮才恢复注入；compaction 后重新收紧 |
| 入口 | `tool-bootstrap.mjs` | 首个请求只暴露工具对：**win32 → `pwsh` + str_replace_editor（官方 pwsh 栈）**；POSIX → `bash` + str_replace_editor；晋升后收窄为最小 resident 集 + 三个发现工具 |
| 入口 | `dev-tool-search.mjs` / `skill-search.mjs` | `dev_tool_search` / `skill_search` / `skill_load` 按需解锁，不倾倒 25 工具目录 / 9KB skill 目录 |
| 治理 | `jspace-frame-v2.mjs`（本预设原创） | 晋升后每会话注入一次：推荐设置基线 + 红线 + **完整 j-space SKILL.md 全文（自动加载，不依赖模型自觉 skill_load）** |
| 治理 | j-space skill（`~/.agents/skills/j-space`） | 协议本体由 preset 自动注入（SKILL.md）；modules 按门控选择性使用；loop 任务可选 `scripts/jspace.py` 控制器 |

## 推荐设置基线（注入的运行框架）

- 复杂/长程任务用 **max** 推理强度（Think Max）；一眼可核验的单步任务可低档。
- `temperature 1.0 / top_p 0.95` 为报告基线；思考模式下 API 可能忽略，属预期，保持提交并在复现时记录服务端行为。

## 红线

1. **勿与 anchored-standard / router-standard 叠加**——首轮重复注入 + persona 冲突会劣化结果。
2. J-Space 协议由 preset 自动注入（SKILL.md 全文），modules 仍按门控选择性使用——**不要把全部模块拼进一次请求**；也不要再自动注入无关 skill。
3. `we / we need / let's` 是控制语法：每次第一人称承诺必须兑现为动作/检查/收束。
4. 框架不创造知识：每个 "done" 绑定具名 verifier + coverage；失败携带诊断重试。

## Windows 平台说明（2026-08-18 变更）

**Windows 上使用官方 pwsh 栈，不再挂 Git Bash（custom-bash）**。

依据与动机（均来自实测 + 官方文档）：

- DSH 官方实现笔记 [`2026-08-01-windows-pwsh-default`](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-08-01-windows-pwsh-default.md)：
  **"bash has no Windows runner"**——官方默认 Windows 栈就是 pwsh（ACL 沙箱 + 超时控制），bash 栈在 win32 禁用。
- 实测：Windows 上 Git Bash 跑重命令（全盘 `find /`、node_modules 扫描）会**长时间挂起**（120s+ 不返回），
  表现为「会话中途卡住」。这正是用户会话与测试会话复现的现象。
- 因此本 preset：win32 的 bootstrap 工具对改为 **`pwsh` + `str_replace_editor`**（`custom-bash` 行 `disabled: true`，
  保留文件仅作回退参考）；POSIX 保持不变（`bash` + `str_replace_editor` 维持 Minimal 轨迹锚定）。

已知权衡：Windows 上失去 Minimal bash 双工具的首轮 schema 锚定（`pwsh` 属于 standard-family schema，
报告 §4.1 显示其锚定轨迹不同）——但 Windows 上 bash 本身不可靠，稳定优先。若需恢复 Git Bash：
把 `custom-bash` 行改为 `disabled: !!js process.platform !== 'win32'` 并把 bootstrap 对里的 `pwsh` 换回 `bash`。

## 使用

1. 新开会话 → agent preset 选择器选 **J-Space Standard（推荐设置 + J-Space）**。
2. 普通任务正常提；长程/多文件/工具密集任务对模型说「用 j-space 处理…」（或 skill_load j-space）。
3. 长任务可选：`python <skill>/scripts/jspace.py note --goal ... / seam / resume` 把状态外化到 `.jspace/`。

## 文件来源

- `context-gate.mjs` / `tool-bootstrap.mjs` / `compaction-epoch.mjs` / `instruction-hint.mjs` /
  `skill-search.mjs` / `dev-tool-search.mjs` / `custom-bash.mjs`：复用本机 `anchored-standard`
  预设（origin: https://github.com/xiaobright/dsh-anchored-standard ，LICENSE: NOASSERTION，
  仅本机组合复用；再分发前请核对上游许可）。
- `jspace-frame.mjs`、`preset.yml`、本 README：本预设原创。
