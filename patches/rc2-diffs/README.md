# A1 — rc.2 标准 diff 集（升级方案 v5.1 Phase 0 / §1.6）

生成时间：2026-09-10（Git Bash + GNU diff/patch + node v24）。
命题：`DSH Desktop 2.0.1` 安装树（unpacked，20 个基线包范围）相对官方基线的**全部内容差异** =
30 项登记补丁 + 1 项未登记 P25（见 `ORPHANS.md §B`），逐文件落成标准 unified diff。

## 基线来源
- **npm pack（8，registry.npmjs.org，全部成功；`~/.dsh/tmp/a1-baseline/packs/` 保留 tgz）**

| 包 | 版本 | sha256(tgz) |
|---|---|---|
| @deepseek-ai/dsh-llm | 0.1.1-rc.2 | b109bbed162a5cd7ec19cc72679d0723a6641d019f4c3827dacab1819bf3320c |
| @deepseek-ai/dsh-llm-pi-ai | 0.1.1-rc.2 | b223240d3ccc8ef8f9f6d4ab54146e6d2fb24b73bcaf9a121fefee230aef5c65 |
| @deepseek-ai/dsh-llm-deepseek | 0.1.1-rc.2 | b428cfc31fb179ea4ddcb2b30f553106f0342547a52056a03504145639314686 |
| @deepseek-ai/dsh-tool-fs | 0.1.1-rc.2 | 4b7629fe7f55e0694048aec6994c5eb01cb13f3078b26265b29549de2aa3e0d4 |
| @deepseek-ai/dsh-client-ui-conversation | 0.1.1-rc.2 | 9403b33b02f9d5daf564764f9a615dc5eb31cc1b449384c0a793b0bc5a9354bd |
| @deepseek-ai/dsh-client-ui-attachment | 0.1.1-rc.2 | 142fe00a9d325ecbb2da89844a43d267ad1f43547eef4505a9d6b8131e07d9ad |
| @deepseek-ai/dsh-token-meter | 0.1.1-rc.2 | 1188932316e62be359a53aa527ea045e56e0b07cf2a1627454bf7e7ed660a483 |
| @earendil-works/pi-ai | **0.82.1**（安装树实测版本；rc2-vs-patches 旧档 0.84.3 作废） | 2f9df9522808b621cd3449876537f03d8a8df8b8d7ec2d5b18c6a910aa85b490 |

- **复用 `~/.dsh/tmp/rc2-vs-patches/@deepseek-ai/`（12 官方原件，拷入 `~/.dsh/tmp/a1-baseline/official-extra/`）**：
  cordis@4.0.1、cordis-plugin-loader@1.0.2、dsh-session、dsh-goal、dsh-agent、dsh-agent-presets、
  dsh-client-connection、dsh-client-runtime、dsh-client-ui-subagent、dsh-file-reference-local、
  dsh-host-apiproxy、dsh-subagent（后 10 个均 0.1.1-rc.2，与安装树 package.json 逐字节一致）。
- P5 基线 = profile 树 `@dsh-external/dsh-super-injector/lib/index.js.bak-gateway-20260820`（改前快照，非 npm 包）。

## 约定
- diff = `diff -u --strip-trailing-cr --label a/<pkg>/<rel> --label b/<pkg>/<rel> <官方> <安装>`；
  `a/`=官方基线、`b/`=安装态（Phase 2 重放方向 a→b）。EOL 事实与容忍方法见 `ORPHANS.md §C1`。
- 同文件多补丁 → 合并单文件（注释头声明应用顺序 + hunk 归属）：
  - `P7-P9-P13-P18-apiproxy.combined.diff`（顺序 P7→P9→P13→P18）
  - `P3-P17c-P23-pi-ai-openai-completions.combined.diff`（顺序 P3→P17c→P23）
  - `P17-P19b-P20-P25-dsh-llm-pi-ai.combined.diff`（顺序 P17→P19b→P20→P25；**P25 未登记**）

