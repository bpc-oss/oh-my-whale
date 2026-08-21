# 漂移看护方案（Drift Watch）

> 目标：让 oh-my-whale 从"快照式发行版"变成"追随式发行版"——本机持续演化，repo 自动感知差异，任何漂移在升级/提交前明显可见，漏同步从"不知道"变成"决策过"。

---

## 1. 漂移面定义

本机快照与 repo 之间的差异来自四个独立层面：

| 层 | 本机数据源 | repo 对照 | 漂移类型 |
|---|---|---|---|
| **补丁** | 内核树 `node_modules/@deepseek-ai/*` + `.bak` 快照文件 | `patches/manifest.json` + `patches/host/*.patch` | KNOWN-APPLIED / UNKNOWN-MODIFIED / LOST |
| **配置** | `%USERPROFILE%\.dsh\profiles\web\package.json`、`settings.yaml`、`cordis.patch.yml` | `config/*.template`（模板渲染结果） | 模板未回写 / 手工覆盖 |
| **插件** | `web/package.json` bundles 数组 + dependencies | `plugins/SOURCES.json` | 未注册的新插件 / 已删除的旧插件 |
| **源码** | `E:\ai-files\dsh-*` 项目目录 | `plugins/standalone/` 快照 | 版本落后 |

---

## 2. drift-scan.ps1 设计

### 2.1 定位

独立脚本，可随时运行，**不写本机**（只读）。输出两份：
- 终端：人类可读的摘要（彩色）
- JSON 文件：结构化报告，供程序消费

### 2.2 四层扫描逻辑

#### 2.2.1 补丁层（核心，先做）

**数据源**：
- `manifest.json` 的 patches 列表（权威清单）
- 内核树文件（`app.asar.unpacked/node_modules`）
- 内核树中所有 `.bak*` / `.orig` 文件（已知补丁的 sourcePath，以及未知改动痕迹）

**判定逻辑**：

```
对每个 manifest 补丁（file == "host" 的补丁，P5 在 profile 树不在此列）：
  1. target 文件存在吗？
     - 不存在 → LOST（补丁目标文件被删了，不是补丁掉了，是内核升级移除了该文件）
  2. reverse-apply check（git apply -R --check）
     - clean → KNOWN-APPLIED
     - fail → 检查 marker
       - marker 存在 → KNOWN-APPLIED（MARKER-PRESENT：反向检查失败但 marker 在，
         说明补丁已应用但有微小上下文差异）
       - marker 不存在 → LOST（补丁确实没打上）

对内核树所有 .bak* / .orig 文件（不在 manifest 的 sourcePath 中，且不是已记录的补丁残留）：
  - 检查 manifest 是否有该 target 的补丁记录
  - 没有 → 此文件有改动但从未被捕获 → UNKNOWN-MODIFIED
  （提示：这是新补丁、调试残留、还是升级残留？需要人工审查）
```

**可选 --deep 模式（v1 不默认启用，见 §4 边界）**：
- 对每个 host 补丁的 target 文件，优先用 `.bak` 快照作为 diff 基线（6 个补丁中 5 个已有 .bak）；
  `.bak` 缺失时才 fallback 到 `npm pack @deepseek-ai/<pkg>@<version>` 获取官方原版对比。
- **版本解析**：npm pack 的版本号不能从 `baseline.kernel`（rc.8 是 dsh 版本，非各包版本）推断——
  cordis 是 4.0.1、pi-ai 是 0.82.1。manifest 必须为每个补丁提供结构化 `sourceSpec`（P4 已有先例），
  没有 `sourceSpec` 的补丁跳过 npm pack（用 .bak 即可）。
- **网络失败降级**：npm pack 失败 → 该补丁标记 `NPM-PACK-UNAVAILABLE`（WARN），不影响 verdict。

#### 2.2.2 配置层

**数据源**：
- template-render.ps1 输出（渲染后的配置）
- 本机实际配置

**判定逻辑**：

