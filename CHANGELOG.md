# Changelog

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
