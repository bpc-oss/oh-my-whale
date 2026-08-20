# DSH 大升级方案：壳 v2.0.1 + 内核 rc.8（一劳永逸版）

> 目标：① 桌面壳 v0.1.0 → **DSH Desktop v2.0.1**（官方改名+重构壳）；② 内核 rc.7 → **rc.8**；
> ③ 建立**可持续升级机制**（补丁生命周期 + 标准化流程），未来 rc.9/rc.10 全部走同一套流程。
> 2026-08-20 首版；v2（修复首审 5 MAJOR + 6 MINOR）；**v3（修复二审 N1–N5）**；**v4（修复三审 NF-1~NF-5，三轮审查全部 APPROVE_WITH_FINDINGS 且非阻塞，可执行）** ★=修复项

---

## 0. 为什么现在升、升什么

### 0.1 情报（2026-08-20 实测）

| 组件 | 现状 | 官方最新 | 差异 |
|---|---|---|---|
| 桌面壳 | v0.1.0（DeepSeek Harness 0.1.0.exe） | **DSH Desktop v2.0.1**（8/18，NSIS 安装器） | 改名 + 重构：托盘更新检查、回滚助手、插件市场、内置 Node/pnpm/CLI、日志到 `%APPDATA%\DSH Desktop\logs`、**Windows 闪退修复** |
| 内核 | rc.7（手工替换进壳） | **0.1.0-rc.8**（npm 已发布） | 直接依赖 76 个（62 prod + 14 dev）全 rc.8，**整树 588 包** ★；`cordis` ^4.0.1、`cordis-plugin-loader` ^1.0.2、`pi-ai` ^0.82.1 **版本均未变**（补丁 P1/P2/P3 直接迁移） |
| dsh-session | rc.7（含我们补的 2 事件） | rc.8 | **实测 rc.8 不含** verification/change + continuous-worker/change → P4 必须重打 |

> ★ M4 修正：0.1b 中"76 依赖"= dsh 包**直接依赖**（62 prod + 14 dev），非整树；rc.7 lockfile 实为 **588 包**整树。补丁结论（P1/P2/P3 版本未变）不受影响。

### 0.2 升级收益

- 官方修复 Windows 闪退（我们 8/14–8/20 反复踩的坑）
- 回滚恢复助手（插件/模型搞崩后自救，未来少求人）
- 插件市场 + 官方插件规范 → 插件安装标准化
- 内置 pnpm/Node → 不再依赖全局 pnpm 环境
- rc.8 是官方当前主线，早晚要跟，现在环境最干净、备份最全

### 0.3 风险总览（先看结论）

| 风险 | 等级 | 缓解 |
|---|---|---|
| 壳路径变化：`C:\Program Files\DeepSeek Harness\` → 可能 `DSH Desktop\` | 中 | 升级前实测 NSIS 安装路径，HANDOFF/补丁脚本/oh-my-whale 模板全部变量化 |
| 壳重构改变 resources 布局（内置 node/pnpm 后 host 路径可能变） | 中 | 装完先实测结构再动内核 |
| 内核 rc.8 不兼容我们的 5 补丁 | 低 | 版本未变（0.1b 表）→ dry-run 验证；P4 重打 |
| 插件与 rc.8 不兼容（官方提示"部分插件暂未适配"） | 中 | 官方提示挂在"更新上游到 rc7"条目下 → 指 rc.5 用户路径（v0.1.0→v2.0.1）；我们已在 rc.7，插件已适配 rc.7，rc.8 需逐个冒烟 |
| profile 数据（~/.dsh）被壳改动 | 低 | 数据目录不变（日志走 %APPDATA%，profile 仍 ~/.dsh）；升级前全量快照 ★ |
| 升级过程失控无法回滚 | 低 | 双保险：整树备份 + node_modules.rc7 保留 + **v0.1.0 安装包留存** ★ |
| 壳升级时并发写 session 竞态 | 低 | 先正常退出桌面版 + 确认无 CLI 残留实例再升级 ★ |

---

## 1. 可持续升级机制（先立规矩，再做事）

> 这就是"一劳永逸"的核心：**每次升级 = 跑同一套 5 步流程 + 更新一张补丁处置表**。
> 机制落地为 oh-my-whale 的 `docs/upgrading.md` + `scripts/` 脚本（后续 Phase 5 固化）。

### 1.1 标准升级流程（每次升级走一遍）

```
STEP 1 准备与基线
  - 当前版本全树备份 → backups/host-<ver>-<date>/（含 sha256 清单）
  - capture 当前补丁（逐补丁指定 diff 对，见 §2.1；校验 .patch 非空）★
  - 记录版本基线表（0.1b）快照到 manifest.json
  - 确认回滚路径（保留旧树 + 旧安装包）

