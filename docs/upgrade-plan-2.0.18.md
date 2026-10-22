# DSH 直接升级到 2.0.18 实施方案（v4）

- 目标：桌面壳 **2.0.16 → 2.0.18**，内核 **0.2.0-rc.1 → 0.2.1-rc.2**
- 依据：`docs/upgrade-assessment-2.0.18.md`
- 审查：v1 REJECT、v2 REJECT、v3 REJECT(1)/APPROVE_WITH_FINDINGS(1)。本版只做**收口修正**，不再改结构。
- 口径：manifest 条目 **43**；补丁/差异文件 **60**（`host/*.patch` 29 + `rc2-diffs/*.diff` 30 + `profile/*.patch` 1）；target 文件 **31**。

---

## 0. 阶段总览

| 阶段 | 内容 | 预计 | 失败动作 |
|---|---|---|---|
| P0 | 预检、备份（全树制品） | 1.5d | 无副作用 |
| P1 | 账本重建为 **31 条 per-target diff** | 2d | git 回滚 |
| P2 | 回滚空跑（go/no-go 闸门） | 1d | 不开始升级 |
| P3 | 正式安装 + 立刻重打 P30（基线 = 2.0.18 pristine） | 0.5d | L2 |
| P4 | profile 依赖 + schemastery + super-injector | 1.5d | L1 |
| P5 | 非视频补丁 8 条 + 子代理导出契约 | 2.5–3d | 逐条撤销 |
| P6 | 视频层（0/14 或 14/14） | 4–5d | 回到 P6 tag |
| P7 | 插件兼容 21 个 | 2.5–3d | 逐个禁用 |
| P8 | 壳侧补丁（P38；P30 复核） | 1d | 恢复原文件 |
| P9 | 配置与行为迁移 | 0.5d | 恢复配置 |
| P10 | 全量验收 | 1.5d | 分层回滚 |

合计 **18–21 个工作日**。

---

## P0 预检与备份（1.5d）

### P0.1 进程门槛
- 只判 `Get-Process 'DSH Desktop'` 为空（当前实测 26 个进程）。
- 删除 `DevToolsActivePort` 判据（实测 mtime Sep 30，进程起于 Oct 18，不是活性指标）。

### P0.2 自更新
- 实测 2.0.16 的 `updates.js:306` 已是 `enabled: default(false)`，无 `process.env`/settings 开关，**不存在配置层**。
- P0 只记录状态；真实动作在 P3 装完立刻重打（见 P3）。
- 不采用 hosts 屏蔽（`github:` 协议的插件依赖会断）。

### P0.3 备份（全树制品，不抽样）

目标 `{{AI_FILES}}\dsh-backups\upgrade-2.0.18-<UTC>/`。实测体量：`~/.dsh` 排除 `backups/tmp/cache` 后 **6.18 GiB / 198,562 文件**（此数**含** `sessions` 与 `attachments`，归档时按下表分装，不要重复计入）；外部源码 ≈0.55 GiB；`resources/app` **739.0 MiB / 25,976 文件**。归档后总量 **≈8.9 GiB**（`E:` 可用 290 GB）。

| 制品 | 内容 | 备注 |
|---|---|---|
| `home-core.tar` | `~/.dsh` 排除 `backups/ tmp/ cache/ sessions/ attachments/` | ≈2.68 GiB，避免重复计入 |
| `sessions.tar` / `attachments.tar` | 各自独立 | ≈2.83 / 0.67 GiB |
| `globals.tar` | **`~/.dsh/cordis.patch.yml`**、**`~/.dsh/.credentials.yaml`**、`reverse-proxy.json`、`skills`、`skills-lock.json`、`patches/` | 全局层，boot 必读 |
| `releases-vendor.tar` | `~/.dsh/releases`、`~/.dsh/vendor-pkgs` | link 目标 |
| `appdata.tar` | `%APPDATA%\DSH Desktop`（profile-selection/-preferences/-setup、plugin-install-recovery、updates、identity） | |
| `shell-app.tar` | `resources\app` | **必需** |
| `installer-2.0.16.exe` | 从 `%LOCALAPPDATA%\dsh-plugin-desktop-updater\installer.exe`（269,333,800 B, FileVersion 2.0.16） | |
| `installer-2.0.18.exe` + `SHA256SUMS.txt` | 官方下载校验 | |
| `shell-app-2.0.18-pristine.tar` | 从 `installer-2.0.18.exe` 解出（7z：`$PLUGINSDIR\app-64.7z` → `resources/app`） | P30 基线与 drift 参照 |
| `external-sources.tar` | link 目录 | |
| `whale-state.txt` | HEAD + status | |

