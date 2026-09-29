# 事故报告：0.2.0 内核升级在壳 2.0.9 上不兼容（2026-09-29）

## 一句话结论

**0.2.0 内核不能装进壳 2.0.9。** 桌面壳 `lib/*.js` 与 0.1.x 内核的 `dsh-app-boot` API 强耦合，
0.2.0 删除了壳仍在 import 的导出，host 进程在 ESM 实例化阶段直接 SyntaxError 秒退。

正确的升级单元是 **壳 + 内核一起升**（壳 2.0.9 → 2.0.16）。

## 时间线

| 时间 | 事件 |
|---|---|
| 09:29 | 冻结回滚包 `~/.dsh/backups/pre-upgrade-020-20260929-104054/` |
| 10:00–15:00 | 取 0.2.0-rc.1 官方树；用「装机 vs 原版」整包 delta 移植 66+ 包本地补丁；补做 45 个账本外包扫描 |
| 15:28 | 打出 `app.asar` 178,275,741 B / sha256 `089503D3…`；`verify-packed2.py` 25/25 标记全过 |
| 17:52 | 部署（备份 `app.asar.pre-020-20260929-175258`），桌面起不来 |
| 18:13 | 从控制台启动并枚举窗口，确认主进程弹 **TaskDialog「Error」** 阻塞（DirectUI 渲染，无文本控件） |
| 18:20 | node 下直接加载 `lib/host-process-entry.js`，拿到真实报错 |
| 18:29 | 回滚 `app.asar`，桌面恢复，43120 正常监听 |

## 根因链

### 1. 直接致命错误（决定性证据）

```
SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not provide
an export named 'SettingsProvider'
  at node_modules/@deepseek-ai/dsh-settings-file/lib/index.js:9
```

装配树里 `dsh-settings` = **0.2.0-rc.1**（已不再导出 `SettingsProvider`），
而 `dsh-settings-file` = **0.1.5-rc.1**（仍在 import 它）。

### 2. 同类版本错配：保留版本线的包取错了版本

`next` 标签下保留自身版本线的 5 个包，最新都是 **0.1.5-rc.3**，装配时却取了旧树里的 0.1.5-rc.1：

| 包 | 装配值 | 应为 |
|---|---|---|
| `dsh-agent-presets` | 0.1.5-rc.3 | ✅ 0.1.5-rc.3 |
| `dsh-settings-file` | 0.1.5-rc.1 | ❌ 0.1.5-rc.3 |
| `dsh-code-runtime` | 0.1.5-rc.1 | ❌ 0.1.5-rc.3 |
| `dsh-code-runtime-worker-thread` | 0.1.5-rc.1 | ❌ 0.1.5-rc.3 |
| `dsh-workflow-worker-thread` | 0.1.5-rc.1 | ❌ 0.1.5-rc.3 |

### 3. 装配树根本不完整

0.2.0 新增的一批包从未进树，但 0.2.0 的包在 import 它们：
`dsh-lazy-require`、`dsh-util-code-language`、`dsh-plugin-manager`、
`dsh-compaction-image-offload`、`dsh-session-format-v3-to-v4`、`dsh-office-to-pdf`、
`dsh-api-account-controller`、`dsh-api-job-controller`、`dsh-api-terminal-controller`、
`dsh-client-ui-plugin-manager`、`dsh-client-product-analytics`、`dsh-agent-preset-registry`。

### 4. 结构性根因：壳与内核版本线强耦合

壳 2.0.9 的 `lib/profile-*.js`（与升级前备份**逐字节相同**，证明本次没有换壳）：

```js
import { DEFAULT_PROFILE_PATCH_RELOAD, PROFILE_PATCH_FILENAME, PROFILE_TEMPLATES,
         composeEntries, healProfilesModuleFallback, initProfile, … }
  from "@deepseek-ai/dsh-app-boot";
```

而 0.2.0-rc.1 的 `dsh-app-boot` 导出里 **既没有 `healProfilesModuleFallback`
也没有 `DEFAULT_PROFILE_PATCH_RELOAD`**。这是壳代码对内核 API 的硬依赖，
不是能靠打补丁绕过的细节——0.2.0 对 profile 布局/清单的改动是成套的。

## 为什么前面的门禁没拦住

- `verify-packed2.py` 验的是**我们自己的 25 组补丁标记**是否落盘，不验第三方包之间的链接完整性。
- 只对补丁点做了 ESM 语法校验，没有对**整棵树的 import/export 图**做校验。
- 没有「壳版本 ↔ 内核版本」的兼容性断言——这是本次唯一真正该有的前置门禁。

## 防复发措施（本次一并落地）

### 门禁 1：`scripts/esm-link-check.mjs`（新增，部署前必过）

静态解析整棵 `asar-root` 的 ESM import/export 图，报告
`UNRESOLVED_SPECIFIER` 与 `MISSING_NAMED_EXPORT`。**退出码非 0 即禁止打包。**

本次它一次报出 31 处问题（24 unresolved + 7 missing named export），
其中第 1 条就是致命的 `SettingsProvider`。

### 门禁 2：`scripts/version-skew-check.py`（新增）

断言「保留自身版本线的包」取的是该版本线的**最新**版本，而不是旧树里带过来的版本。

### 门禁 3：`scripts/shell-kernel-compat.sh`（新增）

从安装件的 `lib/*.js` 抽取所有 `@deepseek-ai/*` 的具名导入，
与安装件内核实际导出求差集。差集非空 → **拒绝只升内核**，要求壳一起升。

### 流程规则

> **内核升级 = 壳升级 + 内核升级，二者同批。**
> 禁止只替换 `app.asar` 里的 `@deepseek-ai/*` 而保留旧壳。

## 恢复动作

```
Copy-Item app.asar.pre-020-20260929-175258  ->  app.asar
```
sha256 复核 `96A936F18346AC3461AF3DBA…` 一致；保留问题件为
`app.asar.broken020-20260929-182920` 供取证。
