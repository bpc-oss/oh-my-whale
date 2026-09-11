# vendored/ — 无 GitHub 仓库的自研插件源码保险箱

> 用户指令（2026-09-11）：`dsh-voice-input` 与 `dsh-token-meter-hermes` 没有独立 GitHub 仓，
> 其"适配最新内核的改动"统一收编进 oh-my-whale 本目录，作为恢复真身。
> awesome-* 勘察结论：两仓均为纯 catalog，不含这些插件源码（见 docs/ 会话记录）。

| 目录 | 真身（live）位置 | 装载方式 | 本次内核适配 |
|------|-----------------|----------|--------------|
| `dsh-voice-input/` | `{{USERPROFILE}}\dsh-voice-input` | `profiles/web/node_modules` symlink（**改即生效，无需 repack**） | v209 路由重构 fix1→fix4（owner-fiber 崩溃→直挂 `ctx.effect+webServer.register` 信封桥；405 守卫/4MiB 上限/Buffer.concat/try-catch 错误信封）。真机验证：POST /voice/ping 200 native、GET 405。 |
| `dsh-token-meter-hermes/` | `{{USERPROFILE}}\.dsh\profiles\web\node_modules\dsh-token-meter-hermes`（实体目录，pnpm 名 `@dsh-external` 外） | profile bundle | V2.1 messageTokens 负值截零（`breakdown-projection.js`）；V2.2 `surface-fold.js` replace-without-range 守卫（compaction 冷回放防御）。离线 fold 6/6、真机历史加载无 too_small。 |

## 同步（live → vendored 快照；vendored → live 恢复）

```powershell
# 快照当前实况（升级/改动后跑一次，随后 git commit）
.\scripts\sync-vendored.ps1 -Pull
# 新机恢复：写回真身位置（voice 还需按 profile package.json 建 symlink，见 README 内注释）
.\scripts\sync-vendored.ps1 -Push
```

## 已知源码母本（非发布仓）
`{{AI_FILES}}/dsh-desktop-reference/packages/llm/token-meter/src/*` 是 hermes 的参考母本
（remote=anywhere-labs/deepseek-harness-desktop 官方镜像，勿推我们私有守卫）。
