# 0.1.1-rc.2 升级方案（rc.8 → rc.11）

> 日期：2026-08-25
> 目标：`@deepseek-ai/dsh` 全家桶 0.1.0-rc.8 → 0.1.1-rc.2（2026-08-21 发布）
> 前置事实：桌面壳 2.0.1 不变；cordis 4.0.1 / cordis-plugin-loader 1.0.2 不变；pi-ai 0.82.1 → 0.84.3（唯一跨版本跳跃）

---

## 0. 上次升级教训（rc.7→rc.8，本方案必须规避的坑）

| # | 教训 | 本方案的对应措施 |
|---|---|---|
| L1 | **补丁遗漏**：P6/P8/P9-P12 等 rc.5 时代补丁升级后被官方覆盖，未重打 | Step 3 用 `drift-scan --compare` 门禁，逐补丁 reverse-apply 验证，不是"看起来能用" |
| L2 | **junction 全部指旧壳/丢失**（已漏 5 次）：fork-to-preset / continuous-worker / routed-subagent / client-ui-subagent / dsh-subagent fork | Step 4 专门 junction 清单 + drift-scan [3.5] 自动化；**不依赖手动记忆** |
| L3 | **新旧壳路径混淆**：`C:\Program Files\DeepSeek Harness`（旧壳回滚树）vs `%LOCALAPPDATA%\Programs\DSH Desktop\resources\app.asar.unpacked`（真实运行）——曾导致误判 | 方案全程只用 `$RUN_KERNEL = %LOCALAPPDATA%\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules`，禁止查旧壳 |
| L4 | **dsh-subagent fork 丢失**：routed-subagent 断言失败 → subagent_routed 工具不可用 | Step 4.2 专项：marker `dshRoutedSubagentPatch: v3.1-preset-mount` 验证 + junction 重建 |
| L5 | **client-ui-subagent 三要素**：deps + junction + host client.js 补丁（P8） | Step 4.3 专项：三要素逐一核对 + `_patch_ui_subagent.mjs` 幂等重跑 |
| L6 | **profile manifest BOM/重复**：JSON BOM 导致静默回退 desktop profile；cordis.patch.yml 重复段落 | Step 4.5：`file --mime-encoding` 检查 + `grep -c '^- id:'` 计数核对 |
| L7 | **配置漂移**：settings.yaml 布尔键陷阱、reasoningEfforts 值级约束（之前曾致自定义模型全消失） | Step 4.4：settings.yaml 模板渲染 diff，引号键检查 |
| L8 | **watcher 并发**：npm 全局 dsh 未改名时自动拉起 CLI host 干扰 | 升级全程保持 `dsh.bak-watcher-block-*` 改名，**且升级期间停掉 `watch-dgx-local-services.ps1` 进程**（它也会自动拉起 `dsh web` 与桌面版并发写同一 profile，曾致 id collision），结束后再恢复 |
| L9 | **中断安装恢复**：plugin-install-recovery state.json 阻塞启动 | Step 2/3 检查该目录，升级后启动前确认无 `recovery-pending` |
| L10 | **MCP 子进程挂起**：chrome-faithful MCP spawn 卡死 boot | Step 5 验证：进程树确认 chrome-faithful-mcp 存活且主进程有 renderer |
| L11 | **修完不验证**：多次"以为修好了"实际补丁没生效（P13 cp 反了等） | 每个补丁应用后立即 `node --check` + marker grep，写进 Step 3 检查单 |
| L12 | **升级影响评估缺失**：升级前不知道补丁命运 | 本文档 §2 已做全量 forward-apply 验证（17 项全部 CLEAN，含已迁移的 P3 与修复的 P13） |

---

## 1. 升级前基线（Step 0）