```
对每个模板（全部 7 个映射，不只 3 个——package.json / cordis.patch.yml / settings.yaml /
  pnpm-workspace.yaml / cordis.yml / session-tool-unlock.mjs / global-skill-tools.mjs）：
  template-render.ps1 渲染到临时目录
  diff 临时目录 vs 本机实际配置路径
  有差异 → 列出 diff 摘要（不输出全文，太噪）
  无差异 → CLEAN

脱敏（先 diff 后脱敏，两条输出路径都要）：
  diff 输出 → 对匹配 check-private.ps1 凭据模式的任意行（api_key/sk-/password/token 等）
  在【终端摘要】和【JSON 报告】中都替换为 [REDACTED]
  注意：settings.yaml 用 apiKeyEnv: BAI_API_KEY 引用环境变量，模板与实际文件的差异
  通常只有手工内联的 apiKey 值——这恰是必须脱敏的行。真实凭据绝不能进 drift-report.json。
```

**范围声明**（显式排除，防误判）：`state.json`、`profile-selection/`、`sessions/` 是用户运行状态，
不是渲染产物，**不参与对比**。

#### 2.2.3 插件层

**数据源**：
- `web/package.json` 的 dependencies 和 bundles
- `plugins/SOURCES.json` 的 plugins 列表

**判定逻辑**：

