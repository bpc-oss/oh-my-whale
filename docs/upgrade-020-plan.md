# DSH 升级方案：内核 0.1.5-rc.1 → **0.2.0-rc.1**（rev.2，独立审查 NEEDS_REWRITE 后返修）

> 版本：rev.2（2026-09-29）。rev.1 经独立审查判定 NEEDS_REWRITE（3 BLOCKER / 4 MAJOR / 3 MINOR），本版逐条返修，见 §9 返修对照。
> 状态：**待二审**。执行前必须过二审；每阶段独立验收、独立回滚。
> 取证：`~/.dsh/tmp/upg017/`（`replay2.py` + `replay-0.2.0-rc.1.json`、`delta-final.py`、官方壳解包 `app64/`、`kernelprobe/`）。

## 1. 目标与既定决策

- **目标内核 `0.2.0-rc.1`**（09-28 发布，npm `next`）。用户 2026-09-29 明确"要最新的"。
- **壳保持 2.0.9**：官方壳 0.10.0 内置 0.1.7-rc.2（低于目标），且架构不同（散文件），换壳=降级+作废 asar 重打包管线。延后单独立项。
- 保持 37 项主机补丁 + 8 项 vendor 补丁 + profile 配置 + junction 农场能力不丢。

## 2. 取证结论

### 2.1 版本矩阵

| 版本 | 发布 | 标签 | 关系 |
|---|---|---|---|
| 0.1.5-rc.1 | 09-10 | — | 当前基线 |
| 0.1.7-rc.2 | 09-24 | `latest` | 官方壳 0.10.0 内置版 |
| **0.2.0-rc.1** | **09-28** | `next` | **目标** |

### 2.2 0.1.7-rc.2 → 0.2.0-rc.1 的真实差异（rev.1 此节结论作废）

**rev.1 的"仅 7 个 JS 文件变动、补丁面额外成本≈0"是错的**，成因已查明：批量比对按"两版元包**直接依赖**交集"取样，而 `dsh-session`、`dsh-llm-deepseek`、`dsh-client-ui-conversation` 在 **0.1.7-rc.2 与 0.2.0-rc.1 两版元包中都不是直接依赖**（二审 registry 直查确认），因此从未进入取样范围。

按包名直接比对（含传递依赖）后的**已核实变动**（`delta-authoritative.json` + 逐文件直验）：

| 包 | 文件 | 我们的补丁 |
|---|---|---|
| dsh-session | lib/index.js | **P04 + P26** |
| dsh-session | lib/types/index.js | 同包（P04/P26 同文件族，Phase 1 一并复核） |
| dsh-session | lib/types/repair.js | 同上 |
| dsh-llm-deepseek | lib/index.js | **P17b** |
| dsh-client-ui-conversation | lib/client.js | **P18b** |
| dsh-subagent | lib/typert.host.js | 非补丁目标（全仓无补丁触及 typert.host.js；P18 实际目标是 dsh-host-apiproxy/lib/index.js） |
| dsh-goal | lib/typert.host.js | 非补丁目标（**P06 打的是 lib/index.js，二者不同文件**） |
| dsh-app-boot | lib/index.js | — |
| dsh-cordis-client-runner | lib/client.js | —（Phase 4 关注：客户端加载链） |
| dsh-session-reference | lib/typert.host.js | — |
| dsh-terminal-bash | lib/index.js | — |
| dsh-tool-cordis | lib/types/api-catalog.js | — |
| dsh-workflow-ptc | lib/index.js | — |

**结论**：0.2.0 相对 0.1.7 **并非零成本**——13 个变动文件全部落在**我们的补丁目标包**上（3 个内核包 + 1 个壳侧包，见 §3）：dsh-session、dsh-llm-deepseek、dsh-client-ui-conversation 三个内核包的文件被改动，dsh-subagent 的 typert.host.js 变动不影响我们。我们直接以 0.2.0-rc.1 为唯一目标（不做 0.1.7 中转），这些包的补丁按 0.2.0 重写即可；"额外成本≈0"的说法删除。

### 2.3 官方桌面壳（结论：不换，已复核）

- 官方 0.10.0（09-26，ModelScope）**内置内核 0.1.7-rc.2**（`kernelprobe/package.json` 实测）——低于目标。
- 架构不同：`app64/app.asar` = 6.5MB，内核为散文件 `resources/app.asar.unpacked/node_modules/`；我们 2.0.9 内核打包进 162MB asar 并关 fuse。
- `dshdesktop.cn` 在本机解析到黑洞 IP `198.18.0.196`，壳的自动更新在本机从来不可用。

