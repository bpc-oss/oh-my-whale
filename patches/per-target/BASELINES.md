# per-target 基线清单（BASELINES）

本目录的每条 diff 都是「某个 pristine 基线文件 → 当前 live 文件」的整文件 diff。本文件逐条写明该基线的**来源与获取方式**，使 24 + 13 + extra 共 43 条产物可以在任何机器上按同一基线复跑并达成 `cmp` 逐字节一致。

机器可读版本就在同目录的 `LEDGER.json`（每条 entry 带 `baselineSource` / `baselinePath` / `eol` / `applyRoot` / `replay`）。

## 1. 三种基线来源

| 来源 | 条数 | `baselineSource` 语法 | 本机落地位置 | 重建方式 |
|---|---|---|---|---|
| npm 上的同版本包 | 34 | `npm:<pkg>@<version>` | `<baselines>/pristine/<pkg>/<rel>` | `npm pack <pkg>@<version>` 后在解包树里取文件 |
| 2.0.16 安装包内的原始副本 | 7 | `installer:app-64.7z!resources/app/...` | `<baselines>/pristine-installer/<pkg>/<rel>`（app 级文件放在 `app/lib/...`） | 从本机 installer 里取出 `$PLUGINSDIR\app-64.7z` 再解包（见 §5） |
| whale 仓库里的 vendored tgz | 2 | `vendor:...tgz!package/<rel>` | `<baselines>/pristine-vendor/@dsh-external/dsh-super-injector/lib/index.js` | 解 `profile/vendor/dsh-external-dsh-super-injector-0.3.3.tgz`，取 `package/lib/index.js.bak-gateway-20260820` |

`<baselines>` 默认是 `{{USER_HOME}}/.dsh/tmp/p1-ledger`。

包版本一律取自 **live 的 `package.json`**（`resources/app/node_modules/<pkg>/package.json`），不取补丁注释里的旧基线：

```
@deepseek-ai/cordis-plugin-loader  1.0.5
@deepseek-ai/cordis               4.0.4
@earendil-works/pi-ai             0.85.1
其余 18 个 @deepseek-ai/dsh-*     0.2.0-rc.1
@dsh-external/dsh-super-injector  0.3.3（private，不在 npm 上）
```

npm 侧用到的 21 个 `<pkg>@<version>`：

```
@deepseek-ai/cordis-plugin-loader@1.0.5
@deepseek-ai/cordis@4.0.4
@earendil-works/pi-ai@0.85.1
@deepseek-ai/dsh-agent@0.2.0-rc.1
@deepseek-ai/dsh-agent-preset-registry@0.2.0-rc.1
@deepseek-ai/dsh-api-remotes@0.2.0-rc.1
@deepseek-ai/dsh-api-session-controller@0.2.0-rc.1
@deepseek-ai/dsh-attachment@0.2.0-rc.1
@deepseek-ai/dsh-cordis-client-runner@0.2.0-rc.1
@deepseek-ai/dsh-file-reference-local@0.2.0-rc.1
@deepseek-ai/dsh-goal@0.2.0-rc.1
@deepseek-ai/dsh-llm@0.2.0-rc.1
@deepseek-ai/dsh-llm-pi-ai@0.2.0-rc.1
@deepseek-ai/dsh-session@0.2.0-rc.1
@deepseek-ai/dsh-session-format-v2-to-v3@0.2.0-rc.1
@deepseek-ai/dsh-session-projection@0.2.0-rc.1
@deepseek-ai/dsh-subagent@0.2.0-rc.1
@deepseek-ai/dsh-token-meter@0.2.0-rc.1
@deepseek-ai/dsh-tool-cordis@0.2.0-rc.1
@deepseek-ai/dsh-tool-fs@0.2.0-rc.1
@deepseek-ai/dsh-tool-subagent@0.2.0-rc.1
```

重建 npm 侧基线（`<baselines>/pack/` 里保留着 30 个 `.tgz`，可直接复用）：

```bash
cd <baselines>/pack
npm pack @deepseek-ai/dsh-session@0.2.0-rc.1        # 逐个包执行
mkdir -p ../pristine/@deepseek-ai/dsh-session
tar -xzf deepseek-ai-dsh-session-0.2.0-rc.1.tgz -C ../pristine/@deepseek-ai/dsh-session --strip-components=1
```

## 2. 复跑方法（判据）

