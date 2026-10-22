# P1 账本重建报告：per-target 可重放 diff（v2，处置独立审查 REJECT）

执行时间：2026-10-19
修订：v2 —— 处置审查的 MAJOR-1～MAJOR-4
产物：`{{USER_HOME}}\oh-my-whale\patches\per-target\`（37 条 patch + `LEDGER.json` + `BASELINES.md` + `verify-ledger.mjs`）、`patches\per-target-extra\`（6 条 patch）

## 结论摘要

| 判据 | 结果 |
|---|---|
| 全部 43 条 patch 回放后与 live `cmp` 逐字节一致 | **43 / 43 通过** |
| 7 个 no-diff target 逐个校验 `pristine == live` | **7 / 7 逐字节一致** |
| `node verify-ledger.mjs`（从已交付产物复跑） | `43/43` + `7/7`，**exit 0** |
| 全树覆盖对账：安装包 vs live 差异文件 | 43 个 = 41 覆盖 + 2 driftWhitelist，**未覆盖 0** |
| 写入 `resources/app` | **0 字节**（全树 25,976 个文件扫描：**4 小时内被修改的文件 = 0**，最新 mtime 仍是 2026-10-02 01:28；无 `.orig`/`.rej`） |
| 改动 `apply.ps1` / git commit / 安装卸载 | 无 |

四处审查意见全部处置完毕；另修正 v1 报告的一处口径错误（三方比对基数应是 33 个 `node_modules` target + 2 个 app 级文件），并把审查的 39 与本次实测 43 的口径差异摆明（见下）。

## 数字小结

- manifest 条目：**44**（P44 已登记；本次未改 manifest）
- manifest target：44 条 → **31 个 target key**（`P18` 的 6 路径数组算 1 个）→ 拆开后**文件级 target = 36**
- 状态分布：`ported` 36、`skip-upstream` 3、`skip-upstream-stricter`/`skip-absorbed`/`skip-not-portable`/`skip-optional-diagnostic` 各 1、`retired` 1
- per-target 产物：**43 条 patch 文件**，去重后 **42 个不同 target**
  - `main`（原 24 条）：**24**
  - `coverage-gap`（本次补齐的 MAJOR-1 缺口）：**13**
  - `extra`（skip 状态却仍有真实 delta）：**5**
  - `extra-semantic`（P5 的语义形态，与整文件形态同一 target）：**1**
- baseline 来源分布（按条目）：npm **34** / 安装包内副本 **7** / vendored tgz **2**
- no-diff：**7**；driftWhitelist 记录：**4**（其中 **2** 个与安装包不同）
- 失败项：**0**；版本不明：**0**

### 全树对账（MAJOR-1 的账）

| 全树差异文件 | 数量 |
|---|---|
| 安装包树与 live 逐文件哈希不同的文件总数 | **43** |
| 其中已被 per-target 产物覆盖 | **41** |
| 其中在 `manifest.driftWhitelist` 里（裁决为死副本，不产 patch） | **2** |
| 其中无任何记录（本次补齐 13 条） | **0** |
| 安装包有、live 没有的文件 | **0** |
| live 有、安装包没有的文件 | **11**（3 个 `.bak` + 8 个 `uqr`） |


补修前（审查时）：43 个差异文件 = 28 覆盖 + 15 未记录（2 个 driftWhitelist + **13 个无任何记录**）。本次补齐后未覆盖为 0：**无记录的 13 个与审查列举的 13 个逐条相同**。

关于「39 vs 43」：审查报的是 39 个不同文件，本次实测为 43 个。我的方法与口径如下，可复核——把安装包整树解开后对 `resources/app` 全量 25,965 个文件逐个做 sha256 与 live（25,976 个文件）比对。43 里含 2 个 app 级文件（`lib/updates.js`、`lib/module-resolution-CTTB3FAS.js`，不在 `node_modules` 下）与 2 个 driftWhitelist 文件；`43 − 2(app 级) = 41`，`41 − 2(whitelist) = 39`，审查的 39 很可能就是这两种排除之一，但它同一句话又说那 2 个 whitelist 文件「在剩下 15 个里」，两种说法不能同时成立，故我不替它选定口径，只报告我自己的测量值。实质结论不受影响：**13 个无记录文件集合完全一致，补齐后全树无一遗漏**。

被排除在 diff 之外的 live-only 文件（安装包没有、live 有，**不镜像、不产 patch**）：

- `node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js.bak-p40`
- `node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js.bak-pre-p43`
- `node_modules/@deepseek-ai/dsh-subagent/lib/index.js.bak-pre-continuable-fix-20261002`
- `node_modules/uqr/LICENSE`
- `node_modules/uqr/README.md`
- `node_modules/uqr/dist/index.cjs`
- `node_modules/uqr/dist/index.d.cts`
- `node_modules/uqr/dist/index.d.mts`
- `node_modules/uqr/dist/index.d.ts`
- `node_modules/uqr/dist/index.mjs`
- `node_modules/uqr/package.json`


## MAJOR-1：13 个覆盖缺口已补齐

| target | live 版本 | baseline | diff 文件 | 回放（hunk/字节 → cmp） | covers |
|---|---|---|---|---|---|
| `@deepseek-ai/dsh-agent-preset-registry/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-agent-preset-registry__lib_index.js.patch` | 1h / 827B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-agent-preset-registry/lib/invariant.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-agent-preset-registry__lib_invariant.js.patch` | 1h / 835B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-agent-preset-registry/lib/types/session.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-agent-preset-registry__lib_types_session.js.patch` | 1h / 859B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-session-projection/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-session-projection__lib_index.js.patch` | 5h / 3631B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-session-projection/lib/types/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-session-projection__lib_types_index.js.patch` | 5h / 4027B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-cordis-client-runner/lib/client.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-cordis-client-runner__lib_client.js.patch` | 2h / 2690B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-session/lib/types/known-event-types.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-session__lib_types_known-event-types.js.patch` | 2h / 606B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/manager.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-api-session-controller__lib_types_client_sessions_manager.js.patch` | 2h / 1174B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-api-session-controller__lib_types_client_sessions_service.js.patch` | 2h / 1280B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-attachment/lib/types/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-attachment__lib_types_index.js.patch` | 2h / 1862B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-subagent/lib/types/child-agent.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-subagent__lib_types_child-agent.js.patch` | 1h / 1239B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-subagent/lib/types/continuation-activation.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-subagent__lib_types_continuation-activation.js.patch` | 1h / 1121B → **byte-identical** | —（无条目覆盖） |
| `@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-tool-cordis__lib_types_api-catalog.js.patch` | 1h / 624B → **byte-identical** | —（无条目覆盖） |