```powershell
# 全部在 oh-my-whale 仓库内操作
cd C:\path\to\oh-my-whale

# 0.1 全树备份（含 sha256 清单）
#   - 桌面壳: %LOCALAPPDATA%\Programs\DSH Desktop\  → backups/shell-2.0.1-<date>/
#   - 运行内核: $RUN_KERNEL → backups/kernel-rc8-<date>/
#   - profile: ~/.dsh/profiles/web → backups/profile-web-<date>/
#   - 生成 sha256 清单文件随备份存放

# 0.2 升级前漂移基线（门禁基线，必须 CLEAN 或逐项 allowlist）
powershell -NoProfile -File scripts\drift-scan.ps1 -Out baseline-drift.json
# 检查 baseline-drift.json: verdict == "CLEAN"（或所有漂移项已在 docs/drift-allowlist.json）

# 0.3 指纹基线
powershell -NoProfile -File scripts\capture-sources.ps1 -Quiet
git -C . add plugins/FINGERPRINTS.json && git -C . commit -m "baseline fingerprints pre-rc11"

# 0.4 前置健康检查
node --check $RUN_KERNEL\@deepseek-ai\dsh-host-apiproxy\lib\index.js   # P13/P7/P9 目标
node --check $RUN_KERNEL\@deepseek-ai\dsh-agent-presets\lib\index.js   # P11 目标
```

**门禁**：0.1-0.4 任一失败 → 停止，先处置再升级。

---

## 2. 补丁处置表（已 forward-apply 验证）

| 补丁 | 目标文件 | 官方 rc.2 状态 | 命运 | 说明 |
|---|---|---|---|---|
| P1 | cordis-plugin-loader 1.0.2 | 未内置 | **重打** | 同版本，干净 |
| P2 | cordis 4.0.1 | 未内置 | **重打** | 同版本，干净 |
| P3 | pi-ai openai-completions.js | 未内置（0.84.3 无 bai） | **重打** | **已迁移完成**（2026-08-25）：补丁头注明 migrated，对 rc.2 CLEAN；正式升级直接 `git apply`，无需手工迁移 |
| P4 | dsh-session | 未内置 | **重打** | 干净 |
| P6 | dsh-goal | 未内置 | **重打** | 干净 |
| P7 | dsh-host-apiproxy session.list | 未内置 | **重打** | 干净 |
| P8 | dsh-client-ui-subagent client.js | 未内置 | **重打** | 干净（+Step 4.3 三要素） |
| P9 | dsh-host-apiproxy fork+preset | ⚠️ 官方已含 agentPreset(125处) | **重打 + 语义复核** | 官方实现是否覆盖 fork 语义需端到端回归（§5） |
| P10 | dsh-client-runtime | ⚠️ 官方已含(15处) | **重打 + 复核** | 同上 |
| P11 | dsh-agent-presets seedLength | 未内置 | **重打** | 干净 |
| P12 | dsh-client-connection | ⚠️ 官方已含(73处) | **重打 + 复核** | 同上 |
| P13 | dsh-host-apiproxy SSE batch | 未内置 | **重打** | **补丁文件已修复**（2026-08-25 重建 header，对 rc.2 CLEAN）；备份源在内核目录 `$RUN_KERNEL\@deepseek-ai\dsh-host-apiproxy\lib\index.js.bak-sse-batch-20260822` |
| P5 | dsh-super-injector（profile 补丁） | 与内核无关 | **随 profile 备份/恢复** | archive/audit only（manifest 注释），不涉及内核升级 |
| P14 | dsh-file-reference-local | **官方未修复**（282 行原样） | **重打** | 干净 |
| P15 | dsh-agent dispose stacktrace | 未内置 | **重打** | 干净；dispose 错误诊断插桩（error.stack），对 rc.2 CLEAN |
| P16 | dsh-subagent routed fork | 未内置 | **重打** | routed-subagent fork（descriptor v3 preset / composition.preset / coldResume），12 hunks 对 rc.2 CLEAN；配合 P16b |
| P16b | dsh-subagent package.json marker | 未内置 | **重打** | `dshRoutedSubagentPatch: v3.1-preset-mount`（routed-subagent 启动断言），对 rc.2 CLEAN |

**P9/P10/P12 复核决策**（升级后 §5 回归前不退役）：
- 官方 agentPreset 支持可能是部分实现（无 seedLength 边界、无 composeAgent 分支）
- 以 fork-to-preset e2e 回归结果为准：母 A → 显式 B（child=B）/ 不指定（继承 A）/ 不存在 preset（结构化错误非 500）
- 回归全过 → 可评估退役 P9-P12；任一失败 → 保留我们补丁（官方 rc.2 是增量，补丁仍干净可打）

---

## 2.5 干跑门禁（Step 2.5，正式升级前必须全过）