## 文件索引（23 个 diff 覆盖 31 项）
| diff 文件 | 补丁 | 目标文件 |
|---|---|---|
| P01-cordis-loader-cycle-guard.diff | P1 | cordis-plugin-loader/lib/index.js |
| P02-cordis-gpd-cache.diff | P2 | cordis/lib/index.js |
| P3-P17c-P23-pi-ai-openai-completions.combined.diff | P3, P17c, P23 | pi-ai/dist/api/openai-completions.js |
| P04-dsh-session-known-events.diff | P4 | dsh-session/lib/index.js |
| P05-super-injector-gateway.diff | P5 | profile @dsh-external/dsh-super-injector/lib/index.js |
| P06-dsh-goal-verification-seam.diff | P6 | dsh-goal/lib/index.js |
| P7-P9-P13-P18-apiproxy.combined.diff | P7, P9, P13, P18 | dsh-host-apiproxy/lib/index.js |
| P08-ui-subagent-input-triggers.diff | P8 | dsh-client-ui-subagent/lib/client.js |
| P10-client-runtime-fork-agentpreset.diff | P10 | dsh-client-runtime/lib/client.js |
| P11-agent-presets-seedlength.diff | P11 | dsh-agent-presets/lib/index.js |
| P12-client-connection-fork-schema.diff | P12 | dsh-client-connection/lib/client.js |
| P14-file-reference-local-dispose.diff | P14 | dsh-file-reference-local/lib/index.js |
| P15-dsh-agent-dispose-stacktrace.diff | P15 | dsh-agent/lib/index.js |
| P16-dsh-subagent-routed-fork.diff | P16 | dsh-subagent/lib/index.js |
| P16b-dsh-subagent-pkg-marker.diff | P16b | dsh-subagent/package.json |
| P17-P19b-P20-P25-dsh-llm-pi-ai.combined.diff | P17, P19b, P20, **P25** | dsh-llm-pi-ai/lib/index.js |
| P17b-llm-deepseek-video.diff | P17b | dsh-llm-deepseek/lib/index.js |
| P18b-ui-conversation-video.diff | P18b | dsh-client-ui-conversation/lib/client.js |
| P18c-ui-attachment-video.diff | P18c | dsh-client-ui-attachment/lib/client.js |
| P19-dsh-llm-contenthasvideo.diff | P19 | dsh-llm/lib/index.js |
| P21-dsh-tool-fs-video.diff | P21 | dsh-tool-fs/lib/index.js |
| P22-pi-ai-responses-shared-video.diff | P22 | pi-ai/dist/api/openai-responses-shared.js |
| P24-token-meter-video-tokens.diff | P24 | dsh-token-meter/lib/index.js |

## 验证记录
- 前向应用：官方件（CR 归一）+ 每个 diff → 与安装态（CR 归一）`cmp` 逐字节相等：**PASS=23 FAIL=0**
  （`~/.dsh/tmp/a1-baseline/verify-apply.sh`，2026-09-10）。
- 全量清单：20 包 `diff -rq --strip-trailing-cr` 扫描——差异文件恰为补丁目标集合，无额外内容差异文件；
  official-only / installed-only 清单全部在 `ORPHANS.md §C` 归类。


## v209 增补（2026-09-11，2.0.9/0.1.5-rc.1 重放波）
- P26-session-events-getter-v205.diff（自 rc2 备份逐字，v209 亦需）
- P27-format-v2v3-video-kind.diff / P28-format-v2v3-source-kinds.diff（迁移白名单，P28 含 6 kind）
- P29-client-ui-commands-backoff.diff（v2：P29 backoff + P29b 15s 超时/250ms 合并窗 + P29c pending 不双发；+ .test.cjs 已扩 3 组断言）
- P30-updates-enabled-default.diff（updates.js `enabled` schema 默认 true→false，仅 default+注释；a=2.0.9 官方 asar 提取，git apply -R --check 过，正向重放逐字节=asar-root）
- 验证记录：2026-09-11 git apply -R --check 严格（无 ignore-ws）P26-P29 4/4 PASS（终审A）；装机 asar 由 packed-final 部署（sha d7e9d301…，28 差异文件 1:1 归属 35 项，0 意外）。
- 2026-09-11 加固波：P29(v2)+P30 `git apply -R --check` PASS（P29 于 asar-root/node_modules、P30 于 asar-root）；正向重放 official(app.asar 提取)+两 diff ≡ asar-root 逐字节（`git -c core.autocrlf=false apply`，机器全局 autocrlf=true 会污染 EOL）；离线测：P29.test.cjs 全绿（含超时计数/250ms 合并/pending 不双发）、voice-verify.mjs 7/7（真 import apply + handler 源码等值抽取）、updates.js/voice index.js/better-sidebar×2 node --check PASS、V7 无 globalThis 写断言 PASS。
