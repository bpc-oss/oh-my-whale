# 升级流程

> 每次 dsh 版本升级时走这套流程，确保补丁、配置、插件平滑过渡。
> 目的：从"手工踩坑"变成"有流程、有评估、有回滚、有验证"。

## 5 步标准流程

### Step 1：准备与基线
1. 当前版本全树备份 → `backups/host-<ver>-<date>/`（含 sha256 清单）
2. 运行 `scripts/capture.sh` 捕获当前补丁（diff .bak 快照 vs 当前）→ 存档到 `patches/`
3. 记录版本基线（`patches/manifest.json` 的 `baseline` 字段）
4. 确认回滚路径（保留旧树 + 旧安装包）
5. **运行 `scripts/drift-scan.ps1 -Out baseline-drift.json`**（升级前漂移基线，纯记录不阻断）

### Step 2：评估新版本
1. 拉官方 release notes（changelog / GitHub releases）
2. 对照补丁处置表（manifest.json 的 patches 列表），判断每个补丁的命运：
   - 继续（官方未修该补丁点）
   - 迁移（官方代码变了，但补丁仍需）
   - 退役（官方已修复，补丁不再需要）
3. 输出《升级影响评估》

### Step 3：执行升级
1. 壳升级（如适用）：安装新版本 DSH Desktop
2. 内核升级：更新 `package.json` 依赖版本 → `npm install`
3. 补丁迁移：`patches/host/apply.ps1`（dry-run 先行 → 逐个 apply）
4. `node --check` 每个被修改的 JS 文件

**Step 3 之后增加门禁（升级后对比，P6 类丢失的捕获点）**：
```
3.5 运行 drift-scan.ps1 --compare baseline-drift.json
    → 输出 'upgrade-drift-report.json'（全量增量矩阵，见 drift-watch-plan.md §3.1）
    → 任何阻断项（new-lost / new-unknown / gone-from-baseline / new-removed-baseline）
      必须先处置（补丁迁移 / 清理残留 / 登记 manifest / 记入 drift-allowlist.json）
    → 处置后重跑 --compare，直到 verdict = CLEAN 或 阻断项全部显式豁免
```

### Step 4：配置与插件迁移
1. settings.yaml：核对 schema 兼容（字段只放宽不收紧）
2. profile 树：`package.json` 的 bundles 逐项核对
3. plugin-gateway / super-injector 自检
4. `pnpm-lock.yaml` 重新生成（若版本变化）

### Step 5：验证矩阵
- [ ] boot 无 pending 无报错
- [ ] 8 组模型全在（llm.models API 或 UI 确认）
- [ ] 旧会话回归（scan-others.mjs 或手工打开若干历史会话）
- [ ] 工具 schema 合法（defineTool 检查）
- [ ] 关键插件冒烟：billing / verification / chrome / voice / worker
- [ ] bai + deepseek 各发一条真实消息
- [ ] `drift-scan.ps1` verdict = CLEAN 或 所有漂移项已记录在 `docs/drift-allowlist.json`
- [ ] 桌面版 + web 双端验证
- [ ] 回滚预案演练（sha256 验证备份 + 恢复演练）

## 补丁处置表（填表指南）

每次升级前更新此表：

| 补丁 | 目标文件 | 官方修复信号 | 本次命运 |
|---|---|---|---|
| P1 | cordis-plugin-loader | loader 版本 >1.0.2 或 EntryGroup 重构 | 继续/迁移/退役 |
| P2 | cordis | cordis 官方性能优化 | 继续/迁移/退役 |
| P3 | pi-ai | pi-ai 原生支持 bai | 继续/迁移/退役 |
| P4 | dsh-session | rc.x 内置两事件 | 继续/迁移/退役 |
| P5 | super-injector | 与内核无关 | 不受影响 |
| P6 | dsh-goal | 官方合入 verification-seam | 继续/迁移/退役 |
| P7 | dsh-host-apiproxy | 官方 session.list 降载 | 继续/迁移/退役 |
| P8 | dsh-client-ui-subagent | 官方合入 input-triggers | 继续/迁移/退役 |
| P9 | dsh-host-apiproxy | fork 原生支持 agentPreset | 继续/迁移/退役 |
| P10 | dsh-client-runtime | fork 原生支持 agentPreset | 继续/迁移/退役 |
| P11 | dsh-agent-presets | resolver 原生支持 seedLength | 继续/迁移/退役 |
| P12 | dsh-client-connection | fork schema 原生支持 agentPreset | 继续/迁移/退役 |

## 升级恢复检查清单

### ui-layout 禁用（`dsh-desktop.mode: advanced` 陷阱）
`settings.yaml` 的 `dsh-desktop.mode: advanced` 会让 Desktop launcher 追加禁用 `ui-layout`（`{ id: "ui-layout", disabled: true }`）→ 桌面版打不开或 UI 残缺（Failed to load plugins / sidebar/conversation pending layout 服务）。本机 8/21 事故。

- **升级后如果桌面打不开**：检查 `settings.yaml` 的 `dsh-desktop.mode`，改为 `compatibility` 后重启。
- 如果 `web-app/cordis.patch.yml` 的 `ui-layout disabled: false` 被升级覆盖（手动修改），在 profile 层 `cordis.patch.yml` 加：
  ```yaml
  - id: ui-layout
    disabled: false
  ```

### dsh web 并发（watcher 自动拉起 CLI）
本地 `dgx-hermes-stack` 项目的 `local/scripts/watch-dgx-local-services.ps1` watcher 可能自动拉起 `dsh web`（通过 npm 全局 dsh），与 Desktop 并发读写同一 profile → id collision + 状态污染。
- **检查**：`npm root -g` 下的 `@deepseek-ai/dsh` 是否存在（本机已改名 `dsh.bak-watcher-block-20260821` 阻断）
- 本机处置：`mv $env:APPDATA/npm/node_modules/@deepseek-ai/dsh $APPDATA/npm/node_modules/@deepseek-ai/dsh.bak-watcher-block-20260821`

## 升级节奏建议

- 内核 rc 发布后等 1-2 周（观察社区反馈）
- 壳大版本同样先看 release notes 有无 breaking
- 升级窗口选在插件低活动期
- 每次升级后更新 HANDOFF 升级记录段

## 回滚

- 双保险：旧壳树备份（tar）+ 新壳旧版本树备份（tar）
- 壳失败：卸载新版 → 重装旧版（安装包留存）
- 内核失败：`node_modules` ← `node_modules.rc<old>` 立即恢复