> 目的：在副本内核上完整预演 3.1-3.4，把"未知风险"变成"已知可控"，再动生产树。
> 事实：官方 rc.2 包已在 `~/.dsh/tmp/rc2-vs-patches/`（审查用解压），可复用作干跑源。
> ⚠️ 干跑清单必须覆盖**所有补丁目标包**（P15 目标 dsh-agent、P16/P16b 目标 dsh-subagent），
> 遗漏会导致干跑失真（曾发生：初版清单只列 10 包）。

```powershell
# 2.5.1 建干跑内核树（复制生产内核，保留原始结构）
$DRY = "$env:TEMP\dsh-dryrun-kernel"
robocopy "$RUN_KERNEL\.." "$DRY" /E /XD node_modules /NFL /NDL /NJH   # 复制 app.asar.unpacked 结构（不含 node_modules）
robocopy "$RUN_KERNEL" "$DRY\node_modules" /E /NFL /NDL /NJH          # 复制 node_modules

# 2.5.2 覆盖官方 rc.2 包（全部 12 个核心包 + pi-ai 0.84.3）
#   @deepseek-ai/{cordis,cordis-plugin-loader,dsh-session,dsh-goal,dsh-host-apiproxy,
#                 dsh-client-ui-subagent,dsh-client-runtime,dsh-agent-presets,
#                 dsh-client-connection,dsh-file-reference-local,dsh-agent,dsh-subagent}
#   @earendil-works/pi-ai（0.84.3）

# 2.5.3 重打补丁（与 3.2 完全相同的命令序列，目标 = $DRY）
#   逐个: git -C $DRY apply -p1 --check patches\host\XXX.patch && git -C $DRY apply -p1
#   P3 已迁移（补丁文件即 0.84.3 版，直接 apply，无需手工迁移）
#   每个补丁后 node --check

# 2.5.4 干跑门禁
node -p "require('$DRY\node_modules\@deepseek-ai\dsh\package.json').version"   # 必须 0.1.1-rc.2
# drift-scan 指向 $DRY 跑一次补丁层（临时改 KernelDir 或用环境变量），确认 14 项 applied

# 2.5.5 冒烟（Node 级，无需启动完整 host）
#   - import $DRY 的 dsh-host-apiproxy: 模块可加载、exports 完整
#   - P3: 用 provider=bai 场景调用 $DRY pi-ai 的 openai-completions 特判路径（supportsDeveloperRole=false）
#   - P9-P12: import $DRY 的 apiproxy/runtime/connection, 验证 fork 请求 schema 含 agentPreset 且可解析
#   - P14: 确认 $DRY file-reference-local 282 行是 Promise.resolve(fiber.dispose())
```

**门禁**：2.5.3-2.5.5 任一失败 → 在干跑树解决并重跑，直到全过才进入 Step 3（正式升级只重复已证明的步骤）。

## 3. 执行升级（Step 3）

> 注意：**壳不升级**（2.0.1 已是当前版），只升内核包依赖。

### 3.1 升级内核（⚠️ 目标树是 app.asar.unpacked，不是 profile）

> 实测事实（审查确认）：内核 102 个 @deepseek-ai 包全在 `app.asar.unpacked/package.json`（dsh=0.1.0-rc.8）；`profiles/web/package.json` 只有 3 个 @deepseek-ai 依赖（client-ui-subagent、subagent-claude-code、subagent-codex）。**在 profile 跑 pnpm 不会升级内核**（rc.7→rc.8 先例是原地 `npm install --legacy-peer-deps`，见 HANDOFF §8.5.3）。

```powershell
# ① 内核树（主升级目标）——app.asar.unpacked 原地升级
cd "$RUN_KERNEL\.."   # = resources/app.asar.unpacked
# 将 package.json 中 @deepseek-ai/* 的 0.1.0-rc.8 全部改为 0.1.1-rc.2（pi-ai 0.82.1→0.84.3 若在该树）
npm install --legacy-peer-deps

# ② profile 树（仅 3 个客户端包）
cd ~/.dsh/profiles/web
pnpm up "@deepseek-ai/dsh-client-ui-subagent" "@deepseek-ai/dsh-subagent-claude-code" "@deepseek-ai/dsh-subagent-codex" --latest
```

**升级后第一道硬门禁（MAJOR-1 修复）**：
```powershell
node -p "require('$RUN_KERNEL\\@deepseek-ai\\dsh\\package.json').version"
# 必须输出 0.1.1-rc.2，否则 STOP——禁止进入 3.2
```