### 这 13 条不是 13 个孤立遗漏，而是同一类系统性缺口

按内容核对，13 条全部是**已登记补丁的 type-surface / 镜像副本**：旧账本只记 `lib/index.js` / `lib/client.js` 入口文件，而这些改动同时落在 `lib/types/**`（类型再导出、API 目录、d.ts 风格的 `.js`）和少量并列 bundle 里，从未入账。逐条归属：

| 归属 | 文件 |
|---|---|
| `P11`（fork seed 的 preset 继承语义） | `dsh-agent-preset-registry/lib/index.js`、`lib/invariant.js`、`lib/types/session.js` |
| `P4`（外部事件名注册） | `dsh-session/lib/types/known-event-types.js` |
| fork-inherited seam（`apply(state,event,context)`） | `dsh-session-projection/lib/index.js`、`lib/types/index.js` |
| fork 带 `agentPreset`（P10 家族 + API 目录） | `dsh-api-session-controller/lib/types/client/sessions/{manager,service}.js`、`dsh-cordis-client-runner/lib/client.js`、`dsh-tool-cordis/lib/types/api-catalog.js` |
| video/file 附件透传 | `dsh-attachment/lib/types/index.js` |
| `P16`/`P44`（routed subagent） | `dsh-subagent/lib/types/{child-agent,continuation-activation}.js` |