**link 目录清单不手抄，从实际引用生成**：

```bash
for f in ~/.dsh/profiles/*/package.json; do
  python -c "import json,sys;d=json.load(open(r'$f'));[print(k,v) for k,v in d.get('dependencies',{}).items() if str(v).startswith(('link:','file:'))]"
done | sort -u
```

已知必须包含：`dev\dsh-governance`、`dev\dsh-global-tool-discovery`、`chrome-faithful`、`dsh-token-meter-hermes`、`dsh-voice-input`、`dsh-voice-input`、`{{AI_FILES}}\dsh-fork-to-preset`、`{{AI_FILES}}\dsh-routed-subagent`、`{{AI_FILES}}\dsh-subagent-model`、**`{{AI_FILES}}/dsh-continuous-worker`**（`profiles/headless` 引用，v3 漏）、`{{AI_FILES}}\dsh-web-billing`、`{{AI_FILES}}\dsh-experimental\m2-demo-plugin`（后两个以实际引用为准，不被引用则不入）。

- 每个归档生成 SHA256 + 文件数/字节数；空归档即失败。
- `home-core.tar`/`globals.tar` 含 `.credentials.yaml` 与 `~/.dsh/private/*`：归档目录不进 git；基线文档禁止写入 `apiKey` 字面值；入库前跑 `check-private.ps1`。

### P0.4 工具链
`patches/host/apply.ps1` 默认路径指向不存在的 `app.asar.unpacked` → 改为 unpacked 或强制 `-KernelDir`。

### P0.5 基线（安装层）
- `resources/app`：**25,976 文件 / 739.0 MiB**
- `resources/app/package.json` = 2.0.16；`@deepseek-ai/dsh` = 0.2.0-rc.1
- **Electron 层**：`%LOCALAPPDATA%\Programs\DSH Desktop\DSH Desktop.exe`。**判据用 `VersionInfo.FileVersion` 字符串（2.0.16 / 2.0.18），不要用字节数**——2.0.16 与 2.0.18 的 exe 字节数实测完全相同（244,654,080）。
  - 注意：`FileVersion` 是 `2.0.16`，不是 `2.0.16.0`；需要比较时用 `[version]` 数值比较。
  - 同层 `dxcompiler.dll`、`resources.pak`、`locales/`、`elevate.exe` 记清单。
- **基线必须在 P2 执行前重取一次**（P1 不改安装树，但重取可消除任何时间差）

### 退出标准
- 所有归档非空且校验通过
- 两个安装包 + 2.0.18 pristine 提取物 SHA256 记录
- 基线（含 Electron 层）已记录
- 2.0.18 installer 的 `app-64.7z` 提取成功（**提取失败即中止，不按成功路径假设**）

---

## P1 账本重建（2d，任何安装之前）

### P1.1 产物形态（关键修正）
**31 个 target key → 24 条 per-target diff + 7 个 no-diff target**。43 个 manifest 条目降级为元数据，挂在该 diff 的 `covers: [...]` 上。

为什么是 24 而不是 31：31 个 key 中有 7 个只被 `skip-*` / `retired` 条目占用、没有 live delta，不应产出空 diff——
`P8`（client-ui-subagent）、`P12`（client-connection）、`P13`（api-gateway）、`P15`（dsh-agent）、`P17b`（llm-deepseek）、`P18`（6 路径数组）、`P31`（sidebar-right）。
这 7 个改为逐个校验 `pristine == live` 并记录。

理由（已实测）：同一文件的 7 条补丁不是可叠加的增量，而是对同一段代码的多次改写。按条目逐条 `diff pristine→live` 会产生 7 份相同 diff，第 2 份必然失败；分组叠加则在第 1 步就失败。只有 per-target 单条 diff 能同时满足"可重放"与"不与 live 打架"。

### P1.2 重建方法
1. `npm pack` 出**作者基线版本**的包（看补丁注释/`kernelLine`）；
2. 按 `node_modules/@scope/pkg/...` 摆好（否则 `-p1` 全失败）；
3. `diff -u <pristine> <live>` 生成整文件 diff，头写 `a/@scope/pkg/...`；
4. **在临时目录回放**：`cd "$env:TEMP/ledger-replay"`（bash 下为 `cd "$TEMP/ledger-replay"`），`patch -p1 --fuzz=0`，再 `cmp` 与 live 逐字节比对。
   **`resources/app` 全程只读**；禁止任何 `patch -d resources/app`。

