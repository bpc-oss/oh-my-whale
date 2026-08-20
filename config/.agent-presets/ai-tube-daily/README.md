# AI TUBE Daily Operator preset

基座：`anchored-standard`（干净首轮、最小 resident 工具、按需解锁）。

用途：日常运行 AI TUBE 项目（抖音收藏 -> TikTok/YouTube 排期发布）的专属执行 preset。

## 组成

- `preset.yml`：预设注册信息。
- `agent.cordis.yml`：复用 anchored-standard 的 context-gate / tool-bootstrap / instruction-hint / dev-tool-search / skill-search，并加入 AI TUBE persona 与 `ai-tube-mission` 注入。
- `ai-tube-mission.mjs`：promotion 后注入一次 AI TUBE 运行契约，包括：
  - 必读文件；
  - 强制 `doctor` / `status`；
  - 恢复优先；
  - 用户 2026-08-18 已确认口径；
  - WorkBuddy hy3-only / 精确 profile / CDP File 注入 / SQLite 唯一真值；
  - 收尾必须更新 HANDOFF/PROJECT_STATUS 并报告标签账本。

## 使用

1. 新开会话，在 agent preset 选择器选 **AI TUBE Daily Operator**。
2. 正常下达 AI TUBE 日常任务即可；preset 会在 promotion 后注入运行契约。
3. 不要与 `anchored-standard` / `router-standard` 叠加。

## 注意

- 增量 TikTok 防重复是用户确认的目标口径；当前代码门禁若仍强制全量，需要先改造并回归测试，不能直接绕过。
- 带原声图文若 TikTok Photos 不支持保留原声音乐，必须向用户报告平台限制，不能擅自转视频。
- 本 preset 只是运行框架，不替代 `AGENTS.md`、`docs/agent_daily_operation_guide.md`、`docs/requirement_conflicts_and_ambiguity_audit.md` 的权威规则。
