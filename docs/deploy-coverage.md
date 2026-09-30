# 部署覆盖清单

这份清单回答一个之前没人回答过的问题：**仓库里每一项东西，换机时会不会被部署出去。**

它由第三轮独立审查提出。那次审查问"每个顶层目录是否被 bootstrap 部署、是否被记录为有意
不部署"，答案是不 —— 而"没有记录"本身就是缺陷：下一次有人加目录时，无从判断该部署还是该忽略。

判定口径：**抹掉这台机器、只从这个仓库跑 `bootstrap.ps1`，能不能得到等价的 DSH。**

## 会被部署

| 路径 | 机制 | 备注 |
|---|---|---|
| `profile/*.template` → `~/.dsh/profiles/web/` | `scripts/template-render.ps1` | 走模板渲染，机器路径占位化 |
| `profile/local-presets/`（15 文件） | `Render-TemplateTree` | 递归渲染。profile 用 `file:./local-presets` 指向它 |
| `config/.agent-presets/`（13 preset） | `bootstrap.ps1` 的 preset 部署块 | 逐 preset 渲染，路径基准是 preset 自身目录 |
| `config/settings.yaml.template` → `~/.dsh/settings.yaml` | `template-render.ps1` | 0.2.0 起内核已不读它（内容迁进 `cordis.patch.yml`），属无害冗余 |
| `super-injector/registry.json.template` → `~/.dsh/super-injector/registry.json` | `template-render.ps1` | dsh-super-injector 启动时读它并自动恢复其中的 bundle |
| `plugins/standalone/dsh-promise-guard/` | `bootstrap.ps1` 按 `SOURCES.json` 的 `payload` + `mounted_in` | 装进 7 个 preset 目录 |
| `gateway/` → `~/.dsh/plugin-gateway/` | `bootstrap.ps1` Phase 5 | |
| `profile/vendor/*.tgz` → `vendor-archives/` | `bootstrap.ps1` | 含 super-injector 0.3.3，**已内含 P5** |
| `patches/host/*.patch` → 内核树 | `patches/host/apply.ps1` | 只应用 `kernelLine` 匹配当前内核的条目 |
| `patches/profile/*.patch` → profile node_modules | `patches/profile/apply.ps1` | P5。在 `pnpm install` **之后**执行 |

## 不会被部署（有意）

| 路径 | 原因 |
|---|---|
| `patches/host/001..037`、`patches/rc2-diffs/` | 0.1.5-rc.1 内核时代的补丁文件。那棵树不是当前内核，这些是"那棵树怎么被打过补丁"的历史记录。0.2.0 上的验证手段是 `scripts/verify-patch-port.mjs`（按 marker，35 OK / 0 TODO），不是重放这些 diff |
| `patches/rc2-diffs/ORPHANS.md` | 孤儿补丁清单 |
| `local-overrides/*.patch` | 逐机设置 diff，按设计由人按 `local-overrides/README.md` 手工应用。`verify.ps1` 断言的是**线上**状态 |
| `vendored/`（3 项，277K） | `dsh-token-meter-hermes` / `dsh-voice-input` 的**回滚参考副本**。两者的真实来源是 `~/dsh-token-meter-hermes`、`~/dsh-voice-input`（后者 440M，备份只有 241K —— 明显不完整，**不适合**做自动恢复源）。`SOURCES.json` 里的 `vendored_backup` 字段**没有任何脚本消费**，它只是记录"备份在哪" |
| `scripts/`（45 文件） | 仓库工具链，不进 `~/.dsh` |
| `docs/`、`.github/`、`CHANGELOG.md`、`README.md`、`LICENSE` | 文档与 CI |
| `config/agent-presets/` | 空的遗留目录（无点前缀），未跟踪 |

## 会被部署但**当前是空的**

| 路径 | 状态 |
|---|---|
| `spec/` | 空目录，未跟踪任何文件。部署链路上不引用它。可以删 |
| `tmp/` | 运行时产物，不跟踪 |

## 不在 git 里的机器本地文件