### 3.2 重打补丁（按 §2 处置表）
```powershell
cd C:\path\to\oh-my-whale
# 先修 P13 补丁文件（从备份重新生成，带 ---/+++ header）
# 逐个: git -C $RUN_KERNEL apply -p1 --check patches\host\XXX.patch && git -C $RUN_KERNEL apply -p1 patches\host\XXX.patch
# P3 按 0.84.3 新代码手工迁移（30 分钟，改后 node --check）
# 每个补丁应用后: node --check <目标> && grep -c <marker> <目标>
```

### 3.3 升级门禁（必须过）
```powershell
# 门禁 0：内核版本断言（防升级空转——drift-scan 不校验 kernel.version）
node -p "require('$env:LOCALAPPDATA\\Programs\\DSH Desktop\\resources\\app.asar.unpacked\\node_modules\\@deepseek-ai\\dsh\\package.json').version"
# 必须输出 0.1.1-rc.2，否则 STOP

# 门禁 1：补丁层对比
powershell -NoProfile -File scripts\drift-scan.ps1 -Compare baseline-drift.json
# → 阻断项（new-lost / new-unknown / gone-from-baseline / new-removed-baseline）
#   必须全部处置（重打 / 登记 manifest / allowlist），重跑直到无阻断
```

### 3.4 启动验证
```powershell
# 启动前确认 plugin-install-recovery 无 recovery-pending（L9）
# 启动后 30s 内: 端口监听 + HTTP 200 + renderer 进程存在 + chrome-faithful-mcp 子进程存活（L10）
```

---

## 4. 配置与插件迁移（Step 4）

### 4.1 junction 清单（L2，逐项 readlink）

⚠️ 现状（2026-08-26 实测）：**fork-to-preset / continuous-worker / routed-subagent / governance 的 `node_modules/@deepseek-ai` 目前是真实目录（rc.8 副本）**，不是 junction——升级时按 §4.1c 处置（A：转 junction → 内核 / B：原地升级）。下表是**目标态**（处置后应为）：

| 插件 | node_modules/@deepseek-ai junction 目标 |
|---|---|
| dsh-fork-to-preset | $RUN_KERNEL |
| dsh-continuous-worker | $RUN_KERNEL |
| dsh-routed-subagent | $RUN_KERNEL（其 lib/node_modules/@deepseek-ai/dsh-subagent 另指 rc8-fork） |
| dsh-governance | $RUN_KERNEL |
| dsh-voice-input | 无 @deepseek-ai 依赖（仅 dev deps，不涉及） |
| @deepseek-ai/dsh-client-ui-subagent | $RUN_KERNEL |

检查命令：`readlink <插件>/node_modules/@deepseek-ai` 应为 `app.asar.unpacked\node_modules\@deepseek-ai`。
⚠️ **junction 语义警告**：对 junction 执行 `mv`/`rm -rf` 会**跟随目标**（2026-08-26 误移内核目录事故）——删除 junction 用 `rmdir`，确认属性用 `(Get-Item <path> -Force).Attributes`（含 ReparsePoint 才是 junction）。drift-scan [3.5] 自动覆盖 junction 层，但对 real_dir 判 OK（不会发现 rc.8 滞留），需 §4.1c 断言补充。

### 4.1b 插件 peerDeps 升级（2026-08-25 审计发现，18 处）

本地插件对 `@deepseek-ai/*` 的 peerDependencies 是 `^0.1.0-rc.5/6/7` 或精确
`0.1.0-rc.8`——semver 实测对 `0.1.1-rc.2` **全部不匹配**（0.x 的 caret 不含次版本升级）。
升级前必须更新（2026-08-26 已改内容，但 **4 个 git 仓库未 commit**（routed-subagent/continuous-worker/web-billing/global-tool-discovery），governance/token-meter 非 git 仓库——升级前先提交或接受工作树状态）：

| 插件 | 更新的 peerDeps |
|---|---|
| dsh-routed-subagent | dsh-agent/agent-presets/llm/session/subagent/subprocess/tools → ^0.1.1-rc.2（7 处） |
| dsh-continuous-worker | dsh-tools/settings/llm/session/credentials → ^0.1.1-rc.2（5 处） |
| dsh-web-billing | dsh-home-paths → ^0.1.1-rc.2（1 处，在 **dependencies** 非 peerDeps） |
| dsh-global-tool-discovery | dsh-tools → ^0.1.1-rc.2（1 处） |
| dsh-governance | dsh-agent/tools 精确版 → ^0.1.1-rc.2（2 处） |
| dsh-token-meter-hermes | dsh-session/session-projection → ^0.1.1-rc.2（2 处） |