### P1.3 判据
每条 per-target diff 回放一次后与 live `cmp` 逐字节一致。不要求"所有条目 APPLIES"（该判据恒假）。

### P1.4 特殊格式
- 无 `a/b` 头的 8 条：P17、P17b、P17c、P18、P18b、P18c、P19、P19b（`003` 有正规头，不在其列）。
- 其中 5 条头指向不存在的 `app.asar.unpacked`。
- **第 9 条格式问题**：`008-dsh-client-ui-subagent-input-triggers.patch` 首行路径尾带 `\r`，`patch -p1` 找不到文件。P8 虽为 `skip-upstream`，P1 必须显式列出。

### P1.5 补登 P44
`dsh-subagent` 的 10-02 continuable 修复未入账（manifest `continuable` = 0）。登记 P44，needle `presetTarget`（`.bak` 0 / live 4）。覆盖率复核：晚于最后登记时间的 live delta 仅此 1 个。

### P1.6 target 与去重
- 实测 target 不一致 **5 条**（P7/P9/P10/P11/P13，均为 host-apiproxy 历史改名；该包在 2.0.16 不存在）。
- patchFile 共用**只有 P20/P25** 一对。
- `P18` 等 `skip-upstream` 不生成 target。

### P1.7 不动安装树
`index.js.bak-p40` 只在 whale 仓库归档，**不从 `resources/app` 移出**（它会改变 P2 的 25,976 基线）。

### 退出标准
- **24 条 per-target diff** 回放后与 live `cmp` 一致
- **7 个 no-diff target** 逐个记录 `pristine == live` 的校验结果（不得造空 diff）
- P44 已登记且有 needle
- `verify-patch-port` 仍 `OK / 0 TODO`

---

## P2 回滚空跑（1d，go/no-go）

### 步骤
1. `profile-selection/state.json` 的 active 从 `web` 切到一次性 profile。
   - 实测 `~/.dsh/profiles/verify` **已存在且 bundles 非空**（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless`）→ **新建 `verify-0218`**，bundles 留空。
   - 生命周期：P2 与 P3 使用；P3 结束、正式切回 `web` 后删除该一次性 profile。
2. 安装 2.0.18，用该 profile 启动。
   - **成功判据（机器可判，二选一）**：① `http://127.0.0.1:<端口>/` 返回 200（端口取自 `%APPDATA%\DSH Desktop\lan-https` 或该 profile 的 host 日志）；② `%APPDATA%\DSH Desktop\logs\host\<date>.log` 出现页面/DOM ready 类标记。
   - **120 秒**内未满足记为失败；重试 1 次。
3. 回滚：
   1. 整目录删除 `resources\app`；
   2. 重装 2.0.16；
   3. 恢复 `shell-app.tar`。
4. 恢复 `~/.dsh` 与 `%APPDATA%`：
   - **先清空目标子集**（`profiles`、`storages`、`.agent-presets`、`sessions`、`attachments`、`releases`、`vendor-pkgs`、`cordis.patch.yml`、`.credentials.yaml`、`%APPDATA%\DSH Desktop\profile-*`），再解包；
   - 不在旧内容上覆盖（覆盖不会删除 2.0.18 新建的文件）。
5. 启动 `web` profile，做**全树比对**：
   - `~/.dsh` 对 P0 归档做 SHA256 清单比对（`sessions` 允许新增，其余必须逐条一致）；
   - `resources/app`：25,976 / 739.0 MiB / `dsh`=0.2.0-rc.1；
   - **Electron 层**：`DSH Desktop.exe` 的 `VersionInfo.FileVersion` = **2.0.16**（字节数不可区分：2.0.16 与 2.0.18 都是 244,654,080）。
6. **链接还原验证**：`profiles/web` 下 5 个 link 依赖必须可解析——`dsh-continuous-worker`、`dsh-fork-to-preset`、`dsh-routed-subagent`、`dsh-subagent-model`、`dsh-full-remote`（见 L1 节的命令）。

### 退出标准
- 全树清单比对通过（不是抽样一个文件）
- Electron 层两项匹配
- **链接还原验证通过**（symlink/junction 解包后退化不影响解析）
- 不通过 → 第二次；第二次仍不通过 → **不开始升级**

