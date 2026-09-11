# A1 ORPHANS 报告 — rc.2 官方基线 vs 安装树全量闭合（2026-09-10）

范围：20 个有补丁痕迹的宿主基线包（12 复用 `~/.dsh/tmp/rc2-vs-patches` 官方原件 + 8 npm pack 新取）
与安装树 `DSH Desktop/resources/app.asar.unpacked/node_modules` 的**全量清单 diff**（不只补丁目标文件），
外加 profile 树 P5 文件。diff 一律 `diff -u --strip-trailing-cr`（安装态 EOL 事实见 §C1）。
产物：`rc2-diffs/` 23 个标准 diff 文件；前向应用验证 **23/23 PASS**（应用后与安装态 CR 归一后逐字节相等，
脚本 `~/.dsh/tmp/a1-baseline/verify-apply.sh`）。

## 结论（TL;DR）
- 30 项登记补丁的全部目标文件差异 = 23 个合并/单项 diff 文件，全部 hunk 可归属，**未发现隐藏的第 31 处代码漂移（孤儿 hunk）**。
- **但发现 1 项未登记补丁：P25（第 31 项，点名见 §B）**——它不是孤儿 hunk，而是"有主无名"：现场脚本自认 P25，方案/manifest 30 项清册没有它。
- 其余"未证"缺口全部闭合，剩余差异均为**非补丁形态差**（EOL / 安装剪枝 / 嵌套依赖 / 备份产物），清单见 §C。

## B. 第 31 项差异（必须点名）：P25 — dsh-llm-pi-ai gateway body-size guard
- 文件：`@deepseek-ai/dsh-llm-pi-ai/lib/index.js`，与 P17/P19b/P20 同文件。
- 内容：新增 `__p25OffloadOldVideos(messages)`（仅保留最新一个内联 video 的 data URL，更早的降级为文本占位）
  + dispatch 处 `p25Messages` 调用 + `context` 构造改为消费 `p25Messages`；标记注释 `// P25:`（2 处）。
- 证据链：安装树存在 `index.js.bak-P25`（09-10 00:19）；补丁脚本 `~/.dsh/tmp/p25_patch.js`（09-10 17:37）；
  安装文件 mtime 09-10 17:42；登记辅助脚本 `p26_manifest.js`（09-10 18:06）已把该文件 ids 写为 `P17+P19b+P20+P25`。
- 与清册的矛盾：方案 v5 §1.0 计数表锁定 30 项（P1–P24+P16b 等），manifest.json 现仅 25 项（P1–P19b）——**两者都不含 P25**。
- 处置要求：A0/方案桌二选一——(a) P25 正式登记为第 31 项并同步 §1.0 计数表与 Phase 2 重放清单；(b) 显式回滚 P25。
  若维持现状，L2/L3"重放 30 项标准 diff"无法复现当前安装态（已打上的 P25 会被还原掉）。
- 本目录对应产物：`P17-P19b-P20-P25-dsh-llm-pi-ai.combined.diff`（文件名已并入 P25，头注标记 UNREGISTERED）。

## C. 基线内非补丁形态差异（全部核实，无代码语义）

### C1. 行尾（EOL）形态
- 官方 npm tarball 全部 LF；安装树中 13 个补丁目标文件为**整文件 CRLF**（壳 2.0.1 解包形态）：
  cordis、cordis-plugin-loader、dsh-session、dsh-goal、dsh-agent、dsh-agent-presets、dsh-client-connection、
  dsh-client-runtime、dsh-client-ui-subagent、dsh-file-reference-local、dsh-host-apiproxy、dsh-subagent(lib)、
  dsh-llm-pi-ai、dsh-tool-fs。