```bash
cd {{USER_HOME}}/oh-my-whale/patches/per-target
node verify-ledger.mjs
# 可选：--baselines <dir>  --live-app <resources/app>  --live-profile <profiles/web/node_modules>  --scratch <dir>
```

脚本行为：按 `LEDGER.json` 每条 entry，把 `baselinePath` 复制到一次性目录的 `<target>` 位置，`patch -p1 --fuzz=0` 应用**已交付的 patch 文件**，执行 `postSteps`（如有），再与 live 文件逐字节比对；同时复核 `noDiff` 记录。全程只写 scratch 目录。

当前结果：

```
patch entries : 43/43 replay byte-identical
no-diff entries: 7/7 confirmed byte-identical
exit 0
```

## 3. 为什么有 7 条用安装包副本而不是 npm 包

对 33 个 `node_modules` target 做三方比对（npm tarball / 安装包副本 / live）后发现 **26 个两者逐字节相同、7 个不同**：6 个 client bundle 的 CSS Module 类名哈希与 `\0dsh-css:` 构建路径不同（npm 侧 `/home/runner/work/deepseek-harness/...`，安装包侧 `D:\qwq\desktop\...`），`@deepseek-ai/dsh-subagent/package.json` 的依赖键序不同——同一版本、不同构建机。

这 7 个改用安装包副本的理由：任务要求的基线含义是「相对当前安装的 0.2.0-rc.1 **我们改了什么**」，而 npm tarball 在这些文件上不是安装树的上游产物，会把别人的构建差异算进我们的账。实测后果：`dsh-client-ui-conversation` 从 80,027B 降到 9,650B、`dsh-subagent/package.json` 从 3,712B 降到 356B，且 `@deepseek-ai/dsh-client-ui-subagent/lib/client.js` 与 `client-ui-sidebar-right/lib/client.js` 这两条从「+37/-37、+26/-26 的假阳性」变成真正的 `pristine == live`（详见报告发现 A）。

其中 5 个产生 patch（installer 来源），2 个成为 no-diff（也把基线镜像到 `pristine-installer/` 供复核）。

## 4. vendor 来源：`@dsh-external/dsh-super-injector` 的两种产物

该包 `private: true`、不在 npm 上、属 **profile 层**（`applyRoot = profiles/web/node_modules`，不是内核树）。

- `patches/per-target/dsh-external_dsh-super-injector__lib_index.js.patch`：整文件 diff（1 hunk，9700 删 / 9714 增）。live 是 **CRLF**、基线是 LF，所以逐行对齐退化为整文件重写。**应用后无需额外步骤即与 live 逐字节一致。**
- `patches/per-target-extra/dsh-external_dsh-super-injector__lib_index.js.semantic.patch`：`diff --strip-trailing-cr` 得到的 14 行语义 diff（P5 的 plugin-gateway 准入校验）。**必须带 post-step**：应用后把 LF 转成 CRLF，才与 live 逐字节一致（`LEDGER.json` 里 `replay.postSteps = ["lf-to-crlf"]`，`verify-ledger.mjs` 会自动执行）。

两者是同一改动的两种形态，**按文件去重、二选一**，不要同时应用。

基线可信性交叉验证：`profile/vendor/...0.3.3.tgz` 里的 `package/lib/index.js.bak-gateway-20260820` 与 live 目录里遗留的 `lib/index.js.bak-before-p5-132132` **逐字节相同**，两条独立路径互证。

## 5. 安装包基线怎么取的（可复现，无需下载）

```powershell
# 本机已有 installer 缓存，未下载任何东西
$inst = "$env:LOCALAPPDATA\dsh-plugin-desktop-updater\installer.exe"   # 269,333,800 B
& "C:\Program Files\7-Zip\7z.exe" x -y $inst -o<tmp>\stage "`$PLUGINSDIR\app-64.7z"
& "C:\Program Files\7-Zip\7z.exe" x -y <tmp>\stage\`$PLUGINSDIR\app-64.7z -o<tmp>\installer-tree "resources/app/*"
```

来源核实（三项独立证据）：

1. `app-64.7z` 内时间戳 `2026-09-29 09:58:46`，与安装树文件 mtime 完全一致；
2. 解出的 `resources/app/package.json` 是 `dsh-plugin-desktop@2.0.16`，与 live 相同；
3. 抽查未改动文件 `resources/app/lib/bin.js` 与 live 逐字节相同。

`pristine-installer/` 里只镜像**用到的**基线文件，保持 `<pkg>/<rel>` 结构；app 级文件无包段，按 `app/lib/<file>` 存放（对应 `applyRoot = resources/app`）。