---

## P3 正式安装 + 立刻重打 P30（0.5d）

1. 安装 2.0.18（隔离 profile）。
2. **第一件事**：以 **2.0.18 pristine** 的 `lib/updates.js` 为基线重打 P30。
   - 基线来源：`installer-2.0.18.exe` → `7z x` 出 `$PLUGINSDIR\app-64.7z` → `7z x` 出 `resources/app/lib/updates.js`。
   - 不用 2.0.16 原文（2.0.18 在 Windows 更新安装链上有改动）。
3. 版本校验：壳 2.0.18；`@deepseek-ai/dsh` 0.2.1-rc.2。
4. 记录新 `resources/app/lib/` 文件清单。

### 退出标准
- 版本两项正确
- `updates.js` 中 `enabled` 为 `default(false)`
- 更新检查不触发

---

## P4 profile 依赖 + 影子依赖 + super-injector（1.5d）

### P4.1 依赖
`@deepseek-ai/dsh-client-ui-subagent`、`dsh-subagent-codex`、`dsh-subagent-claude-code` → `^0.2.1-rc.2`。
前提：`nodeLinker: hoisted` + `autoInstallPeers: false` → 改 peer **不引入新包**，缺包只能 vendor 或改 lock。

### P4.2 schemastery
- 落点：**`profiles/web/pnpm-workspace.yaml` 已有的 `overrides:` 块**（不要另开 `package.json` 的 `pnpm.overrides`）。
- 必须同时覆盖**两种包名**：`@deepseek-ai/schemastery`（lock 里 3.18.1 与 3.18.4 两支）与非 scope 的 `schemastery`（super-injector 的 `^3.18.0`）；并处理 better-sidebar 内嵌副本。
- 如需，把 3.18.5 加入 `minimumReleaseAgeExclude`（3.18.5 发布于 2026-10-16）。
- **改 lock 之前**先记录顶层包基线（P4.4）。

### P4.3 super-injector
`pnpm install` 会从 tgz 重新解包并抹掉 `patches/profile/005`。install 后立即重放；作为 P4 退出项（needle 命中 5 次）。
另：`~/.dsh/patches` 有第二本账（`dsh-video-patches.manifest.json` 等），P1/P4 需说明与 whale manifest 的关系，避免两本账各说一套。

### P4.4 剪枝检查
安装前后记录**全部顶层包**（实测 246 顶层 / 354 展开），逐项 diff；缺失项从归档恢复。

### 退出标准
- `createRequire(...)('@deepseek-ai/schemastery/package.json').version === '3.18.5'`（不是 `import()` 取命名空间）
- super-injector needle 5 次
- 顶层包无未解释缺失
- 隔离 profile 可启动

---

## P5 非视频补丁 8 条 + 子代理契约（2.5–3d）

补丁：P1、P3、P4、P6、P16、P16b、P43、P44。

### P5.1 导出契约
| 符号 | 当前 | 0.2.1-rc.2 |
|---|---|---|
| `registerExternalContinuation` | 有 | 无 |
| `settleRun` | 有 | 无（→ `settleRunResult`） |
| `resolveChildCwd` | 有 | 无 |
| `startContinuable` | 有 | 无（→ `startActivation`） |

受影响文件（实测三个）：`dsh-routed-subagent/lib/index.js`、`lib/engines/claude.js`、`lib/engines/codebuddy.js`。

必须给出映射：`startActivation(spec)` 收 `{provider, request, signal, childId}`，无 `label`；插件传 `{provider,label,request,signal}` 并读 `continuable.childId`。适配层要显式转换。

### P5.2 门禁
`check-plugin-imports.mjs`（PARSE + LINK，能抓 `NO-EXPORT`）：profile 内插件 import 期零链接错误。

### 退出标准
- gate 8 条 OK
- `check-plugin-imports` 零链接错误
- 隔离 profile 可启动

---

## P6 视频层（4–5d）

### 合法状态
- **0/14**：上游本无 video（`contentHasVideo` 在 0.2.1 `dsh-llm`/`dsh-llm-pi-ai` 各 0 次），可启动。等于暂停视频功能。
- **14/14**：完整。
- **禁止 1–13/14**：`dsh-llm-pi-ai` 静态导入 `contentHasVideo`，半层会链接失败。

