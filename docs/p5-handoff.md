# P5 交接：非视频补丁重放（进行中）

日期：2026-10-19 21:10（本地）
工作区：`{{USER_HOME}}\.dsh\tmp\p5-staging\`（含 `REPORT.md`、`tree/`、`results.json`、`survival.json`）
可复现脚本：`{{USER_HOME}}\.dsh\tmp\p5-work\p5-merge.mjs` / `p5-survival.mjs` / `p5-report.mjs`

## 已完成

- 三方合并（ours=2.0.16 补丁版 / base=0.2.0-rc.1 pristine / theirs=2.0.1-rc.2 pristine）
- 28 个 entry 进入合并：**17 无冲突、11 有冲突（24 块）、0 语法失败**
- 行级存活分析：28/28 双向 0 行丢失
- 生产安装树零写入

## 必须先修的两个范围错误

1. **P3 / P41 / P43 被误跳过**：它们与视频补丁共用 `dsh-llm-pi-ai/lib/index.js` 和 `pi-ai/openai-completions.js`，entry 级跳过把整个文件排除了。这两个文件必须纳入 P5，只是解析冲突时把 video 相关块留到 P6。
2. **P18 的 4 个 type-surface 文件与视频判别冲突**（`z.literal("video")`）：解析它们等价于做 P6 的 0/14 决策，建议延后到 P6 一并处理，但要在 P5 明确标记“未完成”。

## 冲突文件（11 个，按优先级）

| 优先级 | 文件 | covers | 冲突块 | 注意 |
|---|---|---|---|---|
| 1 | `dsh-subagent/lib/index.js` | P16+P44 | 5 | `presetTarget` 全在 `:373` 一个冲突块；整块取 theirs 会丢 P44。导出行必须保留 `startContinuable`/`registerExternalContinuation`/`settleRun`（消费方是外部插件） |
| 2 | `api-session-controller/lib/client.js` | P10 | 4 | 决定 4 个生成物（#29/#31/#32/#36）怎么改 |
| 3 | `api-session-controller/lib/typert.host.js` | P18 | 3 | 366 KB codegen 产物；建议从源码重新生成 |
| 4 | `api-remotes/lib/client.js` | P18 | 2 | 1.06 MB codegen 产物 |
| 5 | `dsh-subagent/package.json` | P16b | 1 | 机械冲突：devDeps 版本块 + 补 `dshRoutedSubagentPatch` marker |
| 6–11 | 见 `p5-staging/REPORT.md` | | | |

## 结构性发现

- **上游已删/改名，无需补做**：
  - `preset-registry/lib/invariant.js`（并入 `index.js` + `types/session.js`，P11 语义已在位）
  - `subagent/lib/types/continuation-activation.js` → `activation.js`，我们的 `async setup` 上游已自行实现
- **P5.1 导出契约实证**：上游改 `startActivation` / `settleRunResult`；`registerExternalContinuation` 家族仍在。导出行冲突必须保留三个旧名字，否则 P7 报 `NO-EXPORT`。
- **codegen 产物**（`typert.*`、`types/client/**`、`api-catalog.js`、`api-remotes/client.js`、`cordis-client-runner/client.js`）不应逐块手改，应从源码重生后回补。

## 当前系统状态

- 壳 2.0.18 / 内核 0.2.1-rc.2（**未打任何内核补丁**，除 P30）
- `lib/updates.js` 已改为 `default(false)`（P30）
- profile：`@deepseek-ai/dsh-client-ui-subagent`、`subagent-codex/claude-code` 已升 0.2.1-rc.2；schemastery 3.18.5；5 个 link 依赖可解析；super-injector marker 在位
- DSH 进程：**已停止**（避免半补丁状态被误用）
- 回复基线：`{{AI_FILES}}\dsh-backups\upgrade-2.0.18-20261019T101751Z\`（含 2.0.16 安装包与 shell-app）

## 下一步（严格顺序）

1. 补合并 `dsh-llm-pi-ai/lib/index.js`、`pi-ai/openai-completions.js`（含 P3/P41/P43），video 块标 TODO。
2. 解析 5 个高优先级冲突（P16/P44 优先），每解一个跑 `node --check` + `esm-syntax-check`。
3. 把 P5 结果落到生产树，备份每个原文件为 `.pre-p5`，跑：
   - `node --check` / `esm-syntax-check.mjs`
   - `check-plugin-imports.mjs`（必须 0 NO-EXPORT）
   - 启动 `verify-0218` 冒烟
4. 独立审查 P5，通过后才进 P6。