| 文件 | 作用 |
|---|---|
| `.env`（已 gitignore） | `PLUGIN_SOURCES_DIR=<path>`。本仓库的 JSON 由 node 写成 UTF-8 无 BOM，而硬编码机器路径会被 `check-private.ps1` 判为隐私泄漏 —— 盘符不是该推断的东西，所以走这个文件 |
| `~/.dsh/backups/` | bootstrap Phase 1 与各次手工操作的备份 |

## 部署完成后会跑的门禁

`bootstrap.ps1` 的 Phase 6 smoke 现在会真正阻断（`exit 1`），检查两件事：profile 里的
`.mjs` 语法、以及 super-injector 运行时副本里 P5 gateway 是否在位。

日常核验用这十个（`docs/migration-020-status.md` 第七节有完整命令）：

```
esm-syntax-check / esm-link-check / verify-patch-port / verify-kernel-patches
verify-plugin-activation / audit-registry / audit-preset-mounts
drift-scan / check-private / local-overrides-verify
```

每个都做过**阴性对照** —— 制造它要抓的故障，确认它变红且退出码非零。
一个抓不住自己目标类别的门禁，比没有门禁更糟：它只训练人忽略它。

## AgentOS 接入面的迁移结论（2026-09-30 审计）

用户点名要确认的一项。逐点核对：

| 接入点 | 状态 | 证据 |
|---|---|---|
| `@agent-os/dsh-governance` 0.1.0 | ✅ 完整 | 在 `node_modules` 且在 `dsh.profile.bundles`；`enabled: true`；import 零失败；`apply()` 实测为每个 agent 隔离并挂载 fiber、订阅 `agent/created` / `agent/disposed` / `tools/pre-execute` |
| `agents` 注入服务 | ✅ 存在 | 由 `@deepseek-ai/dsh-agent` 提供，满足插件的 `inject: ['agents']` |
| `clientActivation` receipt | ✅ 就位 | `client-activation.json` 868 字节，含 `protocol` / `receiptSha256` / `epoch` / `brokerGeneration` / `endpointIdentitySha256` |
| `agentos-dsh-lco` | ✅ 按设计关闭 | 块在（template 用 `{{AGENT_OS_BRIDGE}}`），`disabled: true` —— 用户 2026-09-10 的决定，配置保留以便日后启用 |
| `AGENTOS_CHROME_CONFIG` 桥接 | ✅ 在位 | chrome-faithful 兼容块把它转发进 MCP 子进程环境 |
| `reverse-proxy` | ✅ **本次补登记** | 此前只存在于 live，template 缺失 → 重放会丢掉手机入口 |
| AgentOS 主目录 / `framework-governance/state` / `plugin-gateway` / `agents-anywhere` | ✅ 存在 | |

**注意**：governance 是 advisory 设计，运行时不打日志，所以"host 日志里没有它的输出"是
正常的，不能据此判断它没激活。判断依据是挂载路径实测（见上表）。

**本次新增的 7 条 anchors** 保护这些配置不被后续升级静默删除：治理入口、clientActivation、
LCO 入口、bridgePath、reverse-proxy 入口与端口、chrome-config 桥接。anchors 11 → 18 条。

## AgentOS 运行时连通性：DSH 侧已迁移，对端连接断着（2026-09-30）

上面那张表全是 **DSH 侧**的配置。往 AgentOS 那侧查，三条独立证据一致：

| 证据 | 状态 |
|---|---|
| `agentos-lco-broker` 进程 | ✅ 在跑（PID 5956，2026-09-30 10:28 启动） |
| `client-activation.json` 的 `expiresAt` | ❌ **2026-08-25，已过期 36 天** |
| receipt 指向的命名管道 `\.\pipe\AgentOS-DSH-06fbf0ca…` | ❌ 不存在 |
| `watcher-heartbeat.json` | ❌ 最后心跳 2026-09-29 02:49，停在 28 小时前 |

也就是说：receipt 是一张**过期凭据**，它指向的端点也不在。governance 在 DSH 侧挂载正常，
但它的 completion submitter 没有可用的连接。

**对日常使用没有影响。** `client-connector.js` 的注释写明了设计意图：
> Lazily-connecting completion submitter. Connection is established on first submission;
> a failed connection surfaces as a rejected submission and **never fakes a receipt**.