清单：P17、P17c、P18b、P18c、P19、P19b、P20、P21、P22、P23、P24、P25、P37、P39。

顺序：`dsh-llm` → `dsh-llm-pi-ai` → `pi-ai` → `dsh-tool-fs` → 客户端 → `dsh-token-meter`。

测试：读 mp4 返回 video 块且 SHA256 一致；有/无能力分别走 `video_url` / 抽帧；收集器不丢 video；多条只留最新；计价 4096。

### 退出标准
- 5 项测试全过
- 本地 GLM-5.3-Flash-EXL3 实机读 mp4
- 14 条 gate OK
- 未达 → 回 P6 起始 tag（0/14），升级暂停

---

## P7 插件兼容（2.5–3d）

基数 **21**（清单见 v3 §7.1，实测不变）；口径 `bundles 25 / deps 24`。

- **invariants**：npm 上止于 0.2.0-rc.2；无静态 import；机制是 Cordis 服务注入（`inject:["invariants"]` + `ctx.invariants.register`），受影响包 8 个。验收查 `ctx.invariants` 是否存在。
- **P38 必须先在位**（9 个插件靠它解析 profile 树外模块）。
- 三类处置：官方升级 / 自研改 peer + `engines.dsh` / 第三方先试加载后加例外（键 = 0.2.1-rc.2）。
- `compatibility.json` 全部重签。

### 退出标准
- 21 个全部有结论
- `verify-plugin-activation` 全绿（注意：脚本 exit code **2** = 日志过期，算"无效运行，重启后重跑"，不算失败也不算通过）
- 每个插件至少触发一次真实功能

---

## P8 壳侧补丁（1d）

1. **P38**：`lib/module-resolution-<hash>.js`，安装后重新定位重打，更新 manifest 与 gate。
2. **P30**：P3 已重打；本阶段只做行为复核。
3. 检查其他哈希文件名依赖。
4. `008` 补丁的 `\r` 路径问题记录在案（skip-upstream，不重放）。

### 退出标准
- P38 行为验证（profile 树外模块可解析）
- P30 行为验证（更新检查关闭）
- gate `UPSTREAM` 不增加

---

## P9 配置与行为迁移（0.5d）

| 项 | 动作 |
|---|---|
| `compatibility.json` | 键 → 0.2.1-rc.2 |
| 默认模型 | 保持 `jiyuan/deepseek-v4.1-flash-1017` |
| API Key 优先级 | 确认自定义 provider 仍读 `.credentials.yaml` |
| storages unit | 比对 `schedule@1`/`workspace@2`/`session_projcache@3`；变化登记 |
| `schedule.json` | 无 `enabled` 字段；比对任务数与 `unit.version` |
| `cordis.patch.yml` | 88 个 `- id:`（42 顶层）逐条比对 |
| toolDisplay / agent-instructions | 本机未用，复核 |

### 退出标准
- 模型可用、凭据可读
- storages 变化已登记
- 任务数与 unit.version 一致

---

## P10 全量验收（1.5d）

### 判定式（v3 缺失，现补）
**通过 = 下列三项同时成立**：
1. 10 条门禁全绿：`verify-patch-port`、`audit-registry`、`esm-syntax-check`、`check-plugin-imports`、`verify-plugin-activation`、`audit-preset-mounts`、`drift-scan`、`local-overrides/verify.ps1`、`check-private`、`audit-compatibility`；
2. 实机 8 项全过：对话与切换模型、子代理三路、视频读 mp4、MCP、better-sidebar、billing、定时任务、重启后配置不丢；
3. 最终回滚演练（L1 + L2）成功。

任一项不成立 → 不签字，按层级回滚。

---

## 回滚层级（v4.1）

**归档恢复根（P0 审查 M1，实测）：**

| 归档 | tar 内前缀 | 解到 |
|---|---|---|
| `home-core.tar` | `.dsh/…` | `{{USER_HOME}}` |
| `sessions.tar` / `attachments.tar` | `sessions/` / `attachments/` | `~/.dsh` |
| `globals.tar` | 根级 `cordis.patch.yml` 等 | `~/.dsh` |
| `appdata.tar` | `DSH Desktop/…` | `%APPDATA%` |
| `shell-app.tar`（2.0.16） | `app/…` | `<install>\resources` |
| `shell-app-2.0.18-pristine.tar` | `resources/app/…` | `<install>` |
| `external/*.tar` | 各自 basename | 按 `external-manifest.txt` 的源路径还原 |

