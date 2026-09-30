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

### 五之二、better-sidebar 三症状的最终实机确认（2026-09-30）

用户报的三条，逐条点过、看过状态变化（不是"元素存在"就算通过）：

| 症状 | 证据 |
|---|---|
| 底部面板按了是空白 | toggle 可点 → `--dsh-sidebar-height: 220px` → 4 个 tab（文件/文件变动/任务管理/侧边对话）→ 点「文件」列出工作区真实目录树 |
| 右侧栏点不开 / 按钮错位 | P31 撤销后 `data-sidebar-right-expand` 存在且在视口内（x=1557 / 视口 1597）→ 点开后面板在 x=878、宽 719、**在屏内**（P31 撤销前它的内容被 `translateX(719px)` 推出视口） |
| 生成的文件走官方侧栏 | 右栏文件树点 `OR-FOR-PROVIDERS.md` → 新 tab 出现，带「预览 / 编辑」切换，markdown 正文与表格真实渲染。渲染节点的 class 家族是 `nArs4W_*`（better-sidebar 的 CSS module）+ `cm`（CodeMirror 编辑器），**不是** `dsh-client-ui-sidebar-documentpreview` |

第三条是之前一直没能实测的一条（当时会话里没有文件链接）。用 better-sidebar 自己的文件树
代验是等价的：用户点的也是文件，而 `files` 这个 kind 已被 0.24.1 用
`registerFilesKind` 以 `priority: "extension"` 接管，走的就是同一个 pane。

### 五之三、其余核心功能的实机复验（2026-09-30）

| 功能 | 证据 |
|---|---|
| 自定义模型 | 模型选择器显示 `Local GLM-5.3 Flash EXL3 (DFlash2)`；另一处显示 `Space Bunny Alpha / 推理等级 Max` |
| 自定义 preset | 新会话页 hero 区显示 `Enforce + RSI Standard` |
| 历史会话 | 左栏 15 个会话行，跨度 12 小时 ~ 1 个月；当前会话 83 个 `conversation.chat.node` 完整渲染，含早期轮次与子代理工作记录 |
| 加载错误 | 整个复验过程 host 日志零 `history unavailable` / `resume failed` / schema 报错 |
| 内核树残留 | `.bak` / `.orig` 清零（清之前先确认对应内容已在正式文件 + 账本里，备份到 `~/.dsh/backups/kernel-bak-20260930/`） |

**没验成的一条**（2026-09-30 晚已补上）：用 CDP 切换到**另一个**历史会话。
前两次失败的��因都不是功能问题：一次用 `element.click()`，DSH 的会话行只响应指针事件序列，结果落到
"新会话"欢迎页；一次先 `scrollIntoView` 再取坐标，滚动让坐标失效。第三次按正确顺序做才验成 ——
**滚动 → 等稳定 → 取视口内坐标 → 立刻派发真实鼠标事件**：

- 目标：1 个月前的「询问推文内容如何实现」
- 标题切过去了，**155 个 `conversation.chat.node`** 完整渲染
- 内容真实：9月1日 00:27 的「已完成工作 用时 53分40秒」「已重试模型请求（2/∞）」以及子代理的
  分析全文
- 零 `history unavailable` / `resume failed` / `Cannot read properties` / `Too small`

**历史加载是好的。** 用户报过的那两类历史错误（`Cannot read properties of undefined (reading
'parse')`、`Too small: expected number to be >=0`）在这轮全部复验中一次都没出现。

顺带发现会话行的 `children.length` 是 4 而非我假设的 ≤2 —— 按 ≤2 过滤会把 15 个会话全部排除，
这也是前两次"找不到目标"的直接原因。

**本轮又踩了一次查询陷阱**：点开文件后内容不在 `[data-dockkit-host]` 里（该节点会变空），
真实渲染在 panel 的 `tabHostBody`。我一度因为查错选择器而以为预览是空白的 ——
与之前"DOM 里有按钮就算能用"是同一类错误，只是方向相反。**先确认节点在哪，再判断有没有内容。**

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

## 四之二之二、0.24.1 换上去了，但它**从头到尾就没加载过**

上一节把 0.24.1 的架构变化讲清楚了，却漏掉了更要紧的事实：换包之后 better-sidebar
**一次都没成功激活**。用户看到的"两个按钮位置不对""文件走官方侧栏"，
在换包后的运行实例里根本不是 0.24.1 的行为——那是宿主自己的 UI。

判据只有一条，host 日志里躺着：

```
[W] [hmr] better-sidebar (dsh-better-sidebar): failed to import
    at .../dsh-better-sidebar/lib/index.js:119:115
[E] [host-resolved-root-include] TypeError: field.volatile is not a function
```

`super-injector` 的 HMR 每隔几分钟重试一次，每次同样失败，所以日志里反复出现同一行。

### 根因：profile 顶层的 schemastery 影子包

`lib/index.js:119` 是这一行：

