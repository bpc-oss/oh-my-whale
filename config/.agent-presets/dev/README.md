# Dev preset — 开发团队工程师 agent

本 preset = **Standard 工具目录** + **借鉴 deepseek 工程师的 21 技能集**（deepseek-harness `.agents/skills` 11 个原版：10 个 `dsh-*` 字节级镜像 + `record-browser-gif` 含 2 处去仓库化微调；另有 10 个通用化版本 `dev-*`）+ **团队工程师定位**（persona + `dev-mission` 系统提示词段）。面向各种软件产品，**不绑定任何特定仓库**；集合与定位只对使用本 preset 的 agent 生效，不影响其他 preset；默认技能根（项目/用户）照常保留。

## 定位（模型可见）

- **persona**（order 0）：`You are the Dev agent — a professional software development engineer on a product development team.` 端到端承担设计、实现、审查、简化、文档、演示；不限于任何代码库。
- **dev-mission 段**（order 30，注入系统提示词）：开发团队工程师定位与使命（正确性优先/保持简单/契约守衡/团队协作）+ 21 技能分组清单 + 工作准则（非 harness 仓库优先 dev-* 通用版；目标代码库自身规范优先）。
- 编辑定位：直接改 `agent.cordis.yml` 里 `persona` 的 `text` 与 `dev-mission` 行的 `section`（保持无 `{{...}}` 组，段文本是严格插值的模板）。

## 集合内容（21 个）

### 原版 dsh-*（11，deepseek-harness 仓库内路径可解析）

| 技能 | 说明 |
|---|---|
| `record-browser-gif` | 录制浏览器/Web UI 演示 GIF + 编码 + assets-branch 发布（本身通用；已做 2 处去仓库化微调：移除 evidence-chain note 引用、构建命令通用化） |
| `dsh-code-review` | deepseek-harness PR 评审（AGENTS.md/防御模式/质量门禁） |
| `dsh-prose-standard` | 保留契约的简洁散文标准 |
| `dsh-trim-cot-leakage` | 识别并修复「思维链泄漏」散文 |
| `dsh-find-simplifications` | 全库简化候选审计 |
| `dsh-doc-standards` | 文档层级、预算、双语配对、门禁 |
| `dsh-doc-site-sync` | 文档网站同步（VitePress + pairedPages 等） |
| `dsh-translate-docs` | 双语文档工作流（gen-translation-brief 等命令） |
| `dsh-archive-agent-notes` | Agent Notes 归档/恢复/审计 |
| `dsh-merging-stacked-prs` | 栈式依赖 PR 落地 master |
| `dsh-pre-push-checks` | push 前检查、force-push、标记 ready |

### 通用化 dev-*（10，无仓库路径依赖，非 harness 项目优先用）

| 技能 | 对应原版 | 说明 |
|---|---|---|
| `dev-code-review` | dsh-code-review | 通用 PR 评审：意图/接口契约、生命周期与并发、范围与必要性、测试强度 |
| `dev-prose-standard` | dsh-prose-standard | 通用散文标准（覆盖位置/完整命题规则） |
| `dev-trim-cot-leakage` | dsh-trim-cot-leakage | 通用思维链泄漏分类与修复（8 类 + 保留规则） |
| `dev-find-simplifications` | dsh-find-simplifications | 通用简化审计 + 设计提案落盘 |
| `dev-doc-standards` | dsh-doc-standards | 通用文档层级/语料审计/预算 |
| `dev-doc-site-sync` | dsh-doc-site-sync | 通用文档网站同步（manifest → 静态站点投影） |
| `dev-translate-docs` | dsh-translate-docs | 通用双语文档工作流（briefing 驱动 + 子代理整篇） |
| `dev-archive-agent-notes` | dsh-archive-agent-notes | 通用设计决策记录（ADR）生命周期管理 |
| `dev-merging-stacked-prs` | dsh-merging-stacked-prs | GitHub 官方 PR stack 落地（gh stack） |
| `dev-pre-push-checks` | dsh-pre-push-checks | 通用 push 前最小证据选择 + 历史改写保护 |

