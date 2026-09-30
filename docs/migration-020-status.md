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
- **3 个未移植**，理由各不相同（见下）：2 个上游已吸收、1 个不可照搬
  - `P8` 0.2.0 的 `dsh-client-ui-reference` 提供 @ 提及源，且会把子代理子会话排到其他会话前面。
    **功能上**是 P8 的超集（且插入的 token 带导航与 codec，比 P8 的裸文本 `@name ` 更强）。
    唯一未覆盖的是 P8 附带的一层外观：把原始 `@<子会话标题>` 文本渲染成 chip 的
    `lexicon`/`subscribeLexicon`。那依赖不稳定的展示标题，属外观而非功能，故不补。
  - `P13` **不能照搬，账本依据已更正**。SSE 写入器确实没了，但 WebSocket 写入器
    仍然是「每条消息一次 `JSON.stringify` + 一次 `socket.send` + 一个 promise」
    （`dsh-api-gateway/lib/types/stream-server.js` 的 `send()`）——之前写的
    「没有每帧开销可摊薄」是**错的**，我采信了子代理的说法没有自己核。
    promise 链解决的是顺序与背压，不是每帧成本。
    它也无法按原样移植：`parseRemoteStreamClientMessage` 用 `exactKeys` 严格校验，
    **一帧只允许一条消息**，把多帧 join 在一起会直接破坏客户端协议。
    要做需要两端一起加批量消息类型，那是协议改动，不是补丁。
    成本对照：0.2.0 的每帧成本仍**低于** P13 当初针对的 SSE 路径（文本已 stringify、
    没有 `controller.enqueue`、没有重复 encode），所以这是回归风险而非已知故障。
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

## 四之二、bundle 列表与升级前逐项对齐

以 `package.json.bak-subagentui-020-*`（升级前最后一次改动）为基线：

```
pre-upgrade: 23 | now: 23
MISSING now: ["dsh-plugin-manager"]     <- 故意：与官方 0.2.0 版争同一个服务
added now  : ["dsh-local-presets"]      <- 新增：preset 层包
```

**没有任何 bundle 丢失。** 14 条 `compatibility.json` 豁免里有 3 条
（`@bpc-oss/dsh-verification`、`@bpc-oss/dsh-client-ui-verification`、
`dsh-token-meter-hermes`）本来就不在 `dsh.profile.bundles` 里——它们通过自己的
通道组合，升级前也是如此，不是这次迁移造成的缺口。

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

## 四之二、better-sidebar：你装的是 0.12.2，上游已经到 0.24.1

用户报三个症状：底部面板按了是空白、两个按钮落在 `body` 里没进标题栏条、生成的文件仍然用官方侧栏打开。
查上游才发现真正的原因：**装的是 0.12.2，而 npm `latest` 是 0.24.1**（2026-09-28 发布，
比内核升级早一天），中间还有 0.19.1 / 0.21.0-rc.1 / 0.21.1 / 0.22.0 / 0.22.1。
0.24.1 的 peerDependencies 全部是 `^0.2.0-rc.1` —— 它就是为这条内核线做的。

三个症状全是旧版的结构造成的，不是回归：

- 0.12.2 把浮动开关用 `position:fixed` + `appendChild(document.body)` 挂在 body 上，
  靠 CSS `body[data-dsh-title-bar-compat]` 把它压到标题栏下方——这正是"落在 body 里"；
- 底部面板是另一个独立 fixed 面板，空的；
- 0.12.2 拦截 `ctx.workspaces.openPath` 的力度不够，所以文件仍由官方 documentpreview 认领。

**0.24.1 换了架构**，三个症状一起消失：

| | 0.12.2 | 0.24.1 |
|---|---|---|
| 形态 | 自带浮动面板 + 独立底部面板 + body 里的 fixed 开关 | 官方右栏内的一个 pane |
| 插槽 | `conversation.chat.turnTail`、`settings.section` | `sidebar.right.pane.tab`、`sidebar.right.pane.tab.title`、`conversation.session.header.utilities`、`settings.section` |
| inject | `slots, sessions, connection, workspaces, locale` | 另加 `@deepseek-ai/dsh-client-ui-sidebar-right`、`dsh-client-modules` |
| 会话解析 | `sessions.list.getSnapshot().current`（0.2.0 已无此字段） | `ctx.get("uiWorkspace")`，并注明旧名保留为旧宿主兜底 |

也就是说：**我上一轮手写的三处移植（会话 scope、89 处图标改名、settings）在 0.24.1 里上游自己已经做了**
（会话 scope 那条尤其明显，源码注释直说 "The old names stay as the fallback for a host that predates the move"）。
换包时整目录替换，手写补丁一并作废，`scripts/port-better-sidebar-session-020.mjs` 已删除，
免得日后被套到 0.24.1 上。

**教训**：遇到插件在新宿主上报障，先查上游有没有新版本，再决定要不要手写移植。

## 四之三、better-sidebar 侧栏：三处 0.2.0 断裂叠在一起

用户报「右边的侧边栏点不开」。真实原因不是一处，是三层叠加，任何一层单独修都还是打不开：

1. **会话 scope 消失**（我先修错的层）
   面板组件读 `ctx.sessions.list.getSnapshot().current`。0.1.5 的 list 快照带 `current`，
   0.2.0 改成 `{ ids, byId, phase, projectionsBySession }` —— 没有 `current`。
   于是 `store.setSession(undefined)` 恒成立，面板永远停在「无会话」态：
   开关标签是 `noSession`（"选择一个会话以使用侧边栏"），点了没反应。
   0.2.0 把这份选择搬到了 `dsh-client-ui-workspace`（服务名 `uiWorkspace`，
   仍然持久化为 `dsh.sessions.current`），活跃引用是 `uiWorkspace.mainReference.sessionId`。

2. **插件 ctx 的属性访问会抛**（我自己踩的）
   cordis 对**未 inject** 的服务，属性访问 `ctx.uiWorkspace` 直接抛
   `cannot get property "uiWorkspace" without inject`，`ctx.get("uiWorkspace")` 才安全。
   所以**不能**把 `uiWorkspace` 写进 inject 列表——inject 项永远不满足会让整个插件
   永不激活，连带 renderer 一起挂掉。必须惰性 `ctx.get()`。

3. **图标名整体改名**（会话修好后暴露出来的潜在坑）
   0.2.0 的 `@deepseek-ai/dsh-client-ui-primitives` 给图标去掉了数字尺寸后缀，
   改成描边宽度变体：`IconPlusOutline16` → `IconPlusOutlineRegular` /
   `IconPlusOutlineMedium`（`Medium`/`Regular` 是 stroke 宽度，尺寸仍走 `size` prop，默认 16）。
   better-sidebar 客户端有 **89 处引用**对不上，React 报 `#130`（元素类型 undefined），
   面板撞边界错误。已按 `Regular`（1px，对应旧默认）批量改名。

修完的实测：面板 31 个节点、无边界错误、开关标签恢复为「展开底部面板 / 折叠侧边栏」，
收起后**「展开侧边栏」控件存在且可点**（这正是最初报障的点），面板在屏内 577px。

**验证方法的教训**：我之前把「DOM 里存在某个按钮」当成「侧栏能用」来汇报过，这是错的。
判断 UI 能不能用必须**真的点一次并观察状态变化**。同理，`node --check` 抓不到 ESM 错误、
静态门禁抓不到运行时行为——这次的假阳性是我自己的汇报失误，不是工具的问题。

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