**后续规则建议（写入 P4 的验收项）**：任何落在 `lib/index.js` 上的补丁，必须同时对同包 `lib/types/**` 做一次差异扫描；账本条目要能指向「文件」而不只是「入口」。

全部 13 条都用**该包当前安装版本（0.2.0-rc.1）的 npm pristine** 作 baseline，且这 13 个文件的 npm tarball 与安装包副本逐字节相同（无需切到 installer 基线）。逐条回放 `cmp` 全部 **byte-identical**，无一条是构建噪声。

### `uqr` 的判定（结论：保留，不要删）

| 项 | 事实 |
|---|---|
| 版本/内容 | `uqr@0.1.3`，8 个文件（`package.json`、`LICENSE`、`README.md`、`dist/{index.cjs,index.d.ts,index.d.cts,index.d.mts,index.mjs}`），单文件二维码编码器，零依赖 |
| 是否在 2.0.16 安装包里 | **不在**（全树对账里属 `live-only`，安装包 0 命中） |
| 谁引入 | **我方手工补装**，不是某个 npm 安装带进来的。来源已记录在 `docs/migration-020-playbook.md` §6：2.0.16 内置的 0.2.0-rc.1 树缺 `uqr`，但 profile 插件 `dsh-full-remote`（`dependencies.uqr: ^0.1.3`）在运行时 `import` 它，每次启动报 `ERR_MODULE_NOT_FOUND: Cannot find package 'uqr'` |
| 为什么有两份 | 解析锚点可能是 app 树也可能是 profile 树，所以在**两处**各放一份：`resources/app/node_modules/uqr` 与 `~/.dsh/profiles/web/node_modules/uqr`，两份**内容完全相同**（实测 `diff -rq` 无差异） |
| 是否需要升级后保留 | **需要**，只要：(a) profile 仍装 `dsh-full-remote`，且 (b) 2.0.18 的树仍不带 `uqr`。(b) 必须在 P4 重新确认——`resources/app/node_modules/uqr` 是**反安装树基线**的一处刻意偏差，重装/升级会把它抹掉，而装回去必须同时写两处 |
| 本次处置 | **未删除、未新建、未改动**；只记录事实与复核步骤 |

建议 P4 加一条机器判据：

```bash
# 升级后两处都要能解析；任一失败就按 migration-020-playbook §6 重放到两处
node -e "require.resolve('uqr')"                                    # 以 resources/app 为 cwd 的父级
node -e "console.log(require.resolve('uqr',{paths:['<profile>/node_modules']}))"
```

## MAJOR-2：`applyRoot` 已修正

`LEDGER.json` 里两条 super-injector 条目（整文件 patch 与 semantic patch）的 `applyRoot` 原写作 `resources/app/node_modules`，**已改为 `profiles/web/node_modules`**（该包是 profile 层私有包，内核树里不存在）。

修正后三种 root 的账：

| applyRoot | 条目数 | 去重后 target 数 |
|---|---|---|
| `resources/app/node_modules` | 39 | 39 |
| `profiles/web/node_modules` | 2 | 1 |
| `resources/app` | 2 | 2 |
| **合计** | **43** | **42** |


说明：`profiles/web/node_modules` 有 2 条条目但只有 1 个 target——整文件形态与 semantic 形态是同一改动的两种表达，**二选一**。按 target 去重后总计 42。

## MAJOR-3：基线已随产物交付、可复跑

新增/补齐：