```
bundles 中每个插件 id：
  - 是 @deepseek-ai/*（内核包，如 dsh-base、dsh-web-app）或 dsh-web-billing？→ 跳过（内核内部，不在 SOURCES 中）
  - 在 SOURCES 中吗？→ 不在 → UNREGISTERED（新插件，未登记到 SOURCES.json）
  - 在 SOURCES 中且 install_type 匹配 → OK
  - 在 SOURCES 中但 install_type 不匹配 → INSTALL_TYPE_DRIFT（见规范化表）

SOURCES 中每个插件：
  - 在 bundles 中吗？→ 不在 → REMOVED（已从 bundles 移除但 SOURCES 未清理）

dependencies 中每个条目（第三方向，补盲区）：
  - 在 SOURCES 中吗？→ 不在 → UNREGISTERED（依赖已安装但未登记）
  - 在 SOURCES 中且 install_type 匹配 → OK
  - 注意：@deepseek-ai/dsh-subagent-codex 和 dsh-subagent-claude-code 是 dependencies 有但
    bundles 无的"外部子代理"类包——它们应出现在 SOURCES 中（无论是否在 bundles 里），
    否则会被 UNREGISTERED 标记。

install_type 规范化表（specifier 前缀 → install_type 映射，用于 INSTALL_TYPE_DRIFT 判定）：
  | 前缀模式 | install_type |
  |---|---|
  | `file:vendor-archives/*.tgz` | vendor-archive |
  | `file:.../bundles/*.tgz` | file-dir |
  | `link:` | link |
  | `github:` | github |
  | `^` / `~`（semver） | npm |
  | `file:C:/Users/...`（无 tgz） | file-dir |
```

#### 2.2.4 源码层

**数据源**：
- `plugins/standalone/` 下每个目录
- 对应的 `E:\ai-files\<project>` 或 `C:\Users\Administrator\<project>`

**判定逻辑**：

```
对 standalone 中每个项目：
  本机源码目录（从 SOURCES.json 的 source 字段解析，不硬编码 E:\ai-files——
  用 {{PLUGIN_SOURCES_DIR}} / {{USER_HOME}} 变量）vs 快照目录
  对比内容 hash（SHA256 递归，排除黑名单），mtime 只做廉价预筛（复制会改 mtime，不能作主判据）
  排除列表：node_modules/、dist/、*.tgz、*.patched、test 临时文件、*.log
  有差异 → DRIFTED（列出更改文件数）
  无差异 → CLEAN
```

### 2.3 报告格式

```json
{
  "generatedAt": "2026-08-21T01:30:00.000Z",
  "kernel": {
    "dir": "C:\\Users\\Administrator\\AppData\\Local\\Programs\\DSH Desktop\\resources\\app.asar.unpacked\\node_modules",
    "version": "0.1.0-rc.8"
  },
  "sections": {
    "patches": {
      "status": "CLEAN|HAS_DRIFT",
      "knownApplied": ["P1", "P2", "P3", "P4", "P6"],
      "markerPresent": [],
      "lost": [],
      "unknownModified": [
        {
          "type": "bak_without_manifest",
          "bakFile": "@deepseek-ai/dsh-tools/lib/index.js.bak-xxx",
          "targetFile": "@deepseek-ai/dsh-tools/lib/index.js",
          "suggestion": "review: new patch to capture or clean up"
        }
      ]
    },
    "config": {
      "status": "CLEAN|HAS_DRIFT",
      "differs": [],
      "matches": ["package.json", "cordis.patch.yml", "settings.yaml", "pnpm-workspace.yaml", "cordis.yml", "session-tool-unlock.mjs", "global-skill-tools.mjs"]
    },
    "plugins": {
      "status": "CLEAN|HAS_DRIFT",
      "unregistered": [],
      "removed": [],
      "installTypeDrift": []
    },
    "standalone": {
      "status": "CLEAN|HAS_DRIFT",
      "drifted": [],
      "clean": []
    }
  },
  "verdict": "CLEAN|HAS_DRIFT"
}
```

### 2.4 使用方式

```powershell
# 默认模式（只读，输出终端 + drift-report.json）
.\scripts\drift-scan.ps1

# --deep：加 npm pack 对比 + 源码文件 hash 对比（较慢）
.\scripts\drift-scan.ps1 --deep

# 指定基线报告对比（升级后验证）
.\scripts\drift-scan.ps1 --compare baseline-drift.json

# 输出 JSON 到特定路径
.\scripts\drift-scan.ps1 --out my-report.json
```

### 2.5 与现有脚本复用

| 功能 | 复用自 | 原因 |
|---|---|---|
| manifest 解析 | `capture.sh` 的 python JSON 解析 | 已稳定，manifest 结构不变 |
| 补丁 reverse check | `verify.ps1` 的 `git apply -R --check` | 已验证逻辑 |
| 模板渲染 | `template-render.ps1` | 同一套变量展开 |
| 隐私扫描 | `check-private.ps1` 的 pattern | diff 配置前脱敏 |
| 内核路径检测 | `check-env.ps1` 的两壳检测 | 已稳定 |

---

## 3. 升级门禁集成

### 3.1 修改 upgrading.md 的 5 步流程

**Step 1（准备与基线）增加**：
```
1.5 运行 drift-scan.ps1 --out baseline-drift.json
    → 保存升级前的漂移基线（纯记录，不阻断）
```

**Step 2-4 之间增加门禁**：
```
2.5 运行 drift-scan.ps1 --compare baseline-drift.json
    → 输出 'upgrade-drift-report.json'
    → 全量增量矩阵（delta matrix）：跨两张报表，逐项对比每个 patch id 和每个 .bak 路径的状态变化
      - new-lost：manifest 补丁从 APPLIED 变为 LOST → 阻断（补丁在升级中丢失）
      - new-unknown：本地 .bak 偏移从未出现变为出现 → 阻断（新改动未登记）
      - gone-from-baseline：基线中的 UNKNOWN-MODIFIED 在后报告中消失 → 阻断（需 --ack 显式确认）
        （这正是 P6 类丢失的场景——基线中 .bak 存在但未登记，升级后 .bak 被删且补丁消失，
          按"新出现"规则会漏掉；按"消失"规则被捕获，需人工确认：是升级清除了残留，还是补丁丢了？）
      - new-removed-baseline：基线中的 LOST 在后报告中消失 → 阻断（需确认处理方式）
      - recovered：基线 LOST 变为 APPLIED → 不阻断（这是修复了）
    → 任何阻断项必须先处置（补丁迁移 / 清理残留 / 登记到 manifest），
      处置后重跑 --compare 直到 verdict = CLEAN 或 阻断项被 --ack 显式豁免
```

**step 2.5 的提交门禁**：`drift-allowlist.json`（提交到 repo，`docs/drift-allowlist.json`）记录已知漂移。
当一个漂移项是故意保留的（如"standalone 源码快照暂不更新"），可写入 allowlist 并 commit，
`--compare` 跳过 allowlist 中已记录的项。allowlist 格式：
```json
{
  "version": "1",
  "entries": [
    {
      "type": "unknownModified",
      "path": "@deepseek-ai/dsh-tools/lib/index.js.bak-xxx",
      "reason": "调试残留，计划清理",
      "acknowledgedAt": "2026-08-21"
    }
  ]
}
```

**Step 5（验证矩阵）增加**：
```
- [ ] drift-scan.ps1 运行后 verdict = CLEAN 或 所有漂移项已记录在 drift-allowlist.json
```

### 3.2 与 rc.9 升级流程的关系

下次升级时（rc.9）：
1. 先 `drift-scan` 建立基线 → 确认本机与 repo 同步（如果现有漂移，先处置或记入 allowlist）
2. 升级 → 再 `drift-scan --compare`（全量增量矩阵）→ 确认补丁迁移干净
3. 如果 `gone-from-baseline` 出现（基线 UNKNOWN-MODIFIED 消失），阻断性被检出——这正是 P6 类丢失的捕获路径

---

## 4. 不做的事（边界）

| 不做 | 理由 |
|---|---|
| 自动修复漂移 | 漂移需要人工判断（是故意的还是不小心漏的），自动回写可能覆盖用户有意改动 |
| 自动同步 standalone 源码 | 源码开发是独立项目，oh-my-whale 只归档发行版快照 |
| 持续监控（定时任务） | 本机环境复杂，定时任务可能干扰正在运行的工作；改为手动触发 + 升级自动触发 |
| 对比 node_modules 全部 530 个包 | 太多噪声，只对比有 `.bak`/`.orig` 痕迹的包（即有改动历史的） |
| `--deep` npm pack 默认执行 | 版本解析需结构化 `sourceSpec`（P4 先例），且网络可能不可用；v1 不做 npm pack fallback（P4 仅靠 reverse-apply/marker 判定），`--deep` 全部放迭代 2 |
| standalone 层 / `--deep` 放入 v1 首发 | 补丁层（核心，捕获 P6 类事故）、配置层、插件层是价值所在；standalone 源码新鲜度是不同问题（dev 目录天然漂移，最噪）→ 迭代 2 |

### 4.1 编码惯例（PS 5.1，全脚本强制）

- JSON 报告写入必须用 `[System.IO.File]::WriteAllText(path, $json, [System.Text.UTF8Encoding]::new($false))`——PS 5.1 的 `Set-Content`/`Out-File` 默认 ANSI/UTF-16，会破坏中文（内核 JS 注释、patch 路径）
- 读内核文件用 `ReadAllText`，不用 `Get-Content`（非 ASCII 内容场景）
- marker 字符串保持纯 ASCII（现有 verify.ps1 已如此，注释里强制）
- 隐私脱敏输出到终端和 JSON 报告两条路径（F3 强化）

---

## 5. 实施计划

> 迭代 1（v1，本次）：补丁层（含 --compare 增量矩阵 + allowlist）+ 配置层 + 插件层 + upgrading.md 门禁。
> 迭代 2（后续）：standalone 源码层 + --deep npm pack fallback。

| 步骤 | 产出 | 工作量估计 |
|---|---|---|
| 1. 实现 drift-scan.ps1 补丁层（核心，file=="host" 过滤 + .bak 扫描） | 脚本 + 终端输出 + JSON 报告 | ~200 行 |
| 2. 实现 --compare 全量增量矩阵 + drift-allowlist.json 豁免 | 两 JSON 对比 + 增量判定 + 豁免 | ~100 行 |
| 3. 实现配置层（复用 template-render.ps1 + check-private.ps1 脱敏） | 对比逻辑 + 脱敏 + 回归测试 | ~100 行 |
| 4. 实现插件层（内核包排除 + 第三方向 dependencies + 规范化表） | bundles/SOURCES/dependencies 三方对比 | ~70 行 |
| 5. 更新 upgrading.md 集成门禁（step 1.5 / 2.5 / 5） | 文档 | ~40 行 |
| 6. 端到端测试：刻意制造漂移（含 P6 场景：基线 UNKNOWN → 升级后消失）→ 检出 → 报告 | 测试报告 | ~1 小时 |
| 7. 集成 pre-commit 漂移合理性检查（可选，迭代 2） | 预提交检查 | ~40 行 |
| 8. 迭代 2：standalone 源码层（content hash + 排除列表 + SOURCES 路径解析）+ --deep | 迭代 2 交付 | ~120 行 |