### 2.4 补丁重放实测（对 0.2.0-rc.1，54 个产物）

| 判定 | 数量 | 性质（rev.2 重新归类） |
|---|---|---|
| APPLIES | 16 | 直接重放：P02、P07、P09、P13、P18(合并体)、P10、P14、P15、P22、P26、**P27、P28**（+ 旧 .patch 副本） |
| **UNMEASURED**（原误标 GAP） | 8 | **不是"包没了"**：017/017b/018b/018c/019/019b 的 `host/*.patch` 头是**绝对 Windows 路径**（019b 甚至是 `pi-ai-p17-base.js` 相对名 + `/c/Users/...` 混合），任何树都定位不到；其 `.diff` 孪生体实测为 **CONFLICT**，证明目标文件在 0.2.0 树中存在。P30 = 脚本显式跳过壳内 `lib/updates.js`（**未测**）；P05 = 本地 profile 插件不在 npm（**不适用**）。 |
| CONFLICT | 30 | 需逐项重写 |

**复测要求（Phase 1 前）**：把 `host/*.patch` 的路径头归一化为 `a/<pkg>/<rel>`、`b/<pkg>/<rel>` 后重跑重放，才能得到这 6 项的真实判定。

### 2.5 命门：会话格式迁移（P27/P28）

实测 0.1.7-rc.2 与 0.2.0-rc.1 的 `dsh-session-format-v2-to-v3/lib/index.js`（36,092B）**均不含**我们的 kind（`video`/`instruction-hint`/`provider`/`fallback`/`jspace-frame`/`ai-tube-mission`/`verifier-guide`），且 P27/P28 干净 APPLIES。→ 保留并优先重写验证；历史会话能否打开全看它们。

## 3. 资产边界（rev.1 缺失，审查 MAJOR-3）

| 类别 | 补丁 | 换内核时是否需动 |
|---|---|---|
| **内核包**（在 asar 内、随内核换装） | P01–P04、P06、P07、P09、P11–P17b、P19–P26、P29 | **是** |
| **壳侧/客户端包**（在 asar 内、但不是 dsh 元包依赖，随壳代码一同分发） | **P31**、**P37**、**P08**、**P10**、P17c | **取决于装配基线**（见下方） |
| **profile 侧**（我们自己的插件/配置） | P05（super-injector）、`profiles/web` 全部改动、V1–V8 | **否**（但 V5/V6 内嵌 dsh-subagent 副本 → 需 Phase 2.5 验证） |

**装配基线（rev.3 新增，回应二审 M3）**：实测 2.0.9 的 `app.asar.unpacked/node_modules` 只有 8 个原生目录、**没有任何 @deepseek-ai**——内核与壳侧包全部打包在 app.asar 内。因此"壳侧包换内核不动"没有物理依据。Phase 2 的组装规则定为：**
- 内核包**（上表第一行）→ 取 0.2.0-rc.1 的 npm 原件；
- 壳侧包**（上表第二行）→ 二选一并在 Phase 2 前定案：(a) 取自当前 2.0.9 asar（保持壳侧代码不动，只换内核），或 (b) 取自 0.2.0-rc.1 对应包（与内核同版本）。推荐 (a)，因为 P31/P37/P08/P10 是为 2.0.9 壳的代码结构写的；
- `newtree_020rc1` 只含 26 个补丁目标文件，**不是完整内核树**；完整 0.2.0-rc.1 树须由 Phase 2 另行获取（npm 全量或以现装 asar 为底逐包替换）。

## 4. 补丁处置矩阵（rev.2：补 P01/P03 与 V1–V8）

| 处置 | 条目 |
|---|---|
| 直接重放 | P02、P07、P09、P10、P13、P14、P15、P18(合并体)、P22、P26、P27、P28 |
| **必须重写（rev.3 定稿）** | **P01**（cordis-loader 环防护）、**P03**（pi-ai bai 兼容）、P04、P06、P11、P12、P16、P16b、**P17b/P18b/P18c/P19/P19b（其 .diff 孪生体实测 CONFLICT＝已测量）**、P20、P21、P23、P24、P25、P29 |
| 壳侧资产（随壳分发，随 §3 装配基线决定是否重验） | P08、P10、**P31**、**P37** |
| 归一化后复测（rev.3） | P30（壳内 lib/updates.js，脚本显式跳过＝未测，且是 m2 的真闸门）、P05（本地包不在 npm＝不适用）、8 个路径头损坏的 `host/*.patch`（含 017c、018：其 `a/` 侧是**重建文件**而非上游原件，须先校验再测） |
| **vendor 补丁（rev.2 补入）** | V1–V4（证据类）、**V5/V6**（插件内嵌 `@deepseek-ai/dsh-subagent` 副本 → 必须随新内核复核）、**V7**（dsh-better-sidebar）、**V8**（profiles 内 symlink 插件） |
| 待判定（官方已原生化则删） | P17c、P22、P26 视新内核行为而定 |

