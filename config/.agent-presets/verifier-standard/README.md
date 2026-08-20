# Verifier Standard preset

基于 **anchored-standard** 基座（本机性能机制最强且被实测的 preset：首轮锚定
98/99、context-gate、发现式解锁）+ **dsh-llm-verifier** 验证器工具的独立 preset。

## 为什么选 anchored-standard 做基座（评估结论）

| preset | 结构 | 性能机制 | 结论 |
|---|---|---|---|
| **anchored-standard** | 22 行 + 7 个机制 mjs | context-gate + 首轮锚定 + 发现式解锁 + instruction-hint（实测 98/99） | ✅ **基座**：机制最强、无重型认知框架、与「验证驱动」定位正交 |
| j-space-standard | anchored + jspace-frame | 全（含 jspace 思维框架） | 备选：当前默认、最实战验证，但 jspace 重型框架会稀释验证器定位 |
| dev | 简洁 + 21 技能 | 无锚定机制 | 次选：干净但缺性能机制（原 verifier-standard 基座，已备份） |
| dev-reviewer / bounty-pipeline / router-standard | 专用 / 实验性 | — | 排除 |

## 组成

- **锚定机制**（继承 anchored-standard）：`context-gate`（提升前剥离运行时注入）、
  `tool-bootstrap`（首轮目录 = bash + str_replace_editor + **verifier_doctor**，
  提升后 resident 集 + 发现式解锁）、`instruction-hint`（AGENTS.md 存在性提示）、
  `dev-tool-search` / `skill-search`（按需解锁）、compaction-epoch 等。
- **验证器**（本 preset 专属）：
  - `dsh-llm-verifier` 行：绝对路径挂载插件（`C:/Users/Administrator/dsh-llm-verifier/lib/index.js`），
    工具只对本 preset 会话可见；
  - `verifier-guide.mjs`：提升后**近距离一次性注入**「默认调用」规则——多路 rollout
    后自动 verifier_select 选优、长任务每 8-10 步 verifier_progress 止损、收尾
    verifier_track 复盘 + verifier_usage 账本、启动 verifier_doctor 自检；
  - 其余 verifier_* 工具经一次 `dev_tool_search` 解锁后会话内常驻。

## 后端策略（只使用当前对话的模型）

验证器**只**用当前对话的 provider+model（agent-default-model：bai /
deepseek-v4-flash，端点 https://api.b.ai/v1）。b.ai 标准 OpenAI 调用不返回
logprobs，bridge 对 DeepSeek 系网关（api.b.ai / api.deepseek.com）自动走
**DeepSeek-tagged 调用路径**（thinking + logprobs）——实测可拿到评分字母分布。
**无任何凭据回退**：对话 provider 不可用/不支持时工具明确报错，绝不静默切换
到 DeepSeek 官方 API。显式设置 OPENAI_BASE_URL / DEEPSEEK_API_KEY /
VERTEX_API_KEY 环境变量仍可作为用户主动覆盖。

## 使用

1. 切换 preset：设置 → agent preset → Verifier Standard（或新建会话选择）。
2. 首个请求目录：bash + str_replace_editor + verifier_doctor（动手前自检后端）。
3. 首个工具调用/回复后提升：verifier-guide 注入默认规则，dev_tool_search
   解锁其余 verifier_*。
4. 验证器真实调用发生在 agent 按默认规则执行时（select/progress 等），
   费用按 DeepSeek 计费。

## 维护

- 基座升级：anchored-standard 的机制 mjs（context-gate / tool-bootstrap /
  compaction-epoch 等）为本地副本，可整体重新克隆刷新。
- dev 基座旧版备份：`C:\Users\Administrator\dsh-llm-verifier\preset-backups\verifier-standard-dev-base`。
- 插件本体：`C:\Users\Administrator\dsh-llm-verifier`（bridge/ + python/ + lib/）。
