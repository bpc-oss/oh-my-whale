# Oh My Whale — 可复现的 DSH 个人发行版

> 目标：一台新 Windows 机器，只安装官方 DSH Desktop 2.0.18（内核 0.2.1-rc.2），
> clone 本仓库并执行 `bootstrap.ps1`，即可得到与作者一致的内核补丁、模型目录、
> 13 套 agent preset、25 个 profile bundle、权限/主题/反代配置，以及 RSI
> （research_orchestrator + knowledge_ingest + source adapters）能力。

## 1. 先看结论：RSI 源码在哪里

RSI 不是三个独立仓库，而是同一个 bundle：

| 能力 | 源码位置 |
|---|---|
| `research_orchestrator` / `research_job_get` / `research_memory_query` | `plugins/standalone/dsh-global-tool-discovery/lib/research.mjs`（兼容别名 `lib/research-orchestrator.mjs`） |
| `knowledge_ingest` | `plugins/standalone/dsh-global-tool-discovery/lib/knowledge.mjs`（兼容别名 `lib/knowledge-ingest.mjs`） |
| source adapter 注册表 | `plugins/standalone/dsh-global-tool-discovery/lib/registry.mjs` |
| RSS / Hacker News adapters | `plugins/standalone/dsh-global-tool-discovery/adapters/rss.mjs`、`adapters/hackernews.mjs` |
| 全局工具发现 / skills 注入 | `plugins/standalone/dsh-global-tool-discovery/lib/core.mjs`、`lib/skills.mjs`、`lib/session-unlock.mjs` |

上游仓库：<https://github.com/bpc-oss/dsh-global-tool-discovery>（快照 commit `7607c3a`）。

**不存在名为 `adapter steer` 的插件。** `rsi-guide.mjs` / `enforce-guide.mjs` 里
“adapter steer text”只是注释，指 preset/adapter 层的引导文本，不是可安装源码。
真正可扩展的是 `adapterWhitelist` + `registerSourceAdapter()`，见
`docs/reproduction.md` 的 “RSI / adapters” 一节。

## 2. 前置条件

- Windows 10/11，管理员 PowerShell。
- 官方 DSH Desktop **2.0.18**（内核 `@deepseek-ai/dsh 0.2.1-rc.2`）。
- `git`、Node.js >= 22.12、`pnpm`。
- 可选：本地 OpenAI-compatible vLLM 服务；不配置也能启动，但本地模型不可用。
- 需要联网安装 npm / GitHub 依赖；API Key 只放在环境变量，不进入仓库。

## 3. 一键部署

```powershell
git clone https://github.com/bpc-oss/oh-my-whale.git
cd oh-my-whale
Copy-Item config\.env.example .env
# 编辑 .env：至少设置 OMW_PLUGIN_SOURCES_DIR、DSH_LOCAL_VLLM_BASE_URL；
# 需要哪些模型就填哪些 API Key（不要把 .env 提交到 git）。
.\bootstrap.ps1
# 重启 DSH Desktop
```

`bootstrap.ps1` 会：

1. 备份现有 `~/.dsh` profile 和 settings；
2. 应用 `patches/host` 内核补丁；
3. 用 `scripts/template-render.ps1` 渲染 `~/.dsh/profiles/web/cordis.patch.yml`；
4. 把 `plugins/standalone/*` 复制到 `OMW_PLUGIN_SOURCES_DIR`；
5. `pnpm install`，再应用 profile 补丁；
6. 部署 plugin-gateway / super-injector；
7. 做 mjs / 补丁 / super-injector 冒烟检查。

> 新机器不需要作者本机的 `C:\Users\...`、`{{PLUGIN_SOURCES_DIR}}`、`C:\...\dev\...` 路径。
> 所有本地插件源码都已快照进 `plugins/standalone/`。

## 4. 仓库结构

```text
oh-my-whale/
├── bootstrap.ps1                 # 安装入口
├── patches/                      # host + profile 内核补丁与 manifest
├── profile/
│   ├── package.json.template     # 26 deps / 25 bundles
│   ├── cordis.patch.yml.template # 完整 profile 配置（模型/权限/插件/反代）
│   ├── local-presets/            # 13 preset 的 bundle 层挂载
│   └── vendor/                   # 5 个离线 tgz
├── config/
│   ├── .agent-presets/           # 13 套 preset 源码
│   └── .env.example              # 全部环境变量清单
├── plugins/
│   ├── SOURCES.json              # 38 条来源登记（机器可读权威）
│   ├── FINGERPRINTS.json         # 本地开发源指纹
│   ├── inventory.md              # 人类可读清单
│   └── standalone/               # 13 个完整本地插件源码快照
├── gateway/                      # plugin-gateway
├── super-injector/               # registry 模板
├── scripts/                      # render / drift / source audit / privacy scan
└── docs/                         # 复现说明、迁移记录、事故知识库
```

## 5. 必须知道的配置规则

- `profile/cordis.patch.yml.template` 是 profile 配置的**唯一权威**。
  `config/settings.yaml.template` 是 0.1.x 遗留参考，0.2.1 不再渲染它。
- 机器相关值必须写成占位符，由 renderer 替换：
  `{{USER_HOME}}`、`{{DSH_USER_HOME}}`、`{{LOCAL_APP_DATA}}`、
  `{{PLUGIN_SOURCES_DIR}}`、`{{DSH_LISTEN_HOST}}`、`{{TAILSCALE_HOST}}`、
  `{{LOCAL_VLLM_BASE_URL}}`、`{{LOCAL_VLLM_DEEPSEEK_BASE_URL}}`。
- `.env` 被 `.gitignore` 忽略；`scripts/check-private.ps1` 会在提交前扫描机器路径、
  邮箱、密码形态和 API Key。
- 本地插件一律通过 `plugins/standalone/` 快照 + `link:{{PLUGIN_SOURCES_DIR}}/<dir>`
  安装。不要再在 `package.json.template` 里写 `C:\Users\...` 或 `{{PLUGIN_SOURCES_DIR}}\...`。

## 6. 验证

```powershell
node scripts/check-text-integrity.mjs   # C0 控制字符/编码损坏检查
node scripts/audit-plugin-sources.mjs   # 每个依赖是否都有可复现源码
node scripts/audit-registry.mjs        # registry 条目是否在 live 安装中存在
node scripts/audit-preset-mounts.mjs    # preset 挂载是否完整
powershell -NoProfile -File scripts/check-private.ps1
powershell -NoProfile -File scripts/drift-scan.ps1 -Out drift-report.json
```

`audit-plugin-sources.mjs` 是 2026-10-20 新增的 gate：它会检查
`package.json.template` 的每个依赖、`plugins/standalone/*` 的 package name、
`promise-guard` 的 sha256、以及每个 preset 的 `name: ./x.mjs` / 相对 import。

## 7. 当前版本基线

| 组件 | 版本 |
|---|---|
| DSH Desktop | 2.0.18 |
| 内核 | `@deepseek-ai/dsh 0.2.1-rc.2` |
| profile dependencies | 26 |
| profile bundles | 25 |
| registry entries | 38 |
| standalone snapshots | 13 |
| agent presets | 13 |
| 内核补丁基线 | `patches/manifest.json`（当前 kernel line 0.2.1-rc.2） |

## 8. 许可

MIT。第三方插件/上游代码的许可证保留在各 `plugins/standalone/*` 目录内。