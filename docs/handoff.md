# DSH 插件发布与安装注意事项（HANDOFF）


> **⚠ 2026-09-12 23:4x 事故（自定义模型集体消失）**：向 `settings.yaml` 的 `llm-pi-ai.providers.<名>.retryPolicy` **平铺**写 `initialDelayMs/maxDelayMs/jitterRatio` 是非法的——内核只认嵌套形式 `retryPolicy: {mode: always, backoff: {…}}`（dsh-llm ALWAYS_POLICY_KEYS={mode,maxRetries,retryableCodes,backoff}）。一个非法键会让 settings refresh 整树发布失败 → **全部 provider（不只写错的那个）从 UI 消失**。改 settings.yaml 后务必看 host 日志是否还有 `unknown key` [E]，并用 UI 模型下拉确认回归；`streamIdleTimeoutMs`（provider 级）是合法键，但设太小会误杀思考模型（bai 思考首包可 >30s，本机定为 90000）。


> **⚠ 2026-09-12 14:48 热修（桌面版 boot 失败 → 已恢复）**：另一 agent 的 P35 视频补丁在装机 app.asar 的 `dsh-tool-fs/lib/index.js` 里把 `assertVideoCapableRoute` 的 `async` 关键字弄丢（函数体含 `await llm.resolveModelInfo`），ESM 编译 `Unexpected reserved word` → 桌面版进恢复模式。热修=重提取当前 asar → 补回 async → 重打包部署（头对头仅该文件 +6B、unpacked 294/294 一致；备份 `app.asar.pre-p36fix-20260912`）。三点提醒补丁方：①其 P35 补丁源脚本要修回 async，否则下次重放再炸；②P33/P35 只打在装机 asar，`runtime/v209-patched-tree` 源树无对应内容（源树漂移，需回写）；③ESM 包语法验证禁用 `node --check`（按 CJS 解析漏检 ESM 保留字），改用 `vm.SourceTextModule` 或 `node --input-type=module --check`。

> **⚠ 2026-09-12 追加（双 Sidebar 去重 / P31）**：官方 2.0.9 右侧栏与 better-sidebar 重复的按钮已用 **P31 内核补丁**（`ui-sidebar-right` client.js `ExpandButton` 恒返 null）隐藏，profile 只禁零注入者的 `ui-sidebar-files`/`ui-sidebar-documentpreview` 两条 tab。两条铁律入 `docs/upgrading.md`：①禁任何 bundle 前先全树扫 `dsh.client.inject` 引用者（chat→right 事故）；②删/移任何可能被引用的树前先跑 junction 引用扫描（tmp 删除炸 E 盘两仓事故）。asar 重打包注意：`@electron/asar@4.3.0` 多 `--unpack-dir` 只取最后一个，须 brace 合并 + `{/**,}`。

> **⚠ 2026-09-11 追加（v209/packed-asar 时代）**：内核 0.1.5-rc.1 起 `@deepseek-ai/*` 不再存在于 `app.asar.unpacked`——插件对内核的解析走 profiles 农场 junction → `~/.dsh/runtime/v209-patched-tree`（CLI/Electron asar resolver 双轨）。voice 等 `~/dsh-*` symlink 型插件改文件即生效（profile 半），无需 repack；内核半改动必须重跑 `scripts/v209/pack-209.ps1` + fuse + 三绿。历史 `session.jsonl.zstd` 与新 `session.v3.jsonl.zstd` 并存，工具glob要 `session*.jsonl.zstd`。


> 本文面向所有在本机（`%USERPROFILE%\.dsh`）安装、发布、修改 dsh 插件的人/agent。
> 内容来自 2026-08-14 ~ 08-18 的真实事故复盘（会话历史加载、web boot、插件 schema 等）。
> **核心原则：插件改动 = 源码修复 + 全副本发布 + 进程重启 + 旧会话回归，四步缺一不可。**

---

## 0. 本机插件运行架构（先认清再动手）

**⚠️ 2026-08-18 内核已升级：桌面版内核 rc.5 → rc.7（手动替换 + 4 补丁迁移）。**

本机有 **两套 dsh 代码**（npm 全局 rc.6 已于 8/17 软删为 `dsh.bak-cleanup-20260817`，勿动）：

| 端 | dsh 版本 | 插件加载来源 |
|---|---|---|
| 桌面版 DeepSeek Harness（GUI） | **内置 rc.7**（`{{DSH_INSTALL_DIR_LEGACY}}\resources\host\node_modules`，npm 树 + lockfile 留存于 `~/.dsh/backups/host-rc5-20260818-132935/rc7-package-lock.json`） | **web profile 副本**（`.dsh\profiles\web\node_modules`） |
| `dsh web`（命令行起的服务器） | 需用桌面版内核的 bin.js（npm 全局已删） | **web profile 副本** |