- `@earendil-works/pi-ai/dist/api/openai-completions.js` = **混合**（CRLF 基座 + 8 行纯 LF——P17c/P23 补丁脚本按 LF 插入的行，补丁痕迹本身）。
- 09-10 视频系补丁的目标文件被脚本整体重写为 LF：dsh-llm-deepseek、dsh-client-ui-conversation、
  dsh-client-ui-attachment、dsh-llm、openai-responses-shared、dsh-token-meter（安装=官方均 LF，diff 无 EOL 噪声）。
- `dsh-subagent/package.json` 两侧同为 CRLF。
- **所有 rc2-diffs 以 `--strip-trailing-cr` 生成**；重放（Phase 2/L2/L3）必须容忍 CR：官方树→打 diff→若目标是 CRLF 文件，用
  `git apply --ignore-whitespace` 或先按官方 LF 形态应用再转换，或将安装文件 CR 归一后应用再还原。verify-apply.sh 演示了 CR 归一路线。

### C2. 安装树文件剪枝（official-only，无 manifest 归属，良性）
- `@deepseek-ai/cordis-plugin-loader/`：安装树缺 `README.md` 与 **7 个 `.d.ts`**
  （`lib/types/index.d.ts`、`lib/types/internal.d.ts`、`lib/types/config/{entry,group,isolate,tree,utils}.d.ts`）；
  对应 7 个 `.d.ts.map` **保留**。类型声明被安装器剥离，运行时无影响；列入 drift-scan 白名单。

### C3. 安装树新增（installed-only，非补丁）
- `@earendil-works/pi-ai/node_modules/@opentelemetry/api/`：官方 package.json 声明依赖
  `"@opentelemetry/api":"1.9.0"` 的嵌套安装产物。良性，入 drift 白名单。

### C4. 补丁工作产物（installed-only，登记归属后良性）
| 产物文件 | 归属 |
|---|---|
| `cordis/lib/index.js.patched-gpd` | P2 diffTargetPath（manifest 已登记） |
| `cordis-plugin-loader/lib/index.js.pristine` | P1 前态快照（=官方，见 §D-P1） |
| `cordis-plugin-loader/lib/index.js.bak-dbg-parent-20260821`、`.bak-isolate-fix-20260821` | loader 调试期备份（manifest 无引用，建议 A0 登记为历史产物） |
| `dsh-llm/lib/index.js.bak-video-20260831` | P19 sourcePath（在位✓） |
| `dsh-llm-pi-ai/lib/index.js.bak-video-20260831`、`.bak-P20`、`.bak-P25` | P17/P19b sourcePath、P20 前态、P25 前态 |
| `dsh-llm-deepseek/lib/index.js.bak-video-20260831` | P17b sourcePath（在位✓） |
| `dsh-tool-fs/lib/index.js.bak-P21` | P21 前态 |
| `dsh-client-ui-conversation/lib/client.js.bak-video-20260831` | P18b sourcePath（在位✓） |
| `dsh-client-ui-attachment/lib/client.js.bak-video-20260831` | P18c sourcePath（在位✓） |
| `dsh-token-meter/lib/index.js.bak-P24` | P24 前态 |
| `pi-ai/dist/api/openai-completions.js.bak-P23`、`openai-responses-shared.js.bak-P22` | P23/P22 前态 |
| `@dsh-external/dsh-super-injector/lib/index.js.bak-gateway-20260820`（profile 树） | P5 sourcePath（在位✓，P05 diff 的基线） |

### C5. 补丁引入的空白噪声（已被 diff 完整捕获，不算孤儿）
- apiproxy `async prompt(request)` 缩进漂移（P9/P18 编辑顺带）；dsh-client-runtime `fork()` 缩进漂移 +
  **文件尾换行新增**；dsh-client-connection schema 缩进漂移 + 文件尾换行新增（官方两文件 EOF 无换行）。均在对应 diff 内。