## 5. 阶段计划（Phase 2.5 为 rev.2 新增）

### Phase 0 — 基线冻结与回滚包
- `~/.dsh/backups/pre-upgrade-020-<ts>/`：装机 asar + unpacked + resources、runtime 树清单与哈希、profiles/web 配置与 **junction 目标清单**、verify/drift/doctor 报告。
- 门禁：哈希校验通过；drift CLEAN；verify 双源 FAIL=0。

### Phase 1 — 补丁重写（离线）
- 0.1 归一化 **8 个**路径头损坏的 `host/*.patch`（017、017b、017c、018、018b、018c、019、019b）并重跑重放。规则：路径头改写为 `a/<pkg>/<rel>`、`b/<pkg>/<rel>`，且**必须校验 `a/` 侧内容与 0.2.0-rc.1 上游原型逐字节一致**——017c/018 的 `a/` 侧是 `*-original-reconstructed.js` 重建文件，直接用会产出假 APPLIES。归一化后 `.patch` 降为归档，**以 `.diff` 为权威源**。
- 0.2 逐项重写 CONFLICT；每项记录官方是否已原生实现、等价性论证。
- 0.3 复核 V1–V8（尤其 V5/V6 内嵌副本）。
- 门禁：新基线 `git apply --check` 全绿；**产物以 `--strip-trailing-cr` 生成并通过 CR 容错检查**（rev.1 遗漏，MINOR-3）；ESM 解析校验（禁 CJS 盲区）；独立审查补丁矩阵。

### Phase 2 — 内核换装
- 由 0.2.0-rc.1 的 newtree 组装新 asar（`pack-209` 管线，brace + `{/**,}` unpack 模式），装入装机目录（fuse 保持关闭），同步 runtime 树。
- 门禁：包头对头差异白名单、unpacked 哈希一致、启动无 boot 失败。

### Phase 2.5 — junction 农场与 vendor 插件换装后重验（rev.2 新增）
- 审计 `profiles/web/node_modules` 全量 junction/symlink 的目标解析（是否仍指向有效 runtime 树；V5/V6 内嵌 dsh-subagent 副本是否需重建；V7/V8 插件是否仍能加载）。
- 门禁：0 断链；V1–V8 逐项实机确认。

### Phase 3 — 运行时三绿
- `verify -Source asar-root|installed`、`profile verify` 全绿；`drift-scan` CLEAN；桌面版无 boot 失败、43120 监听、会话可开。
- 门禁：FAIL=0。

### Phase 4 — profile 与客户端插件兼容
- 8 个 client-runtime 依赖包实机验证（bash-terminal、better-sidebar、super-injector、vision-toolkit、plugin-manager、genui、openpencil、verification、litkit）；P08（子代理 UI）；0.2.0 变动的 `dsh-cordis-client-runner` 对客户端加载链的影响。
- 门禁：实机记录 + 截图。

### Phase 5 — 会话历史回归（命门）
- `scan_sessions2b.py` 全量扫描会话投影；重点 P27/P28 覆盖的 kind。
- 门禁：零新增"历史加载失败"；抽样点开 5 类 kind。

### Phase 6 — 独立审查与收尾
- 审查整体升级（补丁等价性、回滚可用性、验证覆盖）；更新账本与本文档。

## 6. 风险登记（rev.2 修订）