```js
const volatilePrefs = Object.fromEntries(
  Object.entries(PrefsSchema.dict ?? {}).map(([key, field]) => [key, field.volatile()])
);
```

`volatile()` 是 `@deepseek-ai/schemastery` 的方法。版本对不上：

| 位置 | 版本 | 有 `volatile()` |
|---|---|---|
| 壳内 host | 3.18.4 | 有（9 处） |
| **profile 顶层** `node_modules/@deepseek-ai/schemastery` | **3.18.1** | **无** |
| 连带 `@deepseek-ai/cosmokit` | 1.8.2（host 是 1.8.5） | 无 `createVolatile` |

profile 顶层那个 3.18.1 是 `@bpc-oss/dsh-verification` 的 peer 依赖被 pnpm 提升上来的
（`pnpm-lock.yaml` 里 `autoInstallPeers: false`，peer 由包管理器代管）。
它 shadow 掉了 host 的 3.18.4，于是所有从 profile 侧解析 `@deepseek-ai/schemastery`
的插件拿到的都是 3.18.1。0.24.1 的 peerDependencies 写的是 `^0.2.0-rc.1`（内核线），
它没把 schemastery 列进 peer，于是踩中了这个洞。

**正确修法不是手改顶层包**。手改会被下一次 `pnpm install` 抹掉（实测：改完跑 install，
pnpm 立刻按 lock 把顶层恢复成 3.18.1）。正解是让 pnpm 装 better-sidebar 自己的依赖：

```
node_modules/dsh-better-sidebar/node_modules/@deepseek-ai/schemastery  3.18.4
node_modules/dsh-better-sidebar/node_modules/@deepseek-ai/cosmokit      1.8.5
```

Node 的 ESM 解析从 `dsh-better-sidebar/lib/` 出发先命中自己那一份，3.18.1 留在原地
服务 dsh-verification，两者互不干扰。实测 `createRequire('.../dsh-better-sidebar/lib/index.js')
.resolve('@deepseek-ai/schemastery')` 落在嵌套的 `lib/index.cjs`（3.18.4）上。

### 顺带挖出来的坑：lock 与实装脱节

装 0.24.1 时只改了 `package.json`（`^0.24.1`），**lock 仍锁在**
`file:vendor-archives/dsh-better-sidebar-0.12.2-fix108.tgz`。也就是说
**任何一次 `pnpm install` 都会把插件静默降级回 0.12.2**，而且不会有任何报错。

而 `pnpm install` 当时跑不通：供应链策略 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`
拦下 `@deepseek-ai/dsh-client-ui-subagent@0.2.0-rc.2`（发布于 cutoff 之后 6 小时），
pnpm 在解析任何东西之前就整体拒绝。已在 `pnpm-workspace.yaml` 的
`minimumReleaseAgeExclude` 补上该条目——它本来就在 lock 里，只是没进白名单。

### 另一个被误伤的补丁：P31

`patches/manifest.json` 的 **P31** 把官方右栏的 `ExpandButton` 改成恒返 `null`。
2026-09-12 的判断是"官方右栏与 better-sidebar 重复，保留 better-sidebar"——
那时装的是 0.12.2，它自带挂在 `document.body` 的浮动开关，确实重复。

0.24.1 反过来了：它 `inject @deepseek-ai/dsh-client-ui-sidebar-right`，
用 `sidebar.right.pane.tab` / `.tab.title` 在**官方右栏里**注册 pane。
官方那个 ExpandButton 不再是重复入口，而是**到达插件 pane 的唯一入口**。
继续挂着 P31 = 插件看得见、点不开。已撤销。

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
node scripts\verify-plugin-activation.mjs                   # 重启 DSH 之后跑
```

最后一条是 2026-09-30 新增的。理由见「四之二之二」：插件 import 抛错时**磁盘上一切正常、
渲染器一切正常**，唯一证据在 host 日志里。`verify-plugin-activation.mjs` 查两件事——
host 日志里的 import 失败，以及某个传递依赖解析到了**比顶层更旧**的嵌套副本。
日志超过 6 小时没更新时它会以 exit 2 提示"这个绿只说明日志一直绿，重启再验"。

### 换插件版本时的纪律

`package.json`、`pnpm-lock.yaml`、`node_modules` 三者必须同时对齐。
只改 `package.json` 的后果不是装不上，而是**下一次任何人跑 `pnpm install`
都会把它静默降级回旧版**，且全程无报错（0.24.1 就是这么在 lock 里被
`dsh-better-sidebar-0.12.2-fix108.tgz` 压住的）。

`pnpm install` 跑不通时先看是不是供应链策略：

```
ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION
```

pnpm 会在解析任何东西**之前**整体拒绝 lockfile。把那个包加进
`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 即可。

`compatibility.json` 的豁免是**精确版本**的：插件或内核一升版就要重算，
否则 0.2.0 那种"整批静默禁用"会再来一次。