## 6. 目录结构

```
<baselines>/
├── pack/                      30 个 npm tarball（21 个用到的包 + 其余历史包）
├── pristine/                  npm 解包树，<pkg>/<rel> 布局（34 条 entry 的基线）
├── pristine-installer/        安装包内副本，<pkg>/<rel> 布局，app 级放 app/lib/...（7 条 + 2 条 no-diff）
├── pristine-vendor/           vendored tgz 内副本（2 条 P5 entry 共用）
├── installer-tree/resources/app/   完整解包的 2.0.16 app 树（1.06 GB，全树比对用）
└── verify-ledger/             verify-ledger.mjs 的 scratch 输出（可随时删）
```

## 7. no-diff 与 driftWhitelist 记录

`LEDGER.json` 里 `noDiff` 是「status 全为 skip/retired 且 `pristine == live`」的机器可读清单（7 条，含各自的 `baselineSource` / `baselinePath` / `eol` / `covers`）。`driftWhitelist` 是 `manifest.driftWhitelist` 的 4 条记录，其中 2 条与安装包不同（`dsh-api-session-controller/lib/types/list.js`、`.../commands.js`），按既有裁决作为「死副本 / 生成物」不镜像、不产 patch、不算 drift。

## 8. 逐条基线清单

`eol` 一列是 live / pristine 的换行风格；只有 P5 那一对是 CRLF/LF 不一致（需 post-step），其余两边一致。