连接是**懒连接** —— 首次"完成提交"时才建立，而那发生在会话结束时，不在会话进行路径上。
失败表现为一次被拒绝的提交，不会伪造回执，也不会把异常抛进会话。

**净结论**：AgentOS 的**准入/门禁**那一半是活的（P5 的 plugin-gateway 门禁本地可用），
**完成回传**那一半是断的。要恢复需要 AgentOS 侧为当前 epoch 重新签发 receipt
（`framework-governance client-activation`），不是 DSH 侧能补的 —— 所以这里只记录，不动手。

## AgentOS 侧 DSH 接入清单（AgentOS 目录实查，2026-09-30）

盘的是 `~/AppData/Local/AgentOS` 这一侧，即"AgentOS 的设定里 DSH 接入了哪些"。

### 1. 治理插件 —— AgentOS 分发了一套，DSH 实际用的是另一套

| | 来源 | 内核线（peer `dsh-agent`） | DSH 是否在用 |
|---|---|---|---|
| `@agent-os/dsh-bundle` 0.1.0 | `dsh/bundles/*.tgz` | `0.1.0-rc.6` | ❌ |
| `@agent-os/dsh-bundle` 0.1.1 | 同上 | `0.1.0-rc.6` | ❌ |
| `@agent-os/dsh-bundle` 0.2.0 | 同上 | `0.1.0-rc.7`（description 写明 "for DSH rc.7"） | ❌ |
| `agentos-dsh-lco` 0.1.0 | 同上 | — | ❌ 按用户 2026-09-10 决定保持 `disabled: true` |
| **`@agent-os/dsh-governance` 0.1.0** | **`~/dev/dsh-governance`（本地开发源）** | **`0.1.0-rc.8`** | ✅ **在用** |

**版本号 0.2.0 与当前内核 0.2.0-rc.1 是巧合** —— 那个 bundle 的内核线是 rc.7。
DSH 实际在用的 `@agent-os/dsh-governance` 是本地开发源，peer 指向 **rc.8**，
比 AgentOS 分发的三版都新。所以 AgentOS 的 `dsh/bundles/` 目前是**历史分发渠道，未在用**。

### 2. 治理管道 `framework-governance/`

| 目录 | 项数 | 用途 |
|---|---|---|
| `inbox/` | 15 | 全部是 `inbound-web-live-*.json` —— DSH web 端投递进来的 |
| `outbox/` | 5 | 处理结果 |
| `processed/` | 5 | 已处理 |
| `keys/` | 2 | 签名密钥对（receipt 里的 `publicKeyHex` / `keyId` 对应这里） |
| `ledger/` | **0** | 账本为空 |
| `state/client-activation.json` | 1 | 连接凭据 |
| `state/completions.jsonl` | **86 条** | **完成记录，全部 `COMPLETION_ACCEPTED`，ack 类型 `agent-os-dsh-protocol-ack`** |
| `state/watcher-heartbeat.json` | 1 | watcher 心跳 |

### 3. Broker `dsh/broker/`

33 个 `broker-instance-*.tombstone`，**0 个活跃实例**；而 `agentos-lco-broker` 进程活着
（2026-09-30 10:28 启动）。即：进程在，实例目录全是墓碑 —— 没有活跃 broker 实例在服务。

### 4. 验收证据 `evidence/`

`lco-dsh-phase1` / `phase2` / `phase3` 三个阶段的握手与验收记录。

### 时间线：断点在哪

```
2026-08-24 15:43   client-activation.json 签发（expiresAt = 08-25 07:43）
2026-08-24 15:56   completions.jsonl 最后一条成功 —— 签发后 13 分钟
2026-08-25 07:43   receipt 过期
2026-09-29 10:49   watcher-heartbeat 最后心跳（watcher 还活着）
2026-09-30         仍无新成功记录
```

**结论：接入是完整的，而且曾经真的跑通过 86 次。断在 receipt 过期，且 AgentOS 侧此后
没有为 DSH 重新签发。** watcher 昨天还在跳，说明不是 AgentOS 整体停了，而是没人重新
签发这张凭据。

## @agent-os/dsh-governance 适配 0.2.0-rc.1（2026-09-30）

