# 0.2.0 迁移完工状态（2026-09-30）

桌面壳 **2.0.16** + 内核 **0.2.0-rc.1**，装在
`%LOCALAPPDATA%\Programs\DSH Desktop\resources\app`（2.0.16 起**不再打 asar**，是裸目录）。

本文件是这次迁移的**完工账**。过程与踩坑见 `migration-020-playbook.md`；
事故复盘见 `incident-2026-09-29-kernel020-on-shell209.md`。

## 一、门禁（全部必须绿）

| 门 | 命令 | 当前 |
|---|---|---|
| ESM 语法 | `node --experimental-vm-modules scripts/esm-syntax-check.mjs <app-root>` | `SYNTAX ERRORS: 0` |
| ESM 链接 | `node scripts/esm-link-check.mjs <app-root>` | `TOTAL PROBLEMS: 0` |
| 内核补丁移植 | `node scripts/verify-patch-port.mjs <app-root>` | `OK 34 \| TODO 0 \| UPSTREAM 3 \| PROFILE 1` |
| 覆盖项账本 | `powershell -File local-overrides/verify.ps1` | `all registered overrides present` |
| 内核补丁在场 | `powershell -File scripts/verify-kernel-patches.ps1` | `all kernel patches present` |
| 隐私 | `powershell -File scripts/check-private.ps1` | `OK: no private data found` |

## 二、38 个内核补丁条目的归属

- **34 个已移植**到 0.2.0 树
- **3 个上游已吸收**（强行套会造成重复注册，比不套更糟）
  - `P8` 0.2.0 的 `dsh-client-ui-reference` 提供 @ 提及源，且会把子代理子会话排到其他会话前面——是 P8 的严格超集
  - `P13` 0.2.0 没有 SSE 写入器了；会话事件走多路复用 WebSocket
    （`dsh-api-gateway/lib/types/stream-server.js`），写入已串进 promise 链并带背压，该补丁要摊薄的每帧开销不存在
  - `P17b` 0.2.0 的 DeepSeek Messages 序列化器对任何非图片块直接 `unsupported`，
    且没有 DeepSeek 系模型声明 video；这类路由走 `P20` 抽帧降级才对
- **1 个属 profile 域**（`P5` super-injector，在 profile 层不在内核树）

## 三、四类"静默失效"（每一类都曾让功能无声消失）

1. **preset 必须声明**：0.2.0 不再扫 `<user-home>/.dsh/.agent-presets`。
   `scripts/migrate-presets-to-020.mjs` + `extract-preset-layers.mjs`
2. **本地条目必须是 `file://` URL**：`host-process-entry.js` 清空 `loader.internal`，
   loader 走裸 `import(name)`，Windows 路径不是合法说明符
3. **preset 必须走 bundle patch 层**（不是塞进 profile 自己的 patch）——
   这条曾让 10 个条目 id 在 13 个 preset 里全部 `never started`
4. **插件 peerDependencies 会禁掉整行**：
   `profiles/<name>/compatibility.json` 精确 `包名@版本` → DSH 版本列表

## 四、插件宿主侧改写

| 插件 | 改了什么 |
|---|---|
| `dsh-better-sidebar` | 0.2.0 删了 `settings.register()`，命名空间改成 entry id，schema 改由 entry 的 `static Config` 派生。把 PrefsSchema 折进 Config（**必须排在 PrefsSchema 之后**，否则 TDZ） |
| `dsh-bash-terminal` | 同上删 `settingsScope`（0.2.0 零出现）；shell 改从 entry config 读 |
| `dsh-full-remote` | inject 换成 `dsh-client-connection`；装 `uqr`；picker 守卫识别 0.2.0 官方 picker，不再重复 pin |
| `dsh-plugin-manager` | 第三方 `dsh-plugin-manager@0.1.0`（hrhgit）与官方 `@deepseek-ai/dsh-plugin-manager@0.2.0-rc.1` 争同一个 `pluginManager` 服务且 typert codec 不兼容 → 移除第三方，用官方的 |
| `module-resolution-*.js` | 未注册父模块的裸 `@deepseek-ai/*` 兜底解析到 app 树 |

## 五、实测（CDP 驱动真实 renderer，`scripts/cdp-eval.mjs`）

- 客户端启动清单 **80 条**（迁移前基线 73），13 个第三方插件全部在
- 模型目录：10 个自定义 provider 全在（DGX Spark / opencode / B.AI / teamoroute / tokenrouter / zai-coding-cn / tm / commandcode / stepfun / DeepSeek）
- preset 选择器 8 个全在；`never started` **0**；`新建会话` 成功
- **视频端到端**：3 秒红底+中央蓝矩形的 mp4 → 模型答
  "画面中是一片纯红色背景，正中央有一个蓝色矩形……0到2秒没有变化"，8 秒，¥0.0058
- **对话端到端**：模型 3 秒回"通路"，¥0.0027，跑在自定义模型
  `Local GLM-5.3 Flash EXL3 (DFlash2)`
- 插件市场可用（能列插件、来源、分类、安装按钮）
- `chrome_faithful` MCP 常驻；`reverse-proxy` 控制面挂在 `/dsh-reverse-proxy`

## 五之二、runtime 层（`local-presets/00-runtime.patch.yml`）

0.2.0 的 `dsh-web-app` 依赖 `dsh-tool-workflow` / `dsh-tool-ralph` / `dsh-workflow-ptc`，
却**不依赖**提供 `workflowEngine` 服务的包，于是两个工具永远 pending。
`@deepseek-ai/dsh-workflow` 就是那个提供者，它就在 0.2.0 树里，但没人插它。

这一层补上后：`never started` 0、`did not activate` 0。

两个必须记住的坑：

1. **顶层 `- id: X / name: Y` 是「覆盖」语义**，按已存在的 entry id 匹配。
   要**新增**条目必须写成 `- insert:` + 缩进项，否则只会被报
   `entry "workflow" not found` 然后静默丢弃。
2. `dsh-workflow-ptc` **已经**由 `dsh-web-app` 插入，再写一次会得到
   `duplicate loader entry id "workflow-ptc" in the composed profile`，
   直接把桌面打进恢复模式。

## 六、已知的残留噪音（都不是本次升级造成）

| 现象 | 结论 |
|---|---|
| `agents-anywhere-runtime` EACCES | 端口占用，0.1.5 时代就有 |
| ~~`tool-workflow` / `tool-ralph` pending~~ | **已解决**：见下节 runtime 层 |
| `patch: entry "vision-toolkit" / "dsh-vision-toolkit" / "test-run-plugin" / "agentos-dsh-lco" not found` | 插件已卸载，`disabled: true` 阻断自装配的**故意**残留行 |
| `patch: id is required for non-insert patches` | 同上 |
| `pluginManager has been registered` | 重复尝试被捕获，先注册者胜出；市场实测可用 |

## 七、每次升级后的固定动作

```powershell
cd <whale-repo>
node scripts\verify-patch-port.mjs "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app"
powershell -File scripts\apply-post-install-patches.ps1     # 幂等
powershell -File scripts\verify-kernel-patches.ps1
node scripts\esm-link-check.mjs "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app"
```

`compatibility.json` 的豁免是**精确版本**的：插件或内核一升版就要重算，
否则 0.2.0 那种"整批静默禁用"会再来一次。
