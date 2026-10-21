# Oh My Whale 复现说明 / Reproduction Map

本文回答两个问题：

1. 新机器只拿到本仓库，能否复现作者的 DSH 配置和 RSI 能力？
2. 哪些东西必须由使用者自己提供（API Key、模型服务、外部 CLI）？

## 1. 版本与路径

| 项目 | 值 |
|---|---|
| DSH Desktop | 2.0.18 |
| Kernel | `@deepseek-ai/dsh 0.2.1-rc.2` |
| Profile | `~/.dsh/profiles/web` |
| 配置权威 | `profile/cordis.patch.yml.template` |
| 插件来源权威 | `plugins/SOURCES.json` |
| 渲染器 | `scripts/template-render.ps1` |
| 安装器 | `bootstrap.ps1` |
| 本地插件安装根 | `%USERPROFILE%\ai-files`（`OMW_PLUGIN_SOURCES_DIR` 可覆盖） |

## 2. RSI 能力映射

`dsh-global-tool-discovery` 是一个 bundle，不是一个只有 `dev_tool_search` 的薄插件。
本仓库已把完整源码快照在：

```
plugins/standalone/dsh-global-tool-discovery/
├── lib/
│   ├── index.mjs                 # 聚合入口：core + skills + research + knowledge
│   ├── core.mjs                  # dev_tool_search / tokenize / matchesQuery
│   ├── skills.mjs                # 全局 skill_search / skill_load
│   ├── session-unlock.mjs        # 按会话解锁 resident tools
│   ├── registry.mjs              # source adapter 注册表
│   ├── research.mjs              # research_orchestrator / research_job_get / research_memory_query
│   ├── research-orchestrator.mjs # 兼容导出别名
│   ├── knowledge.mjs             # knowledge_ingest（skill/plugin/memory）
│   └── knowledge-ingest.mjs      # 兼容导出别名
├── adapters/
│   ├── rss.mjs                   # RSS adapter
│   └── hackernews.mjs            # Hacker News adapter
├── docs/                         # 上游接口/架构说明
├── test/                         # 上游测试
└── cordis.patch.yml              # bundle 默认 config
```

上游：<https://github.com/bpc-oss/dsh-global-tool-discovery>，快照 commit
`7607c3ae3508e4ea310c7ffc0d95cf00bfa0a4f9`。

### 关于 “adapter steer”

仓库中**没有**名为 `adapter steer` 的插件或函数。`rsi-guide.mjs` 与
`enforce-guide.mjs` 里的 “adapter steer text” 是注释，指把引导文本放在
preset/adapter 层注入，不是独立实现。可扩展的点是：

- `dsh-global-tool-discovery` 的 `adapterWhitelist` config；
- `lib/registry.mjs` 的 `registerSourceAdapter(name, adapter)`；
- 外部 adapter 必须实现 `search(query, limit, timeoutMs)`。

当前 `cordis.patch.yml.template` 保留 bundle 默认配置（research/knowledge 默认开启）；
RSS/HN adapter 只有显式设置 `adapterWhitelist` 才会注册。这是有意保留的上游默认行为。

## 3. 所有本地插件快照与上游

| 目录 | 包名 | 上游 |
|---|---|---|
| `dsh-global-tool-discovery` | `dsh-global-tool-discovery` | <https://github.com/bpc-oss/dsh-global-tool-discovery> |
| `dsh-routed-subagent` | `dsh-routed-subagent` | <https://github.com/bpc-oss/dsh-routed-subagent> |
| `dsh-fork-to-preset` | `dsh-fork-to-preset` | <https://github.com/bpc-oss/dsh-fork-to-preset> |
| `dsh-subagent-model` | `dsh-subagent-model` | <https://github.com/bpc-oss/dsh-subagent-model> |
| `dsh-web-billing` | `dsh-web-billing` | <https://github.com/bpc-oss/dsh-web-billing> |
| `dsh-token-meter-hermes` | `dsh-token-meter-hermes` | <https://github.com/bpc-oss/dsh-token-meter-hermes> |
| `dsh-plugin-chrome-faithful` | `@bpc-oss/dsh-plugin-chrome-faithful` | <https://github.com/bpc-oss/chrome-faithful> (`packages/dsh-plugin-chrome-faithful`) |
| `dsh-full-remote` | `dsh-full-remote` | <https://github.com/JUANWANG-BUAA/dsh-full-remote> |
| `dsh-governance` | `@agent-os/dsh-governance` | 本地私有源，无 remote；完整 src+dist 已快照 |
| `dsh-continuous-worker` | `dsh-continuous-worker` | 本地发布源；完整源码已快照 |
| `dsh-promise-guard` | preset payload | 本地源；`sha256` 已在 `SOURCES.json` |
| `m2-demo-plugin` | `m2-demo-plugin` | `knowledge_ingest` 生成的 demo；已在 super-injector registry |
| `dsh-voice-input` | `dsh-voice-input` | 旧本地源；**未挂载**，保留回滚快照；模型不提交 |