STEP 2 评估新版本
  - 拉官方 release notes（changelog）
  - 对照补丁处置表：官方是否修了我们的补丁点？（版本号变化 = 需要 diff 验证）
  - 输出《升级影响评估》：每个补丁 继续/迁移/退役

STEP 3 执行升级
  - 壳升级（NSIS 安装）→ 实测安装路径/resources 布局 → 记录到 HANDOFF
  - 内核升级（npm 整包安装 rc.x）→ 保留旧树 node_modules.rc<old>
  - 补丁迁移：dry-run → 逐个 apply → node --check

STEP 4 配置与插件迁移
  - settings.yaml / cordis.patch.yml / package.json 逐项核对
  - 插件 bundle 列表 diff（rc.x 增删的包）
  - gateway / super-injector 重建

STEP 5 验证矩阵（全绿才算完成）
  - boot 无 pending 无报错
  - 8 组模型全在（llm.models API）
  - 旧会话回归（scan-others.mjs 0 FAIL）
  - 工具 schema 合法（defineTool 检查）
  - 关键插件冒烟：billing / verification / chrome / voice / worker
  - bai + deepseek 各发一条真实消息
  - 桌面版 + dsh web 双端验证
  - 回滚预案演练（模拟一次恢复，确认备份可用）
```

### 1.2 补丁处置表（升级评估的核心工具）

| 补丁 | 目标文件（完整 scope）★ | 官方修复信号 | rc.8 评估（2026-08-20） |
|---|---|---|---|
| P1 loader 防环 | `@deepseek-ai/cordis-plugin-loader/lib/index.js` | loader 版本 >1.0.2 或 EntryGroup 重构 | loader 仍是 ^1.0.2 → **继续，直接迁移** |
| P2 cordis gpd 缓存 | `@deepseek-ai/cordis/lib/index.js` | cordis 官方性能优化 | cordis 仍是 ^4.0.1 → **继续，直接迁移** |
| P3 pi-ai bai 特判 | `@earendil-works/pi-ai/dist/api/openai-completions.js` | pi-ai 原生支持 bai | pi-ai 仍是 ^0.82.1（caret 锁 <0.83.0）→ **继续，直接迁移** |
| P4 dsh-session KNOWN | `@deepseek-ai/dsh-session/lib/index.js` | rc.x 内置两事件 | **rc.8 实测未内置** → 重打（数组仍在 ~1069 行，手工插 2 行） |
| P5 gateway 集成 | super-injector（profile 树） | 与内核无关 | **不受影响**，随 profile 走 |

> 每个补丁头部元信息固定格式：`# Target / # DSH version / # Purpose / # Status: active|retired|pending`。
> 官方修了的补丁 → `retired`（存档不删，留审计）。

### 1.3 升级节奏建议

- 内核 rc 发布后**等 1–2 周**（观察社区反馈），再走流程
- 壳大版本（如 v3）同理，先看 release notes 有无 breaking
- 升级窗口选在**插件低活动期**（避免并发写 session 竞态）
- 每次升级后更新 HANDOFF §8 升级记录段 + oh-my-whale 版本基线

