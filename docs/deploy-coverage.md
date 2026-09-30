# 部署覆盖清单

这份清单回答一个之前没人回答过的问题：**仓库里每一项东西，换机时会不会被部署出去。**

它由第三轮独立审查提出。那次审查问"每个顶层目录是否被 bootstrap 部署、是否被记录为有意
不部署"，答案是不 —— 而"没有记录"本身就是缺陷：下一次有人加目录时，无从判断该部署还是该忽略。

判定口径：**抹掉这台机器、只从这个仓库跑 `bootstrap.ps1`，能不能得到等价的 DSH。**

## 会被部署

| 路径 | 机制 | 备注 |
|---|---|---|
| `profile/*.template` → `~/.dsh/profiles/web/` | `scripts/template-render.ps1` | 走模板渲染，机器路径占位化 |
| `profile/local-presets/`（15 文件） | `Render-TemplateTree` | 递归渲染。profile 用 `file:./local-presets` 指向它 |
| `config/.agent-presets/`（13 preset） | `bootstrap.ps1` 的 preset 部署块 | 逐 preset 渲染，路径基准是 preset 自身目录 |
| `config/settings.yaml.template` → `~/.dsh/settings.yaml` | `template-render.ps1` | 0.2.0 起内核已不读它（内容迁进 `cordis.patch.yml`），属无害冗余 |
| `super-injector/registry.json.template` → `~/.dsh/super-injector/registry.json` | `template-render.ps1` | dsh-super-injector 启动时读它并自动恢复其中的 bundle |
| `plugins/standalone/dsh-promise-guard/` | `bootstrap.ps1` 按 `SOURCES.json` 的 `payload` + `mounted_in` | 装进 7 个 preset 目录 |
| `gateway/` → `~/.dsh/plugin-gateway/` | `bootstrap.ps1` Phase 5 | |
| `profile/vendor/*.tgz` → `vendor-archives/` | `bootstrap.ps1` | 含 super-injector 0.3.3，**已内含 P5** |
| `patches/host/*.patch` → 内核树 | `patches/host/apply.ps1` | 只应用 `kernelLine` 匹配当前内核的条目 |
| `patches/profile/*.patch` → profile node_modules | `patches/profile/apply.ps1` | P5。在 `pnpm install` **之后**执行 |

## 不会被部署（有意）

| 路径 | 原因 |
|---|---|
| `patches/host/001..037`、`patches/rc2-diffs/` | 0.1.5-rc.1 内核时代的补丁文件。那棵树不是当前内核，这些是"那棵树怎么被打过补丁"的历史记录。0.2.0 上的验证手段是 `scripts/verify-patch-port.mjs`（按 marker，35 OK / 0 TODO），不是重放这些 diff |
| `patches/rc2-diffs/ORPHANS.md` | 孤儿补丁清单 |
| `local-overrides/*.patch` | 逐机设置 diff，按设计由人按 `local-overrides/README.md` 手工应用。`verify.ps1` 断言的是**线上**状态 |
| `vendored/`（3 项，277K） | `dsh-token-meter-hermes` / `dsh-voice-input` 的**回滚参考副本**。两者的真实来源是 `~/dsh-token-meter-hermes`、`~/dsh-voice-input`（后者 440M，备份只有 241K —— 明显不完整，**不适合**做自动恢复源）。`SOURCES.json` 里的 `vendored_backup` 字段**没有任何脚本消费**，它只是记录"备份在哪" |
| `scripts/`（45 文件） | 仓库工具链，不进 `~/.dsh` |
| `docs/`、`.github/`、`CHANGELOG.md`、`README.md`、`LICENSE` | 文档与 CI |
| `config/agent-presets/` | 空的遗留目录（无点前缀），未跟踪 |

## 会被部署但**当前是空的**

| 路径 | 状态 |
|---|---|
| `spec/` | 空目录，未跟踪任何文件。部署链路上不引用它。可以删 |
| `tmp/` | 运行时产物，不跟踪 |

## 不在 git 里的机器本地文件

| 文件 | 作用 |
|---|---|
| `.env`（已 gitignore） | `PLUGIN_SOURCES_DIR=<path>`。本仓库的 JSON 由 node 写成 UTF-8 无 BOM，而硬编码机器路径会被 `check-private.ps1` 判为隐私泄漏 —— 盘符不是该推断的东西，所以走这个文件 |
| `~/.dsh/backups/` | bootstrap Phase 1 与各次手工操作的备份 |

## 部署完成后会跑的门禁

`bootstrap.ps1` 的 Phase 6 smoke 现在会真正阻断（`exit 1`），检查两件事：profile 里的
`.mjs` 语法、以及 super-injector 运行时副本里 P5 gateway 是否在位。

日常核验用这十个（`docs/migration-020-status.md` 第七节有完整命令）：

```
esm-syntax-check / esm-link-check / verify-patch-port / verify-kernel-patches
verify-plugin-activation / audit-registry / audit-preset-mounts
drift-scan / check-private / local-overrides-verify
```

每个都做过**阴性对照** —— 制造它要抓的故障，确认它变红且退出码非零。
一个抓不住自己目标类别的门禁，比没有门禁更糟：它只训练人忽略它。
