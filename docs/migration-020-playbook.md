# 0.2.0 迁移手册：preset 声明、插件版本豁免、相对路径

2026-09-29 从 0.1.5 升到 0.2.0-rc.1（桌面壳 2.0.16）时踩到的三件事，每一件都会
**静默地**让功能消失，而不是报错。

---

## 1. preset 必须声明，不再扫目录

0.1.5 的 `dsh-agent-presets`（复数）扫描 `~/.dsh/.agent-presets/<name>/`。
0.2.0 拆成两个包：

| 包 | 角色 |
|---|---|
| `dsh-agent-preset` | **一个 preset 一行 loader 声明**，Config 就是 `{id, name, description, order, plugins}` |
| `dsh-agent-preset-registry` | `agentPresets` 服务；`default` / `selectedDefault` 指向一个已声明的 id |

没有声明的话，`agent-preset-registry.selectedDefault` 指向的 preset 每次新建会话都失败：

```
新建会话失败：agent-preset/not-found: Unknown agent preset: enforce-rsi-standard
```

**迁移**：

```powershell
node scripts\migrate-presets-to-020.mjs `
     "$env:USERPROFILE\.dsh\.agent-presets" `
     "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml"
```

它在 profile patch 层尾部追加一段 `- insert:` 块，每个 preset 一行
`name: '@deepseek-ai/dsh-agent-preset'`，`plugins:` 是原 `agent.cordis.yml` 的内容。
脚本带标记，重复运行会拒绝追加第二份（先手工删掉旧块）。

## 2. 本地 `.mjs` 条目要写 `file://` URL，不能写 Windows 路径

`host-process-entry.js:69` 显式 `hostCtx.loader.internal = void 0`，所以 loader 走

```js
else if (name.startsWith(".")) import(new URL(name, this.ctx.baseUrl).href)
else                            import(name)     // 裸说明符
```

`name: C:\Users\...\tool-bootstrap.mjs` 不是合法模块说明符，条目直接 `never started`，
级联成：

```
agent-preset/invalid: context-gate (…): never started tool-bootstrap (…): never started …
```

而 `./tool-bootstrap.mjs` 在 0.1.5 能用是因为 preset 目录就是组合根；0.2.0 的行住在
profile patch 层，`./x.mjs` 会按 **profile 目录**解析。

**迁移器已经把相对路径改写成 `file:///C:/...`**，这是 `import()` 接受的形式。

## 3. 插件的 peerDependencies 会把整行禁掉

0.2.0 的 preflight（`dsh-app-boot` 的 `prepareProfileEntries`）会逐行校验
`peerDependencies` 里的 `@deepseek-ai/*` 是否满足当前内核版本，不满足就

```
dsh: disabling profile plugin row "routed-subagent": Plugin dsh-routed-subagent@0.3.0 is incompatible with dsh 0.2.0-rc.1: peerDependencies {…}
```

用户自己的插件全部钉在 0.1.x 线，于是**整批被静默禁用**。

**官方豁免机制**：`profiles/<name>/compatibility.json`，精确 `包名@版本` → DSH 版本列表：

```json
{
  "dsh-routed-subagent@0.3.0": ["0.2.0-rc.1"]
}
```

从启动日志批量生成：

```powershell
$log = "$env:APPDATA\DSH Desktop\logs\dsh-$(Get-Date -f yyyy-MM-dd).log"
# 取所有 `disabling profile plugin row "x": Plugin <name@ver> is incompatible with dsh <ver>`
# 写成 {"<name@ver>": ["<ver>"]} 合并进 compatibility.json
```

⚠️ 豁免只解除**版本闸门**，不保证插件真的能跑。放行后必须看启动日志里它是否真的挂载。

## 4. 客户端插件失败会把桌面打进恢复模式

renderer 里任何一个 client 插件加载失败：

```
renderer boot failed (plugins: dsh-bash-terminal, dsh-plugin-manager): The client Loader did not provide an error message.
RendererStartupFailure → 窗口变成 "DSH Desktop Recovery"
```

定位工具（`scripts/plug-client-check.mjs`）把插件的 `./client` 入口里每个
`@deepseek-ai/*` 具名导入，对照 profile 与 app 两棵树的真实导出做差集——错误消息
不给内容，链接差集给。

```powershell
node scripts\plug-client-check.mjs dsh-bash-terminal `
     "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-bash-terminal\dist\client.js"
```

**处理顺序**：先把该插件从 `compatibility.json` 移出（回到"被禁"但桌面可用的状态），
再单独移植它的 client 半边。桌面开着比插件开着重要。

## 5. 顶栏 / 恢复模式自测

带调试端口启动，renderer 就能被直接驱动（真实 UI 验收，不只是静态门禁）：

```powershell
Get-Process -Name 'DSH Desktop' | Stop-Process -Force
Start-Process "$env:LOCALAPPDATA\Programs\DSH Desktop\DSH Desktop.exe" `
             -ArgumentList '--remote-debugging-port=9222'
```

`node scripts\cdp-eval.mjs --list` 列出目标，`--expr "<js>"` 在页面里求值。

## 6. 0.2.0 树里缺的传递依赖：`uqr`

壳 2.0.16 内置的 0.2.0-rc.1 树**没有** `uqr`，但树里有模块要 import 它，于是每次启动：

```
[E] [host-resolved-root-include] Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'uqr'
```

`uqr@0.1.3` 是单文件二维码编码器（ESM/CJS 双导出，无依赖）。装到**两处**，
因为解析锚点可能是 app 树也可能是 profile：

```powershell
npm pack uqr@latest          # 解包后
Copy-Item package  "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app\node_modules\uqr" -Recurse
Copy-Item package  "$env:USERPROFILE\.dsh\profiles\web\node_modules\uqr" -Recurse
```

定位手法留个教训：这条报错的 `imported from .../lib/index.js` 是**锚点**，
不是真实来源——`resolveWithState` 会把 parentURL 改写成 `DESKTOP_ENTRY_URL`。
按报错文本去搜文件会白费时间。想拿真实来源只能在 `resolve()` 钩子里记
`context.parentURL`；但**别把 `await` 写进非 async 的解析函数**，我这么干过一次，
直接把 renderer 干崩了。

## 7. 已确认与本次升级无关的噪音

| 现象 | 结论 |
|---|---|
| `agents-anywhere-runtime` EACCES | 端口占用，0.1.5 时代就有 |
| `browse-directory-picker: service "directoryPicker" has been registered` | **上游 0.2.0 自身冲突**：`dsh-host-directory-picker` 与 `dsh-api-workspace-controller` 都 provide 该服务且都被组合。已用 pristine 快照逐字节比对四个 `dsh-host-directory-picker*` 包，均未改动。非致命，先注册者胜出 |
| `patch: entry "vision-toolkit" / "dsh-vision-toolkit" / "test-run-plugin" / "agentos-dsh-lco" not found` | 插件已卸载，`disabled: true` 阻断自装配的**故意**残留行 |
| `patch: id is required for non-insert patches` | 同上，同一类 |
