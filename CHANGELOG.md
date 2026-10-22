# Changelog

## [0.3.9] - 20261021 - add dsh-context (context inspector)

- New profile bundle `dsh-context` (v0.74.0, pinned to upstream commit 14aa60d33e829eb6bbcc8bdcea9f97819b24caea):
  context composition browser, token/cost analytics, context command. Declared in
  `dsh.profile.bundles` and registered in `plugins/SOURCES.json` (install_type github).
- Replaces the temporary super-injector runtime mount used for the first install;
  the injector registry entry is retired in favor of the profile bundle.
## [0.3.8] - 20261020 - reproducible plugin sources + full profile snapshot

**Reproducibility fixes (a second machine no longer needs the author's local paths):**

- `plugins/standalone/` now contains complete snapshots for `dsh-global-tool-discovery`
  (RSI: `research_orchestrator`, `knowledge_ingest`, source adapter registry, RSS/HN
  adapters), `dsh-fork-to-preset`, `dsh-subagent-model`, `dsh-web-billing`,
  `dsh-token-meter-hermes`, `dsh-plugin-chrome-faithful`, `dsh-governance`,
  `dsh-full-remote`, refreshed `dsh-routed-subagent` (8 previously missing tracked files),
  `m2-demo-plugin` and refreshed `dsh-voice-input` (kept as not-mounted rollback source).
- `profile/package.json.template` now resolves every local plugin through
  `link:{{PLUGIN_SOURCES_DIR}}/<dir>`; no author `C:\Users\...` / `{{PLUGIN_SOURCES_DIR}}\...` path.
- `plugins/SOURCES.json` is now the authoritative 38-entry source map, with upstream repo,
  pinned ref, standalone path, and removed/not-mounted status.
- New `scripts/audit-plugin-sources.mjs` gate runs in CI and before `pnpm install`.
- `profile/cordis.patch.yml.template` is now a complete normalized snapshot of the live
  profile: providers/models, permission presets, default model/preset, tool rows,
  billing, web search, reverse proxy/authfix and agent-team/goal settings. The previous
  template stopped at the governance row and would have lost the whole model catalog.
- `scripts/template-render.ps1` now parameterizes `{{LOCAL_VLLM_BASE_URL}}`, defaults the
  plugin-source root on a fresh machine, and no longer renders the legacy 0.1.x
  `settings.yaml.template`.
- `bootstrap.ps1` fixes: missing comma in `param()`; undefined `$UserHome`/`$User`;
  creates the plugin-source parent before copying; renders `super-injector/registry.json`
  instead of overwriting it with the raw `.template`; runs the source audit before install.
- Added `scripts/check-text-integrity.mjs` as a CI/bootstrap gate for stray C0 control characters.
- Repaired embedded control characters that corrupted `scripts\fix-bash-terminal-import.mjs`,
  `scripts\verify-patch-port.mjs` and DSH Desktop paths in maintenance scripts.
- Added `docs/reproduction.md` with the RSI source map and explicit external prerequisites.
  No `adapter steer` plugin exists; the phrase is only a comment in rsi-guide/enforce-guide.

## [0.3.7] - 20261020 - durable-only subagent policy + Agent Team integration

**Behaviour change (policy): `subagent_routed` never creates a one-shot child again.**
The foreground and background-job dispatch paths were deleted outright (not merely defaulted off);
a guard throws if a future edit falls through, and `run_in_background: true` is refused with an
explanatory error. Every dispatch returns a durable subagent id that stays addressable with
`send_message` for the rest of the session. Reason: a one-shot child is a throwaway record that
cannot be messaged and is discarded, which made every delegated conversation dead on arrival.

**Host patches registered this round (all kernelLine 0.2.1-rc.2):**

- **P45** `host/047-agent-team-non-member-identity.patch` - the Agent Team tool installer registers a
  REQUIRED `team:identity` systemPrompt context whose `text()` calls `ctx.agentTeams.membership(agent)`.
  `maybeInstall()` guards on `tryMembership` at `agent/created` time, but a descriptor-bearing subagent
  has no descriptor yet at that moment, so the tools get installed; by the first step the descriptor
  exists, `tryMembership` returns undefined and `membership()` throws `TEAM_NOT_MEMBER` - killing the
  first turn of EVERY subagent provider. The identity text now resolves via `tryMembership()` and
  returns a neutral line for non-members. Lead/teammate behaviour is byte-identical.
- **P46** `host/048-agent-team-preset-passthrough.patch` - `spawnAdmitted()` dropped routing fields, so a
  teammate on a preset-mounting provider could never mount its preset (`startLocal` reads
  `agentPresetOf(request)` for both `childSessionMeta` and `composition.agentPreset`). One guarded
  passthrough; inert for standard callers. Regenerated minimal - the earlier file carried an unrelated
  mojibake hunk.
- **P47** `host/049-dsh-subagent-durable-toolfilter.patch` - `startActivation` never calls the provider
  `start()`, and `startLocal` built the composition from `agentPreset` alone, so a deny-only
  `toolFilter` on the request had NO reader: a "read-only audit" child silently ran with the full tool
  surface. The mask is now carried into both the descriptor (cold resume restores it) and
  `composition.toolFilter` (the only place `applyChildComposition` applies it).

**Plugin features added:**

- archive_teammate (host patch P48) retires a teammate: the roster row keeps its journal history but stops consuming a slot, disappears from list_agents, and frees its name. Archiving does NOT reclaim disk - the Lead session log is append-only.

- help: true returns the full usage guide from inside the tool, so a conversation whose visible tool list predates newer parameters can still discover them.

- `team: true` creates a REAL Agent Team roster teammate (provider `routed-mount`/`routed-fork` +
  `agentPreset`), instead of a disposable child. Parameters the teammate path cannot honour are
  refused instead of dropped; `preset` is required.
- A control tool for continuing durable children (`send_message` when the name is free, otherwise
  `continue_subagent`) - the Agent Team profile layer disables `dsh-tool-subagent-control`, so no
  global `send_message` existed even though every dispatch is durable.
- `inheritsParentContext` is always published `false` (the host rejects `agentPreset` + inheritance);
  fork keeps seeding through the plugin's own `completedTurnPrefix`.
- `childSessionMeta(parent, childDepth, isSeeded, preset)`, `parentAgent`, and
  `seed` + `inheritedEventCount` now match the 0.2.1 contracts; the patch assertion resolves through
  `createRequire` instead of a hardcoded `lib/node_modules` path.

**Verified end-to-end after restart:** durable dispatch returns an id and the child answers;
`run_in_background: true` is refused; a child dispatched with
`tool_filter: { deny: [write, edit, pwsh, shell, terminal] }` reported NO `write`/`edit` and NO
`pwsh`/`shell`/`terminal` in its tool schema, and DOES have `send_message`.

**Independent review review-guide-p48-20261020 (NEEDS_FIXES) - all findings closed:** the guide gained MODE 6 (external engine) plus engine/cwd/timeout_ms/help/continuable, branch precedence and the MODE 3 return shape; the stale "slots are immutable" tip and the "never reclaimed" schema claim are gone; archive now refuses provisioning rows and members owning unfinished tasks, drains unconditionally, exposes isArchived so an archived id cannot be revived, and labels archived task owners; the smoke suite exercises the archive path with a real AbortSignal instead of pinning stub strings.

**Known limits:** roster slots are immutable and include failures. The bundle default `maxMembers: 8` was raised to the safe-integer ceiling by profile-layer override M2 (restating the sibling config fields, because a profile entry replaces the whole config), so
`team: true` is capped per Lead conversation; deleting a child conversation does not free a slot.
A conversation's tool schema is fixed when it starts, so the newly registered control tool is
invisible to older conversations; `subagent_routed` therefore gained a continue mode
(`target_agent_id` + `message`) that reaches an existing durable child from ANY conversation.


## [0.3.5] - 20260930 — P41/P42：中继伪装成 SSE 的 502 曾直接杀死对话；agent 释放必抛 TypeError

一次实机报障（`session-1363ee2e`，19:45:44 与 19:45:54 连挂两个 turn）牵出两个真实缺陷，都不是
"模型选错"或"payload 太大"——那两条路都验证过是通的。

### P41 · 中继把上游故障伪装成 200 + SSE 内联 JSON 错误，DSH 把它判成不可重试

`api.commandcode.ai` 上游挂掉时不返回 502，而是返回 **HTTP 200 + `text/event-stream`**，把错误塞进
流里当一条 `data:`：

```
data: {"id":"gen-…","object":"chat.completion.chunk",…,"choices":[],
       "error":{"code":502,"message":"JSON error injected into SSE stream",
                "metadata":{"error_type":"provider_unavailable"}}}
```

直接打这个端点可以稳定复现（发一个不支持的 role 就回来了）。pi-ai 只保留 `error.message`，于是
`code: 502` 和 `error_type` 在分类前就丢了，剩下光秃秃一句 `JSON error injected into SSE stream`，
在 `classifyPiAiError` 的规则里**一条都不匹配**，落到兜底的 `PI_AI_ERROR`。而 `PI_AI_ERROR` 不在
`DEFAULT_RETRYABLE_CODES`（`dsh-llm`）里 → `dsh-llm-retry` 直接 `next()` → 轮次当场死掉，
provider 上配的 `retryPolicy.maxRetries: 1000` 成了死配置。

修法：按被丢掉的那个 502 本来会得到的分类，把它判成 `SERVER`。配套在 commandcode 的
`retryPolicy` 里显式列出 `retryableCodes`（含 `PI_AI_ERROR`）兜底——这条走的是 live 配置，
不依赖内核补丁，下次升级自动活着。

同一次会话 16 秒内 4 次失败（2 次 `basic-compaction-engine … Connection error.` + 2 次主调用），
usage 全是 0/0/0；用该会话真实的 111k token 上下文重放则完全正常。**故障在上游，不在请求。**

### P42 · 每次 agent 释放都抛 TypeError，把诊断和后续监听器一起丢掉

`dsh-tool-subagent` 的 `removeScoped` 写的是 `fiber.dispose().catch(...)`，但 cordis 4 的
`Fiber.dispose()` 是同步的、返回 `undefined`（cordis 自己每个调用点都包了 `Promise.resolve`），
所以每次对话关闭都会抛 `Cannot read properties of undefined (reading 'catch')`。这个抛出发生在
`agent/disposed` 监听器里，**后面那行本来用来记录真实清理失败的 warn 永远不执行**，同链后续监听器
也被打断。2026-09-30 当天日志里出现 10 次，横跨 5 个会话，每次都紧挨着一条
`session-projection-cache … SessionHandleClosedError: flush on a closed handle`。

### 验证

- `scripts/test-p41-classify.mjs` — 18/18，含 3 条阴性对照：真正的 `stream ended pending` /
    `deferred response` / 无关文本必须**仍然**留在不可重试的 `PI_AI_ERROR`。
- `scripts/test-p42-dispose.mjs` — 钉住 cordis 4 真实形状（`dispose() -> undefined`）；
    旧写法必须抛、新写法必须不抛，否则测试失败。
- 两份 patch 均 `patch -p1` 往返重放后与线上文件逐字节一致；把未打补丁的备份喂给
    `verify-patch-port.mjs`，两条如期变 `TODO`（阴性对照成立）。
- 全量门禁：patch-port `39 OK / 0 TODO`（42 条）、audit-registry 48/48、esm-syntax 1092 模块 0 错、
    plugin-imports 21 插件 88 边 0 问题、plugin-activation 24 健康、preset-mounts 426 id 零缺失、
    drift-scan `CLEAN`、local-overrides 19 锚点全在、check-private OK。

### 同时清理

- **P40 死条目**：上一轮撤销 `dsh-api-session-controller` 活模型选择补丁时，patch 文件和 apply
    脚本都删了，manifest 里的条目却留着，指向一个不存在的 `host/040-*.patch`。本轮一并移除。
- 新增锚点 `commandcode-retryable-codes` / `commandcode-retry-max`：`cordis.patch.yml` 是内核
    每次 boot 都会 reconcile 的文件，diff 察觉不到行被抹掉，只有锚点能察觉（已做阴性对照）。


## [0.3.4] - 20260930 — 全量账本对账：补回丢失项、修 6 个门禁盲点、登记 P38

上一版修好了 better-sidebar，但那只是用户报障的那一个。这轮按"照着 whale 全部登记物逐条对账"做了一遍，
结论是**门禁本身比功能更不可靠** —— 多个门禁在扫错的对象或用错的口径，漏报和误报同时存在。

### 真实丢失 / 未登记（已补）

- **P38 从未登记**：profile 树外的模块解析兜底（preset 入口、本地插件 repo、fork 靠它才能解析
  `@deepseek-ai/*`，否则一律 `ERR_MODULE_NOT_FOUND`）。2026-09-29 起就在内核树里生效，manifest 里
  没有条目 —— 换机或升级会静默丢掉。已生成 patch（reverse-apply 校验通过）、登记、加门禁断言，
  并删掉遗留的 `.bak-extfallback`。
- **`local-presets` 层没有仓库副本**：15 个文件、416K，所有 preset 挂载都声明在这里，profile 用
  `file:./local-presets` 指向它。此前从未进过 git。drift-scan 抓不到它，因为它压根不在 SOURCES 里，
  没有可比对象。已 capture 到 `profile/local-presets/`（路径占位化为 `{{DSH_USER_HOME}}`/`{{USER_HOME}}`）。
- **`autoprompt` preset 只存了 14 个文件中的一个的备份**：真实内容 13 个 .mjs + preset.yml + skills/
  从未入库，`.agent-presets/autoprompt/` 在仓库里只有一个 `.bak`。已完整 capture。
- **`dsh-plugin-manager` 丢了**：包不在、lock 不在、vendor 归档没有，而 SOURCES 没有任何移除记录。
  装回后发现它也缺 `dsh.profile.bundles` 声明（已补）。
- **vision-toolkit 的 provider override 只在 live 上**：`cordis.patch.yml` 里那段把视觉后端钉到
  内网 GLM-5.3、避免回落到公网 VLM（那会把每张图外传）的配置，**只存在于这台机器**。它是
  隐私相关的一半设置，重放即丢。已进 template。
- **profile 模板落后**：better-sidebar 仍锁在 0.12.2 tarball（重放会装回旧版）、subagent-ui 仍指
  0.1.0-rc.8、缺 `dsh-local-presets`/`dsh-full-remote`/4 个官方 experimental bundle、却还留着用户
  主动关掉的 `modlens`/`modsearch`/`dsh-voice-input`（重放会复活）。已全部对齐。

### 门禁盲点（每个都做过阴性对照）

- `verify-plugin-activation` 原本只扫 `logs/` 顶层，而 **host 进程写的是 `logs/host/`** —— 一个以
  "host 日志是唯一证据"为存在理由的门禁，从头到尾读的是错文件。同时它的正则 `\[pkg\][^\n]*` 匹配
  该插件的**每一行**日志，把 `[I] dsh-openpencil mounted` 也算成失败（72 条"失败"里没有一条是真的）。
  还缺三样：没区分"包目录不存在"（静默跳过 → 移走目录仍报 23/23 全绿）、没区分"装着但没被挂载"
  （plugin-manager 的真实状态）、没做时间过滤（10 小时前修好的 bug 一直算失败）。全部补上，
  boot 边界从日志里最后一段 >2 分钟的时间空档自动推断。
- `audit-registry` / `audit-preset-mounts`（新增）：逐字节比 preset 会把模板占位符和 0.2.0 的
  bundle 改名当成丢失。改成**挂载 id 级**对账 + 文件存在性，426 个挂载 id 全部命中。
- `drift-scan` 默认扫 `~/.dsh/runtime/v209-patched-tree` —— 那是 **0.1.5 的死树**，自 2.0.16 起
  没有进程在用它，所有补丁判定都在对着一堆死代码。默认改为扫活动安装，死树需显式 `-RuntimeTree`
  并告警。manifest 的 `baseline.kernel` 同步 0.1.5 → 0.2.0-rc.1。
- `local-overrides/verify.ps1` 用 `Select-String -Context 0,1` 找 `disabled: true`，只看得见紧邻的
  一行 —— live 那一行是注释，于是把一个存在着的行报成缺失。窗口放宽到 0,25。
- `drift-scan` 把四条"故意关闭"报成 `REMOVED`（读起来像丢失）。现在读 SOURCES 的状态，显示
  `NOT MOUNTED (by design)` 且不计入 drift。
- `settings.yaml` 在 0.2.0 已迁进 `cordis.patch.yml` 的 `llm-pi-ai` 行，drift-scan 还在找旧路径，
  永远报一条黄色。现在识别这次迁移。

### 一个差点造成重复的判断

drift-scan 报 P8（@ 提及子代理）LOST，marker `inputTriggers` 在 0.2.0 的 ui-subagent 里确实是 0。
我按 0.1.5 的补丁重打了 P8 —— 写之前读了 `dsh-client-ui-reference`，发现它已经注册了
`{ trigger: "@", name: "reference" }`，且 candidates 里用 `origin === "subagent" && parentId`
**已经列出子代理**，还带 `section.subagents` 分组和 remote 解析，是原补丁的严格超集。已撤销重打，
并把结论写进 manifest 标注 **DO NOT RE-LAND**。**读源码，而不是 grep 旧符号名。**

同理查清另外 8 个 LOST：P9 装着（`agentPreset` 21 处）、P25 装着（`__p25` 前缀在 0.2.0 被去掉）、
P37 装着（`applyP37Video`；它在 `$Symbols` 表里根本没有条目，所以永远报 "no anchor"）、
P11 被上游更严格地解决（`seedLength` 现在是**非法字段**，直接 throw）、P12 吸收、P13 明确不做
（0.2.0 的 WebSocket 严格一帧一消息，没有批量原语）、P17b/P18 上游原生（`{type:"video", mediaType,
url, name}` 三处齐全）。**没有一个补丁真的丢失。**

### 门禁

esm-syntax 0 / esm-link 0 / patch-port 35 OK 0 TODO / kernel-patches 全在 / plugin-activation 24 全绿 /
audit-registry 56 项全在 / preset-mounts 426 个 id 全在 / drift-scan **CLEAN**（首次）/ privacy OK /
local-overrides 全绿。

## [0.3.3] - 20260930 — better-sidebar 0.24.1 真正激活；P31 撤销；新增插件激活门禁

### 根因：0.24.1 换上去了，但它一次都没加载成功
- 症状：底部面板空白、两个按钮落在 body、文件走官方侧栏。**但换包后的运行实例里根本没有 better-sidebar**——用户看到的是宿主自己的 UI。
- 唯一证据在 host 日志：`[W] [hmr] better-sidebar: failed to import` + `TypeError: field.volatile is not a function`（`lib/index.js:119`）。super-injector 的 HMR 隔几分钟重试一次，每次同样失败。
- 原因：profile 顶层 `@deepseek-ai/schemastery` 是 **3.18.1**（dsh-verification 的 peer 被 pnpm 提升上来，`autoInstallPeers: false`），shadow 掉 host 的 3.18.4；连带 cosmokit 1.8.2 vs 1.8.5。0.24.1 的 peerDeps 只写了内核线，没列 schemastery，正好踩中。
- **修法**：让 pnpm 装 better-sidebar 自己的依赖，得到嵌套 `dsh-better-sidebar/node_modules/@deepseek-ai/{schemastery@3.18.4, cosmokit@1.8.5}`。手改顶层包是错的——下一次 `pnpm install` 会按 lock 立刻还原（实测已发生一次）。

### 顺带挖出两个更值钱的坑
- **lock 与实装脱节**：装 0.24.1 时只改了 `package.json`（`^0.24.1`），lock 仍锁 `file:vendor-archives/dsh-better-sidebar-0.12.2-fix108.tgz`。**下一次任何 `pnpm install` 都会静默把它降级回 0.12.2，全程无报错。**
- **供应链策略挡住一切**：`pnpm install` 报 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`，`@deepseek-ai/dsh-client-ui-subagent@0.2.0-rc.2` 发布于 cutoff 之后 6 小时，pnpm 在解析任何东西之前就整体拒绝 lockfile。已加进 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`（它本来就在 lock 里，只是没进白名单）。

### P31 撤销
`patches/manifest.json` 的 P31 把官方右栏 `ExpandButton` 改成恒返 null。2026-09-12 的判断基于 0.12.2（自带 document.body 浮动开关，确实重复）。0.24.1 反过来 inject `dsh-client-ui-sidebar-right`、用 `sidebar.right.pane.tab` 在官方右栏内注册 pane——官方那个按钮不再是重复入口，而是**到达插件 pane 的唯一入口**。继续挂 P31 = 插件看得见、点不开。已撤销（manifest 标 `host-retired`/`retired`，apply.ps1 按 `file -ne "host"` 自动跳过），profile 的 `cordis.patch.yml` 注释同步更新。

### 新门禁
`scripts/verify-plugin-activation.mjs`：查 host 日志的 import 失败 + 传递依赖是否解析到**比顶层更旧**的嵌套副本（嵌套更新是 pnpm 的正常行为，不报；同版本不报）。默认只扫 profile 的 direct dependencies。日志超 6 小时未更新则 exit 2 提醒重启再验。已做阴性对照（构造失败日志能报出 + exit 1，正常时 exit 0）。

### 实机验证（CDP 驱动真实 renderer）
- 底部面板 toggle 可点 → `--dsh-sidebar-height: 220px` → 4 个 tab（文件/文件变动/任务管理/侧边对话）→ 点「文件」列出真实目录树。
- 官方右栏 toggle 恢复（`data-sidebar-right-expand="true"`，x=1557 在 1597 视口内）→ 点开后面板内容是 better-sidebar 的 tab 组。

### 方法教训
判"插件是否可用"必须看 **host 日志**，不能看磁盘、不能看渲染器控制台、不能看 DOM——import 抛错时这三种全是绿的。这一条已经虚报过两次。

## [0.3.2] - 20260929 — 视觉链路改走原生 read_image；遗留 vision-toolkit 卸载并全面登记

### 决策：多模态路由不再借道外部视觉服务
- **本地模型本来就有视觉**：`LANGUAGE_MODEL_ONLY=0`（引擎注释原文 `0 = load vision tower`），启动参数带 `--limit-mm-per-prompt {"image":48,"video":1}` / `--mm-processor-kwargs {"max_image_tokens":2048}`；实测 64×64 纯红 PNG 直接 POST `/v1/chat/completions` → 答 `Red`，reasoning 给出 `(255,0,0)`。
- **DSH 原生 `read_image`** 把图片字节放进模型请求本身（输出 `{type:"image", attachment}`），0 额外模型调用；实测在本机读回截图并直接描述内容。`vision_glance` 这类工具是给**纯文本 agent** 的补丁：`vision_glance/ground/detect` 把图发给外部服务换文字（宿主日志实测 `model=hy3 upstreamMs=11998/15252`，每次看图都外传 + 12–15s）。
- **“说要调视觉工具却直接结束”** 的根因：toolkit 的 10 个 schema 只在**技能加载后**才注册进 Agent 作用域（`exposure.ts` 的 `hasLoadedVisionSkill`），模型看不到工具 → 只能空口承诺。keep-set 过滤**原理上**救不了（工具在激活前根本不存在于装配集）——之前那版 `RESIDENT_VISION_TOOLS` 是死代码，已替换为 `['read_image']`。

### 变更
- 6 个 standard-family preset 的 `tool-bootstrap.mjs`：`RESIDENT_VISION_TOOLS` → `['read_image']`；autoprompt 的 `residentTools` 同步（源已回写 `config/.agent-presets/`）。
- web profile 卸载 `@dsh-external/dsh-vision-toolkit`：`package.json` 去 bundle+dependency、配置行注释、并补 `- id: vision-toolkit / disabled: true`（**行 id 必须是 `vision-toolkit`**：super-injector 写的是包名 `dsh-vision-toolkit`，拦不住 bundle 自装配）。`plugins/SOURCES.json` 标记 `removed_from_profile`。
- 卸载需**重启 DSH**：`dev_uninject_plugin` 返回 OK 但实测 `vision_toolkit_activate` 仍返回 10 个工具（只清了 client 模块表）；重启后 loader 报 `patch: entry vision-toolkit not found`、工具检索无命中 = 真正卸载。
- `settings.yaml`：`vision-toolkit.provider` 指回本地引擎（插件卸载前先断外传）；`commandcode` 的 `stealth/space-bunny-alpha` 补 `input: [text, image]` + `reasoningEfforts`（原来两者皆无，UI 里是纯文本模型）。四项能力**全部实测**：图片→`Red`；`tools`→`finish_reason: tool_calls`；reasoning 字段名 `reasoning`；effort 合法集 `low|medium|high|xhigh|max`（`disabled/enabled` → HTTP 400）。
- zcode：`reasoningLevel.values` 从 `[disabled, enabled, max]` 改为 `[low, medium, high, xhigh, max]`（前两个会 400）。kimi-code 0.36.1：新增 `commandcode` provider + `commandcode/space-bunny-alpha`（`kimi doctor` OK、`kimi -p` 回 PONG）。
- 新增本地 preset 插件 `dsh-promise-guard`（“说了没做”→ 记 warn + 注入一条纠正 turn；9/9 单测通过；限流 3/15min、跳过子代理与提问步）。

### 登记（防“下次更新就没了”）
- preset 源 → `config/.agent-presets/`；插件源 → `plugins/standalone/dsh-promise-guard/` + `plugins/SOURCES.json`；profile 模板 → `profile/package.json.template`、`profile/cordis.patch.yml.template`。
- 模板覆盖不到的受管改动（settings/zcode/kimi）→ 新增 `local-overrides/`（脱敏 diff + `README.md` + **`verify.ps1` 只读漂移检查**），并在 README 目录树登记。
- `scripts/check-private.ps1` 保持绿：所有 patch 内密钥脱敏为 `{{COMMANDCODE_API_KEY}}`。

### 已知无害残留
- 开机 2 行 `[W] [loader] patch: entry … not found` = disabled 阻断行在起作用（条目已不存在）。删掉可让日志全静，代价是插件可能被自动装回。
- 恢复旧会话时偶发 `anchored-tool-bootstrap: missing=["vision_glance"]`：unlock 记录来自会话历史里的 `tool/call` 事件（源码注释：resume/reload 会保留），工具已卸载 → 只报一行，`continuing with what is available`。
## [0.3.1] - 2026-09-12 — 双 Sidebar 按钮去重（P31）+ routed-subagent preset-child 修复 + profile verify 占位符修复

- **dsh-routed-subagent preset-child 修复（上游 1838fca）**：带 preset 的子代理 starting 即失败 `cannot get property "agent" without inject`——根因：routed 的 setup 用 `childCtx.agent` accessor，而内核把 setup 跑在**子 agent 自身 scope**（无 agent accessor；官方 dsh-subagent:1077 用第二参数 `child` 取 session）。改 `setup(childCtx, child)` + `child.session`；端到端验证子代理 completed（25s，回复 ok）。桌面版 host 需重启才加载。
- **P37 视频预览 body**（`dsh-client-ui-sidebar-documentpreview/lib/client.js`）：右侧栏文档预览新增内建 video body（mp4/m4v/mov/webm/ogv），复用 ImageBody 的 bytes→Blob→ObjectURL 管线渲染 `<video controls playsInline>`；Electron 自带专有解码器，H.264 mp4 可直接播放。CLI 端到端验证 readyState=4、boot 0 错误；装机 asar 已重建 staged，待桌面版下次关闭时经 `scripts/v209/deploy-p37.ps1` 部署。**验证门一律用 `vm.SourceTextModule`（ESM），不用 `node --check`。**
- **P31** `dsh-client-ui-sidebar-right/lib/client.js`：`ExpandButton` 恒返 `null`，隐藏与 better-sidebar 重复的官方右栏展开钮。**bundle 本体不可禁**——`dsh-client-ui-chat` 的 `dsh.client.inject` 引用 right 服务，整禁实测 `renderer boot failed`（本仓库首个 inject 依赖事故，教训固化进 `docs/upgrading.md`）。
- profile `cordis.patch.yml`：只禁 `ui-sidebar-files` + `ui-sidebar-documentpreview`（全树扫描确证零注入者的 tab 类型）；模板同步。
- asar 重打包管线纠偏：`@electron/asar@4.3.0` CLI 多 `--unpack-dir` 只取最后一个 → brace 合并 + `{/**,}` 匹配目录顶层文件；新包与装机 final2 头对头校验仅 P31 一文件差异、unpacked 294/294 哈希一致。asar-root 源树丢失后改「extract 装机 asar → 改 → pack」重建。
- **profile verify V1-V4 假 FAIL 修复**：`patches/profile/verify.ps1` 不渲染 manifest `{{USERPROFILE}}` 占位符（vendorPatches root/companions）→ 9/9 PASS。
- `FINGERPRINTS.json` 时间戳刷新（entries 无变化）。
- **勘误（同日）**：`ui-sidebar-documentpreview`（图片/文件预览 tab）属误禁——它无 inject 者但认领 `dsh-resource://file/**` pattern，聊天点图片/文件预览依赖它（禁用后报 sidebarRight: no registered tab type claims），已恢复启用；最终只禁 `ui-sidebar-files`。教训补入 docs/upgrading.md：tab 类型除 inject 外还有资源 pattern 认领方。


## [0.3.0] - 2026-09-11 — 2.0.9 / 内核 0.1.5-rc.1 packed-asar 时代（一夜双跳 2.0.1→2.0.5→2.0.9）

### 架构剧变（升级 SOP 全改写）
- **0.1.3+ 内核整体装进 `resources/app.asar`**，`app.asar.unpacked` 只剩 8 个原生件目录 → 官方引入 **Electron asar 完整性 fuse**（`EnableEmbeddedAsarIntegrityValidation`）：repack 过的 app.asar 会 FATAL 闪退。处置：`@electron/fuses write --app "DSH Desktop.exe" EnableEmbeddedAsarIntegrityValidation=off`（exe 原件备份 `~/.dsh/tmp/v209-intel/exe-backup.bin`；`OnlyLoadAppFromAsar` 保留 on）。repack 管线（brace 语法 `--unpack-dir` + build/*.png，unpacked 标志 parity 已核）固化于 `scripts/v209/pack-209.ps1`。
- **canonical 补丁树迁移**：`~/.dsh/runtime/v209-patched-tree`（tmp 清理炸弹解除；484 农场 junction 已重指）。真身链：profiles 农场→runtime 树；voice 插件 symlink→`~/dsh-voice-input`（改即生效，无需 repack）。
- **更新器真相**（推翻 electron-updater 假设）：壳自研 `desktop-updates`，feed `dshdesktop.cn`，6h 轮询仅提示；下载/安装各需确认框（default=稍后），**无静默覆盖**。补丁环境加保险：**P30** `lib/updates.js` enabled 默认 false。
- **自动回归三绿**：`verify.ps1 -Source asar-root|installed` + profile verify（36+9 项）；`drift-scan.ps1` 默认源切 runtime 树，根层目标（P30）解析修复。

### v209 适配波（新补丁 P26–P30 + 四起"新校验拒旧产物"）
- **P26** dsh-session `get events()` 兼容 shim——0.1.2 删了公共访问器，7 个 profile 插件（verification/better-sidebar/super-injector/vision-toolkit/openpencil/chrome-faithful）全崩 `session.events is not iterable`，**新建会话直接失败**（G3 实机抓出）。
- **P27/P28** session-format v2→v3 迁移白名单：content `video` + source 六 kind（fallback/instruction-hint/provider×283会话/verifier-guide×133/jspace-frame/ai-tube-mission）——官方迁移层不认自家近期血统与我们自定义模态，历史会话成片打不开。**全库 1631 会话逐帧复扫宣告闭合**（`scripts/v209/scan_sessions2b.py`）。
- **P29** dsh-client-ui-commands 重试风暴修复：`commands/list` 无限循环（单页 1018 次）→ 指数退避+30s 熔断+15s 超时+force 合并窗。**P30** 见上。
- **M1 persona 迁移**：0.1.5 `dsh-persona` `text`→必填 `prefix`，13/13 preset agent.cordis.yml 批量改（`.bak-v209-persona`），用户实测恢复无错。
- **V7/V8**：better-sidebar `__DSH_MODULES__` 桥（壳已删该全局；懒 chunk "client module system unavailable"）——局部 `__bsModuleSystem` fallback 不污染全局；voice host 路由 v209 三连修（owner-fiber 崩溃→嵌套 effect 不挂载→直挂+信封桥→fix4 加固 405/4MiB/try-catch），真 HTTP POST /voice/ping 200 + GET 405 双证。
- **会话文件新命名** `session.v3.jsonl.zstd`（旧文件不动）；roundtrip/扫描工具双 glob 兼容。

### 流程升级（本轮独立审查打的靶）
- 三切面×两轮 + 打假纪律：**UI 文本不作证据，磁盘帧/真 HTTP 才算**（一例"假绿"被纠正后重做真取证 RT-2035 turn/end completed）。
- 版本目标纪律：升级方案定稿与动手前 **各重查一次上游 releases**（一夜 2.0.5→2.0.9 的教训入 `docs/upgrading.md`）。
- 装机指纹：app.asar `21a21b14…`（36 项全含）；回滚链 v209-pristine（`robocopy /MIR` 修正版 README）→ shell-2.0.1 → rc.2。
- 完整复盘：`docs/upgrade-v209-executed.md`（附4–附11：v205→v209 全程、审查发现与销项）。

## [0.2.1] - 2026-08-21

### fork-to-preset 端到端修复补丁（P9–P12，rc.5 时代能力丢失的完整恢复）
- **P9 `dsh-host-apiproxy`**：`session.fork` 支持 `agentPreset`——Zod schema 字段 + 权威 `composeAgent()` 分支（resolve+mount 单一路径）+ child meta/selection 记录。修复：字段到达 Host 后调用不存在的 `validatePreset()` 导致 HTTP 500。
- **P10 `dsh-client-runtime`**：public+manager `sessions.fork` 全链转发 `agentPreset`（`SessionForkOptions` schema 同步）。
- **P11 `dsh-agent-presets`**：`resolveSessionPreset` 尊重 `header.seedLength`——fork seed 继承的母会话 `agent-preset/selected` 事件不再覆盖 child header（最深语义 bug：磁盘 header 正确但 UI 显示母 preset）。
- **P12 `dsh-client-connection`**：镜像 fork request schema（host/client 同步，防字段剥除）。
- 完整复盘：`dsh-fork-to-preset/docs/incident-2026-08-21-rc8-fork-to-preset.md`（606 行，含五层断链分析 + 测试建议 + 上游拆分建议，存于插件源码仓库）。
- **注意**：`dsh-desktop.mode: advanced` 会禁用 `ui-layout`（launcher 行为）→ 桌面打不开/UI 残缺——本机已改 `compatibility`。

## [0.2.0] - 2026-08-21

### Drift Watch（迭代 1）：快照式 → 追随式
- **`scripts/drift-scan.ps1`（新）**：四层漂移扫描（补丁 / 配置 / 插件 / 报告 JSON）
  - 补丁层：manifest 补丁状态（reverse-apply + marker 兜底）+ `.bak`/`.orig` 扫描（UNKNOWN-MODIFIED）
  - 配置层：7 模板渲染对比 + package.json JSON 语义对比（忽略键序/斜杠）+ 运行态豁免（allowlist）
  - 插件层：内核包排除 + bundles/SOURCES/dependencies 三方对比 + install_type 规范化表
  - `--compare` 全量增量矩阵：new-lost / new-unknown / gone-from-baseline / new-removed-baseline / recovered
  - `docs/drift-allowlist.json`：已确认漂移逐项豁免（type/path/reason/date，需提交）
  - 编码纪律：UTF-8 无 BOM 写报告、ReadAllText 读内核文件（PS 5.1 兼容）
- **端到端验证**：模拟 P6 事故（基线 UNKNOWN → 升级后消失）→ `gone-from-baseline` 门禁触发 ✓；allowlist 豁免后放行 ✓
- **`docs/upgrading.md`**：门禁集成 Step 1.5（基线）/ Step 3.5（升级后对比阻断循环）/ Step 5（CLEAN 校验）

### 本机漂移处置（drift-scan 首跑发现）
- **捕获 P7**：`dsh-host-apiproxy` session.list 降载补丁（LIST_PROJECTION_EXCLUDED，2026-08-20 打的，从未登记）
  - 原始补丁写入污染了文件编码（GBK mojibake）；从 npm-pack 官方重建干净版 + CRLF 对齐内核
  - 污染现场保留 `index.js.bak-gbk-polluted-20260821`（allowlist 记录）
- **捕获 P8**：`dsh-client-ui-subagent` input-triggers 补丁（rc.5 时代 @ 提及子代理源，rc.8 丢失）
  - 子代理 UI 不显示 = deps 缺失 + junction 缺失 + host client.js 补丁丢失（三要素）
  - 幂等补丁脚本在 `dsh-routed-subagent/scripts/_patch_ui_subagent.mjs`
- **drift-scan 加 junction 层（[3.5]）**：扫描所有 link: 依赖插件的 node_modules junction（STALE=指旧壳 / MISSING / OK）——该模式已漏 5 次
- **全量内核审计**：全部 @deepseek-ai 包 vs npm 官方 rc.8 对比——唯一差异为 dsh-subagent fork（101 行，已知），其余全部可由 P1-P8 解释，**无隐藏补丁**
- **SOURCES.json 18 → 22**：登记 subagent-codex / subagent-claude-code / dsh-global-tool-discovery / dsh-client-ui-subagent
- **profile/package.json.template**：对齐本机 deps/bundles（4 新依赖 + 3 新 bundle）
- **drift-allowlist.json**：记录有意保留的漂移（fork-to-preset 止血中 / 运行态配置 / 污染备份）

## [0.1.1] - 2026-08-21

### 补丁清单修复（rc.8 升级遗留复盘）
- **新增 P6 `dsh-goal` verification-seam 补丁**（`patches/host/006-dsh-goal-verification-seam.patch`）：
  - 背景：rc.5 时代打的 verification-seam（GoalTransitionGuard + permitRef 白名单）在 rc.8 升级时丢失
    （新壳 dsh-goal 是官方原版，无 `registerTransitionGuard`）——它不在 P1–P5 清单里，升级核对漏掉。
  - 内容：`registerTransitionGuard` API + `dispatchTransitionGuards`（goal complete 同步 pre-commit 校验）
    + goal change 白名单允许 `permitRef` 并透传。
  - 已验证：`node --check` 通过；`verify.ps1` P6 applied；rc.8 与 rc.7 差异仅此 seam（干净重打）。
  - 影响：verification 的 goal-guard 是优雅降级（seam 缺失时静默跳过），补丁恢复**同步拦截**能力。
- `manifest.json`：补丁清单 5 → 6 项，P6 记录 source/bak 与 rc.8 丢失说明。
- `patches/host/verify.ps1`：marker 表加 P6（`registerTransitionGuard`）。
- **教训固化**：升级核对清单必须含「宿主补丁依赖的插件」（routed-subagent fork / dsh-goal seam / 插件 junction 指向），
  仅核对 P1–P5 会漏。

### 运行环境修复（本机 rc.8）
- dsh-subagent-rc8/package.json 去除 UTF-8 BOM（boot 即崩：healProfilesModuleFallback JSON.parse 失败）
- 三处插件 junction 从旧壳 rc.7 更新到新壳 rc.8（fork-to-preset / continuous-worker / routed-subagent lib）
- dsh-fork-to-preset 因 renderer boot fatal 移出 bundles（根因待查，疑似 rc.8 无官方客户端包）

## [0.1.0] - 2026-08-20

### Phase 1 — 基建
- Repo 骨架 + git 初始化（本地）
- `patches/manifest.json`：5 补丁元信息 + rc.8 版本基线
- `scripts/capture.sh`：从本机内核捕获补丁（.bak 快照 / npm pack 原版为 diff 基准）
- 5 个补丁生成并验证可逆：
  - P1 cordis-plugin-loader 防环 + parentEntry（rc.8 保留）
  - P2 cordis gpd 缓存
  - P3 pi-ai bai 特判
  - P4 dsh-session KNOWN 事件
  - P5 super-injector gateway 集成（存档；实际靠重建 tgz 生效）
- `patches/host|profile/apply.ps1` + `verify.ps1`（幂等、CheckOnly、marker 兜底）
- 重建 `profile/vendor/dsh-external-dsh-super-injector-0.3.3.tgz`（含 P5 gateway）

### Phase 2 — 配置模板化
- `config/settings.yaml.template`：6 providers、apiKeyEnv 保留、`'off': null` 引号
- `profile/package.json.template`：18 deps / 17 bundles，路径全变量化
- `profile/cordis.patch.yml.template`：tailscale/python/bridgePath/modelDir/file:// 变量化
- `profile/pnpm-workspace.yaml.template`：chrome-faithful 变量化
- `scripts/template-render.ps1`：变量替换 + file:/link:/file:/// 正斜杠规范化
- `scripts/check-private.ps1`：隐私扫描（case-sensitive、JSON 转义路径、standalone 白名单）
- `config/.env.example`：环境变量清单

### Phase 3 — 插件清单
- `plugins/SOURCES.json`：18 插件源清单（install_type → package.json specifier 映射）
- `plugins/standalone/`：4 个本地插件源码（token-meter-hermes / continuous-worker / routed-subagent / voice-input）
- `config/.agent-presets/`：10 个 preset 源码
- `profile/vendor/`：5 个 vendor tgz（super-injector 含 P5）
- `plugins/inventory.md`：分类清单

### Phase 4 — 安装脚本
- `bootstrap.ps1`：7 阶段安装器（环境检测 → 备份 → 补丁 → 配置 → 依赖 → gateway → 冒烟）
- `scripts/check-env.ps1`：新机前置检查

## [计划]
- Phase 5：文档（architecture / handoff / upgrading）+ 独立审查
- Phase 6：CI + pre-commit hook + GitHub 推送

## 2026-08-22 — governance split (plan v5.1 APPROVED)

- 新增 `@agent-os/dsh-governance`（A 插件）来源与 profile 行，默认 `enabled: false`。
- `plugins/SOURCES.json` 新增 local file-dir 条目（`{{USER_HOME}}/dev/dsh-governance`）。
- `profile/package.json.template` 增加依赖与 bundle；`profile/cordis.patch.yml.template` 增加 disable 行。
- `gateway/README.md` 新增 #9“不得写 session”检查项（权威级，覆盖 dev_install_package 路径）。
- C 插件（`@agent-os/framework-governance`）为独立仓库 `{{USER_HOME}}/dev/agentos-framework-governance`，不由 bootstrap 自动安装。