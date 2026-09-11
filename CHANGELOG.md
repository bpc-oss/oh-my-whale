# Changelog

## [0.3.0] - 2026-09-11 — 2.0.9 / 内核 0.1.5-rc.1 packed-asar 时代（一夜双跳 2.0.1→2.0.5→2.0.9）

### 架构剧变（升级 SOP 全改写）
- **0.1.3+ 内核整体装进 `resources/app.asar`**，`app.asar.unpacked` 只剩 8 个原生件目录 → 官方引入 **Electron asar 完整性 fuse**（`EnableEmbeddedAsarIntegrityValidation`）：repack 过的 app.asar 会 FATAL 闪退。处置：`@electron/fuses write --app "DSH Desktop.exe" EnableEmbeddedAsarIntegrityValidation=off`（exe 原件备份 `~/.dsh/tmp/v209-intel/exe-backup.bin`；`OnlyLoadAppFromAsar` 保留 on）。repack 管线（brace 语法 `--unpack-dir` + build/*.png，unpacked 标志 parity 已核）固化于 `scripts/v209/pack-209.ps1`。
- **canonical 补丁树迁移**：`~/.dsh/runtime/v209-patched-tree`（tmp 清理炸弹解除；484 农场 junction 已重指）。真身链：profiles 农场→runtime 树；voice 插件 symlink→`~/dsh-voice-input`（改即生效，无需 repack）。
- **更新器真相**（推翻 electron-updater 假设）：壳自研 `desktop-updates`，feed `dshdesktop.cn`，6h 轮询仅提示；下载/安装各需确认框（default=稍后），**无静默覆盖**。补丁环境加保险：**P30** `lib/updates.js` enabled 默认 false。
- **自动回归三绿**：`verify.ps1 -Source asar-root|installed` + profile verify（36+9 项）；`drift-scan.ps1` 默认源切 runtime 树，根层目标（P30）解析修复。

### v209 适配波（新补丁 P26–P30 + 四起"新校验拒旧产物"）
- **P26** dsh-session `get events()` 兼容 shim——0.1.2 删了公共访问器，7 个 profile 插件（verification/better-sidebar/super-injector/vision-toolkit/openpencil/chrome-faithful）全崩 `session.events is not iterable`，**新建会话直接失败**（G3 实机抓出）。
- **P27/P28** session-format v2→v3 迁移白名单：content `video` + source 六 kind（fallback/instruction-hint/provider×283会话/verifier-guide×133/jspace-frame/ai-tube-mission）——官方迁移层不认自家近期血统与我们自定义模态，历史会话成片打不开。**全库 1631 会话逐帧复扫宣告闭合**（`scripts/v209/scan_sessions2b.py`）。
- **P29** dsh-client-ui-commands 重试风暴修复：`commands/list` 无限循环（单页 1018 次）→ 指数退避+30s 熔断+15s 超时+force 合并窗。**P30** 见上。
- **M1 persona 迁移**：0.1.5 `dsh-persona` `text`→必填 `prefix`，13/13 preset agent.cordis.yml 批量改（`.bak-v209-persona`），用户实测恢复无错。
- **V7/V8**：better-sidebar `__DSH_MODULES__` 桥（壳已删该全局；懒 chunk "client module system unavailable"）——局部 `__bsModuleSystem` fallback 不污染全局；voice host 路由 v209 三连修（owner-fiber 崩溃→嵌套 effect 不挂载→直挂+信封桥→fix4 加固 405/4MiB/try-catch），真 HTTP POST /voice/ping 200 + GET 405 双证。
- **会话文件新命名** `session.v3.jsonl.zstd`（旧文件不动）；roundtrip/扫描工具双 glob 兼容。

### 流程升级（本轮独立审查打的靶）
- 三切面×两轮 + 打假纪律：**UI 文本不作证据，磁盘帧/真 HTTP 才算**（一例"假绿"被纠正后重做真取证 RT-2035 turn/end completed）。
- 版本目标纪律：升级方案定稿与动手前 **各重查一次上游 releases**（一夜 2.0.5→2.0.9 的教训入 `docs/upgrading.md`）。
- 装机指纹：app.asar `21a21b14…`（36 项全含）；回滚链 v209-pristine（`robocopy /MIR` 修正版 README）→ shell-2.0.1 → rc.2。
- 完整复盘：`docs/upgrade-v209-executed.md`（附4–附11：v205→v209 全程、审查发现与销项）。

## [0.2.1] - 2026-08-21

### fork-to-preset 端到端修复补丁（P9–P12，rc.5 时代能力丢失的完整恢复）
- **P9 `dsh-host-apiproxy`**：`session.fork` 支持 `agentPreset`——Zod schema 字段 + 权威 `composeAgent()` 分支（resolve+mount 单一路径）+ child meta/selection 记录。修复：字段到达 Host 后调用不存在的 `validatePreset()` 导致 HTTP 500。
- **P10 `dsh-client-runtime`**：public+manager `sessions.fork` 全链转发 `agentPreset`（`SessionForkOptions` schema 同步）。
- **P11 `dsh-agent-presets`**：`resolveSessionPreset` 尊重 `header.seedLength`——fork seed 继承的母会话 `agent-preset/selected` 事件不再覆盖 child header（最深语义 bug：磁盘 header 正确但 UI 显示母 preset）。
- **P12 `dsh-client-connection`**：镜像 fork request schema（host/client 同步，防字段剥除）。
- 完整复盘：`dsh-fork-to-preset/docs/incident-2026-08-21-rc8-fork-to-preset.md`（606 行，含五层断链分析 + 测试建议 + 上游拆分建议，存于插件源码仓库）。
- **注意**：`dsh-desktop.mode: advanced` 会禁用 `ui-layout`（launcher 行为）→ 桌面打不开/UI 残缺——本机已改 `compatibility`。

## [0.2.0] - 2026-08-21

### Drift Watch（迭代 1）：快照式 → 追随式
- **`scripts/drift-scan.ps1`（新）**：四层漂移扫描（补丁 / 配置 / 插件 / 报告 JSON）
  - 补丁层：manifest 补丁状态（reverse-apply + marker 兜底）+ `.bak`/`.orig` 扫描（UNKNOWN-MODIFIED）
  - 配置层：7 模板渲染对比 + package.json JSON 语义对比（忽略键序/斜杠）+ 运行态豁免（allowlist）
  - 插件层：内核包排除 + bundles/SOURCES/dependencies 三方对比 + install_type 规范化表
  - `--compare` 全量增量矩阵：new-lost / new-unknown / gone-from-baseline / new-removed-baseline / recovered
  - `docs/drift-allowlist.json`：已确认漂移逐项豁免（type/path/reason/date，需提交）
  - 编码纪律：UTF-8 无 BOM 写报告、ReadAllText 读内核文件（PS 5.1 兼容）
- **端到端验证**：模拟 P6 事故（基线 UNKNOWN → 升级后消失）→ `gone-from-baseline` 门禁触发 ✓；allowlist 豁免后放行 ✓
- **`docs/upgrading.md`**：门禁集成 Step 1.5（基线）/ Step 3.5（升级后对比阻断循环）/ Step 5（CLEAN 校验）

### 本机漂移处置（drift-scan 首跑发现）
- **捕获 P7**：`dsh-host-apiproxy` session.list 降载补丁（LIST_PROJECTION_EXCLUDED，2026-08-20 打的，从未登记）
  - 原始补丁写入污染了文件编码（GBK mojibake）；从 npm-pack 官方重建干净版 + CRLF 对齐内核
  - 污染现场保留 `index.js.bak-gbk-polluted-20260821`（allowlist 记录）
- **捕获 P8**：`dsh-client-ui-subagent` input-triggers 补丁（rc.5 时代 @ 提及子代理源，rc.8 丢失）
  - 子代理 UI 不显示 = deps 缺失 + junction 缺失 + host client.js 补丁丢失（三要素）
  - 幂等补丁脚本在 `dsh-routed-subagent/scripts/_patch_ui_subagent.mjs`
- **drift-scan 加 junction 层（[3.5]）**：扫描所有 link: 依赖插件的 node_modules junction（STALE=指旧壳 / MISSING / OK）——该模式已漏 5 次
- **全量内核审计**：全部 @deepseek-ai 包 vs npm 官方 rc.8 对比——唯一差异为 dsh-subagent fork（101 行，已知），其余全部可由 P1-P8 解释，**无隐藏补丁**
- **SOURCES.json 18 → 22**：登记 subagent-codex / subagent-claude-code / dsh-global-tool-discovery / dsh-client-ui-subagent
- **profile/package.json.template**：对齐本机 deps/bundles（4 新依赖 + 3 新 bundle）
- **drift-allowlist.json**：记录有意保留的漂移（fork-to-preset 止血中 / 运行态配置 / 污染备份）

## [0.1.1] - 2026-08-21

### 补丁清单修复（rc.8 升级遗留复盘）
- **新增 P6 `dsh-goal` verification-seam 补丁**（`patches/host/006-dsh-goal-verification-seam.patch`）：
  - 背景：rc.5 时代打的 verification-seam（GoalTransitionGuard + permitRef 白名单）在 rc.8 升级时丢失
    （新壳 dsh-goal 是官方原版，无 `registerTransitionGuard`）——它不在 P1–P5 清单里，升级核对漏掉。
  - 内容：`registerTransitionGuard` API + `dispatchTransitionGuards`（goal complete 同步 pre-commit 校验）
    + goal change 白名单允许 `permitRef` 并透传。
  - 已验证：`node --check` 通过；`verify.ps1` P6 applied；rc.8 与 rc.7 差异仅此 seam（干净重打）。
  - 影响：verification 的 goal-guard 是优雅降级（seam 缺失时静默跳过），补丁恢复**同步拦截**能力。
- `manifest.json`：补丁清单 5 → 6 项，P6 记录 source/bak 与 rc.8 丢失说明。
- `patches/host/verify.ps1`：marker 表加 P6（`registerTransitionGuard`）。
- **教训固化**：升级核对清单必须含「宿主补丁依赖的插件」（routed-subagent fork / dsh-goal seam / 插件 junction 指向），
  仅核对 P1–P5 会漏。

### 运行环境修复（本机 rc.8）
- dsh-subagent-rc8/package.json 去除 UTF-8 BOM（boot 即崩：healProfilesModuleFallback JSON.parse 失败）
- 三处插件 junction 从旧壳 rc.7 更新到新壳 rc.8（fork-to-preset / continuous-worker / routed-subagent lib）
- dsh-fork-to-preset 因 renderer boot fatal 移出 bundles（根因待查，疑似 rc.8 无官方客户端包）

## [0.1.0] - 2026-08-20

### Phase 1 — 基建
- Repo 骨架 + git 初始化（本地）
- `patches/manifest.json`：5 补丁元信息 + rc.8 版本基线
- `scripts/capture.sh`：从本机内核捕获补丁（.bak 快照 / npm pack 原版为 diff 基准）
- 5 个补丁生成并验证可逆：
  - P1 cordis-plugin-loader 防环 + parentEntry（rc.8 保留）
  - P2 cordis gpd 缓存
  - P3 pi-ai bai 特判
  - P4 dsh-session KNOWN 事件
  - P5 super-injector gateway 集成（存档；实际靠重建 tgz 生效）
- `patches/host|profile/apply.ps1` + `verify.ps1`（幂等、CheckOnly、marker 兜底）
- 重建 `profile/vendor/dsh-external-dsh-super-injector-0.3.3.tgz`（含 P5 gateway）

### Phase 2 — 配置模板化
- `config/settings.yaml.template`：6 providers、apiKeyEnv 保留、`'off': null` 引号
- `profile/package.json.template`：18 deps / 17 bundles，路径全变量化
- `profile/cordis.patch.yml.template`：tailscale/python/bridgePath/modelDir/file:// 变量化
- `profile/pnpm-workspace.yaml.template`：chrome-faithful 变量化
- `scripts/template-render.ps1`：变量替换 + file:/link:/file:/// 正斜杠规范化
- `scripts/check-private.ps1`：隐私扫描（case-sensitive、JSON 转义路径、standalone 白名单）
- `config/.env.example`：环境变量清单

### Phase 3 — 插件清单
- `plugins/SOURCES.json`：18 插件源清单（install_type → package.json specifier 映射）
- `plugins/standalone/`：4 个本地插件源码（token-meter-hermes / continuous-worker / routed-subagent / voice-input）
- `config/.agent-presets/`：10 个 preset 源码
- `profile/vendor/`：5 个 vendor tgz（super-injector 含 P5）
- `plugins/inventory.md`：分类清单

### Phase 4 — 安装脚本
- `bootstrap.ps1`：7 阶段安装器（环境检测 → 备份 → 补丁 → 配置 → 依赖 → gateway → 冒烟）
- `scripts/check-env.ps1`：新机前置检查

## [计划]
- Phase 5：文档（architecture / handoff / upgrading）+ 独立审查
- Phase 6：CI + pre-commit hook + GitHub 推送

## 2026-08-22 — governance split (plan v5.1 APPROVED)

- 新增 `@agent-os/dsh-governance`（A 插件）来源与 profile 行，默认 `enabled: false`。
- `plugins/SOURCES.json` 新增 local file-dir 条目（`{{USER_HOME}}/dev/dsh-governance`）。
- `profile/package.json.template` 增加依赖与 bundle；`profile/cordis.patch.yml.template` 增加 disable 行。
- `gateway/README.md` 新增 #9“不得写 session”检查项（权威级，覆盖 dev_install_package 路径）。
- C 插件（`@agent-os/framework-governance`）为独立仓库 `{{USER_HOME}}/dev/agentos-framework-governance`，不由 bootstrap 自动安装。