**解包顺序（L1）**：先清空，再依次 `home-core` → `releases-vendor` → `sessions` → `attachments` → `globals` → `appdata`；清空清单还必须包含 `skills`（globals 会覆盖但不删除，残留旧文件会形成混合态）。`globals` 与 `home-core` 有三处重叠（`.credentials.yaml`、`cordis.patch.yml`、`reverse-proxy.json`），内容实测相同，后者覆盖前者无副作用。

| 层 | 动作 |
|---|---|
| L0 | git 回滚 |
| L1 | **清空 `profiles`/`storages`/`.agent-presets`/`sessions`/`attachments`/`releases`/`vendor-pkgs`/`skills`/`cordis.patch.yml`/`.credentials.yaml` 后解包** `home-core.tar` + `releases-vendor.tar` + `sessions.tar` + `attachments.tar` + `globals.tar` + `appdata.tar`；恢复后做全树比对 |
| L2 | 删 `resources\app` → 重装 2.0.16 → 恢复 `shell-app.tar`（解到 `resources\`）→ 校验 `resources/app` 三项 + Electron 层 `FileVersion` |
| L3 | L1 + L2 全部 |

**链接还原验证（P0 审查 M2，必须加进 P2/P10 退出标准）**：`home-core.tar` 含 136 个 symlink 与 12,375 个 hardlink，其中 `profiles/web/node_modules` 下 5 个 link 依赖（`dsh-continuous-worker`、`dsh-fork-to-preset`、`dsh-routed-subagent`、`dsh-subagent-model`、`dsh-full-remote`）是指向 `C:`/`E:` 的 Windows 符号链接/Junction。解包后必须验证：

```bash
node -e "for (const p of ['dsh-continuous-worker','dsh-fork-to-preset','dsh-routed-subagent','dsh-subagent-model','dsh-full-remote']) { try { console.log('OK ', p, require.resolve(p + '/package.json', {paths:['{{USER_HOME}}/.dsh/profiles/web']})) } catch (e) { console.log('FAIL', p, e.code) } }"
```

必须带 `/package.json` 后缀：`releases/.../988c9c5` 与 `vendor-pkgs/fr/package` 是目录，解析包入口未必命中。任一 `FAIL` 即视为 L1 不完整。

说明：`SESSION_FORMAT_VERSION` 在 0.2.0-rc.1 与 0.2.1-rc.2 均为 4，无格式迁移破坏；风险是备份缺失，已覆盖。

---

## 中止条件（可判定）

| 条件 | 判定式 |
|---|---|
| P2 空跑 | 120s 内未满足"HTTP 200 或 host 日志出现 DOM/页面 ready 标记"= 失败；2 次失败 → 不升级 |
| P3 版本/更新 | 壳 ≠ 2.0.18 / `dsh` ≠ 0.2.1-rc.2 / `updates.js` 非 `default(false)` → 回滚 L2 |
| P4 schemastery | `require('@deepseek-ai/schemastery/package.json').version !== '3.18.5'` → 回滚 L1 |
| P4 剪枝 | 顶层包 diff 出现未解释缺失且无法从归档恢复 → 回滚 L1 |
| P5 链接 | `check-plugin-imports` 报 `NO-EXPORT` → 该插件不得进入 P7 |
| P6 超时 | P6 起始 commit 的 UTC 起算 5 个工作日；未 14/14 → 回 P6 tag（0/14），升级暂停 |
| P7 插件 | 21 个中 >5 个 `verify-plugin-activation` FAIL（exit 2 不计）→ 暂停逐个决策 |
| P10 | 三项判定式任一不成立 → 不签字 |

---

## 审查记录

| 轮次 | 结论 | 残留问题 |
|---|---|---|
| v1 | REJECT ×2 | 见 v2 §14 |
| v2 | REJECT ×2 | 见 v3 §14 |
| v3 | REJECT(可行性) / APPROVE_WITH_FINDINGS(安全) | P1 方法互斥会写坏 live；回放未限临时目录；P2 判据只查一个文件；Electron 层未判；link 清单错；P1.8 动基线；P30 基线对象错；若干数字 |
| v4 | **APPROVE_WITH_FINDINGS ×2** | 非阻塞：31→24+7；FileVersion 字符串；临时目录写法；可交互判据；归档口径；verify profile 生命周期 |
| v4.1 | 已收口 | 上述 6 项全部写入本文件 |