---

## 2. 本次升级执行计划

### Phase A：升级前准备（预估 1.5h）

1. **全树备份**：`C:\Program Files\DeepSeek Harness\resources\host\node_modules`（rc.7 补丁后状态）→ `backups/host-rc7-20260820/` + 生成 sha256 清单。★ 实测确认：既有备份目录 `host-rc5-20260818-132935` 的 node_modules 是 **rc.5 树**（仅含 rc7 lockfile），rc.7 树尚无整树备份，必须先补。
2. **补丁捕获（逐补丁指定 diff 对，校验 .patch 非空）** ★：
   - 全部使用 `diff -u`（unified 格式，`git apply` 兼容；plain diff 会被 git apply 拒收）★ NF-1
   - P1：`diff -u <index.js.bak-20260820-cycle-guard> <index.js>`（注意目录下另有 `index.js.bak-agentos-20260820`，按名区分）
   - P2：`diff -u <index.js.bak-20260820-cordis-gpd-cache> <index.js.patched-gpd>`（当前 index.js == 原版，**必须用 .patched-gpd 作右侧**）
   - P3：`diff -u <openai-completions.js.bak-20260820-bai> <openai-completions.js>`
   - P4：当前 dsh-session/lib 无 .bak → `npm pack @deepseek-ai/dsh-session@0.1.0-rc.7` 解包取原版 `lib/index.js`，diff 原版 vs 当前
   - 每个 .patch 生成后校验**非空**（空补丁即告警中止）
   - **格式验证（必做）** ★ NF-1：重建 pristine 副本 → `git apply` 该 .patch → diff 结果 vs 当前文件——证明补丁既格式合法又内容完整（升级启动前就验，不等到升级中）
   - 存档 `backups/host-rc7-20260820/patches/`（oh-my-whale patches/ 第一版内容）
3. **~/.dsh 全量快照** ★：profiles/（含 P5 + super-injector 运行副本）、sessions/（全部历史）、plugin-gateway/、super-injector/、settings.yaml、.credentials.yaml、.agent-presets/，排除 logs/cache/tmp，附 sha256 清单。这是壳升级阶段（风险最高）的真正保险。
4. **下载安装包 + 校验** ★：
   - v2.0.1：modelscope CDN（199.6MB），**sha256 校验**官方 digest `f749367ba970b6964c766d2134084e326dd50fad71cffda27b2081fbaec39552`
   - **v0.1.0 安装器**（GitHub release v0.1.0 资产 `DeepSeek-Harness-0.1.0.exe`）下载留存——回滚预案头号场景依赖它 ★
5. **环境确认**：无残留 CLI 实例（防并发写）、桌面版**托盘正常退出**（不硬杀，防丢会话状态/文件锁）★、管理员权限

### Phase B：壳升级 v0.1.0 → v2.0.1（预估 1.5h）