> 注：技能间兄弟引用在集合内全部可解析（31 处已验证）。`dev-*` 主体无仓库路径，仅个别方法论文档链接指向同集合的 `dsh-*`（`dsh-doc-standards` / `dsh-prose-standard` / `dsh-code-review`）；若单独抽取 `dev-*` 子集，需一并携带这些 `dsh-*` 或改链。

## 使用

1. 新建会话，在 agent/preset 选择器里选 **Dev**（只有空白会话可切换 preset）。
2. 会话内技能目录出现 21 个技能；两个 translate-docs（`dsh-`/`dev-`）为用户显式调用型（`/` 菜单），其余 19 个模型可自动加载。
3. 使命段随每次请求注入系统提示词；preset 热发现，改文件即生效（已运行的会话保持其挂载时的组装，新会话读到新版）。

## 结构

```
~/.dsh/.agent-presets/dev/
├── agent.cordis.yml   ← Standard 组装 + skill-filesystem 挂载 + dev-mission（17 行）
├── dev-mission.mjs    ← 零依赖插件：把 config.section 注册为 agent 作用域提示词段
├── preset.yml         ← 选择器展示元信息
├── README.md
└── skills/            ← 21 个技能（10 dsh-* 字节级镜像 + record-browser-gif + 10 dev-* 通用版）
```

> **零依赖**：本 preset 唯一本地插件 `dev-mission.mjs` 无任何外部 import，**不需要 node_modules junction**，可整体复制/迁移。

## 任意会话按 preset 派子代理（`subagent_as_preset`）——全局插件

**全局插件 `dsh-preset-subagent`**（源码 `E:\ai-files\dsh-preset-subagent`，已热装配到 web profile、`bundles` 持久装配）——**任何 preset 的任意会话**都有 `subagent_as_preset` 工具，包括内置 standard：

```
subagent_as_preset(prompt="用 dev 工程师标准审查这个仓库", preset="dev", description="dev 审查")
```

- 子代理**完整挂载**目标 preset：persona、提示词段、技能目录、工具全用目标 preset 的（自定义 provider 在 async setup 里 `await agentPresets.mount(childCtx, preset)`，替代官方认父）
- one-shot 专家调用：走官方 subagent 生命周期（UI/轨迹可见），返回子代理最终输出
- `preset` 任意指定（dev / standard / router-standard / anchored-standard / 未来任何 preset），不存在时报错列出可用 id
- 说明：官方 continuable（`send_message` 续话）子代理仍继承父方 preset——完整挂载是 one-shot 语义
- provider 注册在 host 平面（进程单例），多 preset 会话并存无冲突（幂等跳过重复注册）

### 部署注意

- **全局插件**：源码 `E:\ai-files\dsh-preset-subagent`（含 `node_modules` junction → host node_modules，包内静态 import 依赖它）。热装配：`dev_install_package(dir=E:\ai-files\dsh-preset-subagent)`；重启后由 `bundles` 列表自动装配。移动源码目录需同步重建 junction。
- **dev 自身零依赖**：不涉及 junction；唯一本地插件 `dev-mission.mjs` 无外部 import。
- **已知耦合点**：`verifier-standard` preset 里有一份旧的 `dev-subagent-preset.mjs` 副本（persona 版插件的残留，已从 dev 移除）。它和全局插件共享 host 平面扩展点——如果给它配置 `extraSkills`，会影响所有子代理。建议确认其来源后删除该副本，全局能力已完全覆盖它。

## 扩展

- 加技能：往 `skills/` 放 `<name>/SKILL.md`（或扁平 `<name>.md`），frontmatter 必填 `name`（kebab-case）+ `description`。
- 只读集合：`skill-filesystem` 行加 `includeDefaultRoots: false`，则该 agent 只看 `skills/`（彻底隔离）。
- 迁移：整个 `dev` 目录可复制为 `dev-<variant>`；`agent.cordis.yml` 中 `customSkillDirs` 是绝对路径，复制后需同步改路径。

## 技能格式要求（dsh-skill-filesystem）

- `<name>/SKILL.md` 或 `<name>.md`；名称必须 kebab-case。
- Frontmatter：`name`、`description` 必填；可选 `whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable`。
- 发现深度仅一层，不支持嵌套 `**/SKILL.md`。