插件副本位置（`@bpc-oss/dsh-verification` 为例）：
1. `.dsh\profiles\web\node_modules\@bpc-oss\dsh-verification\` ← **web 服务器和桌面版实际加载的副本，最重要**
2. 发布暂存 `{{PLUGIN_SOURCES_DIR}}\dsh-verification\.tmp-profile-pkgs\`（若为源码项目）

**改一处 = 改了个寂寞。** 任何发布都必须多副本同步（同一构建产物，比对文件大小/hash）。

---

## 1. 自定义事件类型必须注册，否则历史直接不可读（最高频事故）

插件通过 `agent.session.append(...)` 往会话日志写入自定义事件（如 `verification/change`）时，
**必须在插件模块加载时把类型注册进 `KNOWN_SESSION_EVENT_TYPES`**：

```ts
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session';
(KNOWN_SESSION_EVENT_TYPES as Set<string>).add('verification/change');
```

原因：
- dsh-session 0.1.0-rc.6 的 `KNOWN_SESSION_EVENT_TYPES` 是**静态 44 个类型**，没有插件注册 API；
- `Session.append()` 没有 `ignorable` 选项，事件信封上也没法标记；
- 不注册 → 任何含该事件的会话在**任何进程**加载时抛
  `SessionFormatUnsupportedError: contains event type "xxx" unknown to this harness`，
  历史加载直接失败（曾导致 500+ 个会话全部报错）。

注意：
- TS 类型声明是 `ReadonlySet`，运行时是可变 Set，需要 `as Set<string>` 断言（**JS 文件里不要写断言**，直接 `.add()`）；
- **注册必须在读取方进程里生效**：插件 import 的 dsh-session 必须与持久化层是同一个模块实例。
  桌面版的插件加载器可能解析到不同实例（实测注册没生效）→ **双保险**：直接把类型加进
  dsh-session 的 KNOWN 集合字面量（`lib/index.js` 里 `new Set([...])` 加一行 `"xxx/change",`）。
  该文件位置：桌面版内置 `{{DSH_INSTALL_DIR_LEGACY}}\resources\host\node_modules\@deepseek-ai\dsh-session\lib\index.js`。
  ⚠️ 应用更新会覆盖内置文件，需重新加；官方 rc.6+ 若自带该类型则无需。

**实测案例 2（2026-08-19）**：`dsh-continuous-worker` 插件（`{{PLUGIN_SOURCES_DIR}}\dsh-continuous-worker`，直接路径加载）
写 `continuous-worker/change` 事件但未注册 → 含 234 万事件的会话历史不可读。
- 该插件自带 `node_modules\@deepseek-ai\dsh-session` **独立副本** → 插件内注册落不到宿主实例，
  必须改内置 dsh-session KNOWN 集合（双保险，与 verification/change 同一模式）；
- 插件 `lib/index.js` 是手写 JS（无 src 构建），直接改 lib 即源码修复，但注册那行实际是
  写给"未来共享实例"的保险，真正生效的是内置 KNOWN 加行。

---

## 2. Schema 只许放宽，不许收紧（向后兼容是底线）

- 记录/投影 schema 一旦上线，**新增字段必须 `optional()`**（或带默认值）。
- `z.object().strict()` 下：旧记录缺新字段 → `invalid_type`；折叠输出带 schema 未声明的键 → `unrecognized_keys`。
- 本次事故：新版插件给记录加了必填的 `authorityScope`/`policyFacts`，导致旧记录全部校验失败 →
  `history unavailable ... [plan, authorityScope] expected object`；且 `applyVerificationRecord` 把整个 record
  （含 `kind`）展开进投影，投影 schema 未声明 `kind` → 新旧记录都报 `unrecognized_keys`。
- **规则**：
  - 读取旧会话（历史加载）是发布后的最低验收线；
  - 折叠输出里出现的键，schema 必须声明（`kind: z.literal('...').optional()`）；
  - 字段收紧 = breaking change，必须同时提供迁移或兼容路径；
  - 类型接口（TS 手写类型）与 schema 同步改 optional，并给使用处判空（`ref.authorityScope?.epochId`、
    `policyFacts?.paths ?? []` 等），`tsc --noEmit` 会帮你找出所有使用处。
- **实测案例（2026-08-17）**：`VerdictSchema.claimId` 曾被定为 `z.string().min(1)`，但旧版插件在
  无 bound evidence 的裁决路径下写入过**空 claimId**（如 `ac-review-pass`），导致含这些记录的会话
  历史不可读（`[verdicts, "<key>", claimId] too_small`）。修复：`claimId: z.string()`（去掉 min(1)）。
  ⚠️ **该 schema 在 `@bpc-oss/dsh-evidence` 包**（`packages/dsh-evidence/src/evidence.ts`），不在
  dsh-verification 里——改完要**单独构建 dsh-evidence 并同步其副本**（插件 bundle 不会内联它，
  运行时从 node_modules 解析）。

---

## 3. 手工补丁会被发布/安装流程冲掉（教训：2:37 事件）

在运行副本（profile / npm 全局）上打的**手工补丁，下次任何发布/安装/同步都会覆盖**。
本次：手工补丁修好后，源码被重新构建发布（2:37），profile 副本被新构建替换 → 补丁全部丢失 → 故障复发。

**所有修复必须写进插件源码仓库**（如 `{{PLUGIN_SOURCES_DIR}}\dsh-verification\packages\dsh-verification\src`），
然后走完整发布流程。运行副本上的手工改动只配当"应急止血"，且要记录在案、尽快落源码。

---

## 4. 发布与安装的标准流程（照做）

```powershell
# 1) 源码改动后
pnpm typecheck          # tsc --noEmit，修完所有 "possibly undefined"
pnpm test               # 全量测试；schema 行为变化时同步更新断言旧行为的测试
pnpm build              # tsup → lib/index.js

