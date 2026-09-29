# 升级流程

> **⚡ 2026-09-11 v209 时代新铁律（先读这段）**
> 1. **版本目标二次确认**：方案定稿时和动手安装前，各查一次 `api.github.com` releases——一夜 2.0.5→2.0.9 双跳的教训。npm latest ≠ 可装：壳内置构建才是兼容基线（dsh-settings 导出教训）。
> 2. **packed-asar 布局（0.1.3+/壳 2.0.7+）**：内核 JS 全在 `resources/app.asar`；unpacked 只剩原生件。补丁工作树=~/.dsh/runtime/<树>，repack 用 `scripts/v209/pack-209.ps1`（`--unpack-dir` 大括号语法 + `build/*.png`，unpacked 标志 parity 必核）。
> 3. **完整性 fuse**：repack 后必 `npx @electron/fuses write --app "DSH Desktop.exe" EnableEmbeddedAsarIntegrityValidation=off`（`OnlyLoadAppFromAsar` 保留 on），否则 FATAL 闪退。exe 先备份。官方更新会重置 fuse+洗补丁=升级窗口 SOP 起点。
> 4. **三绿门禁**：`verify.ps1 -Source asar-root`、`-Source installed`、`profile/verify.ps1` 全 FAIL=0 才算装完；drift-scan 默认源已指 runtime 树。
> 5. **新校验层拒旧产物**（已四次）：格式迁移白名单（video/6 source kinds）、persona text→prefix、`__DSH_MODULES__` 删除、voice 路由 owner 语义。升级预检必含：两树 `Config = z.object(` diff（盯 required/改名/validateKeys 白名单三类）+ 全库会话 kind 扫描（`scripts/v209/scan_sessions2b.py`）。
> 6. **证据纪律**：功能绿灯只认磁盘帧（`session*.jsonl.zstd` 含 v3 新名，`scripts/v209/roundtrip-wait.py`）与真 HTTP；UI 文本不算证据。


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
- [ ] `drift-scan.ps1` 第 4 层（Plugin sources）无 `CHANGED` / `NEW-UNREGISTERED` 项——
      本地插件更新后需先跑 `scripts/capture-sources.ps1` 重新采集指纹并 commit `plugins/FINGERPRINTS.json`
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
| P13 | dsh-host-apiproxy | sseResponse 原生支持批量 flush（20 帧/30ms） | 继续/迁移/退役 |
| — | session-projection-cache 配置 | 官方默认 200 事件/5s；本机 patch 为 5000 事件/30s（2026-08-22 实测 500 事件 8s 攒满触发 16MB 全量重写 → 升级到 5000） | 官方若调高默认值可退役配置覆盖 |

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

### 禁用任何 bundle 前：先查谁 `dsh.client.inject` 它
profile `cordis.patch.yml` 里给 bundle 加 `disabled: true` 之前，必须全树扫描 `dsh.client.inject` 引用者：
```powershell
# 在 patched tree 的 node_modules 根执行（python 扫 dsh.client.inject 数组）
python -c "import json,glob; [print(o['name'],t) for pj in glob.glob('**/package.json',recursive=True) for o in [json.load(open(pj,encoding='utf-8'))] for t in [(o.get('dsh') or {}).get('client',{}).get('inject',[]) or []] if '<目标包名>' in t]"
```
- 本机事故（2026-09-12）：禁用 `ui-sidebar-right` 消官方右侧栏 → `dsh-client-ui-chat` 的 inject 数组含该服务 → 桌面 `renderer boot failed (plugins: @deepseek-ai/dsh-client-ui-chat)`。
- 正确解法（P31）：服务保留、只隐藏重复 UI（client.js 组件恒返 null）；tab 类型里只禁**真正重复**的那条：
  `ui-sidebar-files`（Explorer 文件树，与 better-sidebar 重复）禁用；`ui-sidebar-documentpreview` **保留**——
  它认领 `dsh-resource://file/**` pattern，聊天点图片/文件预览依赖它（2026-09-12 曾误禁，运行时报
  `sidebarRight: no registered tab type claims <url>` 后恢复）。**教训：tab type 的依赖不止 inject 一面，
  还看它 claim 的资源 pattern 有没有运行时调用方（openRightbar/点文件引用）。**

### 清理任何被引用的树前：先跑全 junction 引用扫描
删除/移动一个被 junction 指向的目录（tmp 树、旧壳树、vendor 树）前，必须枚举全盘 junction 的 Target（`Get-ReparsePoint`/`fsutil reparsepoint query` 或 drift-scan 的 junctions 段）确认无活引用。
- 本机事故（2026-09-11/12）：清 tmp 旧 asar-root 树时未扫引用 → E 盘 routed-subagent、dsh-subagent-rc8 两处 `node_modules` 整体 junction 断链（已重指 runtime 树恢复）。

### kimi code 升级后：重打 maxRetries 无限重试补丁
`~/.kimi-code/bin/kimi.exe` 是 Bun 单文件可执行，官方 `kimi upgrade` 在 Windows 不支持自动更新（提示手动跑 `irm https://code.kimi.com/kimi-code/install.ps1 | iex`——**先下载审查再执行，不要盲管 iex**）。升级会覆盖二进制，本地 `maxRetries:-1` 补丁必然丢失。
- 补丁器：`scripts/kimi/pimi` 目录下的 `patch-kimi-maxretries.py`（三处 provider client 构造：Anthropic + 2×OpenAI，`maxRetries: 0` → `-1`）
- **铁律一：替换必须字节等长**。改了长度会移位 Bun 内嵌负载，Windows 拒绝加载，报错信息极具误导性（"此版本应用程序不适用于你的处理器架构"）。`" 0"→"-1"` 两字节换两字节才安全。
- **铁律二：绝不在运行中原地覆写 kimi.exe**。生成 `.patched` 副本，再 `Move-Item` 改名换入。原地覆写曾直接损坏 exe。
- 2.1.1 带 Authenticode 签名，但等长内容修改可正常加载（实测）——拦路的是长度不是签名。
- 每次 kimi 升版后位点会变（0.36.1 的 `buildClient/apiKey/baseURL` 锚点在 2.1.1 已不存在），先 `grep` 定位再改；另有 3 处 `maxRetries: 0` 属 fs 删除默认，**不要动**。
- 换版后体检：`kimi doctor`（配置合法性）+ `diff config.toml`（确认升级没改写用户配置）。

## 升级节奏建议

- 内核 rc 发布后等 1-2 周（观察社区反馈）
- 壳大版本同样先看 release notes 有无 breaking
- 升级窗口选在插件低活动期
- 每次升级后更新 HANDOFF 升级记录段

## 回滚

- 双保险：旧壳树备份（tar）+ 新壳旧版本树备份（tar）
- 壳失败：卸载新版 → 重装旧版（安装包留存）
- 内核失败：`node_modules` ← `node_modules.rc<old>` 立即恢复