# P0 完成报告（预检与备份）

日期：2026-10-19
备份目录：`{{AI_FILES}}\dsh-backups\upgrade-2.0.18-20261019T101751Z\`

## 0. 结论

P0 全部产出已就绪，安装树**零写入**。P1 账本重建并行完成，等待独立审查后进入 P2。

## 1. 预检

| 项 | 结果 |
|---|---|
| 磁盘 | C: 478 G 可用 / E: 278 G 可用 |
| 7-Zip | 26.04（`C:\Program Files\7-Zip\7z.exe`） |
| tar | GNU tar 1.35 |
| DSH 进程 | 关闭前 25 个，`CloseMainWindow` 超时后强制结束，最终 **0** |
| 关闭时活动 | 最近 5 分钟无 `turn/start` / `step/start` |

## 2. 工具链修正（P0.4）

`patches/host/apply.ps1` 的默认内核路径原指向不存在的 `resources\app.asar.unpacked`。已改为：

```powershell
$unpacked = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app\node_modules"
if (Test-Path (Join-Path $unpacked "@deepseek-ai\dsh\package.json")) { $KernelDir = $unpacked }
```

PowerShell 解析通过；路径实测 `True`。

## 3. 备份制品（不含 `external/` 合计 10,360,314,238 B ≈ 9.65 GiB；含 external 为 10,856,019,159 B ≈ 10.11 GiB）

| 制品 | 大小 | `tar -tf` 条目 | 校验 |
|---|---|---|---|
| `home-core.tar` | 3,038 MiB | 218,085 | rc=0 |
| `sessions.tar` | 2,904 MiB | 5,093 | rc=0 |
| `attachments.tar` | 687 MiB | 4,811 | rc=0 |
| `appdata.tar` | 947 MiB | 8,993 | rc=0 |
| `shell-app.tar`（2.0.16） | 762 MiB | 29,078 | rc=0 |
| `releases-vendor.tar` | 172 MiB | 10,996 | rc=0 |
| `globals.tar` | 100 KiB | 23 | rc=0 |
| `installer-2.0.16.exe` | 269,333,800 B | — | 已复制 |
| `installer 2.0.18` | 330,099,798 B | — | SHA256 与官方一致 |
| `shell-app-2.0.18-pristine.tar` | **836,433,920 B** | — | 从 NSIS 解出 |
| `external/`（14 项） | **495,704,921 B ≈ 473 MiB** | 1–5,292 | rc=0 |

`SHA256SUMS.archives` 共 31 行，覆盖根目录全部 tar/exe 与 `external/` 全部文件。

### 归档恢复根（P0 审查 M1）

| 归档 | tar 内前缀 | 解到 |
|---|---|---|
| `home-core.tar` | `.dsh/…` | `{{USER_HOME}}` |
| `sessions.tar` / `attachments.tar` | `sessions/` / `attachments/` | `~/.dsh` |
| `globals.tar` | 根级 `cordis.patch.yml` 等 | `~/.dsh` |
| `appdata.tar` | `DSH Desktop/…` | `%APPDATA%` |
| `shell-app.tar` | `app/…` | `<install>\resources` |
| `shell-app-2.0.18-pristine.tar` | `resources/app/…` | `<install>` |

**链接还原**：`home-core.tar` 含 136 symlink / 12,375 hardlink；`profiles/web` 下 5 个 link 依赖指向 `C:`/`E:`。解包后必须用 `require.resolve` 验证（见方案 L1 节），否则 L1 视为不完整。

### 外部 link 源码（14 项）

排除 `node_modules`、`.git`、`.worktrees`、`*.bak-*`；每个目录记录 git HEAD 与 dirty 数，dirty 仓库另存完整 `git diff`：

- `dsh-continuous-worker` HEAD `36a30a6`，dirty=10（diff 已存）
- `dsh-token-meter-hermes` HEAD `9d1cfe2`，dirty=3（diff 已存）
- `chrome-faithful` HEAD `7cefa82`，dirty=0
- `dsh-global-tool-discovery` HEAD `7607c3a`，dirty=0
- `dsh-fork-to-preset` HEAD `1cb7b9f`，`dsh-routed-subagent` HEAD `7ade572`，`dsh-subagent-model` HEAD `88253d2`
- **无 git**：`dsh-governance`、`dsh-voice-input`（按目录归档）

> 偏差说明：`{{AI_FILES}}\dsh-continuous-worker` 下有一个 `node_modules.bak-rc7` 符号链接指向旧壳，首次 tar 被撑到 4.2 GB。已改为排除 `node_modules*`，源码与 dirty diff 完整保留；恢复后需重装依赖。

## 4. 安装包

首次下载因 `gh release download` 超时后仍在写、与 `curl -C -` 并发导致文件多出 229 KB、SHA256 不符。已删除并用 **12 路 Range 并行**重下：

```
size = 330,099,798  (与官方一致)
sha256 = d1edf6ef53156542e06836e2a478dc3508599a3290c5402eb32f771e7bb09f39
官方  = d1edf6ef53156542e06836e2a478dc3508599a3290c5402eb32f771e7bb09f39
```

`SHA256SUMS.txt` 与安装包同批从 `gh release download v2.0.18 -R anywhere-labs/deepseek-harness-desktop -p SHA256SUMS.txt` 取得（备份目录内留存）。

## 5. 2.0.18 pristine（P0.3c）

从 `installer-2.0.18.exe` 的 NSIS `$PLUGINSDIR\app-64.7z` 解出：

| 项 | 值 |
|---|---|
| 文件数 | 27,930 |
| 字节 | 808,634,535（771.2 MiB） |
| 壳版本 | **2.0.18** |
| 内核 | **0.2.1-rc.2** |
| `lib/updates.js` | 存在 |
| `enabled` 默认值 | **`true`** ← P30 必须在安装后立刻重打 |

## 6. P1 并行完成（待审查）

- `patches/per-target/`：**24 条** per-target diff，独立抽查回放后与 live 逐字节一致
- `patches/per-target-extra/`：**6 条**（5 条 skip 状态却有真实 delta + 1 条 super-injector 语义 diff）
- `patches/per-target/LEDGER.json`：记录每条 diff 的 target / applyRoot / baselineVersion / covers
- manifest：登记 **P44**（continuable 修复），总数 44；P15/P18/P5 加注指向额外 diff
- 门禁：`verify-patch-port` 仍 `OK 40 / 0 TODO`

P1 详细报告：`docs/p1-ledger-report.md`

## 7. 安全状态

- `resources/app` 最近 2 小时被修改文件数：**0**
- 未安装、未卸载任何包
- 未执行任何 git commit
- 备份目录不在任何 git 仓库内

## 8. 进入 P2 前必须做的事

1. 独立审查 P0/P1 产物（本报告 + `docs/p1-ledger-report.md`）
2. P2 执行前重取一次安装层基线（文件数/字节/exe 大小）
3. 按方案把 `profile-selection` 切到一次性 `verify-0218`
