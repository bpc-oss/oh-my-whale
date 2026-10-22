# DSH 直接升级到 2.0.18 实施方案

- 目标：桌面壳 **2.0.16 → 2.0.18**，内核 **0.2.0-rc.1 → 0.2.1-rc.2**
- 现状：43 条补丁（40 OK / 0 TODO），24 个插件健康，默认模型 `jiyuan/deepseek-v4.1-flash-1017`
- 依据：`docs/upgrade-assessment-2.0.18.md`（本方案的所有数字来自该评估的实测）
- 原则：**每阶段独立验收通过后才进入下一阶段**；任何阶段失败都能回到上一检查点

> 这是"一步到位"路线。评估已明确它风险高；本方案的目的不是消除风险，而是把风险切成可回滚、可定位的段。

---

## 0. 阶段总览

| 阶段 | 内容 | 预计 | 风险 | 失败后的动作 |
|---|---|---|---|---|
| P0 | 预检、基线、完整备份、下载与校验 | 0.5d | 低 | 无副作用 |
| P1 | 补丁账本"可重放化"（快照补丁转真 a/b） | 1d | 低 | 回滚 git |
| P2 | 安装 2.0.18，隔离 profile 首次启动 | 0.5d | 中 | 重装 2.0.16 |
| P3 | profile 依赖对齐 + 清除 schemastery 影子 | 0.5d | 中高 | 恢复 profile 快照 |
| P4 | 非视频内核补丁重打（6 条）+ pi-ai（4 条） | 1–1.5d | 中 | 逐条撤销 |
| P5 | 视频栈重建（14 条） | 3–4d | 高 | 降级为"无视频"并记录 |
| P6 | 插件兼容（18 个 peer 失败 + 兼容例外） | 1.5–2d | 高 | 逐个禁用 |
| P7 | 壳侧补丁（P30 / P38） | 0.5d | 中 | 恢复原文件 |
| P8 | 配置与行为迁移 | 0.5d | 中 | 恢复配置快照 |
| P9 | 全量验收 + 回滚演练 | 1d | 低 | 按层级回滚 |

合计 **9–11.5 个工作日**。

---

## P0 预检与基线（0.5d）

### 动作

1. 记录基线（写入 `docs/upgrade-baseline-2.0.18.txt`）：
   - 壳版本、内核版本、289 个 `@deepseek-ai` 包版本表
   - 43 条补丁的 status 与 gate 结果（`verify-patch-port` / `audit-registry` / `plugin-activation`）
   - 24 个插件版本表、`compatibility.json` 全文
   - 当前默认模型、`agent-default-model`、`providers` 块