## D. sourceBroken 附录（任务指定 P1/P13 + 顺位发现的同类）
- **P1**：`sourcePath=@deepseek-ai/cordis-plugin-loader/lib/index.js.bak-20260820-cycle-guard` **不存在**。
  反建：`lib/index.js.pristine` 与 npm 官方 1.0.2 `lib/index.js` **CR 归一后逐字节相同**（cmp 验证）——
  可作 P1 的改前基线替代；或将 `rc2-diffs/P01-cordis-loader-cycle-guard.diff` 反向应用（`patch -R -p1`，需容忍 CRLF）从安装态还原版。
  建议 A0 把 sourcePath 改指 `.pristine` 并注记等价关系。
- **P13**：`sourcePath=@deepseek-ai/dsh-host-apiproxy/lib/index.js.bak-sse-batch-20260822` **不存在**。
  反建：P13 改前态 = 当前安装文件**仅**反向应用 `P7-P9-P13-P18-apiproxy.combined.diff` 的 `@@ -4855` hunk
  （SSE 批量块自包含，反向即还原 `for await ... controller.enqueue(...)` 单行原版）。
  该 hunk 即 P13 的完整差异，manifest 的 sourceBroken 说明可直接引用本文件该 hunk。
- 同类（未在任务点名内，一并记录）：**P2** `.bak-20260820-cordis-gpd-cache` 缺失（改前态=官方基线，rc2-diffs/P02 即其差异）；
  **P6** `.bak-permitfix` 缺失；**P15** `.bak-stacktrace-20260824` 缺失（其源注记在 P14 note 里也指向该文件）；
  **P7** note 所指 `.bak-gbk-polluted-20260821` 缺失；**P16** sourcePath 为散文（"rc.8 fork, production tree"）非路径。
  共同点：官方 npm 基线 + 本目录标准 diff 已可完全替代这些断链 bak 的"改前对照物"职能。

## E. 与 manifest / 方案 30 项对不上的地方（汇总）
1. **P25 未登记**（§B）——计数表需 30→31 或回滚。
2. `manifest.baseline` 写 `0.1.0-rc.8`；安装树实测 `0.1.1-rc.2`（8 个 rc.8 sourceSpec 同步待改）——A0 §1.6 已在办，尚未落盘（manifest mtime 仍 Aug 31）。
3. manifest 当前仅 25 条（P1–P19b），P20–P24 待 A0 登记；P20–P24 的现场锚点已由本目录 diff 固定（P21 marker 3 处 `// P21:` + schema 放宽；P24 `VIDEO_BLOCK_TOKENS@:16` + `case "video"@:37`——方案 §1.1 预估值与现场一致）。
4. 任务口径核对：方案 §1.1 "P20 落点 dsh-llm-pi-ai、tool-fs 内仅 P21 注释顺带提及" **成立**；但任务下发文本"dsh-tool-fs（P20/P21 同文件）"不准确——实测 tool-fs diff 无 P20 代码，仅 P21 注释里出现字符串 "P20 frames fallback"（P21 imageReadContent 注释）。
5. P13 双重身份：manifest=apiproxy SSE 批量（rc.2 现状，本目录已固化）；方案 §1.3 组C=dsh-api-gateway WS 移植目标（v205）——现状/目标态并存，非矛盾，登记时建议分开表述。
6. pack 清单：方案 §1.6 "6+1=7 pack"不含 dsh-token-meter；P24 使其成为**第 8 包**（本 A1 已按任务指令执行，全部成功）。

## F. 证明边界（诚实声明）
- "全部差异恰好 = 补丁集"仅在 **20 个基线包 + profile P5 文件** 内闭合（含各自全部文件的全量清单扫描）。
- 其余 ~190 个 unpacked 包未取官方 tarball 对照，A1 不背书"零差异"；全树兜底 = 方案 A3-5 drift-scan。
- rc2-vs-patches 复用的 12 包可信度旁证：其 package.json 与安装树同名包 package.json 全部逐字节一致（除 P16b 目标本身），
  且 cordis-plugin-loader `.pristine` == 其官方副本（双重印证）。