1. **`patches/per-target/BASELINES.md`** —— 逐条写明 `baselineSource` 与获取方式：npm 侧 21 个 `<pkg>@<version>` 清单 + `npm pack` 复现命令；安装包侧从本机 `installer.exe` 取 `$PLUGINSDIR\app-64.7z` 的完整 PowerShell 命令 + 三项来源核实证据；vendor 侧 tgz 路径与内部路径；P5 两种形态与 `post-step` 说明。
2. **`<baselines>/pristine-installer/`** —— 安装包侧基线文件已按 `<pkg>/<rel>` 结构落盘（app 级文件按 `app/lib/<file>`，对应 `applyRoot = resources/app`）：7 条 patch 用到的 7 个 + 2 个 no-diff 复核用的 = **9 个文件**。
3. **`<baselines>/pristine-vendor/`** —— vendored tgz 内的 `lib/index.js.bak-gateway-20260820`，2 条 P5 条目共用。
4. **`LEDGER.json` 每条 entry 增加** `baselineSource`、`baselinePath`、`eol`（live / pristine 分别记录）、`baselineVersion`、`applyRoot`、`replay`；`noDiff` 记录同样带 `baselineSource`/`baselinePath`/`eol`。
5. **`patches/per-target/verify-ledger.mjs`** —— 从已交付产物复跑的验证器（默认 baseline 目录 = `<baselines>`，可 `--baselines/--live-app/--live-profile/--scratch` 覆盖；`postSteps` 自动执行）。

复跑结果（**本次实测**，全程只写 scratch 目录）：

```
$ cd {{USER_HOME}}/oh-my-whale/patches/per-target && node verify-ledger.mjs
patch entries : 43/43 replay byte-identical
no-diff entries: 7/7 confirmed byte-identical
exit 0
```

审查指出的「用交付素材复跑只能得 19/24」已消除：差额的 5 条正是 `baseline_kind = installer` 的那 5 个 kernel 文件（`dsh-subagent/package.json`、`client-ui-{conversation,attachment,commands,sidebar-documentpreview}`）；它们现在由 `pristine-installer/` 提供基线，`LEDGER.json` 的 `baselineSource` 明确指到该目录。

`eol` 字段的唯一异常是 P5（live CRLF / pristine LF，两条 entry 均如此），其余 41 条两边都是 LF。

## MAJOR-4：报告账实已对齐

| 项 | 原报告 | 更正为 |
|---|---|---|
| extra 数量 | 5 | **6**（5 条 skip 状态真实 delta + 1 条 P5 semantic 形态） |
| manifest 条目 | 43 | **44**（`P44` 已登记：`target = @deepseek-ai/dsh-subagent/lib/index.js`、`patchFile = per-target/deepseek-ai_dsh-subagent__lib_index.js.patch`、`status = ported`） |
| P44 与 P16 的关系 | 未写 | `P16` 的 `patchFile` 仍是旧账 `host/016-dsh-subagent-routed-fork.patch`，`P44` 指向新的 per-target 产物——**两者是同一个 live 文件**。per-target 产物已同时承载 P16 + P44 的改动，**按文件去重，不得逐条二次 apply**（重复 apply 会因上下文缺失而失败，或把同一改动叠加两次） |
| `presetTarget` 计数口径 | 「补丁 4 / live 5」（单位混用） | 统一为两种口径并列：**按行：patch 4 / live 4**；**按子串出现次数：patch 5 / live 5**（4 个新增行里有 1 行含 2 次）。另：`.bak-pre-continuable-fix-20261002` 两口径均为 **0** |
| no-diff 记录 | 只有正文表格 | `LEDGER.json` 新增机器可读 `noDiff`（7 条，带 `baselineSource`/`baselinePath`/`eol`/`covers`/`status`）与 `driftWhitelist`（4 条，带 `differsFromInstaller` 布尔） |

## 24 条主产物（原样保留）

