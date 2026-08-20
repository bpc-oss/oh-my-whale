# 本机 dsh 架构说明（2026-08-20 实测）

## 1. 总体架构

```
DSH Desktop v2.0.1（Electron 壳，%LOCALAPPDATA%\Programs\DSH Desktop\）
└── resources/app.asar.unpacked/node_modules/   ← 内核（rc.8，宿主）
    ├── @deepseek-ai/dsh 0.1.0-rc.8
    ├── @deepseek-ai/cordis 4.0.1
    ├── @deepseek-ai/cordis-plugin-loader 1.0.2
    ├── @earendil-works/pi-ai 0.82.1
    └── @deepseek-ai/dsh-session 0.1.0-rc.8

~/.dsh/（用户数据，跨版本保留）
├── settings.yaml              ← 6 组 provider + thinking + permission
├── profiles/web/              ← web profile（18 deps / 17 bundles / cordis.patch.yml）
│   ├── package.json           ← 依赖与 bundle 清单
│   ├── cordis.patch.yml       ← 配置覆写（billing/verification/voice 等）
│   ├── vendor-archives/       ← 本地 tgz 包
│   └── node_modules/          ← 安装树（pnpm）
├── .agent-presets/            ← 10 个自定义 preset
├── plugin-gateway/            ← 插件准入（静态检查）
├── super-injector/            ← 运行时注入（registry/staging）
└── sessions/                  ← 全部历史会话

%APPDATA%\DSH Desktop\         ← 壳 userData（profile-selection/state.json、logs/、Crashpad/）
```

## 2. 关键机制

### 2.1 profile 与 bundle
- profile 由 `package.json` 的 `dsh.profile.bundles` 决定挂哪些 bundle
- bundle = 声明了 `dsh.bundle`（cordis.patch.yml）的包；非 bundle 插件用 patch insert 挂载
- 壳默认 desktop profile（2 bundle）；web profile 通过托盘/state.json 切换

### 2.2 补丁体系（oh-my-whale patches/）
| # | 目标 | 作用 | 迁移条件 |
|---|---|---|---|
| P1 | cordis-plugin-loader | parent 链防环 + parentEntry 快照 | loader 版本变化时重验 |
| P2 | cordis | getPropertyDescriptor 链上缓存 | cordis 版本变化时重验 |
| P3 | pi-ai | bai 特判（isDeepSeek + developerRole） | pi-ai 版本变化时重验 |
| P4 | dsh-session | KNOWN 事件注册 | rc.x 内置两事件后退役 |
| P5 | super-injector | gateway 门禁 | 已重建进 tgz，补丁仅存档 |

### 2.3 插件准入（plugin-gateway）
- `dev_install_package` 装配前 spawnSync 门禁，exit≠0 拒绝
- 权威 FAIL：bundle 声明缺失 / 入口不完整 / 裸 Windows 路径
- 启发式 WARNING：配置超前 / schema 根 / 写放大

### 2.4 MCP / Skill / 插件（三者关系）
- 一切皆插件（cordis bundle）；MCP client 和 Skill loader 都是内置插件
- MCP server 通过 `dsh-mcp-client` 条目接入（chrome-faithful 模式）
- Skill 通过 `skill_search`/`skill_load` 全局工具使用

## 3. 版本与升级

- 基线见 `patches/manifest.json`（rc.8 / shell v2.0.1）
- 升级流程见 `docs/upgrading.md`
- 回滚：`backups/` 双保险（旧壳树 tar + 新壳 rc.7 tar）

## 4. 本机特有配置速查

- bai：`api: openai-completions`（不支持 Responses API）；reasoningEfforts 三档（off/high/max）
- 本地模型：dgx-spark-vllm（18008）/ qwen-vl（18010）/ qwen27b（18009），apiKeyEnv 占位
- 远程访问：tailscale serve（trustedHosts 在 cordis.patch.yml）
