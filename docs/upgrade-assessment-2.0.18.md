# DSH 升级评估：2.0.16 / 内核 0.2.0-rc.1 → 2.0.18 / 内核 0.2.1-rc.2

评估日期：2026-10-19
评估对象：本机 `%LOCALAPPDATA%\Programs\DSH Desktop`（壳 2.0.16，内核 0.2.0-rc.1）
方法：下载 0.2.1-rc.2 全部 28 个补丁目标包，逐个把 43 条补丁 dry-run 到新版文件；semver 实测插件 peer 范围。**未改动任何生产文件。**

---

## 0. 结论摘要

**不建议一步到位。**

- **一步到 2.0.18（0.2.1-rc.2）风险高**：14 条视频补丁需要在新架构上**重写**（上游 0.2.1 完全没有 video 支持），18 个插件 peer 校验失败，`schemastery` 影子依赖会重现之前 better-sidebar 那个崩溃。
- **建议先走 2.0.16 → 2.0.17（内核 0.2.0-rc.2）**：该版本只把 pi-ai 从 0.85.1 提到 0.87.1，cordis/schemastery/loader 版本全不变，插件 peer 范围仍然成立。**只有 4 条 pi-ai 补丁需要重打**。风险中低。
- 2.0.18 单独作为一个项目做，主要成本在视频栈重建。

> 另外：2.0.18 发布说明写明「从下个版本开始，稳定版不再更新，由 DSH NEXT 取代」。2.0.18 是最后一个稳定版，长期必然要迁到 NEXT 线。

---

## 1. 版本与官方变更

| 层 | 本机 | 官方最新 | 差距 |
|---|---|---|---|
| 桌面壳 | 2.0.16 | v2.0.18（10-17） | 2 个版本 |
| 内核 | 0.2.0-rc.1 | 0.2.1-rc.2 | 1 个 minor |

中间版本的官方变更：

### 0.2.0-rc.2（对应壳 2.0.17）
- **pi-ai 0.85.1 → 0.87.1**；部分旧模型 ID 被移除，已保存的模型选择可能需要重选。
- 桌面端菜单栏可管理 dsh 命令与插件（无需另装 Node/pnpm）。
- 修 PowerShell 持久会话的退出码/标记泄漏、计划审阅打不开等。

### 0.2.1-rc.1（对应壳 2.0.18）
破坏性/需迁移项（官方原话节选）：

- 移除运行时 `invariant` 插件及各包 `./invariant` 导出。
- **子路径插件不再读取独立的 `package.json`**，文本与图标须通过子路径导出。
- **第三方插件兼容性优先按 `engines.dsh` 判断**；未声明时沿用旧规则。
- **输入区统计扩展拆为 `activity` / `usage` 两个入口**；覆盖旧 `stats` 整行的插件要改注册 ID。
- **子代理工具改为立即返回 child ID**；自定义 SDK runtime 需支持 `session/wait`。
- 移除工具展示的 `both` 混合模式，只保留 `native` / `ptc`。
- `agent-instructions` 移除逐行 `dshHome` 配置，改读 `DSH_HOME`。
- API Key 读取优先级变更（Web/桌面优先用已保存凭据）。
- Agent Team 消息改为直接投递 Inbox，移除 outbox/自动重试/去重。

### 0.2.1-rc.2
- 适配 DeepSeek-V4.1-Flash-1017。
- 新增 DeepSeek Search 与 Fetch API（网页搜索设置里开启）。

---

## 2. 内核补丁可移植性（43 条）

方法：把每条补丁 dry-run 到 0.2.1-rc.2 的对应文件。

| 结果 | 数量 | 说明 |
|---|---|---|
| 直接适用（含 offset/fuzz） | **9** | P2, P14, P22, P26, P27, P28, P29, P41, P42 |
| 需重打（RE-PORT） | **20** | 见下 |
| 已被上游吸收/包不存在 | **4** | P7/P9（host-apiproxy）、P10（client-runtime），这些包在 0.2.x 线已不存在 |
| 壳侧（`resources/app/lib`） | **2** | P30 `updates.js`、P38 `module-resolution-<hash>.js` |
| 已标记 skip / retired | **8** | P8, P11, P12, P13, P15, P17b, P18, P31 |

### 需重打的 20 条