| target | live 版本 | baseline | diff 文件 | 回放（hunk/字节 → cmp） | covers |
|---|---|---|---|---|---|
| `@deepseek-ai/cordis-plugin-loader/lib/index.js` | 1.0.5 | npm | `deepseek-ai_cordis-plugin-loader__lib_index.js.patch` | 3h / 2516B → **byte-identical** | `P1` |
| `@deepseek-ai/cordis/lib/index.js` | 4.0.4 | npm | `deepseek-ai_cordis__lib_index.js.patch` | 2h / 2316B → **byte-identical** | `P2` |
| `@earendil-works/pi-ai/dist/api/openai-completions.js` | 0.85.1 | npm | `earendil-works_pi-ai__dist_api_openai-completions.js.patch` | 6h / 5116B → **byte-identical** | `P3` `P17c` `P23` |
| `@deepseek-ai/dsh-session/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-session__lib_index.js.patch` | 3h / 1133B → **byte-identical** | `P4` `P26` |
| `@dsh-external/dsh-super-injector/lib/index.js` | 0.3.3 | vendor | `dsh-external_dsh-super-injector__lib_index.js.patch` | 1h / 794118B → **byte-identical** | `P5` |
| `@deepseek-ai/dsh-goal/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-goal__lib_index.js.patch` | 5h / 3917B → **byte-identical** | `P6` |
| `@deepseek-ai/dsh-api-session-controller/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-api-session-controller__lib_index.js.patch` | 4h / 3614B → **byte-identical** | `P7` `P9` `P11` |
| `@deepseek-ai/dsh-api-session-controller/lib/client.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-api-session-controller__lib_client.js.patch` | 3h / 2509B → **byte-identical** | `P10` |
| `@deepseek-ai/dsh-file-reference-local/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-file-reference-local__lib_index.js.patch` | 1h / 546B → **byte-identical** | `P14` |
| `@deepseek-ai/dsh-subagent/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-subagent__lib_index.js.patch` | 10h / 7823B → **byte-identical** | `P16` `P44` |
| `@deepseek-ai/dsh-subagent/package.json` | 0.2.0-rc.1 | installer | `deepseek-ai_dsh-subagent__package.json.patch` | 1h / 356B → **byte-identical** | `P16b` |
| `@deepseek-ai/dsh-llm-pi-ai/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-llm-pi-ai__lib_index.js.patch` | 11h / 16320B → **byte-identical** | `P17` `P19b` `P20` `P25` `P39` `P41` `P43` |
| `@deepseek-ai/dsh-client-ui-conversation/lib/client.js` | 0.2.0-rc.1 | installer | `deepseek-ai_dsh-client-ui-conversation__lib_client.js.patch` | 14h / 9650B → **byte-identical** | `P18b` |
| `@deepseek-ai/dsh-client-ui-attachment/lib/client.js` | 0.2.0-rc.1 | installer | `deepseek-ai_dsh-client-ui-attachment__lib_client.js.patch` | 1h / 943B → **byte-identical** | `P18c` |
| `@deepseek-ai/dsh-llm/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-llm__lib_index.js.patch` | 2h / 3321B → **byte-identical** | `P19` |
| `@deepseek-ai/dsh-tool-fs/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-tool-fs__lib_index.js.patch` | 7h / 6000B → **byte-identical** | `P21` |
| `@earendil-works/pi-ai/dist/api/openai-responses-shared.js` | 0.85.1 | npm | `earendil-works_pi-ai__dist_api_openai-responses-shared.js.patch` | 2h / 2347B → **byte-identical** | `P22` |
| `@deepseek-ai/dsh-token-meter/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-token-meter__lib_index.js.patch` | 2h / 993B → **byte-identical** | `P24` |
| `@deepseek-ai/dsh-session-format-v2-to-v3/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-session-format-v2-to-v3__lib_index.js.patch` | 2h / 514B → **byte-identical** | `P27` `P28` |
| `@deepseek-ai/dsh-client-ui-commands/lib/client.js` | 0.2.0-rc.1 | installer | `deepseek-ai_dsh-client-ui-commands__lib_client.js.patch` | 4h / 8373B → **byte-identical** | `P29` |
| `lib/updates.js` | 2.0.16 | installer | `app__lib_updates.js.patch` | 1h / 732B → **byte-identical** | `P30` |
| `@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/client.js` | 0.2.0-rc.1 | installer | `deepseek-ai_dsh-client-ui-sidebar-documentpreview__lib_client.js.patch` | 2h / 4912B → **byte-identical** | `P37` |
| `lib/module-resolution-CTTB3FAS.js` | 2.0.16 | installer | `app__lib_module-resolution-CTTB3FAS.js.patch` | 1h / 1553B → **byte-identical** | `P38` |
| `@deepseek-ai/dsh-tool-subagent/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-tool-subagent__lib_index.js.patch` | 1h / 1027B → **byte-identical** | `P42` |


