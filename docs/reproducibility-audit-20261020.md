# 复现审计 2026-10-20

## 结论

本轮把“别人只拿到 oh-my-whale 仓库也能复现 RSI 与 profile 配置”从
**不成立** 修到 **源码层面可解析、可渲染、可通过仓库内检查**。
尚未做的是在一台真正的空白 Windows 机器上跑完整 `bootstrap.ps1`
（本机有 live `~/.dsh`，只能做隔离渲染和静态/在线检查）。

## 已修复的阻断项

| # | 问题 | 修复 |
|---|---|---|
| 1 | `research_orchestrator` / `knowledge_ingest` / adapters 的实现只在作者本机 `~/.dsh/profiles/web/*.mjs`，仓库没有完整源码 | 把上游完整仓库快照进 `plugins/standalone/dsh-global-tool-discovery/`，含 `lib/research.mjs`、`lib/knowledge.mjs`、`lib/registry.mjs`、`adapters/rss.mjs`、`adapters/hackernews.mjs`、测试与 docs |
| 2 | `dsh-global-tool-discovery` 的 package spec 是 `link:{{USER_HOME}}/dev/dsh-global-tool-discovery`，新机必断 | 改为 `link:{{PLUGIN_SOURCES_DIR}}/dsh-global-tool-discovery`；`SOURCES.json` 记录 upstream + pinned ref `7607c3a` |
| 3 | `dsh-fork-to-preset` / `dsh-subagent-model` / `dsh-web-billing` / `dsh-token-meter-hermes` / `@agent-os/dsh-governance` / `dsh-full-remote` / chrome-faithful DSH bundle 同样只有作者本机路径 | 全部提交 standalone 快照；package template 全部改走 `{{PLUGIN_SOURCES_DIR}}` |
| 4 | `dsh-routed-subagent` 快照缺 8 个 tracked 文件（engines + probe scripts） | 从 0.4.0 源仓库补齐 |
| 5 | `m2-demo-plugin` 只存在于 `{{PLUGIN_SOURCES_DIR}}\dsh-experimental`，super-injector registry 指向作者路径 | 快照进 `plugins/standalone/m2-demo-plugin`；registry 改为 `{{PLUGIN_SOURCES_DIR}}/m2-demo-plugin` |
| 6 | `profile/cordis.patch.yml.template` 只有 15 个顶层条目，缺整个 providers/models、permission、default model、tool rows、billing、web search、agent-team/goal 等 | 从 live profile 重新脱敏/参数化为 979 行完整模板；渲染后与 live 的结构性 diff 只剩占位符差异和 authfix 路径差异 |
| 7 | bootstrap `param()` 缺逗号；`$UserHome` / `$User` 未定义；standalone 复制不创建父目录；Phase 5 用原始 `.template` 覆盖已渲染 registry | 全部修复；`-DryRun` 现在只渲染到 temp 并跳过备份/安装/部署写操作 |
| 8 | `scripts\fix-bash-terminal-import.mjs`、`scripts\verify-patch-port.mjs`、DSH Desktop 路径被控制字符（`\f` / `\x0b` / `\r` / `\x07`）污染 | 已按字节修复；新增控制字符扫描 |
| 9 | `fix_bunny.mjs` / `verify_bunny.mjs` 被一次错误的模板替换写坏，`node --check` 失败 | 重写为可运行的 JSON/YAML 检查与修复脚本 |
| 10 | README / inventory / 版本基线严重过期（2.0.9 / rc.8 / 18 deps / 4 standalone） | README 重写为 2.0.18 / 0.2.1-rc.2 / 26 deps / 25 bundles / 38 registry / 13 presets / 13 standalone；inventory 从 SOURCES 重新生成 |
| 11 | `check-private.ps1` 因作者路径失败；`settings.yaml.template` 仍被渲染，会与 profile patch 形成第二套模型配置 | 清理文档/registry 中的作者路径；settings template 标为 LEGACY 且不再渲染 |
| 12 | 没有检查“依赖是否都有可复现源码”的 gate，也不检查控制字符/编码损坏 | 新增 `scripts/audit-plugin-sources.mjs` 和 `scripts/check-text-integrity.mjs`，接入 CI 和 bootstrap 安装前检查 |

## 当前验证结果

```text
node scripts/check-text-integrity.mjs
node scripts/audit-plugin-sources.mjs   -> checked 26 deps / 38 registry / 106 assertions -> OK
node scripts/audit-registry.mjs         -> checked 52 entries: OK 52
node scripts/audit-preset-mounts.mjs    -> mount ids 426, missing 0
node check-plugin-imports.mjs           -> 23 plugin entries, 99 import edges, 0 problems
check-private.ps1                       -> OK: no private data found
node --test (RSI snapshot)              -> 57 tests pass
node --check 全部 mjs                    -> 166 files, 0 failures
PowerShell Parser 全部 ps1               -> 22 files, 0 failures
template-render.ps1 -DefaultsOnly       -> 17 rendered YAML files parse, 0 bad
```

## 本机 drift-scan 的预期结果

在作者这台已有 live 安装上跑 `drift-scan.ps1 -Installed` 会报 `HAS_DRIFT`，原因不是仓库缺源码，而是：

- 本机 `profiles/web/package.json` 仍指向旧的 `C:/Users/.../dev/...`、`{{PLUGIN_SOURCES_DIR}}/...` 路径；
- 本机 `dsh-voice-input` 仍是旧依赖（新模板已改成 not-mounted）；
- 本机 junction 仍指向旧 dev 目录。

新机器走 `bootstrap.ps1` 会按新模板生成 `link:{{PLUGIN_SOURCES_DIR}}/...`，不会产生这些差异。
若要把作者本机也迁移到新布局，需单独执行一次 profile 备份 + `pnpm install` + 重启，不建议和本次源码补齐混在一起。

## 仍需要人工/外部提供

- 官方 DSH Desktop 2.0.18 安装包与内核 0.2.1-rc.2；
- 各 provider API Key（`.env` / 环境变量，不提交）；
- 本地 vLLM 的 `DSH_LOCAL_VLLM_BASE_URL` 与 `DSH_LOCAL_VLLM_DEEPSEEK_BASE_URL`；
- Tailscale hostname（仅手机远程）；
- `@agent-os/dsh-governance` 所需的 Agent OS client activation 文件；
- Chrome Faithful 的 Chrome profile / OCR 模型；
- 旧 `dsh-voice-input` 的 ASR 模型（仅在主动回滚语音插件时需要）。

## 重要语义澄清

- **没有 `adapter steer` 这个插件。** 它只出现在 `rsi-guide.mjs` / `enforce-guide.mjs`
  的注释里，指 adapter/preset 层的引导文本。真正的扩展机制是
  `dsh-global-tool-discovery` 的 `adapterWhitelist` + `registerSourceAdapter()`。
- RSS/HN adapter 当前保留上游默认：只有 config 显式给
  `adapterWhitelist: ["rss","hackernews"]` 才会注册；否则 research 仍可用
  papers/web/searxng/code 四个内置来源。