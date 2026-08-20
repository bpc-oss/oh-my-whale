# 证据笔记：DSH 插件打包 / client / 自唤醒先例（调研子代理 b1d9ec08，全本地证据）

> 方法：仅 read/grep/pwsh 本地检视，未依赖网络。所有证据为本地文件路径+行号。

## 1. 包同时做 host+client+skill 的元数据要求
- package.json 需声明：`dsh.bundle.patch`（相对路径指向包内 cordis.patch.yml）、`dsh.client`（`{platform:"web"` 必填、`inject:string[]`、`immediately?:boolean`）、`exports["./client"]` 指向 client 入口、`files` 包含所有运行时文件（含 cordis.patch.yml 与 SKILL.md）。
- `dsh.bundle.patch` = 该包纳入 profile 时自动并入的插件层（CLI 按它把包名写进 `dsh.profile.bundles`）。
- `dsh.client` = 浏览器端 bundle 装载元数据；`platform` 必须是 `"web"`；`inject` 是构建图依赖边；`immediately` 表示启动即预载。
- 权威实现：`dsh-genui/package.json` L95-103 + cordis.patch.yml + files 含 SKILL.md；`dsh-better-sidebar/package.json` L42-55/L57-70；`dsh-bash-terminal/package.json` L52-66。

## 2. Client 入口构建/加载
- 源码 `src/client.jsx` → esbuild/tsdown 打成 CJS，外面包 `window.__ModuleLoader__.load({ id: <包名>, factory: require => ... })`（必须有该注册调用，id 必须等于包名，否则模块表查不到）。
- 产物经 `exports["./client"]` 暴露；宿主编译期扫描装载项里声明 `dsh.client` 且在 Loader 中的 entry，把 `{url, rev, inject, immediately}` 写进 `window.__DSH_BOOT__` 图，按 `/plugins/<入口名>/client.js(+.map)` 无缓存伺服。
- Service 注册（ctx.betterSidebar 范例）：client 端 `export const inject=[...]` 声明所需服务，`apply(ctx){ ...; ctx.provide("betterSidebar", service) }`，其他插件经 `ctx.betterSidebar` 消费。证据：dsh-better-sidebar/lib/client.js L8780-8926、src/client/service.ts、src/context-types.ts L446-474；dsh-client-modules lib/index.js L238-264/L280-345。

## 3. Host 插件 apply(ctx,config) 契约
- `export const name`（可选）+ `export const inject=["tools","systemPrompt","settings",...]` + `Config` 用 schemastery `z.object` + `export function apply(ctx, config)`。
- 动态 host (cordis runner) ctx 白名单：`effect/on/once/provide/timeout/interval/setTimeout/setInterval/throttle/debounce` + 声明服务（tools 仅 register/schemas/get）。

## 4. Skill 分发
- dsh-genui 把 SKILL.md 放包根并列入 files（package.json L32），随 npm 分发；宿主 skill 注册只扫用户/工作区/.bundled 根（dsh-skill-filesystem roots()）。
- 未找到「宿主自动扫描已装插件包内 SKILL.md」的 provider 证据（需显式标注）。

## 5. 命令面与 patch
- `dsh plugin --profile <p> [pnpm args...]` 纯透传 pnpm（add/remove/list/--help）；成功后 reconcile 重写 `dsh.profile.bundles`（有 dsh.bundle 的依赖自动进 bundle 栈，无则警告不进）。
- patch 语法：顶层 YAML 序列；非 insert 行必须 id（可带 name 校验），逐 key 覆盖（`disabled:true`→禁用、`config:{}`→整份替换）；`- insert:[{id,name(,config)}]` 可带目标 id 或顶层追加；未命中 warn+skip。
- 插件管理前端（dsh-plugin-manager）向 profile 的 cordis.patch.yml 原子写入 `{id,name,disabled:!enabled}`（OWNER_MARKER）+ 驱动 ctx.loader entry 启停。

## 6. 「宿主侧持续执行 / 定时 / 自唤醒」先例（已存在，重要参照）
- **dsh-schedule**：inject ["agents","sessions","tools","sessionPersistence"]；`ctx.on("agent/created")` 建每 agent 运行时；`setTimeout`（MAX_TIMER_DELAY_MS 封顶）定时；到点 `createUserMessage` + `this.agent.followup(message)`（在 agent.runMaintenance 内）；busy 失败则等 `agent.whenIdle()`。
- **dsh-tool-jobs（最贴近"打工人"）**：`ctx.jobs.onJobDone((snapshot, owner) => ...)`，idle owner 用 `owner.followup(msg)`、busy 用 `owner.inject(msg)`；delivery `quiet|wakeup`(默认)；`maxConsecutiveWakes=3`；监听 `ctx.on("agent/inbox/claimed")`；并注入 `systemPrompt.section`。
- **dsh-headless** L86 同样用 `agent.followup(createUserMessage(...))`。
- chrome-faithful 与 genui 的 host 侧均未见 agent/session 直接访问（genui 只走 tools/systemPrompt/webServer；chrome-faithful 是纯配置 bundle，仅 insert mcp-client 行）。