`@deepseek-ai/dsh-subagent/lib/index.js` 这一条同时承载 `P16` + `P44`（未入账的 10-02 continuable / `presetTarget` 修复）——`LEDGER.json` 的 `covers` 已把 `P44` 计入。

## extra 6 条（`per-target-extra/`）

| target | live 版本 | baseline | diff 文件 | 回放（hunk/字节 → cmp） | covers |
|---|---|---|---|---|---|
| `@deepseek-ai/dsh-agent/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-agent__lib_index.js.patch` | 1h / 503B → **byte-identical** | `P15` |
| `@deepseek-ai/dsh-api-session-controller/lib/typert.host.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-api-session-controller__lib_typert.host.js.patch` | 4h / 2650B → **byte-identical** | `P18` |
| `@deepseek-ai/dsh-api-session-controller/lib/typert.remote-client.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-api-session-controller__lib_typert.remote-client.js.patch` | 2h / 1236B → **byte-identical** | `P18` |
| `@deepseek-ai/dsh-api-remotes/lib/client.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-api-remotes__lib_client.js.patch` | 2h / 1389B → **byte-identical** | `P18` |
| `@deepseek-ai/dsh-attachment/lib/index.js` | 0.2.0-rc.1 | npm | `deepseek-ai_dsh-attachment__lib_index.js.patch` | 3h / 1396B → **byte-identical** | `P18` |
| `@dsh-external/dsh-super-injector/lib/index.js` | 0.3.3 | vendor | `dsh-external_dsh-super-injector__lib_index.js.semantic.patch` ⚠post-step | 1h / 1619B → **byte-identical** | `P5` |


⚠ `dsh-external_..._semantic.patch` 需要 post-step（应用后把 LF 转 CRLF）才与 live 逐字节一致，`LEDGER.json` 的 `replay.postSteps = ["lf-to-crlf"]` 已声明，`verify-ledger.mjs` 会自动执行。它与 `per-target/` 里的整文件形态是**同一改动的两种形态，二选一**。

## no-diff 7 条 + driftWhitelist 4 条

| target | live 版本 | baseline | pristine == live | covers |
|---|---|---|---|---|
| `@deepseek-ai/dsh-client-ui-subagent/lib/client.js` | 0.2.0-rc.1 | installer | **yes（逐字节）** | `P8` |
| `@deepseek-ai/dsh-client-connection/lib/client.js` | 0.2.0-rc.1 | npm | **yes（逐字节）** | `P12` |
| `@deepseek-ai/dsh-api-gateway/lib/index.js` | 0.2.0-rc.1 | npm | **yes（逐字节）** | `P13` |
| `@deepseek-ai/dsh-llm-deepseek/lib/index.js` | 0.2.0-rc.1 | npm | **yes（逐字节）** | `P17b` |
| `@deepseek-ai/dsh-subagent/lib/typert.host.js` | 0.2.0-rc.1 | npm | **yes（逐字节）** | `P18` |
| `@deepseek-ai/dsh-subagent/lib/typert.remote-client.js` | 0.2.0-rc.1 | npm | **yes（逐字节）** | `P18` |
| `@deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js` | 0.2.0-rc.1 | installer | **yes（逐字节）** | `P31` |

