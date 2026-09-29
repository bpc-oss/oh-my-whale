# Oh My Whale — 专属 dsh 发行版

> 把本机 8 月踩坑沉淀下来的专属 DeepSeek Harness 环境固化为可复现的个人发行版。
> 新电脑 = 装官方 dsh + 一条命令 → 恢复完整开发环境（内核补丁 / 模型配置 / 插件体系 / 事故知识库）。

## 一键安装

```powershell
# 1. 安装 DSH Desktop v2.0.9（官方 GitHub releases / dshdesktop.cn）
#    ⚠ 2026-09-11 起内核在 app.asar 内且受 Electron 完整性 fuse 保护：
#    打完补丁必须关 fuse（见 docs/upgrade-v209-executed.md 附7 与 scripts/v209/pack-209.ps1）
# 2. 以管理员身份打开 PowerShell
git clone <你的 oh-my-whale 仓库地址>
cd oh-my-whale
.\scripts\check-env.ps1    # 前置检查
.\bootstrap.ps1            # 一键部署
# 3. 按提示设置环境变量（见 config/.env.example）
# 4. 重启桌面版 → 全部自定义模型、插件、补丁就绪
```

## 这是什么

| 资产 | 说明 |
|---|---|
| **内核补丁** | `patches/` — 5 个补丁（loader 防环 / cordis 缓存 / pi-ai bai 特判 / session 事件 / gateway 集成），版本基线 rc.8 |
| **模型配置** | `config/settings.yaml.template` — 6 组 provider（bai / deepseek / 本地 vLLM / opencode / qwen） |
| **插件体系** | `plugins/SOURCES.json` — 18 个插件的来源清单；`plugins/standalone/` 内嵌 4 个本地插件源码 |
| **准入机制** | `gateway/` — plugin-gateway 静态准入（进 profile 前必过） |
| **知识库** | `docs/handoff.md` — 事故复盘（YAML 陷阱 / schema 根 / file:// URL / 升级流程） |

## 目录结构

```
oh-my-whale/
├── bootstrap.ps1              # 一键安装（7 阶段）
├── patches/                   # 内核补丁（host + profile 分离）
│   ├── manifest.json          # 补丁元信息 + 版本基线
│   ├── host/                  # P1-P4 宿主内核补丁 + apply/verify
│   └── profile/               # P5 profile 补丁（存档）
├── profile/                   # profile 模板（路径变量化）
│   ├── package.json.template  # 18 deps / 17 bundles
│   ├── cordis.patch.yml.template
│   ├── *.mjs                  # 全局工具（session-tool-unlock 等）
│   └── vendor/                # vendor-archives tgz（含重建的 super-injector）
├── config/                    # 配置模板
│   ├── settings.yaml.template
│   ├── .agent-presets/        # 10 个 preset
│   └── .env.example
├── gateway/                   # plugin-gateway 源码
├── plugins/                   # 插件清单 + 指纹 + standalone 源码
│   ├── SOURCES.json           # 插件来源清单（23 项）
│   ├── FINGERPRINTS.json      # 本地插件源码指纹（capture-sources.ps1 生成）
│   ├── inventory.md
│   └── standalone/            # 4 个本地插件源码
├── local-overrides/           # 基线之后的受管覆盖（settings/zcode/kimi 脱敏 diff + verify.ps1）
├── scripts/                   # 工具
│   ├── capture.sh             # 从本机捕获补丁
│   ├── capture-sources.ps1    # 采集本地插件源码指纹（git HEAD / dirty / 版本 / tgz sha256）
│   ├── drift-scan.ps1         # 五层漂移扫描（补丁/配置/插件注册/junction/源码指纹）
│   ├── template-render.ps1    # 模板渲染
│   ├── check-private.ps1      # 隐私扫描
│   └── check-env.ps1          # 新机前置检查
└── docs/                      # 文档（architecture / handoff / upgrading）
```

## 核心机制

### 补丁管理（升级安全）
- `scripts/capture.sh`：从本机内核捕获补丁（diff .bak 快照 vs 当前）
- `patches/host/apply.ps1`：幂等应用（CheckOnly 模式 + 版本基线校验）
- 官方升级时：dry-run 全部补丁 → 逐个迁移 → 更新 manifest 基线

### 插件源码追踪（本地开发同步）
本地 `{{PLUGIN_SOURCES_DIR}}/*` 插件频繁更新时，靠 **源码指纹** 保持 oh-my-whale 与本地一致：
- `scripts/capture-sources.ps1`：扫描本机 profile，为每个本地源插件记录指纹
  - git 仓库：`git HEAD` + `dirty`（未提交改动数）+ `version`
  - vendor tgz：`sha256`
  - 自动发现 deps 未声明的 node_modules 链接（野插件，如 dsh-web-billing）
- `scripts/drift-scan.ps1` 第 4 层（Plugin sources）：实时重算指纹 vs 仓库 `FINGERPRINTS.json`
  - `CHANGED: <id> (HEAD xxx -> yyy)` = 本地插件更新了但仓库快照过期 → 跑 `capture-sources.ps1` 重新采集
  - `NEW-UNREGISTERED: <id>` = 新插件出现但 SOURCES.json 没登记
- 工作流：**改插件 → 跑 `capture-sources.ps1` → commit FINGERPRINTS.json**；升级前 drift-scan 全绿

### 模板化（换机安全）
- 所有机器路径用 `{{VAR}}` 占位符，`template-render.ps1` 渲染
- `check-private.ps1`：commit 前扫描（机器路径 / 凭据 / tailscale 域名）

## 版本基线

| 组件 | 版本 |
|---|---|
| 桌面壳 | DSH Desktop v2.0.9（内核 0.1.5-rc.1，packed-asar 布局；见 CHANGELOG 0.3.0） |
| 内核 | @deepseek-ai/dsh 0.1.0-rc.8 |
| cordis / loader / pi-ai | 4.0.1 / 1.0.2 / 0.82.1 |
| 补丁 | P1-P12（manifest.json 为权威；rc.8 升级曾丢 dsh-goal seam / apiproxy 降载 / fork+preset 能力，8/21 已捕获为 P6/P7/P9-P12） |

## License

MIT
