# 升级流程

> 每次 dsh 版本升级时走这套流程，确保补丁、配置、插件平滑过渡。
> 目的：从"手工踩坑"变成"有流程、有评估、有回滚、有验证"。

## 5 步标准流程

### Step 1：准备与基线
1. 当前版本全树备份 → `backups/host-<ver>-<date>/`（含 sha256 清单）
2. 运行 `scripts/capture.sh` 捕获当前补丁（diff .bak 快照 vs 当前）→ 存档到 `patches/`
3. 记录版本基线（`patches/manifest.json` 的 `baseline` 字段）
4. 确认回滚路径（保留旧树 + 旧安装包）

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

## 升级节奏建议

- 内核 rc 发布后等 1-2 周（观察社区反馈）
- 壳大版本同样先看 release notes 有无 breaking
- 升级窗口选在插件低活动期
- 每次升级后更新 HANDOFF 升级记录段

## 回滚

- 双保险：旧壳树备份（tar）+ 新壳旧版本树备份（tar）
- 壳失败：卸载新版 → 重装旧版（安装包留存）
- 内核失败：`node_modules` ← `node_modules.rc<old>` 立即恢复