注意：`@deepseek-ai/cordis`（^4.0.1）和 `@deepseek-ai/schemastery`（^3.18.1）是独立版本号，**不要动**。
验证命令：`node scripts/check-peer-compat.mjs`（或按 §2.5 冒烟方式逐一 semver 断言）。

### 4.1c 插件本地 vendor 树处置（审查 F-01，2026-08-26）

⚠️ **重大盲区**：以下插件的 `node_modules/@deepseek-ai` 是**独立真实目录**（rc.8 副本，
200 包），Node 解析 `require('@deepseek-ai/*')` 时**先命中本地树**（永远到不了内核）：
`{{PLUGIN_SOURCES_DIR}}/{dsh-fork-to-preset, dsh-continuous-worker, dsh-routed-subagent}`、
`{{USER_HOME}}/dev/dsh-governance`（`dsh-web-billing` 已是 junction → 内核，正常）。
升级后这些插件会**静默运行 rc.8 代码**，且 `drift-scan [3.5]` 对 real_dir 判 OK 不会发现。

**处置（升级时二选一，推荐 A）**：
- **A（推荐）**：删除本地 `@deepseek-ai` 真实目录 → 建 junction → `$RUN_KERNEL\@deepseek-ai`
  （已验证：本地树与内核**包集合完全一致**，0 独有包，转 junction 零丢失）
- **B**：原地 `npm install --legacy-peer-deps` 升级本地树到 rc.2 + 重打全部补丁（P1-P16b）

**⚠️ 操作警告**：junction 下 `mv`/`rm -rf` 会**跟随目标**（2026-08-26 事故：误移内核目录导致
桌面版 boot 失败）。操作前必须确认目标属性：
```powershell
# 先确认是真实目录还是 junction（ReparsePoint 才安全动）
(Get-Item 'E:i-files\dsh-fork-to-preset
ode_modules\@deepseek-ai' -Force).Attributes
# 删除 junction 用 rmdir（不跟随），删除真实目录才用 Remove-Item -Recurse
```

**§5 断言**：升级后验证每个插件的本地解析版本：
```powershell
node -p "require('{{PLUGIN_SOURCES_DIR}}/dsh-fork-to-preset/node_modules/@deepseek-ai/dsh/package.json').version"
# 必须输出 0.1.1-rc.2（junction 后与内核一致）；若仍 0.1.0-rc.8 → 处置未生效
```

### 4.2 dsh-subagent fork 专项（L4）
- marker 验证：`grep dshRoutedSubagentPatch $RUN_KERNEL\@deepseek-ai\dsh-subagent\package.json`
- 若丢失：从 `{{PLUGIN_SOURCES_DIR}}\@deepseek-ai\dsh-subagent-rc8`（已有 rc8 基础 fork）基于 rc.11 官方重建
- junction：`dsh-routed-subagent/lib/node_modules/@deepseek-ai/dsh-subagent` → rc8 fork

### 4.3 client-ui-subagent 三要素（L5）
1. profile deps 含 `@deepseek-ai/dsh-client-ui-subagent`（npm 包，升级后确认存在）
2. profile node_modules junction 存在
3. host client.js 补丁：`node {{PLUGIN_SOURCES_DIR}}\dsh-routed-subagent\scripts\_patch_ui_subagent.mjs`（幂等）

### 4.4 settings.yaml / cordis.patch.yml 核对（L6/L7）
- `file --mime-encoding ~/.dsh/profiles/web/package.json` 应为 `utf-8`（无 BOM）
- `grep -c '^- id:' ~/.dsh/profiles/web/cordis.patch.yml` 与预期 entry 数一致
- settings.yaml：reasoningEfforts 引号键（'off'）保留；bai/qwen27b 配置未丢
- 模板渲染 diff：`scripts/template-render.ps1 -OutDir <tmp>` 对比 web profile

### 4.6 ui-layout 兜底恢复（app.asar.unpacked 手动修改，升级必丢）

`$RUN_KERNEL\..\@deepseek-ai\dsh-web-app\cordis.patch.yml` 内 `ui-layout` entry 的
`disabled: false` 是手动补的兜底（配合 `dsh-desktop.mode: compatibility`，防 advanced
模式禁用 ui-layout 导致 UI 空白）。**升级/重装会覆盖 app.asar.unpacked**，恢复命令：