| target | 类别 | applyRoot | baselineSource | baselinePath | eol (live / pristine) |
|---|---|---|---|---|---|
| `@deepseek-ai/cordis-plugin-loader/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/cordis-plugin-loader@1.0.5` | `pristine/@deepseek-ai/cordis-plugin-loader/lib/index.js` | LF / LF |
| `@deepseek-ai/cordis/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/cordis@4.0.4` | `pristine/@deepseek-ai/cordis/lib/index.js` | LF / LF |
| `@earendil-works/pi-ai/dist/api/openai-completions.js` | main | resources/app/node_modules | npm `@earendil-works/pi-ai@0.85.1` | `pristine/@earendil-works/pi-ai/dist/api/openai-completions.js` | LF / LF |
| `@deepseek-ai/dsh-session/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-session@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-session/lib/index.js` | LF / LF |
| `@dsh-external/dsh-super-injector/lib/index.js` | main | profiles/web/node_modules | vendor `oh-my-whale/profile/vendor/dsh-external-dsh-super-injector-0.3.3.tgz!package/lib/index.js.bak-gateway-20260820 | `pristine-vendor/@dsh-external/dsh-super-injector/lib/index.js` | CRLF / LF |
| `@deepseek-ai/dsh-goal/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-goal@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-goal/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-api-session-controller/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-api-session-controller@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-api-session-controller/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-api-session-controller/lib/client.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-api-session-controller@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-api-session-controller/lib/client.js` | LF / LF |
| `@deepseek-ai/dsh-file-reference-local/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-file-reference-local@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-file-reference-local/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-subagent/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-subagent@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-subagent/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-subagent/package.json` | main | resources/app/node_modules | installer `app-64.7z!resources/app/node_modules/@deepseek-ai/dsh-subagent/package.json | `pristine-installer/@deepseek-ai/dsh-subagent/package.json` | LF / LF |
| `@deepseek-ai/dsh-llm-pi-ai/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-llm-pi-ai@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-llm-pi-ai/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-client-ui-conversation/lib/client.js` | main | resources/app/node_modules | installer `app-64.7z!resources/app/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js | `pristine-installer/@deepseek-ai/dsh-client-ui-conversation/lib/client.js` | LF / LF |
| `@deepseek-ai/dsh-client-ui-attachment/lib/client.js` | main | resources/app/node_modules | installer `app-64.7z!resources/app/node_modules/@deepseek-ai/dsh-client-ui-attachment/lib/client.js | `pristine-installer/@deepseek-ai/dsh-client-ui-attachment/lib/client.js` | LF / LF |
| `@deepseek-ai/dsh-llm/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-llm@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-llm/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-tool-fs/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-tool-fs@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-tool-fs/lib/index.js` | LF / LF |
| `@earendil-works/pi-ai/dist/api/openai-responses-shared.js` | main | resources/app/node_modules | npm `@earendil-works/pi-ai@0.85.1` | `pristine/@earendil-works/pi-ai/dist/api/openai-responses-shared.js` | LF / LF |
| `@deepseek-ai/dsh-token-meter/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-token-meter@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-token-meter/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-session-format-v2-to-v3/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-session-format-v2-to-v3@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-session-format-v2-to-v3/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-client-ui-commands/lib/client.js` | main | resources/app/node_modules | installer `app-64.7z!resources/app/node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js | `pristine-installer/@deepseek-ai/dsh-client-ui-commands/lib/client.js` | LF / LF |
| `lib/updates.js` | main | resources/app | installer `app-64.7z!resources/app/lib/updates.js | `pristine-installer/app/lib/updates.js` | LF / LF |
| `@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/client.js` | main | resources/app/node_modules | installer `app-64.7z!resources/app/node_modules/@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/client.js | `pristine-installer/@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/client.js` | LF / LF |
| `lib/module-resolution-CTTB3FAS.js` | main | resources/app | installer `app-64.7z!resources/app/lib/module-resolution-CTTB3FAS.js | `pristine-installer/app/lib/module-resolution-CTTB3FAS.js` | LF / LF |
| `@deepseek-ai/dsh-tool-subagent/lib/index.js` | main | resources/app/node_modules | npm `@deepseek-ai/dsh-tool-subagent@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-tool-subagent/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-agent-preset-registry/lib/index.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-agent-preset-registry@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-agent-preset-registry/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-agent-preset-registry/lib/invariant.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-agent-preset-registry@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-agent-preset-registry/lib/invariant.js` | LF / LF |
| `@deepseek-ai/dsh-agent-preset-registry/lib/types/session.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-agent-preset-registry@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-agent-preset-registry/lib/types/session.js` | LF / LF |
| `@deepseek-ai/dsh-session-projection/lib/index.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-session-projection@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-session-projection/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-session-projection/lib/types/index.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-session-projection@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-session-projection/lib/types/index.js` | LF / LF |
| `@deepseek-ai/dsh-cordis-client-runner/lib/client.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-cordis-client-runner@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-cordis-client-runner/lib/client.js` | LF / LF |
| `@deepseek-ai/dsh-session/lib/types/known-event-types.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-session@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-session/lib/types/known-event-types.js` | LF / LF |
| `@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/manager.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-api-session-controller@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/manager.js` | LF / LF |
| `@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-api-session-controller@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.js` | LF / LF |
| `@deepseek-ai/dsh-attachment/lib/types/index.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-attachment@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-attachment/lib/types/index.js` | LF / LF |
| `@deepseek-ai/dsh-subagent/lib/types/child-agent.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-subagent@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-subagent/lib/types/child-agent.js` | LF / LF |
| `@deepseek-ai/dsh-subagent/lib/types/continuation-activation.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-subagent@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-subagent/lib/types/continuation-activation.js` | LF / LF |
| `@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js` | coverage-gap | resources/app/node_modules | npm `@deepseek-ai/dsh-tool-cordis@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js` | LF / LF |
| `@deepseek-ai/dsh-agent/lib/index.js` | extra | resources/app/node_modules | npm `@deepseek-ai/dsh-agent@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-agent/lib/index.js` | LF / LF |
| `@deepseek-ai/dsh-api-session-controller/lib/typert.host.js` | extra | resources/app/node_modules | npm `@deepseek-ai/dsh-api-session-controller@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-api-session-controller/lib/typert.host.js` | LF / LF |
| `@deepseek-ai/dsh-api-session-controller/lib/typert.remote-client.js` | extra | resources/app/node_modules | npm `@deepseek-ai/dsh-api-session-controller@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-api-session-controller/lib/typert.remote-client.js` | LF / LF |
| `@deepseek-ai/dsh-api-remotes/lib/client.js` | extra | resources/app/node_modules | npm `@deepseek-ai/dsh-api-remotes@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-api-remotes/lib/client.js` | LF / LF |
| `@deepseek-ai/dsh-attachment/lib/index.js` | extra | resources/app/node_modules | npm `@deepseek-ai/dsh-attachment@0.2.0-rc.1` | `pristine/@deepseek-ai/dsh-attachment/lib/index.js` | LF / LF |
| `@dsh-external/dsh-super-injector/lib/index.js` | extra-semantic | profiles/web/node_modules | vendor `oh-my-whale/profile/vendor/dsh-external-dsh-super-injector-0.3.3.tgz!package/lib/index.js.bak-gateway-20260820 | `pristine-vendor/@dsh-external/dsh-super-injector/lib/index.js` | CRLF / LF |
