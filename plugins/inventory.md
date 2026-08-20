# DSH 插件清单（oh-my-whale 版）

> 与 `~/.dsh/plugin-inventory.md` 对应；SOURCES.json 是机器可读的权威来源，本文件是人类速查。
> 分类：稳定/常用 → profile bundle；低频但稳定 → profile bundle；实验/临时 → super-injector；禁用/废弃 → 清理。

## 18 个依赖（SOURCES.json 为准）

| 包 | install_type | 来源 | 说明 |
|---|---|---|---|
| @agentos/dsh-lco | file-dir | AgentOS bundles | LCO 适配器（observer stage） |
| @bpc-oss/dsh-client-ui-verification | vendor-archive | repo profile/vendor | 验证客户端 UI |
| @bpc-oss/dsh-evidence | vendor-archive | repo profile/vendor | 证据 schema（改 schema 要单独构建！） |
| @bpc-oss/dsh-plugin-chrome-faithful | file-dir | {{CHROME_FAITHFUL_DIR}} | Chrome 自动化（github bpc-oss/chrome-faithful） |
| @bpc-oss/dsh-verification | vendor-archive | repo profile/vendor | 验证引擎 |
| @bpshil/litkit-dsh | github | bpc-oss/litkit-search | LitKit 搜索 |
| @dsh-external/dsh-super-injector | vendor-archive | repo profile/vendor | 运行时注入器（**重建 tgz 含 P5 gateway**） |
| @dsh-external/dsh-vision-toolkit | github | Anionex/dsh-vision-toolkit | 视觉工具 |
| @liustack/modlens | npm | ^3.11.0 | 代码透镜（当前 UI 禁用） |
| @liustack/modsearch | npm | ^5.3.0 | 搜索（当前 UI 禁用） |
| @omdsh-dev/dsh-genui | github | omdsh-dev/dsh-genui | 生成 UI |
| dsh-bash-terminal | npm | ^0.3.11 | 终端 |
| dsh-better-sidebar | vendor-archive | repo profile/vendor | 侧边栏（fix108 tgz） |
| dsh-continuous-worker | link | {{PLUGIN_SOURCES_DIR}} | 后台 worker（standalone 内嵌源码） |
| dsh-plugin-manager | npm | ^0.1.0 | 插件管理 |
| dsh-routed-subagent | link | {{PLUGIN_SOURCES_DIR}} | 路由子代理（standalone 内嵌源码） |
| dsh-token-meter-hermes | file-dir | {{USER_HOME}} | Token 计量（standalone 内嵌源码） |
| dsh-voice-input | link | {{USER_HOME}} | 语音输入（standalone 内嵌源码） |

## 17 个 bundles（web profile）

@deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app、dsh-web-billing、dsh-bash-terminal、
dsh-better-sidebar、dsh-plugin-manager、@dsh-external/dsh-vision-toolkit、@liustack/modlens、
@liustack/modsearch、@bpc-oss/dsh-plugin-chrome-faithful、@omdsh-dev/dsh-genui、dsh-voice-input、
dsh-continuous-worker、@bpshil/litkit-dsh、@dsh-external/dsh-super-injector、dsh-routed-subagent、@agentos/dsh-lco

## patch insert 条目（非 bundle）

- session-tool-unlock（全局 dev_tool_search）
- global-skill-tools（skill_search / skill_load）
- research-orchestrator（研究编排）

## 实验/临时

- 目录：{{PLUGIN_SOURCES_DIR}}/dsh-experimental（本机）
- 注入：dev_inject_plugin → 转正：dev_install_package（需过 plugin-gateway）