### 为什么以前没发现它对不上新内核

插件**不是 git 仓库**（`~/dev/dsh-governance` 无 `.git`），且 `dist/` 是在 0.1.x 还有
`.d.ts` 的时候编译的。之后内核换成 0.2.0-rc.1，源码与新内核脱节，但**已编译的 dist 照常加载**，
所以门禁、启动、实机使用全都看不出问题 —— 直到要重新构建它。

### 依赖面

| 包 | 用法 | 0.2.0 状态 |
|---|---|---|
| `@deepseek-ai/cordis` | `Service`（值）、`Context`/`Fiber`（类型） | 4.0.4，**不发 .d.ts**（`types` 指向的 `lib/types/index.d.ts` 不存在，只有 `.d.ts.map`） |
| `@deepseek-ai/dsh-agent` | 全部 6 处是 `import type` | 0.2.0-rc.1，无类型 |
| `@deepseek-ai/dsh-tools` | `defineTool`（值）+ 5 个类型 | 0.2.0-rc.1，无类型 |

因为值导入只有 `Service` 和 `defineTool`，**运行时依赖面极小**，逐个核对过签名都没变：
`tools.guard(fn)` 在 0.2.0 仍是注册式（`layer.guards.append(fn)`，返回 disposer），
`tools.register(def)` 返回 `this.layers.effect(...)` 即 disposer，`defineTool` 仍是
`async execute(args, exec)` 两参数。`tools/pre-execute`、`tools/post-execute`、
`tools/change`、`agent/pre-step` 四个事件全部健在。

### 修的两处真问题

1. **`payload.turn` 已不存在。** 0.2.0 的 `agent/pre-step` payload 收窄为
   `{ agent, messages, signal, step }`，turn 搬到了事件流（`turn/start` 的 `event.data.turn`）。
   旧代码 `observedTurn: payload.turn` 静默得到 `undefined` —— 连 `number | null` 都不是，
   序列化时字段直接消失。改为记 `null` 并注释说明，不伪造数字。
2. **源码在新内核上根本编译不过。** 三个 DSH 包都不发声明，`strict` 下 `import type`
   无从解析（首次 `tsc` 报 30 个错）。新增 `src/kernel-0.2.d.ts` 提供 ambient 声明，
   每一项都注明在 0.2.0 树里的核验依据（字段出现次数、`tools.guard` 的实现片段、
   pre-step 的解构形态），不是照抄旧声明。编译错误 30 → 0。

### 顺带发现的版本污染（未处理，只记录）

`~/.dsh/profiles/node_modules/@deepseek-ai/cordis` 是 **4.0.2**，来自 2.0.9 时代的
`v209-patched-tree`。DSH 运行时用自己的 loader hook 解析到 app 树的 4.0.4，**不受影响**；
但任何走标准 Node 解析的工具（脚本、CLI、测试）会命中 4.0.2 —— 同一服务的两个类身份。
治理插件的 `node_modules/.pnpm/` 里还躺着一整套同期的副本（cordis 4.0.1、dsh-agent 0.1.x、
cosmokit 1.8.2），虽然当前没有链接指向它们。

删除该共享层需要先确认没有东西依赖它，属于独立决策，未擅自处理。

### 实机验证（0.2.0 rc.1 上逐项）

用忠实还原的 stub ctx（必须含 `reflect` 与 `isolate`，否则 cordis 的 `Service` 构造就炸）
驱动 `apply()` 与 `mountAgentOsGovernance`：

```
挂载 scopes            yes
订阅事件               agent/pre-step, tools/pre-execute, tools/post-execute,
                       tools/change, agent/created, agent/disposed
guard 可调用           true
pre-step 已接线        true
governance 状态可查     present
拆卸后剩余事件          2（apply 层的 created/disposed；fiber 层的 4 个已正确卸载）
未准入执行被拒绝        false
```

最后一条是**设计内的降级**：插件注释写明 "Task 5 never enforces policy"，且在没有有效
broker 凭据时 `degradationReasons` 含 `broker-not-configured` / `same-user-cooperative-enforcement`，
不拒绝是正确的。与上面「receipt 过期 36 天」是同一件事的两面。
