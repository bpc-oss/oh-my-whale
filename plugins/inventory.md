# DSH 插件清单（oh-my-whale）

> 机器可读权威是 [`SOURCES.json`](./SOURCES.json)。本文件只做人类速查。
> 本仓库当前登记 **39** 条，其中 **13** 个目录有完整 standalone 源码快照。

## 完整本地源码快照（standalone）

| id | 安装方式 | 来源 | 状态/说明 |
|---|---|---|---|
| `@bpc-oss/dsh-plugin-chrome-faithful` | link | https://github.com/bpc-oss/chrome-faithful.git | active — Thin DSH bundle for Chrome Faithful. Snapshot is the packages/dsh-plugin-chrome-faithful subdirectory; npm resolves i... |
| `dsh-continuous-worker` | link | plugins/standalone/dsh-continuous-worker | active — Background continuous worker. Full source snapshot is committed under plugins/standalone; no remote is required. |
| `dsh-routed-subagent` | link | https://github.com/bpc-oss/dsh-routed-subagent.git | active — Routed subagent (0.4.0). Full source snapshot, including lib/engines/* and probe scripts, is committed; the older sna... |
| `dsh-token-meter-hermes` | link | https://github.com/bpc-oss/dsh-token-meter-hermes.git | active — Hermes-style context breakdown projection. Snapshot is the author working tree (includes the V2/V2.1 clamp edits) and... |
| `dsh-voice-input` | link | plugins/standalone/dsh-voice-input | not-mounted — Legacy voice-input plugin. Kept as a source snapshot for rollback; not mounted by the fresh profile. Models are not c... |
| `dsh-global-tool-discovery` | link | https://github.com/bpc-oss/dsh-global-tool-discovery.git | active — RSI core bundle. Contains the actual implementations of research_orchestrator (lib/research.mjs, legacy alias lib/res... |
| `dsh-fork-to-preset` | link | https://github.com/bpc-oss/dsh-fork-to-preset.git | active — Fork any session into a chosen agent preset (header UI; host preset route; requires P9-P12 kernel patches). Full sour... |
| `dsh-web-billing` | link | https://github.com/bpc-oss/dsh-web-billing.git | active — Web billing UI and metering ledger. Full source snapshot is committed; no author-local {{PLUGIN_SOURCES_DIR}} path is... |
| `dsh-subagent-model` | link | https://github.com/bpc-oss/dsh-subagent-model.git | active — Subagent model selection badge. Full source snapshot is committed; no author-local {{PLUGIN_SOURCES_DIR}} path is nee... |
| `@agent-os/dsh-governance` | link | plugins/standalone/dsh-governance | active — Agent OS governance plugin: native admission reader, capability router, policy guard, status and optional completion ... |
| `dsh-full-remote` | link | https://github.com/JUANWANG-BUAA/dsh-full-remote.git | active — Remote-access reverse proxy. Snapshot is the local 0.3.7 package including the Connection-auth compatibility files (l... |
| `m2-demo-plugin` | link | plugins/standalone/m2-demo-plugin | active — Generated demo plugin used by the super-injector registry. Its former only source was {{PLUGIN_SOURCES_DIR}}/dsh-expe... |

## vender 离线 tgz

| id | 安装方式 | 来源 | 状态/说明 |
|---|---|---|---|
| `@bpc-oss/dsh-client-ui-verification` | vendor-archive | profile/vendor/bpc-oss-dsh-client-ui-verification-1.0.0-9e59c586.tgz | active — Verification client UI |
| `@bpc-oss/dsh-evidence` | vendor-archive | profile/vendor/bpc-oss-dsh-evidence-1.0.0-355cd8ca.tgz | active — Evidence package (schema lives here!) |
| `@bpc-oss/dsh-verification` | vendor-archive | profile/vendor/bpc-oss-dsh-verification-1.0.0-e2b031f3.tgz | active — Verification engine (enforce/advisory) |
| `@dsh-external/dsh-super-injector` | vendor-archive | profile/vendor/dsh-external-dsh-super-injector-0.3.3.tgz | active — Runtime plugin injector (REBUILT tgz includes P5 gateway gate) |

## 公开 GitHub 来源

| id | 安装方式 | 来源 | 状态/说明 |
|---|---|---|---|
| `@bpshil/litkit-dsh` | github | https://github.com/bpc-oss/litkit-search | active — LitKit search |
| `@dsh-external/dsh-vision-toolkit` | github | https://github.com/Anionex/dsh-vision-toolkit | not-mounted — Vision toolkit — REMOVED from the profile on 2026-09-29: the native read_image path replaced the external vision serv... |
| `@omdsh-dev/dsh-genui` | github | https://github.com/omdsh-dev/dsh-genui | active — Generate UI |