| target | 与安装包是否不同 | 处置 |
|---|---|---|
| `node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/list.js` | **不同** | driftWhitelist：死副本/生成物，不镜像、不产 patch、不计 drift |
| `node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/commands.js` | **不同** | driftWhitelist：死副本/生成物，不镜像、不产 patch、不计 drift |
| `node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/index.js` | 相同 | driftWhitelist：死副本/生成物，不镜像、不产 patch、不计 drift |
| `node_modules/@deepseek-ai/dsh-subagent/lib/types/index.js` | 相同 | driftWhitelist：死副本/生成物，不镜像、不产 patch、不计 drift |


## 关键发现

### A. npm tarball 与安装包实际携带的构建不是同一份产物（7 个文件）

对 33 个 `node_modules` target 做三方比对（npm / 安装包内副本 / live）：**26 个逐字节相同、7 个不同**——6 个 client bundle 的 CSS Module 哈希与 `\0dsh-css:` 构建路径不同（npm 侧 `/home/runner/work/deepseek-harness/...`，安装包侧 `D:\qwq\desktop\...`），`dsh-subagent/package.json` 依赖键序不同。

这 7 个改用安装包副本作 baseline。影响：`dsh-client-ui-conversation` 80,027B → 9,650B、`sidebar-documentpreview` 36,732B → 4,912B、`client-ui-commands` 14,189B → 8,373B、`client-ui-attachment` 23,058B → 943B、`subagent/package.json` 3,712B → 356B；`P8`（client-ui-subagent）与 `P31`（sidebar-right）从 `+37/-37`、`+26/-26` 的 CSS 哈希假阳性变成真正的 `pristine == live`。

其中 5 个产生 patch（`baselineSource = installer`），2 个成为 no-diff（基线也镜像进 `pristine-installer/` 供复核）。

### B. 5 个 skip 状态 target 仍有真实 live delta

`dsh-agent`(P15，disposed-listener 附 stack)、`api-session-controller/lib/typert.host.js`、`api-session-controller/lib/typert.remote-client.js`、`api-remotes/lib/client.js`、`attachment/lib/index.js`（后 4 个属 P18）。它们今天在 live 上带着我们的改动但 manifest 标 skip，等于无账可依。已回放验证后放入 `per-target-extra/`，**未改 manifest 状态**。需要决策：升级时继续应用，还是把 manifest 状态改回 `ported`。

### C. P5 的两种形态与 CRLF

live 文件是 **CRLF**、vendored 基线是 LF，所以逐行对齐退化成整文件重写（1 hunk，9700 删 / 9714 增）；用 `--strip-trailing-cr` 得到的语义 delta 只有 **14 行**（plugin-gateway 准入校验）。两种形态都已交付并各自验证。基线可信性交叉验证：tgz 内的 `.bak-gateway-20260820` 与 live 目录遗留的 `index.js.bak-before-p5-132132` 逐字节相同。

### D. `presetTarget` / P44

见 MAJOR-4 表。live 文件（Oct 2）与 `.bak-pre-continuable-fix-20261002` 的差异就是那次未入账的修复，现已由 `P44` 登记并由 per-target 产物承载。

### E. 三个「2.0.16 中不存在」的包

`@deepseek-ai/dsh-host-apiproxy`、`dsh-client-runtime`、`dsh-agent-presets` 在 `resources/app/node_modules` 下均不存在，且 manifest 已无 target 指向它们（`P7/P9/P10/P11/P13` 现指向 `api-session-controller`/`api-gateway`）。`@dsh-external/dsh-super-injector` 不在内核树里（profile 层私有包），已按 profile 根单独处理。