**视频栈（14 条，最重）**：P17, P17c, P18b, P18c, P19, P19b, P20, P21, P23, P24, P25, P37, P39，以及 offset 的 P22。
上游 0.2.1-rc.2 里 `video` 关键字出现次数：`dsh-llm` = 0、`dsh-llm-pi-ai` = 0、`pi-ai/openai-completions` = 0、`dsh-tool-fs` = 0。**视频能力是我们的私有改造，上游从未有过，必须在新架构上重建**。

**非视频（6 条）**：
- P1（cordis-plugin-loader 环守卫）
- P4（dsh-session known events）
- P6（dsh-goal 验证缝）
- P16 / P16b（dsh-subagent routed fork + 包标记）——**尤其注意**：0.2.1 把子代理改为立即返回 child ID，fork 语义要重新对齐。
- P43（tool_call id 改写，锚点里含 `videoToFrames`，重新锚定即可）

**pi-ai 4 条**：P3, P17c, P22, P23。其中 P22 在 0.87.1 上可直接套用；P3/P17c/P23 在 0.87.1 上偏移约 122 行，在 1.1.0 上偏移更大。

### 账本质量问题（顺带发现）

`patches/host/003`、`017`、`017c`、`018*`、`019*` 这些文件**不是可重放的 a/b 补丁**，而是 `diff 快照文件`（头是 `pi-ai-original-reconstructed.js` 这类任意文件名）。也就是说：**补丁账本对这批条目只能"记录"，不能"重放"**。升级前必须先补成真正可 apply 的补丁，否则换机/重建时无法还原。

---

## 3. 插件兼容性

### 3.1 peer 范围实测

semver 实测：`0.2.1-rc.2` **不满足** `^0.2.0-rc.1`（npm 预发布规则：不同 patch 的预发布版本不落在同一范围）。

`0.2.1-rc.2` 下 peer 校验失败的插件：**18 个**（去重后）：

```
dsh-better-sidebar@0.24.1            14 项
@zseven-w/dsh-openpencil             11
dsh-bash-terminal@0.3.11             10
@bpc-oss/dsh-verification             9
@deepseek-ai/dsh-workflow-ptc         9   ← 精确 peer 0.2.0-rc.1
@omdsh-dev/dsh-genui                  8
@deepseek-ai/dsh-client-ui-subagent   7
@bpc-oss/dsh-client-ui-verification   6
@deepseek-ai/dsh-subagent-claude-code 6
@deepseek-ai/dsh-subagent-codex       6
dsh-plugin-manager                    6
@deepseek-ai/dsh-workflow             5   ← 精确 peer 0.2.0-rc.1
@deepseek-ai/dsh-sdk-protocol         4
@agent-os/dsh-governance              2
dsh-token-meter-hermes                2
@bpshil/litkit-dsh                    1
@dsh-external/dsh-super-injector      1
```

### 3.2 `engines.dsh`

**0 / 314** 个包声明 `engines.dsh`。0.2.1 会回退到旧规则（peer + 兼容例外），所以不会立刻全崩，但意味着**兼容判断仍然依赖 `compatibility.json`**。

### 3.3 `compatibility.json`

现有 12 条例外**全部以 `0.2.0-rc.1` 为键**，升级后逐条失效，需要重新签发并逐插件实机验证。

### 3.4 profile 依赖

- `@deepseek-ai/dsh-client-ui-subagent: ^0.2.0-rc.1` → 需改 `^0.2.1-rc.2`
- `@deepseek-ai/dsh-subagent-codex/claude-code: ^0.1.0-rc.8` → 官方 `next` 已有 `0.2.1-rc.2`，建议同步
- `@deepseek-ai/dsh-workflow` / `dsh-workflow-ptc`：精确锁 `0.2.0-rc.1`，必须升级

### 3.5 已知影子依赖风险（上次崩过的同一坑）

```
profile/node_modules/@deepseek-ai/schemastery         3.18.1   ← 顶层影子，问题根源
profile/.../dsh-better-sidebar/node_modules/.../schemastery 3.18.4
内核 0.2.1 需要                                        ~3.18.5
```

0.2.1 把 schemastery 提到 3.18.5。顶层的 3.18.1 会再次 shadow 内核，`field.volatile()` 缺失导致 better-sidebar 加载失败——**与 9 月 30 日那次是同一个故障**。

---

## 4. 依赖与运行时变化

| 包 | 当前 | 0.2.0-rc.2（壳 2.0.17） | 0.2.1-rc.2（壳 2.0.18） |
|---|---|---|---|
| `pi-ai` | 0.85.1 | ^0.87.1 | **^1.1.0（主版本）** |
| `cordis` | 4.0.4 | ~4.0.4 | ~4.0.5 |
| `cordis-plugin-loader` | 1.0.5 | ~1.0.5 | ~1.0.6 |
| `schemastery` | 3.18.4 | ~3.18.4 | ~3.18.5 |