2. 确认无运行中的会话/后台任务；**关闭 DSH Desktop**。
3. 备份（目标 `{{AI_FILES}}\dsh-backups\upgrade-2.0.18-<UTC 时间戳>\`，先测可用空间）：
   - `%LOCALAPPDATA%\Programs\DSH Desktop\resources\app`（整目录，用于 P2 回滚）
   - `~/.dsh/profiles`
   - `~/.dsh/.agent-presets`
   - `~/.dsh/storages`
   - `~/.dsh/.credentials.yaml`（**只备份，不读取内容入日志**）
   - `~/.dsh/HANDOFF.md`、`~/.dsh/*.json`
   - `oh-my-whale` 的 `git rev-parse HEAD` 与未提交状态
4. 下载并校验：
   - `DSH-Desktop-2.0.18-x64-Setup.exe`
   - **同时下载 2.0.16 安装包**（回滚用）——若官方仍提供；否则保留 `resources\app` 副本作回滚源
   - `SHA256SUMS.txt`，`sha256sum -c` 必须全部 OK

### 退出标准
- 备份可读（抽样校验文件数/大小）
- 两个安装包的 SHA256 与官方公布一致
- 基线文件已入库（whale 仓库）

### 独立审查点
审查者必须亲自核对：备份路径真实存在且体积合理、SHA256 与 GH release assets 一致、基线数字与当前机器一致。

---

## P1 补丁账本"可重放化"（1d）

### 问题
`patches/host/003`、`017`、`017c`、`018`、`018b`、`018c`、`019`、`019b` 不是 `a/b` 补丁，而是 `diff 快照`（头为 `pi-ai-original-reconstructed.js` 等）。它们无法在换机/重建时重放。

### 动作
1. 对每个快照补丁，用**当前 0.2.0-rc.1 树**重建基线：
   - 从当前文件反向应用"我们加的那段"，得到 pristine 副本
   - 生成标准 `--- a/<pkg>/... +++ b/<pkg>/...` 补丁
2. 若无法反向还原（缺少 pristine），以 npm 上同版本包为基线重新生成。
3. 更新 manifest：`patchFile` 指向新补丁；删除/归档旧快照文件。
4. 校验：把每条新补丁 dry-run 到**当前**文件，必须 `APPLIES`。

### 退出标准
- 43 条补丁中，`ported` 的 35 条全部满足：`patch -p1 --dry-run` 在当前树上成功
- `verify-patch-port` 仍为 `OK 40 / TODO 0`

### 独立审查点
抽样 5 条（含 003/017c/019b），审查者自己 dry-run，确认"快照变真补丁"没有丢 hunk。

---

## P2 安装 2.0.18 并隔离启动（0.5d）

### 动作
1. 运行 `DSH-Desktop-2.0.18-x64-Setup.exe`（同目录覆盖安装）。
2. **不要直接启动 `web` profile**。先让应用处于恢复/隔离状态：
   - 若壳支持恢复模式：进入恢复模式
   - 否则先用 `desktop` 或一个全新的 `verify` profile 启动
3. 校验版本：
   - `resources/app/package.json` → `2.0.18`
   - `resources/app/node_modules/@deepseek-ai/dsh/package.json` → `0.2.1-rc.2`
4. 记录旧壳被替换后的实际目录结构变化（`lib/` 下的哈希文件名清单）。

### 退出标准
- 壳与内核版本正确
- 主进程能起来（不要求 profile 插件全绿）
- 已记录新 `resources/app/lib/` 文件清单（供 P7 用）

### 失败动作
- 用 P0 保留的 `resources\app` 副本恢复，或重装 2.0.16

### 独立审查点
审查者确认：版本号、安装路径、是否残留两个壳、旧壳是否被删除。

---

## P3 profile 依赖对齐 + 影子依赖（0.5d）

### 动作
1. `profiles/web/package.json`：
   - `@deepseek-ai/dsh-client-ui-subagent` → `^0.2.1-rc.2`
   - `@deepseek-ai/dsh-subagent-codex` → `^0.2.1-rc.2`
   - `@deepseek-ai/dsh-subagent-claude-code` → `^0.2.1-rc.2`
   - `@deepseek-ai/dsh-workflow` / `dsh-workflow-ptc` → `0.2.1-rc.2`（当前精确锁 0.2.0-rc.1）
2. 清除 `profiles/web/node_modules/@deepseek-ai/schemastery`（3.18.1 影子）。
3. 用新版内核自带的 pnpm 重新安装；确保：
   - 内核 `schemastery` 3.18.5
   - `dsh-better-sidebar` 内嵌 schemastery 升到 3.18.5（或改为不内嵌、由内核提供）
4. 删除 `dsh-client-ui-subagent.stale-rc8` 等陈旧别名（确认无引用后）。

### 退出标准
- `pnpm ls @deepseek-ai/schemastery` 在 profile 内只有一个可解析来源且为 3.18.5
- 无 `field.volatile is not a function` 类加载错误
- profile `pnpm install` 退出码 0

### 独立审查点
审查者必须自己跑 `node -e "require.resolve(...)"` 或等价检查，确认运行时解析到 3.18.5，而不是只看 package.json。

---

## P4 非视频内核补丁重打（6 条）+ pi-ai（4 条）

### 清单
| 补丁 | 目标 | 关键变化 |
|---|---|---|
| P1 | cordis-plugin-loader | 环守卫；新 loader 1.0.6 |
| P4 | dsh-session | known events 白名单；文件增大 5% |
| P6 | dsh-goal | 验证缝；偏移 1 行 |
| P16 | dsh-subagent | **语义变化**：子代理改为立即返回 child ID，fork 需对齐 session/wait |
| P16b | dsh-subagent/package.json | 包标记 |
| P43 | dsh-llm-pi-ai | tool_call id 改写（锚点含已消失的 video 上下文，重新锚定） |
| P3 | pi-ai | bai 兼容（isDeepSeek / developerRole） |
| P17c | pi-ai | openai-completions video wire |
| P22 | pi-ai | responses API video_url（0.87.1 可直接套用，1.1.0 需重打） |
| P23 | pi-ai | 工具结果媒体收集器 |

### 动作
1. 以新版文件为基线，逐个重新生成补丁（先读新代码，再打，不照搬行号）。
2. P16 先写一页"新子代理契约对照"（旧：阻塞返回结果；新：立即 child ID + session/wait），再改代码。
3. 每改完一条：`node --check` → dry-run 往返 → 更新 manifest → 跑 `verify-patch-port`。

### 退出标准
- 10 条全部 `APPLIES` 且 gate 为 OK
- `esm-syntax` 0 错
- 用隔离 profile 启动，无插件加载失败

### 独立审查点
审查者逐条比对"补丁意图 vs 新代码语义"，重点审 P16：不是能打上就算过，要确认新契约下路由仍正确。

---

## P5 视频栈重建（14 条，3–4d）

### 必须先做的设计（0.5d）
写 `docs/video-stack-0.2.1.md`，明确新架构下每个能力落在哪：
- 模型能力声明（video 输入）
- 工具结果里 video 块的产生（`read_image`）
- 传输层编码（`video_url` / responses API）
- 无 video 能力模型 → 抽帧降级
- 历史里旧视频的卸载策略
- token 计价

### 重建顺序
1. `dsh-llm`：`contentHasVideo`（P19）
2. `dsh-llm-pi-ai`：MODALITIES、gating、routing、抽帧、卸载（P17/P19b/P20/P25/P39）
3. `pi-ai`：completions / responses 的 video wire（P17c/P23/P22）
4. `dsh-tool-fs`：`read_image` 返回 video 块（P21）
5. 客户端：会话/附件/侧栏预览（P18b/P18c/P37）
6. `dsh-token-meter`：video 固定计价（P24）

### 测试（必须自动化，不能只看"能跑"）
- `read_image` 读 mp4 → 返回 `type:"video"` 块，data URL SHA256 与源文件一致
- 有 video 能力的模型 → 请求体出现 `video_url`；无能力 → 走抽帧且不报错
- 工具结果媒体收集器不再静默丢弃 video
- 历史多条视频 → 只保留最新，旧的被卸载
- 计价：video 块按固定 4096 tokens

### 退出标准
- 上述 5 项测试全过
- 用本地 GLM-5.3-Flash-EXL3 实机跑一次"读 mp4 并描述内容"
- gate 14 条为 OK

### 失败动作
- 若 3.5d 内未完成，**降级**：保留"图片能力 + 抽帧"，把 video 原生支持标为已知缺失并登记，不阻塞整体升级。此为唯一允许的降级项，需你确认。

### 独立审查点
审查者必须自己跑至少 2 项测试，并检查"无能力模型不会被误判为不支持"。

---

## P6 插件兼容（18 个，1.5–2d）

### 三类处置
| 类型 | 处置 |
|---|---|
| 官方包（workflow / subagent-codex / claude-code / client-ui-subagent） | 升到 0.2.1-rc.2 |
| 自研插件（governance / routed-subagent / better-sidebar / bash-terminal / token-meter-hermes / full-remote / litkit / super-injector 等） | 改 peer 范围 + 实机验证；能加 `engines.dsh` 的加上 |
| 第三方不可控（openpencil / genui / bpc-oss / dsh-plugin-manager 等） | 先试加载；不行则加 `compatibility.json` 例外并记录理由 |

### 重点检查
- `web-billing`：输入统计拆成 `activity` / `usage`，确认注册 ID 已适配
- `super-injector`：子路径插件不再读独立 `package.json`，确认入口导出完整
- `governance`：是否使用被移除的 `invariant` 导出
- `routed-subagent`：子代理 child ID 契约
- `better-sidebar`：schemastery 3.18.5 + 新版 client-ui-slots 扩展位
- `chrome-faithful`：MCP 子进程在新壳下能否 spawn

### 退出标准
- `verify-plugin-activation` 24 个全健康
- 每个插件至少触发一次真实功能（不是只看加载成功）
- `compatibility.json` 中所有例外都指向 0.2.1-rc.2 且有原因

### 独立审查点
审查者抽查 5 个插件，自己触发功能，不接受"日志无错误"作为通过标准。

---

## P7 壳侧补丁（P30 / P38，0.5d）

### 动作
1. P30：`lib/updates.js` — 确认文件仍存在；重新打"更新默认关闭"。
2. P38：`lib/module-resolution-<hash>.js` — **哈希文件名每次构建都变**：
   - 在 `resources/app/lib/` 中定位新文件名
   - 重新打补丁
   - 更新 manifest 的 `target` 与 gate 的 `files`
3. 检查是否还有其他依赖哈希文件名的补丁。

### 退出标准
- 两个补丁在新壳上生效（用行为验证：更新检查被禁用；profile 外模块可解析）
- gate 的 `UPSTREAM` 计数不增加

---

## P8 配置与行为迁移（0.5d）

| 项 | 动作 |
|---|---|
| `compatibility.json` | 键从 0.2.0-rc.1 改为 0.2.1-rc.2，逐条复核 |
| 默认模型 | 保持 `jiyuan/deepseek-v4.1-flash-1017`；确认新内核不会移除该自定义 provider |
| `toolDisplay` | 本机未使用 `both`，无需迁移（复核） |
| `agent-instructions` | 本机未用逐行 `dshHome`（复核） |
| API Key 优先级 | 确认自定义 provider 仍从 `.credentials.yaml` 读取 |
| 自动化任务 | 旧实验组合包自动清理，确认现有定时任务仍在 |
| `agent-presets` | 检查 `seedLength` / fork 相关字段在新内核下的语义 |

### 退出标准
- 默认模型可用
- 凭据读取正常
- 无启动期配置告警（除已知无害项）

---

## P9 全量验收与回滚演练（1d）

### 门禁（全绿才收）
```
verify-patch-port        (期望 43 条 0 TODO)
audit-registry
esm-syntax-check
check-plugin-imports
verify-plugin-activation  (24)
audit-preset-mounts
drift-scan               (CLEAN)
local-overrides/verify.ps1
check-private
audit-compatibility
```

### 实机验收清单
- [ ] 新建对话、恢复旧对话、切换模型
- [ ] 子代理（routed / codex / claude-code）
- [ ] 视频：读 mp4 并描述
- [ ] MCP：chrome-faithful 工具可调用
- [ ] better-sidebar 左右栏、文件预览
- [ ] web-billing 计费与统计
- [ ] 定时任务
- [ ] 重启后配置不丢（模型、凭据、插件）

### 回滚演练（必须做一次）
1. 停应用
2. 恢复 `profiles/web` 快照
3. 恢复 `resources\app`（或重装 2.0.16）
4. 启动，确认回到基线

### 退出标准
- 门禁全绿 + 验收清单全过 + 回滚演练成功

---

## 回滚层级

| 层级 | 触发条件 | 动作 | 影响 |
|---|---|---|---|
| L0 | 单个补丁打错 | `git checkout` + 重新生成 | 无 |
| L1 | profile 起不来 | 恢复 `profiles/web` 快照 | 丢失升级期 profile 改动 |
| L2 | 壳起不来 | 恢复 `resources\app` 或重装 2.0.16 | 回到 2.0.16 |
| L3 | 全崩 | 恢复整个 `~/.dsh` 快照 | 回到升级前，可能丢升级后新会话 |

**升级期间产生的新会话**不保证能回滚后继续使用（内核数据格式可能有迁移）。升级前应告知并确认。

---

## 中止条件（必须提前约定）

1. P2 后 2 次尝试仍无法启动 → 回滚 L2，停止升级。
2. P3 影子依赖无法在不改插件源码的前提下解决 → 回滚 L1，重新设计。
3. P5 超过 3.5d 且 5 项测试未全过 → 按"降级项"处理（需你确认）。
4. P6 中超过 5 个插件无法恢复 → 暂停，逐个评估是否放弃该插件。

---

## 需要你确认的三件事

1. **升级期新会话可否牺牲**：回滚会丢失升级后产生的会话数据格式兼容性。
2. **视频栈若超时是否允许降级**（保留抽帧、暂不做原生 video）。
3. **2.0.18 是最后一个稳定版**，之后是 NEXT；本次升级是否要同时评估 NEXT 线（不建议同批做）。

---

## 审查要求

本方案必须经过独立审查，审查者需自行验证而非采信本文数字，重点挑战：

- 阶段顺序是否有"后置依赖"（例如 P5 依赖 P4 的 P17c，顺序是否成立）
- 是否存在漏掉的补丁/插件（43 + 24 是否穷尽）
- 回滚是否真的可行（`resources\app` 副本在新壳安装后是否还能用）
- 时间估算是否过于乐观
- 中止条件是否可判定