### F. 旧账本格式问题的关系

`P17/P17b/P17c/P18/P18b/P18c/P19/P19b` 缺 `a/b` 头、`008-...-input-triggers.patch` 首行带 `\r`——属旧账（`patches/host/` 等）的格式问题，本次产物 43 条头全部规范、不继承这些问题，旧 patchFile 未改未删。

## 失败项与跳过项

- **失败：0**。无一条因 patch 应用失败、`.rej` 或 `cmp` 不一致被丢弃；无包因 `npm pack` 失败缺基线；无「版本不明」项（4 个新包 `dsh-agent-preset-registry`/`dsh-session-projection`/`dsh-cordis-client-runner`/`dsh-tool-cordis` 均从 registry 取到 `0.2.0-rc.1`）。
- **不产 patch（合理）**：`P8`/`P12`/`P13`/`P17b`/`P18`(subagent 两文件)/`P31` 共 7 个 target 校验为 `pristine == live`；`driftWhitelist` 4 条（其中 2 条与安装包不同，按既有裁决不镜像）。
- **不产 patch（包不存在）**：`host-apiproxy`、`client-runtime`、`agent-presets`。

## 复现

```bash
# 1. 全量复跑（读取已交付的 patch + LEDGER + 基线树）
cd {{USER_HOME}}/oh-my-whale/patches/per-target
node verify-ledger.mjs                    # 期望 43/43 + 7/7，exit 0

# 2. 只重建某一侧基线（详见 BASELINES.md）
cd {{USER_HOME}}/.dsh/tmp/p1-ledger/pack && npm pack <pkg>@<version>
```

证据文件（`{{USER_HOME}}\.dsh\tmp\p1-ledger\`）：`tree-diff.json`（全树 43 差异 + 11 live-only 的机器记录）、`results2.json`（原 36 个 key）、`results13.json`（13 个缺口）、`verify.json`、`baseline-agreement.json`（npm vs 安装包 33 个 target 的逐字节比对）。

## 未做与仍存疑虑

1. **manifest 未改**（本轮约束）：`P15`/`P18` 的 5 个真实 delta 仍是 `skip` 状态，与 live 事实不符；`driftWhitelist` 里 2 个「死副本」与安装包实际不同，裁决是否仍成立值得复核。
2. **P44 的 patchFile 与 P16 不是同一个字符串**（`host/016-...patch` vs `per-target/...patch`）。按文件去重的规则已写进 `LEDGER.json` 的 `notes`，但 manifest 里两条指向不同文件这一事实本身可能让下游「逐条 apply」的脚本重复处理同一个 target，建议 P4 的 apply 脚本以 `target` 为主键、而不是以 `patchFile`。
3. **`uqr` 的两个副本是刻意的反基线偏差**：全树对账把它们列为 live-only。P4 必须在升级后重新确认两处都能解析，否则启动即 `ERR_MODULE_NOT_FOUND`。
4. **3 个 `.bak` 文件仍在安装树里**（`dsh-api-session-controller/lib/index.js.bak-p40`、`dsh-llm-pi-ai/lib/index.js.bak-pre-p43`、`dsh-subagent/lib/index.js.bak-pre-continuable-fix-20261002`）。按计划 P1.7 未移出（迁移会改变 P2 的 25,976 基线数），但它们属于 live-only，未入账也未镜像。
5. **P5 的整文件 diff 不可外科式套用**（794KB，整文件重写）。P4 若要语义化应用，应改用 semantic 形态 + CRLF post-step。
6. **未做全树端到端回放**：只做了逐文件回放验证（P1 判据），没有「把安装包整树解开 + 套 43 条 + 与 live 全树比对」；那属 P10 全量验收。目前 43 个差异文件已 100% 有处置，这一步的期望值很高。
7. **旧账本（`patches/host/*.patch` 等）是否仍可应用、是否与 per-target 产物语义等价**，本次未评估。