| 风险 | 级别 | 缓解 |
|---|---|---|
| 目标为**预发布**（`next`），无官方壳配对 | 高 | 分阶段回滚 + Phase 0 快照先成立；**双轨判据**：0.2.0 正式版发布日复评。自动更新闸门 = **P30**（updates 默认关闭）——该补丁当前在 UNMEASURED 桶（壳内 lib/updates.js 未测），**P30 归一化复测通过前视为闸门未建立，全程不得放开**（注：壳自研更新通道在本机从来不通，此处管的是配置层闸门而非网络通道） |
| 会话历史成片打不开（P27/P28） | 高 | 优先重写 + Phase 5 全量扫描 |
| 4 个补丁目标包在 0.1.7→0.2.0 有改动（§2.2） | 中 | 直接以 0.2.0 为唯一目标重写；不做 0.1.7 中转 |
| V5/V6 内嵌副本与新内核语义不符 | 中 | Phase 2.5 专项 |
| 补丁重写引入行为漂移 | 中 | 等价性论证 + 独立审查；能删则删 |
| 壳长期停留 2.0.9 | 中 | 官方跟进 0.2.0 后单独立项换壳 |

## 7. 验证矩阵

1. 包级：头对头差异白名单、unpacked 哈希、ESM 解析、CRLF 容错。
2. 补丁级：manifest 齐、`git apply -R --check` 过、verify 三绿。
3. 运行级：桌面版无 boot 失败、会话可开、工具可用、子代理可派。
4. 数据级：全量会话投影零新增失败。
5. 回滚级：任一阶段可独立回到 Phase 0 快照。

## 8. 未决问题

- 0.2.0 正式版发布日 → 复评是否切换（双轨判据）。
- 归一化路径头后，6 项视频补丁的真实判定 → Phase 1 回填。
- 官方壳跟进 0.2.0 的时点 → 评估 T3 换壳。

## 9. 对 rev.1 审查意见的返修对照

| 审查发现 | 处置 |
|---|---|
| BLOCKER-1 §2.2 结论被证伪 | **接受**：查明成因（元包直接依赖交集漏掉传递依赖包），重写 §2.2，删除"额外成本≈0"，列出已核实的 4 个补丁目标包变动 |
| BLOCKER-2 §4 漏 P01/P03 | **接受**：§4 补入（二者均 CONFLICT） |
| BLOCKER-3 V1–V8 零处置 | **接受**：§4 补 vendor 行 + Phase 2.5 专项 |
| MAJOR-1 GAP 是伪信号 | **接受**：§2.4 重新归类为 UNMEASURED/未测/不适用，并给出归一化复测方法 |
| MAJOR-2 P06 归因错误 | **接受**：§2.2 表中标注 dsh-goal 变的是 typert.host.js，P06 打的 index.js 未变 |
| MAJOR-3 P31/P37 判据错位 | **接受**：新增 §3 资产边界表，P31/P37 移出内核重写范围 |
| MAJOR-4 junction 无换装后校验 | **接受**：新增 Phase 2.5 |
| MINOR-1 P18/P22 分类 | **接受**：P18 归入"直接重放（合并体）"、P18b 归入"重新定位"；P22 只留"直接重放"一处 |
| MINOR-2 预发布缓解 | **接受**：风险表加双轨判据 + 禁用自动更新通道 |
| MINOR-3 CRLF 未进门禁 | **接受**：Phase 1 门禁加 `--strip-trailing-cr` 与 CR 容错 |

### 二审（APPROVE_WITH_FINDINGS）返修

| 二审发现 | 处置 |
|---|---|
| M1 §2.2 缺 dsh-session/lib/types/{index,repair}.js | **接受**：已补入事实表 |
| M2 dsh-subagent/typert.host.js 误标为 P18；补丁目标包 4→3 | **接受**：改标非补丁目标，结论改为 3 内核包 + 1 壳侧包 |
| M3 §3 自相矛盾；壳侧包"不动"无物理依据；Phase 2 组装基线未定义 | **接受**：资产边界去重，新增**装配基线**规则（内核包取 0.2.0 原件；壳侧包推荐取自现装 2.0.9 asar 保持壳侧代码不动；newtree 仅 26 文件不是完整树） |
| M4 P08 双列；P17b/P18b/P18c/P19/P19b 应入"必须重写"；018-host-apiproxy-video 与 P18 分类未处理 | **接受**：矩阵去重，视频五项移入必须重写（.diff 孪生体已测=CONFLICT）；P18 归入壳侧资产 |
| m1 路径头损坏实为 8 个且含重建文件 | **接受**：Phase 1 门禁加"a/ 侧须与 0.2.0 上游原型逐字节一致"校验，`.patch` 降归档、`.diff` 为权威源 |
| m2 双轨判据空转 | **接受**：闸门改为 P30，且 P30 复测通过前视为未建立 |
| m3 根因表述错误（并非"转为传递依赖"） | **接受**：改为"两版元包中均非直接依赖，rev.1 取样漏掉" |
