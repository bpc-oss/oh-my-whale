# DSH 升级完成报告：2.0.16 / 0.2.0-rc.1 → 2.0.18 / 0.2.1-rc.2

日期：2026-10-19
执行：P0–P10 全流程；每阶段独立审查（共 8 轮，含 4 次 REJECT 修复）

## 结果

| 项 | 值 |
|---|---|
| 桌面壳 | **2.0.18** |
| 内核 | **0.2.1-rc.2** |
| 补丁门禁 | **40 OK / 0 TODO / 4 UPSTREAM / 0 NO-FILE（44 条）** |
| ESM 语法 | 1,451 模块 **0 错** |
| 插件导入 | 22 entry / 93 边 **0 问题** |
| 插件激活 | **26 个全健康** |
| registry | 51/51 |
| preset 挂载 | 426 id 零缺失 |
| local-overrides | 全 PASS |
| 私有数据 | OK |
| drift-scan | **HAS_DRIFT（1 项，见 §7，预期内）** |

## 1. 备份与回滚

备份：`{{PLUGIN_SOURCES_DIR}}\dsh-backups\upgrade-2.0.18-20261019T101751Z\`（≈10.1 GiB）

- 2.0.16 安装包（269,333,800 B）与 2.0.18 安装包（SHA256 与官方一致）
- `home-core` / `sessions` / `attachments` / `globals` / `appdata` / `releases-vendor` / `shell-app`
- `shell-app-2.0.18-pristine.tar`（P30 与 drift 基线）
- 14 个 link 源码目录（无 git 的按目录归档；dirty 仓库另存完整 diff）

回滚流程已按 P2 实跑一次（装 2.0.18 → 回 2.0.16 → 全量恢复），基线精确复原（25,976 文件 / 739.0 MiB / 0.2.0-rc.1）。

## 2. 账本（P1）

- `patches/per-target/`：37 条 per-target diff + `LEDGER.json` + `BASELINES.md` + `verify-ledger.mjs`
- `patches/per-target-extra/`：6 条
- 覆盖缺口追平：43 个 live delta 全部有账（type-surface + 3 个入口 bundle + P44）
- 快照式旧补丁已重建为可重放 diff

## 3. 非视频补丁（P5）

- 三方合并 30 文件：27 解析落地、3 个纯视频块交 P6
- 修掉两个真实缺陷：`startContinuable` 丢 `label`、preset 分支漏 `applyChildOverrides`
- 最终 25 → 28 条非视频补丁进入 OK

## 4. 视频栈（P6）

14 条补丁整层重建，**64 + 54 项测试全过**：

- `contentHasVideo`、gating、`video_url` 两条 wire、工具结果媒体重挂、抽帧降级、旧视频卸载、`read_image` 视频块、客户端 3 个 bundle、4096 token 计价
- 视频 schema 在 typert host/remote 与 api-remotes 三个面上均通过 zod 校验
- 生产树 `video` 代码与 0.2.16 ground truth 一致（排序 grep 空 diff）

## 5. 壳侧（P8）

- P38 模块解析兜底：0.2.18 的 chunk 改名为 `module-resolution-CcoXnXDo.js`，已在新文件重打（patch 046），门禁 needle 同步
- P30 更新开关：从 2.0.18 pristine 基线重打，`enabled: default(false)`

## 6. 插件层（P7）

- `dsh-plugin-manager` 0.1.0 与服务端内置 0.2.1 版本重复注册 → 移除 profile 副本
- `@deepseek-ai/dsh-experimental-schedule-bundle` 在 0.2.1 已并入核心 → 从 bundles 移除
- `dsh-community-market`、`@agents-anywhere/dsh-bridge-next` 0.2.1 期望但缺失 → 安装
- `dsh-better-sidebar` 0.24.1 等待已不存在的 `webRuntime` → 升 **0.28.0**（0.2.1 原生），并补 locale 包
- 两个插件的嵌套 `schemastery` 影子（3.18.1/3.18.2）移除，统一解析 **3.18.5**
- **`dsh-routed-subagent` 适配 0.2.1**：内核补回 `start(provider, spec)` 兼容桥（含 descriptor 快照、catalog 登记、能力校验），插件优先走该桥；修掉外部引擎被误路由为本地子代理的问题

## 7. 遗留项测试结果（2026-10-20 补测）

1. **drift-scan 的 1 项预期漂移**：`dsh-routed-subagent` 源码有 1 个未提交文件（本次适配）。解决：在 `{{PLUGIN_SOURCES_DIR}}\dsh-routed-subagent` 提交后运行 `scripts/capture-sources.ps1` 并提交 `FINGERPRINTS.json`。**未清零，属预期。**
2. **视频真实 provider 回合：PASS。** 用 ffmpeg 生成 2 秒彩条 mp4，经**生产树**的 `convertMessages` 生成 wire（确认含 `video_url` 与 `data:video/mp4`），打本地 `GLM-5.3-Flash-EXL3`（`192.168.31.221:8888`）：HTTP 200，`prompt_tokens=269`（纯文本约 93），模型正确列出 White/black/red/orange/yellow/green/cyan/blue/magenta。证明视频原生摄入链路贯通。
3. **`subagent_routed` 真实调用冒烟**：未跑模型回合（需 UI 触发）。已用真实 `SubagentRuntime` 原型验证：`svc.start` 存在、走 `provider.start`、descriptor `version:3` 写入、catalog 事件写入父会话、返回的 run 带 `id`/`localAgent`。首次真实使用时确认父会话出现子代理卡片即可。
4. **`tool_filter` 已不再被忽略（原判断失效）**：兼容桥优先走 routed 的 `provider.start`，其中 `:325-326` 主动执行 `childCtx.tools.restrict({ deny })`。此前“内核 `composition` 只带 agentPreset”的结论只适用于 `startLocal` 路径，而该路径现在不会被使用。
5. **`web-billing` 剪枝风险已消除**：它原先只是 `node_modules` 里的实体目录、未声明依赖（`pnpm install` 会当 extraneous 清掉）。已按 SOURCES 定义补 `link:{{PLUGIN_SOURCES_DIR}}\dsh-web-billing`，重装后为符号链接；重启后插件数 **27 健康**、导入 99 边 0 问题。profile 模板同步补了 `{{PLUGIN_SOURCES_DIR}}` 版本。其余 3 个 experimental bundle 由内核自带，无剪枝风险。
6. 一次性子代理的 descriptor `mode`：走 `provider.start` 路径时由桥固定为 `one-shot`（与 0.2.16 一致）；`startLocal` 回退路径才是 `continuable`。

## 8. 结论

升级完成，功能面与配置面均保留。回滚随时可用。唯一未清零的事项是第 7 节第 1 条：在 `{{PLUGIN_SOURCES_DIR}}\dsh-routed-subagent` 提交本次适配后跑 `capture-sources.ps1`，drift-scan 即回到 `CLEAN`（当前唯一漂移就是该仓库的 1 个未提交文件）。