`dsh-voice-input` 已被官方 `@deepseek-ai/dsh-experimental-voice-input-bundle` 取代，
所以 `profile/package.json.template` 不声明它，`SOURCES.json` 标记为 not-mounted。

## 4. 配置层与不可提交内容

- `profile/cordis.patch.yml.template` 包含完整 providers/models、permission、
  default model、agent-team、goal budget、backend 配置、web/billing、反代与
  authfix。它是从 live profile 脱敏/参数化后的快照。
- `profile/package.json.template` 只使用：
  - 官方 npm 版本；
  - `file:vendor-archives/*.tgz`；
  - `github:<org>/<repo>`；
  - `link:{{PLUGIN_SOURCES_DIR}}/<standalone-dir>`。
- `config/settings.yaml.template` 是 0.1.x 遗留，不参与渲染。
- `.env` 永远不提交。`scripts/check-private.ps1` 会扫描机器路径、邮箱、密码形态、
  `sk-*` key。
- `~/.dsh/sessions/`、`~/.dsh/storages/`、`~/.dsh/cache/` 不进入仓库。

## 5. 新机器安装

```powershell
git clone https://github.com/bpc-oss/oh-my-whale.git
cd oh-my-whale
Copy-Item config\.env.example .env
# 编辑 .env：
#   OMW_PLUGIN_SOURCES_DIR=%USERPROFILE%\ai-files
#   DSH_LOCAL_VLLM_BASE_URL=http://<your-vllm>:8888/v1\n#   DSH_LOCAL_VLLM_DEEPSEEK_BASE_URL=http://<your-vllm>:8899/v1
#   BAI_API_KEY / OPENCODE_API_KEY / ...（按需）
.\bootstrap.ps1
```

如果不想用默认安装根，可设置：

```powershell
$env:OMW_PLUGIN_SOURCES_DIR = 'D:\ai-files'
.\bootstrap.ps1
```

`bootstrap.ps1` 会在 `pnpm install` 前自动：

- 调用 `node scripts/check-text-integrity.mjs` 和 `node scripts/audit-plugin-sources.mjs`；
- 把 `plugins/standalone/<dir>` 复制到 `$OMW_PLUGIN_SOURCES_DIR/<dir>`；
- 生成 `~/.dsh/super-injector/registry.json`（已渲染，不再被 `.template` 覆盖）。

## 6. 必须由使用者提供的外部项

- DSH Desktop 2.0.18 本体；
- 所有 provider API Key；
- 本地 vLLM/OpenAI-compatible 服务（如果不使用本地模型可全部走云端 provider）；
- Tailscale hostname（只有需要手机远程访问时）；
- Chrome Faithful 所需的 Chrome profile / OCR 模型（可选）；
- Agent OS governance 的 `client-activation.json`（若启用该插件）。

这些都不会被写成作者本机绝对路径：要么是环境变量，要么在 `.env`，要么是
`{{LOCAL_APP_DATA}}` / `{{USER_HOME}}` 占位符。

## 7. 验证

```powershell
node scripts/check-text-integrity.mjs
node scripts/audit-plugin-sources.mjs
node scripts/audit-registry.mjs
node scripts/audit-preset-mounts.mjs
powershell -NoProfile -File scripts/check-private.ps1
node --experimental-vm-modules scripts/check-plugin-imports.mjs
```

期望：

- `audit-plugin-sources.mjs`：每个 dependency 都有 standalone/vendor/github/npm 来源；
- `audit-registry.mjs`：51+ registry 检查全部存在；
- `audit-preset-mounts.mjs`：426 个 mount id 无 missing；
- `check-private.ps1`：`OK: no private data found`；
- `check-plugin-imports.mjs`：0 problem。

## 8. 已知边界

- 外部 npm/GitHub 包仍依赖网络和上游可用性；本仓库只能保证“来源可解析”，
  不能把整个 npm registry 离线化。
- `plugins/standalone/dsh-governance` 是本地私有实现，没有公开 remote；已提交
  `src` + `dist`，但 Agent OS 运行时和 `client-activation.json` 仍需单独提供。
- `dsh-full-remote` 快照包含作者的 Connection-auth 兼容补丁；若上游升级，
  需要重新核对 `lib/index-authfix-v2.js` / `lib/backend-auth.mjs`。
- `dsh-voice-input` 的 ASR 模型体积达数百 MB，未提交；仅在主动回滚旧语音插件时
  才需要下载。