## npm 来源

| id | 安装方式 | 来源 | 状态/说明 |
|---|---|---|---|
| `@liustack/modlens` | npm | ^3.11.0 | not-mounted — Code lens (currently disabled in plugin-management state) — NOT MOUNTED: Turned off by the user on purpose; kept out ... |
| `@liustack/modsearch` | npm | ^5.3.0 | not-mounted — Search (currently disabled in plugin-management state) — NOT MOUNTED: Turned off by the user on purpose; kept out of ... |
| `dsh-bash-terminal` | npm | ^0.3.11 | active — Bash terminal |
| `dsh-better-sidebar` | npm | profile/vendor/dsh-better-sidebar-0.12.2-fix108.tgz | active — Upstream sidebar. 0.28.0 mounts onto the official right sidebar and requires @huanlin/dsh-plugin-better-locale. |
| `dsh-plugin-manager` | npm | ^0.1.0 | not-mounted — Plugin manager |
| `@deepseek-ai/dsh-subagent-codex` | npm | ^0.2.1-rc.2 | active — Official Codex external subagent (0.2.1-rc.2 line). |
| `@deepseek-ai/dsh-subagent-claude-code` | npm | ^0.2.1-rc.2 | active — Official Claude Code external subagent (0.2.1-rc.2 line). |
| `@deepseek-ai/dsh-client-ui-subagent` | npm | ^0.2.1-rc.2 | active — Subagent client UI (0.2.1-rc.2, dependency only, not a bundle). |
| `@zseven-w/dsh-openpencil` | npm | 0.1.0-rc.2 | active — OpenPencil drawing plugin (npm rc.2; part of the same interrupted manual install) |
| `@deepseek-ai/dsh-experimental-voice-input-bundle` | npm | * | active — Official experimental voice-input bundle, brought in by the desktop 2.0.16 import. NOTE: it replaced dsh-voice-input,... |
| `@deepseek-ai/dsh-experimental-agent-team-profile` | npm | * | active — Official experimental agent-team profile bundle (desktop 2.0.16 import). |
| `@deepseek-ai/dsh-experimental-schedule-bundle` | npm | * | not-mounted — Official experimental schedule bundle (desktop 2.0.16 import). |
| `@deepseek-ai/dsh-experimental-auto-review` | npm | * | active — Official experimental auto-review bundle (desktop 2.0.16 import). |
| `@agents-anywhere/dsh-bridge-next` | npm | ^2.0.2 | active — Agents Anywhere phone-remote bridge; 0.2.1 profile bundle. |
| `dsh-community-market` | npm | ^0.0.1 | active — Community plugin market; 0.2.1 profile bundle. |
| `@huanlin/dsh-plugin-better-locale` | npm | ^0.4.3 |
| `dsh-context` | github | github:bowenliang123/dsh-context#14aa60d33e829eb6bbcc8bdcea9f97819b24caea (0.74.0) | active — Context inspector: composition browser, token/cost analytics, context command. Mounted as a profile bundle; supersedes the temp super-injector mount. | active — Locale pack required by dsh-better-sidebar 0.28.0. |

## 本地/特殊来源

| id | 安装方式 | 来源 | 状态/说明 |
|---|---|---|---|
| `@agentos/dsh-lco` | file-dir | {{AGENT_OS_DIR}}/dsh/bundles/agentos-dsh-lco-0.1.0.tgz | removed — Agent OS LCO adapter. REMOVED 2026-09-30 on the user instruction — no longer merely disabled. Do not reinstall: the b... |
| `dsh-promise-guard` |  | plugins/standalone/dsh-promise-guard | not-mounted — Promise guard: no-tool promise steps become a logged error plus a corrective turn — NOT MOUNTED: NOT a profile bundle... |
| `dsh-local-presets` | file-dir | profile/local-presets | active — Local preset layer: every preset mount is declared here (13 layer files + 00-runtime.patch.yml). Declared through the... |
| `m2-demo-plugin` | link | plugins/standalone/m2-demo-plugin | active — Generated demo plugin used by the super-injector registry. Its former only source was {{PLUGIN_SOURCES_DIR}}/dsh-expe... |

## 统计

- Profile dependencies: **27**
- Profile bundles: **26**
- Agent presets: **13**
- Registry entries: **39**
- Standalone snapshots: **13**