1. 确认桌面版已正常退出（托盘退出后检查 `Get-Process 'DeepSeek Harness'` 无残留；有则核实是否活跃会话后再处理）★
2. 运行 DSH-Desktop-2.0.1-x64-Setup.exe（NSIS）：
   - 若默认安装路径变 `C:\Program Files\DSH Desktop\` → **记录新路径**
   - 若覆盖旧路径 → 确认覆盖行为（旧文件先备份过，无碍）
   - SmartScreen/Defender 可能拦截社区签名安装器 → 预留时间，必要时"仍要运行" ★
3. **实测结构**（关键步骤，结果记入 HANDOFF）：
   - 安装路径 / productName 目录
   - `resources/host/` 是否存在、node_modules 布局是否与 v0.1.0 相同（rc.5 树是 pnpm 布局、rc.7 树是 npm 平铺——**两代布局不同，铺树时勿混用**）★
   - 内置 node/pnpm/dsh CLI 位置
   - ~/.dsh 是否被访问/迁移
4. **先打 P1–P3 补丁再首次 boot（顺序关键，N2 修复）** ★：新壳自带裸 rc.7 内核（无我们的补丁），而 `~/.dsh/profiles/web` 仍含 17 bundles（含 dsh-super-injector，group 结构变异者）——**裸内核 + 原 profile 首次 boot 可能触发 P1 防环的自环死循环**（8/20 实测同环境同代码挂过）。因此：
   - 装完壳后**立即**对 `resources/host/node_modules` 应用 P1/P2/P3（版本 rc.7 未变，`git apply --check` + `node --check` 先行）
   - 再启动验证：能 boot、能开新对话（此时内核 rc.7 + P1–P3 已打）
   - 若仍想隔离壳缺陷，可先用 minimal profile（无 super-injector）boot 一次，再全 profile boot
5. 若壳结构变化大 → 停下来记录差异，调整后续步骤再继续（本方案按"结构基本一致"推进）

### Phase C：内核升级 rc.7 → rc.8（预估 2h）

1. **构建方法（N1 修复）** ★：从 **host deployment root** 构建，不从 dsh 单包——
   - **Option A（首选）**：临时目录建 `package.json`，镜像 `resources/host/package.json` 的**直接依赖表（197 个）**，其中 `@deepseek-ai/*` 全部 pin 到 `0.1.0-rc.8`，然后 `npm install`（含 devDeps，不加 --omit=dev）→ 自然生成完整 rc8 树 + rc8-package-lock.json
   - **Option B（备选，有前置条件）**：装完 v2.0.1 后在自带 host 树内原地升级。⚠️ **实测当前 `resources/host/package.json` 的 197 个依赖全部用 `workspace:^` 协议**（pnpm/yarn 协议，npm 直接报 EUNSUPPORTEDPROTOCOL）→ 必须先确认 v2.0.1 自带 manifest 是**真实版本范围**（无 workspace:^），否则先重写 manifest（备份原文件）或用 Option A。npm 也不支持 glob 包名（`@deepseek-ai/dsh-*` 会 404）→ 需逐个列名 ★ NF-2
   - ⚠️ **为什么不能 `npm install @deepseek-ai/dsh@0.1.0-rc.8` 单包**：① registry 安装从不安依赖包的 devDeps（--omit=dev 只影响根项目），dsh-session/dsh-llm/dsh-agent/dsh-tools 会被跳过；② host 树的 197 直接依赖中有 **22 个不在 dsh 包的依赖闭包内**（dsh-shell、dsh-workflow、dsh-sandbox、dsh-compaction、dsh-spill、dsh-code-runtime、cordis-plugin-group 等 boot 关键包）→ 单包装必出残缺树 boot 必挂
   - **rc7-package-lock.json 禁止作为安装输入**（588 条 entry 全部锁定 rc.7 版本，按它装会静默得到 rc.7）；仅作包集合 diff 对照 ★
   - **闭包校验（必做）**：装完后逐项核对 host-root 的每个直接依赖都存在于新树（缺失 = **输出差异清单供人工审查，不硬中止**——rc.8 若合法合并包则差异属正常，审查确认后继续；rc.7 vs rc.8 闭包差异记录供审查）★ NF-3
   - **版本记录（N4 修复）** ★：从新 rc8 lockfile 提取 P1/P2/P3 目标 + 关键传递依赖（cosmokit、@satorijs/*、schemastery 等）的解析版本，与当前 rc.7 树对比，记入备份清单——避免 `git apply --check` 上下文漂移时无法分辨"版本漂移 vs 补丁失败"
2. 铺入 rc.8 树，保留旧树：`resources/host/node_modules` → `node_modules.rc7`
   - **⚠️ NF-5 修复** ★：`node_modules.rc7` 是未打 P4 的 rc.7（改名发生在 P4 重打之前）→ 立即把 Phase A 捕获的 rc.7 P4 补丁也打到 `node_modules.rc7`（或从 Phase A 备份复制 dsh-session），使"秒回滚"树 == 升级前完整状态（含 P1–P4）
3. **补丁迁移**（先 dry-run 全部）：
   - P1/P2/P3：`git apply -p0 --check`（版本未变，预期干净通过）
   - P4：手动重打（N5 修复）★：rc.8 的 `KNOWN_SESSION_EVENT_TYPES` Set 起始 ~1054 行（goal/change 在 1069，schedule/change 在 1079）；按 **ASCII 序**插入两行——`"continuous-worker/change",` 插在 `compaction/summary` 与 `feedback/record` 之间，`"verification/change",` 插在 `user/message` 与 `web/deepseek-search-llm-request` 之间
   - P5：不在此步（profile 树，随 Phase D）
4. 全部 `node --check` 通过
5. 启动 boot 验证（补丁后）→ 观察 stderr 无异常

### Phase D：配置与插件迁移（预估 1.5h）

1. settings.yaml：核对 schema 兼容（rc.8 若收紧字段会拒载 → 用备份对照，按 HANDOFF §2 规则处理）
2. profile 树：package.json 18 依赖 / 17 bundles 逐项核对 rc.8 兼容
3. 补丁 P5：确认 super-injector 运行副本仍含 gateway 集成（tgz 未变则不受影响）
4. gateway / super-injector 自检
5. pnpm-lock.yaml 若因 rc.8 更新 → 重新生成并验证

### Phase E：验证矩阵（预估 2h）

按 §1.1 STEP 5 全项执行：
- boot 无 pending；8 组模型全在
- 旧会话回归（重点：verification/change + continuous-worker/change 事件的历史会话，验证 P4 生效）
- 工具 schema；billing；bai + deepseek 实测消息
- 桌面版 + web 双端
- **userData 迁移检查**（D7）★：首启后核对工作区/会话可见；v2.0.1 productName 改为 DSH Desktop，Electron userData 目录大概率从 `%APPDATA%\DeepSeek Harness` 变 `%APPDATA%\DSH Desktop`，若工作区状态存 userData 需手动迁移
- **回滚演练（N3 修复）** ★：不重装壳，短路验证双保险——(a) sha256 校验 Phase A 两份备份（整树 + ~/.dsh 快照）；(b) `node_modules.rc7` 换入 host 验证 boot 可用 + 换回 rc.8 验证 boot 可用。全程不卸载/重装壳，不破坏当前工作状态。完整壳恢复（卸载 v2.0.1 → 重装 v0.1.0）记入 §4"全面失败"场景，不在此演练。

### Phase F：固化（预估 2h）

1. 把本次全过程写成 `docs/upgrading.md` 的第一篇案例（含路径变化记录、补丁处置结论、验证输出）
2. capture rc.8 基线补丁 → 更新 manifest.json 版本基线（rc.8）
3. 更新 HANDOFF §8（新增 rc.8 + v2.0.1 记录）
4. oh-my-whale 后续 Phase 1–6 实施时，直接用这套升级产物

---

## 3. 关键决策点（升级中需要实测确认）

| # | 决策点 | 默认假设 | 若假设不成立 |
|---|---|---|---|
| D1 | v2.0.1 安装路径 | `C:\Program Files\DSH Desktop\`（改名） | 记录真实路径，全部脚本/模板变量化 |
| D2 | v2.0.1 resources/host 布局 | 与 v0.1.0 一致（node_modules 平铺） | 结构变化 → 内核替换方式改为 npm install --prefix 到新路径 |
| D3 | v2.0.1 内置 node/pnpm | 仅壳用，host 仍用系统 node | 若 host 用内置 node → 脚本/路径调整 |
| D4 | rc.8 与 settings.yaml schema | 兼容（字段只放宽） | schema 收紧 → 按 HANDOFF §2 规则处理 |
| D5 | rc.8 与 17 bundles | 兼容 | 逐个降级/等待插件适配，记录到 HANDOFF |
| D6 | 官方提示"部分插件未适配" | 指 rc.5 用户（v0.1.0→v2.0.1 路径）——实测该提示挂在"更新上游到 rc7"条目下，我们已在 rc.7 | 若指 rc.8 → 升级前先查插件 upstream 状态 |
| D7 | ★ userData 迁移 | v2.0.1 首启工作区/会话可见 | `%APPDATA%\DeepSeek Harness` → `%APPDATA%\DSH Desktop` 手动迁移 |

---

## 4. 回滚预案

| 场景 | 操作 |
|---|---|
| 壳升级失败/闪退 | 卸载 v2.0.1 → 重装 **v0.1.0（安装包预先下载留存）** ★ → 恢复备份树 |
| 内核 rc.8 boot 失败 | `resources/host/node_modules` ← `node_modules.rc7`（秒回滚）→ 备份树（Phase A 备份的是**打补丁后的 rc.7**）直接可用 |
| 补丁迁移冲突 | 保留 rc.8 原版文件 → 手工 diff 迁移 → 若无法迁移，评估"放弃该补丁"的代价（如 P1 防环：rc.8 若同样有环 bug 则不可弃） |
| 配置拒载 | 恢复备份 settings.yaml → 用 HANDOFF §2 规则改 schema 兼容 |
| 全面失败 | 恢复到 Phase A 备份（整树 + ~/.dsh 全量快照）★，损失 = 本次升级投入时间 |

---

## 5. 验收标准（升级完成 = 全部满足）

- [ ] 桌面版 v2.0.1 正常启动，托盘图标可用
- [ ] 内核 `@deepseek-ai/dsh` = 0.1.0-rc.8
- [ ] 5 个补丁全部生效（P1–P4 内核 + P5 profile），verify.ps1 全绿
- [ ] 8 组模型全在，bai 发送消息正常（无 400）
- [ ] 旧会话（含自定义事件）全部可加载
- [ ] 17 bundles 全挂载，boot 无 pending 无报错
- [ ] settings.yaml / cordis.patch.yml 与原配置行为一致（diff 仅版本相关差异）
- [ ] userData 迁移检查通过（D7）★
- [ ] 回滚演练成功一次
- [ ] HANDOFF §8 更新完毕，升级案例写入 docs/upgrading.md

---

## 6. 时间线

| 阶段 | 时长 | 前置 |
|---|---|---|
| A 准备 | 1.5h | 无 |
| B 壳升级 | 1.5h | A |
| C 内核升级 | 2h | B |
| D 配置迁移 | 1.5h | C |
| E 验证 | 2h | D |
| F 固化 | 2h | E |
| **合计** | **~10.5h** | 可分段执行（A→B 一天，C→D 一天，E→F 一天） |

> 执行窗口建议：分 2–3 个半天，每段结束都是可用状态（A 后完全可回退，B 后 rc.7 可用但无补丁，C 后 rc.8 可用）。
> 每阶段退出标准：★ A=sha256 清单 + 4 个 .patch 非空可审 + 快照完整；B=v2.0.1 裸壳 rc.7 能 boot 且新对话成功；C=node --check 全过 + boot 无报错；D=bundles 全挂载；E=§5 全绿；F=文档提交。

---

## 7. 未来升级（rc.9+）怎么走

1. 官方发 rc.9 → 等 1–2 周观察
2. 跑 §1.1 五步流程（本方案就是模板）
3. 补丁处置表更新：查 cordis/loader/pi-ai/session 版本号是否变 → 变则 diff 验证
4. 壳 v2.0.1 → v3.0 同理：release notes + 实测路径/布局
5. oh-my-whale 的 capture/apply/verify 脚本化后，升级 = 跑脚本 + 人工确认关键决策点

> **一劳永逸的含义**：不是"升一次永不再升"，而是"每次升级都有流程、有评估、有回滚、有验证，成本从 10.5h 降到 1–2h"。