`pi-ai` 跨主版本（0.85 → 1.1）是视频栈必须重写的技术原因之一：`buildParams`/`convertMessages` 仍在，但内部结构变化大。

---

## 5. 壳侧

- 壳升级会**整目录替换 `resources/app`**，P30（`lib/updates.js`）与 P38（`lib/module-resolution-<hash>.js`）必须重新打。
- **P38 的目标文件名带内容哈希**（当前 `module-resolution-CTTB3FAS.js`），每次构建都会变。升级后必须重新定位，不能沿用路径。
- 2.0.18 自身改动集中在插件页、市场来源、右键菜单、更新安装；与我们的壳补丁无直接冲突面，但都要重验。
- 官方稳定线到 2.0.18 为止，之后是 NEXT（2.0.19-next）。

---

## 6. 风险分级

| 风险项 | 等级 | 依据 |
|---|---|---|
| 视频栈重建 | **高** | 14 条补丁，上游零 video 支持，pi-ai 主版本跃迁 |
| 插件 peer 全线失效 | **高** | 18 个插件，semver 实测拒绝 |
| schemastery 影子依赖 | **高** | 上次已导致 better-sidebar 加载失败 |
| routed-subagent fork 语义 | **高** | 0.2.1 改变子代理返回模型（child ID + session/wait） |
| web-billing 统计扩展 | 中 | 输入统计拆成 `activity`/`usage` |
| pi-ai 4 条补丁 | 中 | 0.87.1 偏移 ~122 行；1.1.0 更远 |
| 非视频内核补丁 6 条 | 中 | 锚点移动，可重打 |
| 壳侧 P30/P38 | 中 | 哈希文件名必变 |
| 配置行为迁移 | 中 | invariant/subpath/toolDisplay/dshHome 等（本机未用 `both`/`dshHome`，受损面小） |

---

## 7. 两条路线

### 路线 A（推荐）：分两步

**第 1 步：2.0.16 → 2.0.17（内核 0.2.0-rc.2）**

- 变化面：仅 pi-ai 0.85.1 → 0.87.1。
- 补丁：重打 4 条 pi-ai（P3/P17c/P22/P23）；其余内核补丁因同 minor 基本不动。
- 插件：peer 范围 `^0.2.x-rc.1` **仍然满足 0.2.0-rc.2**，无需批量改。
- `compatibility.json`：只需把键 `0.2.0-rc.1` → `0.2.0-rc.2`。
- 壳侧：重打 P30/P38。
- 预计：**0.5–1 天**，风险中低。

**第 2 步：2.0.17 → 2.0.18（内核 0.2.1-rc.2）**

- 非视频补丁重打 6 条 + pi-ai 4 条。
- 视频栈 14 条重建。
- 18 个插件 peer/兼容例外重签 + 24 插件实机验证。
- schemastery 3.18.5 影子清理。
- 子代理 fork 语义对齐。
- 预计：**7–10 天**，风险高。

### 路线 B：直接到 2.0.18

把第 1、2 步合并。省一次壳安装，但**第一次就在最高风险面上全部重打**，出问题难以二分定位（历史上最惨的几次升级都是这样）。不推荐。

---

## 8. 无论走哪条都必须准备的

1. 备份 `~/.dsh`（含 profile、agent-presets、storages、补丁树）。
2. 校验 43 条补丁的**可重放性**：先把快照式补丁（003/017/017c/018*/019*）转成真正的 a/b 补丁。
3. 升级前后各跑一轮完整门禁（patch-port、audit-registry、esm-syntax、plugin-imports、plugin-activation、preset-mounts、drift-scan、local-overrides、check-private）。
4. 每个阶段独立审查通过后才进入下一阶段。
5. 保留回滚：旧壳安装包 + `~/.dsh` 快照 + 补丁 manifest 的 commit 指针。

---

## 9. 建议

先做**路线 A 第 1 步**。它用最小代价把内核补到 0.2.0-rc.2（含 pi-ai 模型目录更新），同时验证"壳升级 + 补丁重打 + 门禁"这条流水线在低风险面上是否可靠。

第 2 步单独立项，先做视频栈的设计对齐（上游新架构 + pi-ai 1.1.0），再动代码。