# 2) 同步全部运行副本（同一产物）
#    profile 副本 / npm 全局副本 / .tmp-profile-pkgs 暂存
#    比对 lib/index.js 的文件大小/hash 确认一致

# 3) 重启所有加载该插件的进程
#    桌面版（DeepSeek Harness，--port 0 随机端口）、dsh web（3080）、CLI agent 会话
#    进程只在启动时加载模块，不会热更新；不重启 = 改了等于没改

# 4) 旧会话回归（发布验收）
#    打开几个含插件事件的旧会话确认历史可加载；
#    或脚本验证：新进程 import 插件后
#      - KNOWN_SESSION_EVENT_TYPES.has('<自定义事件类型>') === true
#      - 旧记录能通过 VerificationRecordSchema.safeParse
#      - 全量折叠投影能通过 VerificationProjectionSchema.safeParse
```

---

## 5. 验证脚本速查（`{{USER_HOME}}\.agent-os\tmp\dsh-log-repair\`）

| 脚本 | 作用 |
|---|---|
| `verify-profile-patch.mjs` | 用指定插件副本的 schema 验证真实会话（记录解析 + 投影折叠 + 注册检查） |
| `scan-others.mjs` | 全量扫描所有会话日志（真实持久化后端读取，0 FAIL 才算过） |
| `verify-known-patch.mjs` | 检查 dsh-session KNOWN 集合是否含自定义类型 |
| `plugin-patch-notes.md` | 本次事故的完整补丁/发布记录（备份 hash、每处改动、验证证据） |

---

## 6. 其他已知风险（长点心）

- **多进程并发写同一会话**：web 服务器 + CLI + 桌面版同时操作同一会话日志时，跨进程无锁，
  中断收尾事件与恢复续写会竞态 → `seq gap in committed region`（8/14 事故，已上报上游
  deepseek-ai/deepseek-harness discussion #420）。**避免在 agent 活跃工作时用多个端打开同一会话**。
- **版本漂移**：8/18 升级后桌面版 rc.7（事件类型表 45 项含补丁），npm 全局已删——**全机只有一套 rc.7 内核**，
  事件类型表不会分叉；未来再升级任何一端后，用 `scan-others.mjs` 全量回归。
- **安装渠道**：`@bpc-oss/*` 是私有包（npm 404），没有版本号升级通道——**唯一的版本管理就是源码仓库 + 全副本发布**。
- **发布后必重启**：桌面版随机端口（`--port 0`），重启后找新端口再验证（`netstat` 按进程找监听）。
- **host 端插件异常会闪 UI（8/18 事故）**：插件在 `agent/created` 回调里抛异常会**中断 host 的 agent 创建/恢复流程**，表现为"点历史会话 → 主区闪退回新会话页"（浏览器 0 报错，host stderr 才有 `Error: ...`）。两类高危写法：
  - `ctx.systemPrompt.section({ name: "..." })` 放在 `agent/created` 里重复注册 → 抛 `prompt section "xxx" is already registered`（须 apply 时注册一次）；
  - 任何 per-agent 逻辑可能抛异常 → `agent/created` 回调整体包 try/catch，失败只记日志放行，绝不阻断宿主。
  - 排查口诀：**UI 闪退查 host 进程 stderr**，不是浏览器 console。
- **host 服务对浏览器端不可见**：host `ctx.provide(name, svc)` 只在 host 端 Cordis Context 生效，浏览器端 `inject: [name]` 永远 pending → `waiting for service: xxx` 整棵插件树 boot 失败。跨端数据走 `ctx.webServer.register({ kind: "prefix", path, handler })` HTTP 路由（dsh-web-billing 模式），client 端 `inject` 只列浏览器端服务。
- **工具 schema 必须 object 根（8/18 事故）**：裸 `ctx.tools.register({ parameters: {} })` 会把空对象原样透传，无参工具转出 `type: null` 的非法 schema，本地 vLLM 路由 400 拒收（`Invalid schema for function 'xxx'`）。**必须用 `defineTool()`**（内部编译 `{}` → `{type:"object", properties:{}}`）——litkit_*（5 工具）与 smoke_hello 均因此修复。
- **rc.7 内核 profile bundle 严格校验（8/18 事故）**：rc.7 的 loadProfile 要求 **bundles 列表里每个包必须声明 `dsh.bundle`**（cordis.patch.yml），否则 host 启动即崩（桌面版 "failed to start" 窗口 + host stderr `Error: profile bundle "xxx" declares no dsh.bundle`）。**新插件加入 profile 的正确姿势**：① package.json 声明 `dsh.bundle.patch` + 提供 cordis.patch.yml（bundle 形态）；② 或只在 profile `cordis.patch.yml` 里 insert（非 bundle 形态，不进 bundles 数组）。只加 dependencies + bundles 数组而缺 patch 声明 = 启动即崩（8/18 实测：dsh-preset-subagent 因此被移出 bundles，源码保留在 {{PLUGIN_SOURCES_DIR}}）。
- **Electron 桌面版单实例锁**：残留的 Harness 主进程（窗口 "failed to start" 或无窗口僵尸）会占单实例锁，后续双击快捷方式直接失败。排查启动问题先 `Get-Process 'DeepSeek Harness'` + 提权清理，再启动。host 进程 = 带 `bin.js web` 参数的同名 exe（ELECTRON_RUN_AS_NODE），不是 node.exe。
- **用户自定义 agent preset（`.dsh/.agent-presets/<name>/`）里 mjs 的 bare import 会解析失败**（8/18 实测：`Cannot find package '@deepseek-ai/dsh-tools'`——该目录不在任何 node_modules 树）。内置 preset 的 mjs 只用相对导入所以没事；**自定义 preset 若 import bare specifier，需在 preset 目录建 node_modules junction → host 内核**（`mklink /J .agent-presets\dev\node_modules "{{DSH_INSTALL_DIR_LEGACY}}\resources\host\node_modules"`）。dev preset 已修（dev-subagent-preset.mjs import OK，resume 不再报 preset mount 失败）。
- **profile loader entry 的 name 禁止裸 Windows 路径（8/19 事故）**：`cordis.patch.yml` insert 一个指向本地 .mjs 的 entry 时，`name: C:/Users/.../x.mjs` 会直接崩 host（`ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'c:'`，桌面版窗口 "failed to start"）。**文件入口必须写成 `file:///C:/Users/...`（正斜杠三斜线）**。8/19 实测：session-tool-unlock.mjs 因此崩 boot，已改 file:// URL 修复。
- **dsh-preset-subagent（{{PLUGIN_SOURCES_DIR}}\dsh-preset-subagent）**：subagent_as_preset 工具插件，2026-08-18 补齐 `dsh.bundle` 声明 + `cordis.patch.yml` 后正确加入 profile bundles（此前缺声明导致 rc.7 启动即崩）。⚠️ **开发/排障时严禁同时起 CLI 实例（bin.js web）与桌面版**——并发写同一 profile/会话存储会竞态导致桌面版闪退（8/18 实测，HANDOFF §6 风险复发）。
- **loader parent 链自环死循环（8/20 根因，已打防环补丁）**：cordis-plugin-loader `Entry._disabled()` 遍历 parent 链（`while (entry) entry = entry.parent.ctx.fiber.entry`），当 entry 的 parent 链**自环**（实测 `cordis:group` entry 的 `parent.ctx.fiber.entry === 自己`，id=bpc-verification-engine）时无限循环 → JS 主线程 100% CPU、事件循环饿死（HTTP 全超时、CLOSE_WAIT 堆积、文件写入停但 CPU 满载），桌面版表现为"掉线/卡死"。**诱因**：super-injector 对 CW 等 bundle 的周期 reload（重导 import + `rebootCtx.registry.plugin` + 手动 `fiber.entry = entry`）在 group 结构上可能破坏 parent 链。**已修**：host 内核 `cordis-plugin-loader/lib/index.js` `_disabled()` 加 visited 集合防环（成环时告警按启用处理，备份 `index.js.bak-20260820-cycle-guard`）。**排查口诀**：掉线但进程活着 → `Get-Process` 看 CPU 100% + `netstat` 看 CLOSE_WAIT → `node -e "process._debugProcess(<pid>)"`（需管理员）开 inspector → `Debugger.pause` 抓栈。
- **web-billing detail 账本膨胀（8/20 降载）**：`maxRecent` 默认 100000 会导致 detail 账本涨到 52MB（46555 条 recent），会话活跃时 30s 全量序列化 52MB 加剧事件循环卡顿（插件自身 warn `detail flush is large`）。已在 `profiles/web/cordis.patch.yml` 配 `maxRecent: 20000` + `maxMessagesPerSession: 500`（**需重启 host 生效**；存量 52MB 文件未动，新写入按新上限滚剪，统计聚合不丢）。遗留 CLI 实例（tb-full 副 host 55134、旧版 dsh 3199 跑了 48h）已杀。

---

## 8. 2026-08-18 内核升级记录：rc.5 → rc.7

- **执行方式**：手动替换（官方无自动更新）。备份：`~/.dsh/backups/host-rc5-20260818-132935/`（整树 31989 文件 + sha256 校验通过；旧树另存于 `resources/host/node_modules.rc5`）。
- **新内核**：`@deepseek-ai/dsh 0.1.0-rc.7`（npm 全套 195 包，全部 rc.7），依赖 lockfile 已留存备份目录（`rc7-package-lock.json`）。
- **补丁迁移**：原 5 个本地补丁中 **P1–P4 已迁移**（compaction 前缀回溯 / goal TransitionGuard / session verification/change 双集合 / apiproxy 子代理模型同步），**P5（maxMessages 15）按决策不迁移**，接受官方 50。
- **验证结果**：web boot 无 pending；历史会话（含 verification/change）加载正常；AI 工作台（continuous-worker v5）/ billing / node-pty 1.2.0-beta.15 冒烟通过；litkit 5 工具 schema 合法；会话格式版本 0 兼容。
- **@agentos/dsh-lco 两次启动崩（8/20 修复）**：① `dist/plugin.js` import `./lco-dsh-broker-client.mjs` 但构建（tsconfig include 只列 plugin.ts）没把 mjs emit 进 dist → `ERR_MODULE_NOT_FOUND` 崩 boot；已修 `.agent-os/adapters/dsh/tsconfig.json`（include 加 mjs）+ 重打包 bundles tgz + 同步运行副本（旧 tarball 备份 `.bak-missing-dist-file-20260820`）。② patch 层 `mode: canary` 但插件只接受 `observer|store` → `mode must be observer or store` 崩 boot；已改 `profiles/web/cordis.patch.yml` 为 `observer`。**教训：改插件后必须手动 `node bin.js --profile web` 复现验证；插件 bundle 的 mode 演进（observer→canary→safe_default）必须插件实现先行。**
- **插件准入网关 plugin-gateway（8/20 MVP 上线）**：`~/.dsh/plugin-gateway/`（独立零依赖 node 脚本）。所有经 `dev_install_package` 进 profile 的插件**必须先过静态门禁**（#1 bundle 声明 / #2 入口完整性 / #4 无裸 Windows 路径 为权威 FAIL 即拒；#3 配置超前 / #5 schema 根 为启发式 WARNING；#7 loader 内部 为纪律层 WARNING；**#8 写放大值级超阈值 = FAIL 硬拒**）——已接入 super-injector（`dev_install_package.execute` 装配前 spawnSync gateway，exit≠0 拒绝且不写 profile 文件；备份 `index.js.bak-gateway-20260820`）。**已知边界**：`dsh plugin add`/pnpm/patch insert 路径暂无自动拦截（规划 audit-profile P2）；#3/#5 启发式需冒烟兜底（P1）；#7 纪律层，真兜底是 loader 防环补丁。用法：`node ~/.dsh/plugin-gateway/scripts/verify.mjs <dir> [--strict]`。
- **cordis 链上定位缓存补丁（8/20，方案 v3 复审通过后实施）**：`@deepseek-ai/cordis/lib/index.js` 的 `getPropertyDescriptor` 原每次沿原型链 2-4 层 `Reflect.getOwnPropertyDescriptor` 遍历（CPU 采样占 52%，多 agent 并行时事件推送变慢、「任务完成但对话慢慢蹦」）。已改为 **WeakMap<target, Map<prop, depth>> 链上定位缓存**：属性所在层运行期稳定 → 缓存 depth；命中后单层 `getOwnPropertyDescriptor` 取**最新值**（writable 实例字段/ctx.baseUrl 改写均可见）；不存在属性不缓存（防先探测后赋值）；`createTraceable` 的 set 陷阱与 defineProperty 陷阱均失效缓存。实测：3000 次命中调用 3002 次反射（原约 6000+，减半）；7 项正确性专项全 PASS。备份 `index.js.bak-20260820-cordis-gpd-cache`。**需 host 重启生效**；期望热点占比 52% → 25-35%。
- **settings.yaml YAML 1.1 布尔键陷阱（8/20 事故，已修）**：settings.yaml 被重写时 `reasoningEfforts` 的 `off: null` 被 YAML 1.1 解析为**布尔 `False` 键**（`off` 是 false 同义词）→ `llm-pi-ai` 的 modelFields schema（键须 string/null）校验失败 → **整个 provider 被拒 → 自定义模型全消失**（表现：设置页/对话框只剩官方模型，`llm.models` API 只剩 deepseek-official/modlens）。**修复**：settings.yaml 中 `reasoningEfforts` 的键必须**引号包裹**（`'off': null`）。**教训**：任何 settings.yaml 的键若可能被 YAML 解析成布尔/数字（off/no/on/yes/true/false/null/数字），必须用引号；写入方（agent/工具）重写 settings.yaml 时注意保留引号。当前已修（`settings.yaml.bak-false-key-20260820` 备份坏版本），8/20 13:30 验证 6 自定义组全恢复。
- **settings.yaml reasoningEfforts 值级约束（8/20 事故二，已修）**：`reasoningEfforts` 的**值**（wire）也有约束——**只有 `off` 级别允许 `null`**，其他级别（minimal/low/medium/high/max）必须给 wire 字符串（`resolveModelReasoning` 校验：`if (wire === null && level !== "off") invalid`）。bai 之前配了 `minimal/low/medium: null` → resolveProfiles 抛错 → 整个 llm-pi-ai 拒载（同样表现：自定义模型全消失）。**正确写法**：`{'off': null, minimal: low, low: low, medium: medium, high: high, max: max}`（off 用引号防布尔陷阱，其他级别给 wire 值）。另：**`reasoningEfforts` 只能放模型级**（provider 级是未知字段，同样拒载——qwen27b 曾因此中招）。8/20 15:0x 验证 8 组全恢复（含 bai/qwen27b 思考强度）。
- **bai 特判两处（8/20 修，pi-ai 内核补丁）**：① **developer role**：api.b.ai 不接受 `developer` role（400 `unknown variant 'developer'`）——`pi-ai/dist/api/openai-completions.js:1148` `supportsDeveloperRole` 加 bai 排除（`provider === "bai" || baseUrl.includes("api.b.ai")` → false，用 system 代替），备份 `openai-completions.js.bak-20260820-bai`。② **思考挡位对齐 DeepSeek 官方**：`reasoning_effort` 仅 `low/high/max` 三档（api-docs.deepseek.com/guides/thinking_mode），bai 的 reasoningEfforts 降为 `{off: null, high: high, max: max}` 三档（挡位数由**键**决定，wire 值只是发送映射）。**教训**：自定义 provider 的 compat 字段（supportsDeveloperRole 等）llm-pi-ai 的 compatProfile schema 不开放，只能改 pi-ai 内置检测特判。
- **bai API 能力边界（8/20 调研 docs.b.ai/llmservice/api/）**：B.AI 官方只有 3 个端点——`GET /v1/models`、`POST /v1/chat/completions`（OpenAI 兼容）、`POST /v1/messages`（Claude 兼容）。**不支持 Responses API（/v1/responses）**——bai 配置必须用 `api: openai-completions`（当前正确），勿配 `openai-responses`。如需 Anthropic 风格可配 `api: anthropic-messages` 变体。
- **已知遗留**：① ~~dsh-super-injector 的"插件"设置 section 崩溃（React #130）~~ **已于 2026-08-18 修复**：`slots.register` 把 `component` 塞进 options 且返回手写 DOM——按契约改为 `register(options, component)` + React 组件包装（原 DOM 逻辑保留在 useEffect），运行副本与 vendor-archives tarball 已同步，浏览器实测插件管理页完整渲染、控制台 0 错误（源码仓库未定位，若找到需同步）；② 本地 vLLM（dgx-spark-vllm）升级时未运行，未实测 400 链路（schema 校验已单独验证）。
- **vendor-archives tgz 必须用 `npm pack` / `tar` 重打（8/19 事故）**：8/18 修复时「同步 tarball」用手写/拼接方式生成 tgz，结果 tar header checksum 无效 + 只有 1 个 header + 其余文件裸拼 + mtime 乱码（1985 年）→ pnpm 安装报 `ERR_PNPM_TARBALL_EXTRACT 无效 TAR header checksum`。**正确姿势**：① 从运行副本目录 `npm pack --pack-destination <tmp>` 生成新 tgz（会带 `dsh-external-` 前缀，需重命名为 vendor-archives 的固定文件名）；② 重算 `sha512` 并更新 `pnpm-lock.yaml` 对应 integrity（`sha512-<base64>`）；③ 隔离目录 `pnpm install --offline` 验证通过再落地。8/19 已按此重打 dsh-super-injector-0.3.3.tgz 并更新 lock（坏文件备份为 `.bad-checksum-20260819`）。
- **回滚**：还原 `resources/host` ← 备份目录（或 ren `node_modules.rc5` 回 `node_modules`）即回 rc.5。

---

## 8.5 2026-08-20 大升级记录：壳 v0.1.0 → DSH Desktop v2.0.1 + 内核 rc.7 → rc.8

> 完整方案见 `docs/rc8-upgrade-plan.md`（三轮独立审查通过）；Phase A-E 均派独立验收（全部 PASS/PASS_WITH_FINDINGS）。

### 8.5.1 新壳架构（重大结构变化，与旧壳完全不同）

| 维度 | 旧壳 v0.1.0 | 新壳 v2.0.1 |
|---|---|---|
| 安装位置 | `{{DSH_INSTALL_DIR_LEGACY}}\` | **`%LOCALAPPDATA%\Programs\DSH Desktop\`**（NSIS per-user） |
| host 内核 | `resources/host/node_modules` | **`resources/app.asar.unpacked/node_modules`**（asar 内无 node_modules） |
| 内核形态 | 独立 host 进程（ELECTRON_RUN_AS_NODE） | **Electron 主进程内嵌**（dsh-plugin-desktop 作为 Cordis 插件组装） |
| profile 默认 | `--profile web` | **`desktop`**（新壳自带，仅 2 bundle）；`web` 通过托盘/state.json 切换 |
| profile 状态 | 无 | `%APPDATA%\DSH Desktop\profile-selection\state.json`（active/lastKnownGood） |
| userData | `%APPDATA%\DeepSeek Harness` | `%APPDATA%\DSH Desktop`（日志：`logs\dsh-YYYY-MM-DD.log` + `.error.log`） |
| 包管理 | 全局 pnpm | **内置 pnpm/Node/CLI**（壳自带） |
| 桌面快捷方式 | `DeepSeek Harness.lnk`（公共桌面） | `DSH Desktop.lnk`（用户桌面，RUNASADMIN 已设） |

### 8.5.2 新壳 boot 三个坑（全部已修，`profiles/web/cordis.patch.yml` 有记录）

1. **loader entry 重复 id 会 fatal**（`duplicate loader entry id: bpc-verification-client`）：cordis.patch.yml insert 段不能有重复 id——曾因误恢复旧备份导致桌面版启动即挂，删除重复行即愈。
2. **MCP spawn 在 Electron 主进程失败**（`mcp-client(chrome_faithful): Connection closed` + cross-spawn ENOENT）：新壳 host 是 Electron 主进程，`command: !!js process.execPath`（DSH Desktop.exe）**无法 spawn 为 node 模式** → 子进程启动失败。**当前处置**：profile 层覆写 `failOnStartupError: false`（MCP 失败仅重试告警，boot 不阻断）——代价是 `mcp__chrome_faithful__*` 工具暂不可用。**待办**：改为显式 node.exe 路径或 shell 包装（Phase C 验收 MAJOR-1，需在下次维护窗口解决）。
3. **YAML overlay 解析严格**：cordis.patch.yml 出现孤立 `\r` 行或 `- insert:` 无内容即 `YAMLException: end of the stream or a document separator is expected` → boot fatal。编辑该文件必须保持规范（无孤立 CR、insert 块必带 id）。

### 8.5.3 内核 rc.8 升级要点

- **安装方式**：原地 `npm install --legacy-peer-deps`（`app.asar.unpacked/package.json` 里 96 个 `@deepseek-ai/*` 从 rc.7 → rc.8；**2 个包无 rc.8 版本保留 rc.7**：`dsh-client-schema-form`、`dsh-client-web-react`）。rc8 lockfile 存档 `backups/host-rc7-20260820/rc8-package-lock.json`。
- **补丁处置**（按补丁处置表流程）：
  - P1 loader 防环：**rc.8 保留了我们打的 P1**（loader 仍 1.0.2，npm install 保留原位文件）——⚠️ 不是官方修复，是补丁随树保留；下次 loader 版本变化必须重验/重打（Phase C 验收 F1 修正记录）
  - P2 cordis gpd 缓存：重打成功（cordis 仍 4.0.1）
  - P3 pi-ai bai 特判：重打成功（pi-ai 仍 0.82.1）
  - P4 dsh-session KNOWN：重打成功（**rc.8 实测仍不含**两事件，必须打）
- **boot 验证**：HTTP 200、窗口正常、插件全载（billing/super-injector/continuous-worker/vision-toolkit）、225 会话历史完整。
- **回滚**：双保险——旧壳树 `backups/host-rc7-20260820/node_modules.tar`（260MB）+ 新壳 rc.7 树 `backups/rc7-v2.0.1-node_modules.tar`（219MB）；旧壳 exe 仍在 `{{DSH_INSTALL_DIR_LEGACY}}\`（快捷方式已删，目录保留作回滚）。

### 8.5.4 其他记录

- **research-orchestrator.mjs 文件损坏**（boot 阻塞）：文件中 `parseExaContent` 被声明两次（52/113 行，两个版本的函数体合并残留）→ ESM 顶层重复声明 SyntaxError → boot fatal。已删重（保留处理 `result.content` 的版本）。教训：**任何 agent 合并/重写 profile 内 mjs 文件后必须 `node --check`**。
- **research-orchestrator 二次重写引用了不存在的 adapters（8/20 23:0x 修复）**：该文件 21:58 被某个任务重写为 533 行新版（Phase 1: unified normalization），顶层 `import { rssAdapter } from '../adapters/rss.mjs'` + `hackernewsAdapter`，但 `~/.dsh/profiles/adapters/` 目录不存在 → `ERR_MODULE_NOT_FOUND` → boot fatal（桌面版弹"恢复"窗口）。修复：创建 `profiles/adapters/{rss,hackernews}.mjs` 最小实现（`export const rssAdapter = { search: async () => [] }`，命名导出必须匹配 import）。教训：**mjs 文件新增顶层 import 必须确认目标文件存在；boot 后窗口标题含"恢复"= boot fatal，查 error.log 的 ERR_MODULE**。
- **备份方法论修正**：本机 robocopy 大目录树不可靠（10 分钟只复制 1 个目录就卡住）→ 统一用 `tar -cf`（260MB 整树约 1 分钟）+ `tar -tf` 校验。Phase A 曾因 robocopy 静默失败导致备份不完整，验收审查发现后改用 tar。
- **旧壳/新壳并发风险**：桌面旧快捷方式已删除，新壳 RUNASADMIN 已设（`HKCU\...\AppCompatFlags\Layers` = `~ RUNASADMIN`）。两壳共享 `~/.dsh/profiles/web`，**严禁同时运行两壳**（并发写 session 竞态）。
- **已决定不升级**：rc.8 的 cordis/loader/pi-ai 版本未变；2 个客户端包官方未发 rc.8（可能 rc.9 补发）——下次升级时先查 `npm view @deepseek-ai/<pkg> versions`。

---

## 6.5 GitHub 发布审计（2026-08-19，bpc-oss 组织 dsh 插件仓库）

对本机开发的、已发布到 `github.com/bpc-oss` 的 dsh 插件逐仓审计"别人安装是否踩坑"：

| 仓库 | 事件类型 | lib/ 构建产物 | npm 指引 | 结论 |
|---|---|---|---|---|
| dsh-verification | ✅ 已注册 verification/change | ✅ 已提交（2026-08-19 修） | ✅ 已修正 | 已修（commit a66866d + b7c85df） |
| dsh-routed-subagent | ✅ 用核心类型 subagent/descriptor | ✅ 已提交 | ✅ | 无坑 |
| dsh-web-billing | ✅ 不写 session 事件 | ✅ 已提交 | ✅ | 无坑 |
| DSH-better-sidebar | ✅ 不写 session 事件 | npm 有 v0.13.1；GitHub 通道 src 完整 + README 有 build 指引 | ✅ 双通道 | 基本无坑（GitHub clone 需自 build，有说明） |
| chrome-faithful | ✅ 不写 session 事件（MCP 插件） | 无 main 依赖 | ✅ | 无坑 |

**发布红线（新插件上 GitHub 前自查）**：
1. 写 `session.append('xxx/change')` 必须注册类型（或只用核心类型）；
2. `package.json main` 指向的 `lib/` 必须随仓库提交（或发布 npm / README 写清 build 步骤）；
3. README 不得写指向不存在 npm 包的安装命令（`@bpc-oss/*` 均不在 npm，404）；
4. 发布后在新环境 clone 实测挂载 + 旧会话回归。

---

## 7. 一句话总结

> 插件动了任何代码 → 源码修（不是副本修）→ typecheck + test + build → 三副本同步 →
> 重启所有端 → 旧会话回归（历史可加载 + 记录/投影 schema 全过）。四步缺一，迟早翻车。

---

## 8. 视觉链路：原生 read_image 取代外部 toolkit（2026-09-29）

### 结论
多模态路由上 `vision_*` 工具是**历史包袱**：它们为纯文本 agent 而生，把图片上传到外部 VLM 换回一段文字。宿主模型自带视觉 + DSH 原生 `read_image`（图片直接进请求）才是正解，且零额外模型调用、零外传。

### 四个坑（下次遇到直接对号入座）
1. **工具未挂载 ≠ keep-set 能救**：toolkit 的 schema 在技能加载前不进装配集，任何 keep 过滤都是空集。要么改用原生工具，要么让技能预加载。
2. **disabled 条目的 id 必须是行 id，不是包名**：`super-injector` 的自动卸载写 `id: dsh-vision-toolkit`，而 bundle patch 的行 id 是 `vision-toolkit` → 拦不住；日志只留一行 `client 模块表已移除`，插件仍然活着。真正生效要重启宿主。
3. **loader 按路径缓存 mjs**：改 preset 的 `.mjs` 后新会话可能仍跑旧代码（本次靠重启才看到常量切换生效）；`agent.cordis.yml` 则是每次请求重算。

4. **uninject 写入的 disabled 行是内核级 loader 语义**：id 匹配到已安装的 bundle 插件时会把它在 loader 层禁用（UI 消失、宿主日志安静）；插件未装时才退化为无害 not-found。卸载 bundle 型插件后必须摘行或核对 UI，不能只看注入器 exit 0（2026-10-22 dsh-context 实录，修复=摘 cordis.patch.yml 尾部 3 行）。
### 能力实测表（写声明前先探，别照抄同级模型）
| 声明 | 探针 | 结论 |
|---|---|---|
| `input: image` | base64 纯红 PNG → chat/completions | 答 `Red`，reasoning 含 `(255,0,0)` |
| `tool_use` | 带 `tools` 的请求 | `finish_reason: tool_calls`，参数正确 |
| `reasoning_key` | 看响应字段 | 是 `message.reasoning`，不是 `reasoning_content` |
| `support_efforts` | 逐值扫 | 只接受 `low/medium/high/xhigh/max`；`disabled/enabled` 400 |

### 防丢
所有改动已登记（preset 源 / 插件源+指纹 / profile 模板 / `local-overrides/` 脱敏 diff）。DSH 更新后先跑：

```powershell
powershell -NoProfile -File .\local-overrides\verify.ps1
```

有 `DRIFT` 就按 `local-overrides/README.md` 逐条回填。