```powershell
# 检查：grep -A2 "ui-layout" $RUN_KERNEL\..\@deepseek-ai\dsh-web-app\cordis.patch.yml
# 若 disabled 不在或为 true：在 ui-layout entry 下加 disabled: false（或用现有补丁脚本）
# 同时确认 settings.yaml 的 dsh-desktop.mode 仍为 compatibility（非 advanced）
```

### 4.5 插件指纹重采集
```powershell
powershell -NoProfile -File scripts\capture-sources.ps1 -Quiet
# 升级后 vendor tgz / npm 版本变化会显示 CHANGED，确认符合预期后 commit
```

---

## 5. 验证矩阵（Step 5，全部通过才算完成）

### 5.1 基础
- [ ] **内核版本断言**：`node -p "require('$env:LOCALAPPDATA\\Programs\\DSH Desktop\\resources\\app.asar.unpacked\\node_modules\\@deepseek-ai\\dsh\\package.json').version"` == `0.1.1-rc.2`
- [ ] **插件本地解析版本断言**（§4.1c 处置后）：`node -p "require('<插件路径>/node_modules/@deepseek-ai/dsh/package.json').version"` == `0.1.1-rc.2`（fork-to-preset / continuous-worker / routed-subagent / governance 逐个）
- [ ] boot 无 pending、无 `Failed to load plugins`
- [ ] 端口监听 + HTTP 200 + renderer 进程 + chrome-faithful-mcp 存活
- [ ] 主进程空闲 CPU < 10%（30s 采样）
- [ ] 无 `agent/disposed listener threw`（P14 验证：`grep -c "listener threw" logs` == 0 或仅升级前历史）
- [ ] 无 `id collision` 新增（checkpointRoot 生效：`~/.dsh/data/continuous-worker/checkpoints` 存在）

### 5.2 功能回归
- [ ] 8 组模型全在（llm.models API，含 bai/qwen27b 自定义）
- [ ] bai + deepseek 各发一条真实消息（P3 验证）
- [ ] fork-to-preset e2e：母 A → 显式 B / 不指定继承 A / 不存在 preset 结构化错误（P9-P12 验证）
- [ ] 子代理 UI：header 子代理按钮 + @ 提及（P8 验证）
- [ ] subagent_routed 工具可用（L4 验证）
- [ ] 旧会话打开若干（含 emp-w 系列之外的历史会话）
- [ ] billing 页面正常（v2.5.0 已修 settle）
- [ ] vision-toolkit / chrome-faithful 工具冒烟

### 5.3 稳定观察（升级后 24h）
- [ ] 无 V8 崩溃（Crashpad/reports 无新 dump）
- [ ] 主进程内存稳定（无持续增长，24h 内 < 3GB）
- [ ] drift-scan 重跑 = CLEAN

---

## 6. 回滚预案

| 场景 | 动作 |
|---|---|
| boot 失败（补丁冲突） | 恢复内核备份 → 恢复 profile 备份 → 恢复 plugin-install-recovery 状态 → 重启 |
| 功能回归失败（fork 坏） | 判定 P9-P12 保留我们补丁（官方实现不全）→ 不退役 → 重启 |
| 24h 内崩溃/泄漏 | 整体回滚到 rc.8：从 `backups/kernel-rc8-<date>/` 恢复内核树 + junction 指回恢复后的新壳路径（⚠️ 不是旧壳 `C:\Program Files\DeepSeek Harness`，那是 rc.7 回滚树不运行）+ npm 全局 dsh 恢复原名 |

回滚演练在 Step 5 前做一次（sha256 验证备份完整性）。

---

## 7. 执行顺序汇总

```
Step 0 基线（备份+drift基线+指纹） ──门禁──▶
Step 3 升级内核 + 重打 17 补丁（P1-P16b，全部 CLEAN 直接 apply） ──门禁(compare)──▶
Step 4 配置迁移（junction/fork/三要素/编码检查/指纹） ──▶
Step 5 验证矩阵（基础+功能+稳定） ──▶ 完成（或回滚）
```

每步完成即跑 `drift-scan.ps1` 确认；全程不碰旧壳路径；不依赖手工记忆（全部落清单/脚本）。
