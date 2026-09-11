# DSH 升级方案 v5.2（执行中）—— 壳 2.0.5 + 内置内核 0.1.2-rc.1

v5 经第三轮终审（R1'' APPROVE_WITH_FINDINGS / R2'' APPROVE_WITH_FINDINGS / R3'' **APPROVED**）后，全部点级必改已并入 v5.1；R2'' 明示"改毕即可进入 Phase 0"，R3'' 明示"无需第四轮方案复审"。
**v5.2 = Phase 0 执行记录与修订，见文末《附3》——§1.0 计数表与 §1.3 组C 表以附3 为准。**
审查链存档：`docs/upgrade-v205-review-round1.md`（一轮全文）+ 二/三轮结论在会话与本档附注。
基线：内核 0.1.1-rc.2 + 壳 2.0.1。回滚：`backups/v012-upgrade-20260909/` + Phase 0 整壳备份。

---

## 0. 核心决定
1. **包源 = 壳 2.0.5 安装包内置构建**（dsh-settings 7 导出完整；npm 原版缺 3——9/9 全灭根因）。npm 0.1.5-rc.1 不采用。
2. **目标 2.0.5，更新面全冻结**：GitHub tags 最新=v2.0.5，`updates/state.json` 曾提示 2.0.6（无官方发布痕迹）→ 不追版本。electron-updater 代码不在 app.asar 明文（grep 0 命中，机制未证）→ 冻结=「移除 resources/app-update.yml + 备份 state.json」，**验证位**：装后与每门禁窗口检查 `updates/` 无新增下载（不假设冻结必然有效）。
3. 壳 2.0.5 内置：内核 0.1.2-rc.1 全套 + cordis 4.0.2（`get(name,strict)`@762 ✓、无 descLocationCache ✓）+ pi-ai 0.84.3（dist/api 在）。`dsh-typert-registry` 实测存在于 v205 树（含 typert-loader/protocol 同族）。
4. **并发漂移警示（实测）**：P24 于一轮审查后（09-10 17:14）被其他会话打上——本机存在活体并行修改。**执行窗口（Phase 0-3）内用户须约束其他 agent/会话停止写 DSH 树与 profile**；A3-5 drift-scan 终验兜底。

## 1. 补丁全景：**30 项内核补丁**（归组表锁定，禁减法口径）

### 1.0 归组计数表（唯一权威）
| 组 | 成员 | 数 |
|----|------|---|
| 组A 直接重放 | P1 P2 P3* P4 P8 P14 P17* P17b P18b* P18c P20 P21 P22 P23（**星号=锚点未满/跨版本，A2 按位复核后才放行**：P3 14/14 但 pi-ai 0.82.1→0.84.3；P17 12/13；P18b 31/33，miss=`crypto.randomUUID()`/`bytesToBase64` 行） | 14 |
| 组A-待测 | P17c（017c patch 头临时文件名、命中率未测，A2 补测） | 1 |
| 组B 官方内置验证 | P11（v205 原生 inheritedEventCount/seedLength，按免打假设验）、P15（已原生 catch，降级诊断增强可跳） | 2 |
| 组B-Profile | P5（super-injector 网关，不受壳升级影响，装后验证在位） | 1 |
| 重导出队列（锚点<100% 必须重生成 hunk） | P6(26/30) P16(93/104，含 version!==2 miss) P19(miss 恰是其全部作用的 export 行) P19b(16/19，2 import miss) | 4 |
| 组C 重定位移植 | P7 P9 P10 P12 P13 P18（规格见 §1.3） | 6 |
| marker 单列 | P16b（routed-subagent 断言 marker，随 routed-fork 补丁（P16）同打） | 1 |
| 新登记 | **P24**（§1.1）+ P20–P23（已入上表） | 1 |
| **合计** | | **30** |

### 1.1 视频系列 + P24
- P20 落点 1 文件 `dsh-llm-pi-ai/lib/index.js`（P20 标记 7 处：1070 BEGIN/1071 MAX_FRAMES/1117/1119/1133 END/1161/1260）；dsh-tool-fs 内仅 P21 注释顺带提及。
- P21 `dsh-tool-fs/lib/index.js` @1004/1072/1082；P22 `pi-ai/dist/api/openai-responses-shared.js`；P23 `pi-ai/dist/api/openai-completions.js`。
- **P24（活跃，第 30 项）**：`dsh-token-meter/lib/index.js` :16 `VIDEO_BLOCK_TOKENS=4096` + `case "video"` 计价分支（tokens += @:41；行号以现场为准，A2 锚点表覆盖）。09-10 17:14 打上，v205 token-meter 存在且 video 0 命中 → **需重放**。文件行尾 LF。
- 脚本 `.dsh/tmp/p2*.js`（argv[2]、rep 唯一性）。**A0：P20–P24 全部登记 manifest**。

### 1.2 视频官方现状
v205 6 目标 grep `video` 全 0；`MODEL_MODALITIES=["text","image"]`（llm-deepseek:1848）；`dsh-llm-pi-ai:274` 与 P17 前 context 逐字一致 → **13 个视频补丁（P17 系 8 + P20–P24）无一被原生取代**。其余文件视频面 A2 覆盖。

### 1.3 组C 移植规格
| ID | 落点与规格 |
|----|----|
| P7 | `api-session-controller/lib/index.js:1894`（**运行时加载份=lib/index.js 已判定**：exports 映射+深链 grep 0；`lib/types/{list,commands,index}.js` 死副本入 drift 白名单不镜像；A2 一行验证 `node -e "console.log(require.resolve('@deepseek-ai/dsh-api-session-controller'))"` @cwd=profiles/web）。denylist 重写输入=静态 `SessionProjectionMap`（typert.host.js:1728）**+ A2 实采一次真实 session.list 行的 projections.values 键清单**（组E 运行时追加动态键 contextBreakdownHermes/verification）；保 `sessionListMetadata`（summaryFor:1712 自读） |
| P9 | `api-session-controller/lib/index.js:655`；`SessionForkRequest` 无 agentPreset → typert host/remote-client schema 同改 |
| P10+P12 | `api-session-controller/lib/client.js:1827/2452` + `client-connection/lib/client.js:3839/4511` + typert 链；与 P9 合并移植 |
| P13 | `dsh-api-gateway` WS。**禁改帧协议**（stream-protocol exactKeys 只认 item/end/error，并帧=客户端抛错断流）。合批点=`send()` 串行写链侧（:346-364）：pump 收集/延后 await，send 合写链跳数；终帧（end/error）前 pump 必须 await 已排队批写、终帧走链尾；**`socket.bufferedAmount` 水位：初值 1MB 起排空、单次等待 ≤30ms**（Phase 2 A/B 调参），复用 :354-357 readyState 守卫。1 文件 2 hunk ≈45-60 行。降级"接受逐条 send"**默认禁止**：G6 A/B（逐条 vs 合批，测首字延迟 vs 任务完成时刻）实测无滞后才允许降级，否则 P13 阻塞。**Phase 2 前置交付：首字延迟探针脚本**（.dsh/tmp 现无覆盖件） |
| P18 | **≥7 处/4 包**：①`api-session-controller/lib/index.js:731/745/754/766`（hasImage 门+admitPromptContent+serializeImageAdmission 逻辑）②`typert.host.js:570`（schema 起 :561）③`typert.remote-client.js:570` ④`api-remotes/lib/client.js:7909-7919` ⑤`dsh-subagent/lib/typert.host.js:45`+`typert.remote-client.js:45`（continuable prompt 复用 PromptContentPart）⑥`api-remotes/client.js:7026-7037` ⑦`dsh-subagent/lib/index.js:2911`（+types/index.js:333 白名单）。mediaType 已收紧 4 字面量 union → video 分支沿用 rc.2 `z.string()` 不枚举 MIME。`dsh-attachment/lib/index.js:104`/typert ImageBlock 视 P21 耐久形态定（条件项） |

### 1.4 组D 客户端连带
- **链真相**：`.dsh-module-fallback/node_modules/@deepseek-ai/*` 中 client-runtime/schema-form/web-react/ui-primitives = **symlink→`profiles/node_modules/…`→壳 unpacked**（0.1.1-rc.2）→ 升壳后随净移除包**真断链**；仅 ui-slots、sdk-protocol 指 profile 本地。
- **来源已证**：官方 0.1.2 新机制（`dsh-app-boot/lib/index.js:316 PROFILE_MODULE_FALLBACK_DIR`、:589 resolveModuleFallbackEntries、:567-571 按 targets **rmSync 重建**）→ **不手工删**，升壳自动再生。今日 00:16 一次 0.1.2 CLI 运行建过农场后回滚（历史死链混入）。
- **清账对象钉死**：Phase 1 link 差分前仅清 `profiles/node_modules` 层历史死链（00:16 CLI 产物）；`.dsh-module-fallback` 由 rmSync 自管，**不碰**。
- 8 个 client-runtime 依赖包：bash-terminal、better-sidebar、super-injector、vision-toolkit(类型)、plugin-manager、@omdsh-dev/dsh-genui、@zseven-w/dsh-openpencil、@bpc-oss/dsh-client-ui-verification（后三者经 `dsh.client.inject` 硬注入→改 import 须同改 inject/peerDeps）。
- **D1 主线**：v205 `dsh-client-store`（PRESENT）导出 defineStore（bash-terminal 只用它→直接换）；其余 7 包逐包定符号集（better-sidebar 引 `.../client` 的符号名先从 CJS bundle 取出）。**D2 兜底**：无法改的插件建 rc.2 **实体目录，路径钉死 `profiles/web/node_modules/@deepseek-ai/<pkg>`**（pnpm-managed 优先解析、不在 rmSync 管辖），从 `v012-upgrade-20260909/kernel-unpacked` 拷，验与 0.1.2 客户端协议兼容；不行则显式禁用+登记 manifest disabled。禁止静默坏。
- 净移除 5 包中 web-react/schema-form/tool-subagent-report 在 profile 0 直接引用（fallback 闭包带入）→ 处置面收敛到 client-runtime 一族。`dsh-host-apiproxy` profile 0 引用 → 仅组C 语义移植。

### 1.5 组E profile vendor 补丁（4 项，不在壳路径，进门禁）
1. `@bpc-oss/dsh-verification/lib/index.js`（10 行差；`vendor-pkgs/` 孪生同内容→同改；自造 `// P0` 标记 A0 登记改前缀 **V1** 防命名空间冲突）
2. `dsh-token-meter-hermes/lib/breakdown-projection.js`（34 行；v205 `cachedSnapshot(meta, inheritedEventCount, keys)` 新签名 → G5 投影往返）
3. `chrome-faithful/src/chrome-profile-launcher.mjs`（13 行）
4. vendor-archives 3 个重建 bpc-oss tgz
（research-orchestrator.mjs 与 bak 逐字节同=未修改，已剔除）

### 1.6 A0/A1 前置治理
- manifest：baseline→0.1.1-rc.2；sourceSpec 8 项改实版本；P1/P13 sourcePath 断链标注+反建 diff；P16 sourcePath 散文改路径；`017c`/`018` patch 头重写 `+++ b/<pkg>/<rel>`；apiproxy 同文件 P7/P9/P13/P18 合并单文件序列 patch（声明 apply 顺序）；typert/死副本 drift 白名单登记。**verify 工具=实存的 `oh-my-whale/patches/host/verify.ps1`（3306B）+ `patches/profile/verify.ps1`（1134B）**，A0 幂等验证用。
- A1 基线**精确清单**：`npm pack` @deepseek-ai **6 包**（dsh-llm、dsh-llm-pi-ai、dsh-llm-deepseek、dsh-tool-fs、dsh-client-ui-conversation、dsh-client-ui-attachment）@0.1.1-rc.2 **+ `@earendil-works/pi-ai@0.82.1` = 共 7 次 pack**（19 宿主包中 12 已有基线）→ 全量 diff 闭合"未证"缺口 → 30 项标准 diff。

## 2. 执行序列

### Phase 0 预备（全可逆）
- A0 manifest 治理 + P20–P24 登记（§1.6）
- A1 基线补齐（§1.6 精确清单）+ 30 项标准 diff
- A2 情报树补全 + 锚点核对表：
  - v205 提取**缺 unpacked 根层：`lib/`、`build/`、`cordis.patch.yml`、`package.json`、`package-lock.json`** → 从 app-64.7z 对应层级重提取；`lib/` 完整性断言口径=**≥ v205 asar header 声明条目数（81）**（rc.2 的 63 仅对照），**A2 不完成禁开 Phase 1**
  - 30 项锚点 grep 计数表（含 P17c 补测、P3*/P17*/P18b* 按位复核、P24 现场行号）+ 组C 落点复验 + P7 denylist 实采键清单（§1.3）+ 组E 与新 cordis 兼容面
- A3 环境冻结（顺序锁；全动态枚举，禁硬编码 PID）：
  1. 用户排空/退出全部 DSH 会话并确认
  2. `Disable-ScheduledTask` **逐字 4 项**（勿用 *dsh* 名过滤——第 4 项不匹配）：`dsh-voice-auto-patch`（每 10min 整体覆写旧壳 app.asar，判活按 `DeepSeek Harness` 不匹配 `DSH Desktop.exe`→误判壳未跑）、`dsh-voice-auto-patch-tick`、`DSH-Fix-Serve`（每 2min tailscale serve reset=远程暴露面漂移）、`GLM53-Responses-Shim`（logon 跑 `.dsh/tmp/start-glm53-shim.cmd`）；记录 `tailscale serve status` 基线
  3. 杀壳进程树：`Get-CimInstance Win32_Process -Filter "Name='DSH Desktop.exe'"`（**勿用 ExecutablePath 等值 WQL——反斜杠转义实测返回 0，致命**）+ `ParentProcessId` 递归收集子树（renderer/gpu/network/audio/crashpad/chrome-faithful node 子进程）；chrome.exe **仅杀 DSH 子树闭包内**的（实测 58 活 chrome 中 0 个命令行含 DSH——按名整杀=误杀用户浏览器；闭包计数 0 则跳过）→ kill → **轮询验证 app.asar 可写（重试 10 次，失败即中止）**
  4. 基线三元组（**A3 现场重取，文档数字仅示意**——P24 类并发写使条目数漂移；实测参考：HKCU Uninstall 子键 45、`%LOCALAPPDATA%\Programs` 目录 21、安装目录条目 37,06x）：**存清单非仅计数**
  5. drift-scan 终验（防 P24 式并发改动再入）
  - 会话安全已证：kimi.exe 树祖先=WindowsTerminal，无 DSH 祖先——A3 不自杀
- A4 快照（安装前一刻重拍）：
  - 整壳：`robocopy "…\DSH Desktop" "…\backups\shell-2.0.1-20260910" /MIR /COPY:DAT /R:1 /W:1 /XD vlm_frames .dsh-vision-toolkit /XF debug.log rgblight.mp4`（实测壳目录 0 reparse，无链接丢失问题；**/XJ"保留 reparse"旧表述作废**；将来需含链接复制用 bsdtar --win-attributes）+ sha256（app.asar、exe）
  - 链接图基线（**钉死口径，可复现**）：`Get-ChildItem -LiteralPath <root> -Recurse -Force -Depth 3 | Where LinkType`（**不带 -Directory**），三 root=`profiles/web/node_modules`、`profiles/web/.dsh-module-fallback/node_modules`、**`profiles/node_modules`（整层）**，按 FullName 去重 → `link-graph-before.tsv`。实测口径 TOTAL≈5362 / →壳≈594 / 已断≈59 / 外部 7（E:/dev/releases）；带 -Directory 会得 514/232/28 的另一口径——**A4 命令与 Phase 1 差分必须同一条命令，禁止跨口径相加；数字现场重取**
  - 活动 settings：`~/.dsh/settings.yaml` + sessions/ + `%APPDATA%\DSH Desktop` userData 清单（**.credentials.yaml 排除出 diff**）
  - patch-after-replay.txt 补全 30 项（现止于 P19b）；更新器冻结（app-update.yml 改名）+ state.json 备份；`backups/installers/DSH-Desktop-2.0.1-x64-Setup.exe` 登记 L3 禁删
- A5 profile `cordis.patch.yml` L150-161 结构损坏先修

### Phase 1 安装
- `v205-intel/setup.exe`（134,265,015B、FileVersion 2.0.5、payload 0.1.2-rc.1/4.0.2/0.84.3 已核）
- 硬断言（失败即中止回滚）：HKCU 键清单不变、Programs 目录清单不变、唯一被改目录=DSH Desktop、版本三元组正确（防"第二个壳"——机上另有 `C:\Program Files\DeepSeek Harness` 旧壳残留+被 voice-auto-patch 定期改写，A3 已停）
- 新壳更新器即刻冻结 + `updates/` 观察位
- link 差分（**与 A4 同命令**）→ 复活/新断比对预期 → 前置清账（§1.4）→ 组D 处置树执行
- 不启动桌面版 → Phase 2

### Phase 2 补丁重放（B验证 → A → 待测 → 重导出 → C → D → E验证；每文件动前存官方原件→`oh-my-whale/host-rc1-official/`）
- 组C 按 §1.3；P13 帧序单测；typert 改动入 drift 白名单；**前置交付：首字延迟探针**（§1.3 P13）
- **G1 无头 CLI**：`node "<unpacked>/@deepseek-ai/dsh/lib/bin.js" web` → 0 failed/0 pending + `require.resolve` 全清单打印（防 D2 实体副本被链遮蔽）→ 迭代到绿

### Phase 3 门禁（用户在场）
- G2 启动：HTTP 200、无白屏、历史 3+ 会话不闪退；billing 量化（首屏 p50<1s、账本字节 ±20%）
- G3 模型与工具：bai 5+dgx、思考挡位、reasoning_content 多轮、developer role；**点名往返**：litkit_doctor、smoke_hello、组E verification/token-meter 投影工具各 1 次
- G4 视频端到端：拖入→预览（P18c）→composer（P18b）→wire（P17 系）→glm/qwen 原生答对；非 video 模型 P20 抽帧；read_image→P21→P23 搭车链（e2e-video-*.mjs 探针）；**P24 计价合理性抽查**
- G5 子代理/fork：P16b marker 断言、fork-to-preset 按钮、@ 提及（P8）、fork 子会话 preset（P9/P10/P11/P12）、token-meter 新签名往返
- G6 性能：**P13 A/B 量化**（逐条 vs 合批首字延迟，降级唯一判据）、CPU 无 52% 回归（P2）、projcache 30s 级独立项（profile 覆盖键未变）
- G7 continuous-worker（可延后独立窗口）：A5 修复后去 disabled，验 v2 挂载
- G8 资源：**复用 `.dsh/tmp/pool-tags.ps1`**（非分页池逐标签）+ Get-Process Handles/WS；基线/每 5 轮/终态三采样；**阈值：非分页池增量 <200MB、句柄增量 <500、WS 增量 <15%**；会话开合 20 轮
- G9 验证窗口：禁 CLI 子代理实例；cordis.patch.yml/storages mtime 前后记录；`updates/` 无新下载

### Phase 4 收尾
- manifest baseline→0.1.2-rc.1；组C/D/E、P24、白名单入 note；**计划任务 4 项与 tailscale 按 A3 基线恢复原态**
- capture-sources → FINGERPRINTS.json commit → drift-scan 全绿；HANDOFF+lessons
- 收尾复审（对执行结果与文档一致性）

## 3. 回滚（三级）
1. **L1 unpacked**：停 → `robocopy "…/v012-upgrade-20260909/kernel-unpacked" "<unpacked>" /MIR /COPY:DAT /R:1 /W:1`（**不用 rm 手删**——/MIR 防 2.0.5 净增 31 包成孤儿残留）→ **重放 P20–P24**（备份早于它们）→ `New-Item -ItemType Junction` 按 link-graph-before.tsv 重建（先删残留实体）→ **更新器冻结位恢复**
2. **L2 整壳**：`robocopy <shell-2.0.1-20260910> "…\DSH Desktop" /MIR /COPY:DAT /R:1 /W:1 /XD vlm_frames .dsh-vision-toolkit /XF debug.log rgblight.mp4` → 同上重建链接 + **更新器冻结位恢复** → 重放 30 项标准 diff（A1 产物）
3. **L3 重装**：installers/2.0.1 setup.exe → 30 项全重放（最后手段）
- **禁**：整树回拷 profile-web 备份（58,934 实体化文件毁链接农场）；删任何 backups 子目录
- 触发：G1 >30min 不通，或 G2-G6/G8 任一失败无法当场定位

## 4. 风险登记
- R1 组C 全"需大改"，P13 最高险 → 形态已锁（§1.3），降级须过 G6 量化，仍阻塞则回滚
- R2 整壳回滚缺口 → A4 备份 + L3 installers **CLOSED**
- R3 组D 断链（8 包）→ D1 主线/D2 实体兜底（路径钉死）/G1 解析打印
- R4 安装器不触 .dsh；userData 首启改写 → 快照+diff
- R5 typert 生成物补丁漂移 → 白名单 + 单测
- R6 更新器机制未明 → 冻结+观察位双保险
- R7 v205 树 lib/build 层未提取 → A2 硬门禁（断言口径=header 81）
- R8 **活体并发修改**（P24 实证）→ §0.4 用户约束 + A3-5 drift 终验
- R9 计划任务覆写 asar/tailscale 漂移 → A3-2 四项点名禁用 + Phase 4 恢复

## 5. 验收定义
- 方案过关：**已达成**——三轮审查后 R3'' APPROVED；R1''/R2'' 必改项全部并入本 v5.1（附 2 销项记录），R2'' 结论"改毕即可进入 Phase 0"
- 执行过关 = G1-G6+G8+G9 全绿（G7 可延后）+ drift-scan 全绿 + Phase 4 收尾复审通过
- 任一 BLOCKER 新证据 → 停，回方案桌

## 附：v4→v5 变更摘要
P24 反转（残留→活跃#30）｜组D 反转（共存→断链+fallback 官方机制查明+清账前置）｜计数表锁定｜A1 精确 7-pack｜组E 4 项+V1 前缀｜P18 ≥7 处/4 包+行号修正｜P13 形态锁定+降级量化｜link 口径钉死｜/XJ 作废｜A3 动态枚举+计划任务+会话安全｜M4 三元组｜更新器观察位｜G8 阈值/节拍/pool-tags｜G3 点名工具｜P7 判定命令+白名单｜verify.ps1 纠错｜typert-registry 销疑｜package-lock 入缺项。

## 附2：v5→v5.1 第三轮终审销项
P17/P18b 星号入组A 规则（按位复核）｜P24 行号"以现场为准"｜P16b 措辞防自动解析踩坑｜**link root3 还原整层 `profiles/node_modules` 并改引 5362/594/59 口径（A4=Phase1 同命令）**｜**WQL 过滤器改 `Name='DSH Desktop.exe'`**｜chrome.exe 限子树闭包+计数 0 跳过｜计划任务第 4 项 `GLM53-Responses-Shim` 点名｜基线三元组"现场重取，数字仅示意"｜L1 改 robocopy /MIR 防孤儿｜L2 补 /R:1 /W:1+更新器位｜A2 lib 断言口径=header 81｜P7 denylist 实采动态键｜P13 bufferedAmount 1MB/30ms 初值｜Phase 2 前置首字延迟探针｜D2 路径钉死 web/node_modules｜§0.4 并发停写用户约束。

## 附3：Phase 0 执行记录（A0/A1/A2 完成，2026-09-10 晚）+ v5.2 修订（权威覆盖前文）

### 完成态
- **A0 ✓**：manifest 治理落盘（备份 manifest.json.bak-a0-20260910；baseline→0.1.1-rc.2；sourceSpec 8 项改实；sourceBroken P1/P13/P16；P20–P24 登记；vendorPatches V1–V4；driftWhitelist 4；apiproxySequence P7>P9>P13>P18；017c/018 -v2 标准头件通过 git apply -R 反向校验）。**A1 孤儿扫描后补登记 P25 → 补丁总数 31**（`node -e` 实测 patches=31）。verify.ps1 自身缺陷（EAP=Stop+git stderr 中止）已知悉，Phase 0 内治理。
- **A1 ✓**：8 次 npm pack 全成（7+token-meter；pi-ai@0.82.1 与安装树一致）→ `oh-my-whale/patches/rc2-diffs/` 23 个 diff 覆盖 31 项（含 3 个同文件合并件）；**23/23 前向应用逐字节 cmp PASS**。安装树多数目标为 CRLF、官方件 LF → diff 用 --strip-trailing-cr，EOL 归类见 ORPHANS §C1。
- **A2 ✓**：v205 树补提取闭合（setup.exe 重解 app-64.7z SHA 同源证明；lib 126 文件逐字节==asar header、build 9/9、cordis.patch.yml、package.json；**反转：package-lock.json 官方 payload 根本不包含，非遗漏**——前文缺项清单作废）。锚点表 `tmp/v205-intel/anchor-table-v5.md`。

### v5.2 分组修订（取代 §1.0 表；总数 31）
| 组 | 成员 | 数 |
|----|------|---|
| 组A REPLAY_OK（v205 锚点实测通过） | P1(12/12，loader 已 bump 1.0.3 仍存活) P2 P3* P4 P8 P14 P17b P17c(补测过@814 唯一命中) P18c P22 P23 P24(4/4，行号现场 CHARS@16/case@44/default@47) | 12 |
| 重导出队列（锚点漂移，Phase 2 按 v205 实码重生成） | P6(cache→runtime 改名) **P17**(userContent 3 参化) **P18b**(2 行局部化) P19(export 行) P19b **P20/P21**(0.1.2 llm-pi-ai 图像管线重构 toPiContext(options,images,onReplayDegrade)@1201；tool-fs displayPath 文案族) **P25**(P20 同族) + **P16b**(随 P16) | 9 |
| 组C REPOSITION 移植 | P7 P9 P10 P12 P13 P18（规格仍按 §1.3，行号 A2 现场吻合） | 6 |
| SKIP_NATIVE（验证后免打） | P11(v205 原生 wireHeader→seedLength@1424；resolveSessionPreset 全树消失) P15(emitDisposed@639 原生 catch；error.stack 一行可选) | 2 |
| RETEST | P16（**可能大部原生取代**：v205 SUBAGENT_DESCRIPTOR_VERSION=3+composeFrom+coldResume 全套；`version!==2` 族 0 命中 → Phase 2 前与标准 diff 逐行对读） | 1 |
| 组B-Profile | P5（现树实测在位） | 1 |

### v5.2 事实修正（覆盖前文对应处）
1. **P25 收编为第 31 项**（不采纳"回滚它"选项——它是视频链网关体积守卫，回滚会破坏 G4 全链）：dsh-llm-pi-ai `__p25OffloadOldVideos`，脚本 p25_patch.js(17:37)，并发会话 17:42 打上。并发现该会话另建了交叉登记 `{{USERPROFILE}}/.dsh/patches/dsh-video-patches.manifest.json`（含 sha256+.bak 清单，p26_manifest.js 为其脚本，非代码补丁）。**R8 并发漂移风险坐实且活跃（今日 17:14 P24 → 17:42 P25）**。
2. §1.4 组D 补强：better-sidebar `CHUNK_EXTERNALS` 按名引用 3 个净移除包、super-injector dev-install 生成模板触名 → 不止 bash-terminal 一族；真符号 import 仅 bash-terminal `defineStore`，且 **dsh-client-store 无 ./client 子路径，D1 换名必须用根路径 import**。D2 权重↑。
3. Phase 1 差分预期修正：**复活≈57**（A2 实扫 profiles/node_modules 层 589 链/57 死，全为 00:16 CLI 预放 v205 新增包链接，升壳自动复活）；真断链面=净移除 5 包的引用；P7 require.resolve 验证移到装后（现必失败）。
4. P7 denylist 输入闭合：静态 SessionProjectionMap in typert.host.js:1727-1728 + **实采 15 个动态投影键**（421 会话 projcache；contextBreakdownHermes/verification 证实）→ 落 `anchor-table-v5.md`。
5. L1/L2 回滚"重放 30 项"→ **31 项**；patch-after-replay.txt 补全口径=31。
6. A2 缺项清单中 package-lock.json 作废（官方无此件）。

### Phase 0 剩余 = A3/A4/A5（冻结窗口，须用户配合）
- A3（用户退出全部 DSH 会话+约束并行 agent 后执行）→ A5（cordis.patch.yml 结构修复，live-reload 敏感故并入冻结窗口）→ A4（装前一刻重拍：整壳备份/链接图/settings/31 项 patch-after-replay/更新器冻结）→ 交付 Phase 1 开闸检查单。

## 附4：G3 门禁期发现的第 32 项补丁 P26（2026-09-11 02:25）
实机 Playwright 驱动 CLI host（3080）跑对话往返时，`session/create` 稳定报 `gateway/internal: session.events is not iterable`。根因：**0.1.2 内核删除了 rc.2 的 `Session.get events()` 公共访问器**（改为 `snapshotEvents(fromSeq,toSeq)`/`ownEvents()`），但 7 个 profile 插件仍按 `session.events` 迭代（@bpc-oss/dsh-verification×5、better-sidebar、super-injector、vision-toolkit/exposure、openpencil/presentation-hydration、chrome-faithful/entry）。属与 P24/P25 同源的 v205 API 漂移，前 31 项审查清单未覆盖（那是"我们主动打的补丁"，此项是"官方删了我们的依赖面"）。
- 修复：在 `dsh-session/lib/index.js` snapshotEvents() 上方插回 shim `get events(){ this.eventsSnapshot ??= Object.freeze([...this.log]); return this.eventsSnapshot; }`（复用 append 处 `this.eventsSnapshot=void 0` 的失效语义）。`.bak-agentos-preplay` 在位。
- 验证：重启 CLI host 后 create+发消息（glm-5.3-flash/Max，答"正常"）、fork 父子双向（子答"可用"）、视频端到端（纯蓝视频答"蓝色"，token 2K→7.4K 印证 P24/P25）全过；console 仅剩 `/billing/session/*` 404（agent-50 修复中，独立问题非 P26）。
- manifest 计数：patches=32（P1–P26 + P16b + P17b/c + P18b/c + P19b）；新增 rc2-diffs/P26-session-events-getter-v205.diff（纯 P26 单 hunk）。
- 教训入档：升级审查必须把"官方内核**移除**的公共 API"作为独立扫描维度（前几轮只查了"我们要打的补丁能否重放"，没查"我们插件依赖的内核面是否还在"）。G8 完整 20 轮开合阈值测试留待桌面版运行期补测（当前快照 WS 772MB/502 句柄/17 线程，无异常增长）。

## 附5：三轮审查 A/B/C 闭环修订（2026-09-11 03:30-04:10）
**已修**：
- P17b EOL 漂移（git apply autocrlf 重写 2068 行 CRLF）→ 已回 LF，diff 纯度复核 ✓。
- V5/V6 登记：并行会话 00:54 修的 fork-to-preset / routed-subagent 内嵌 dsh-subagent 副本（snapshotJsonValue 同 P26 类漂移）→ manifest vendorPatches 6 项。**遗留**：插件源仓（{{AI_FILES}} 两项目）需把嵌套副本修复回写上游，否则重装回退。
- sha256 基线：v205 asar `96fdbe15…`/exe `31994b23…` 落 phase0/sha256-v205-baseline.txt。
- manifest：baseline→shell 2.0.5/kernel 0.1.2-rc.1/cordis 4.0.2/pi-ai 0.84.3/loader 1.0.3；P11=skip-native（审查A 证实 seedLength 原生@1442、resolveSessionPreset 全树消失）；P15=skip-optional-diagnostic；P9/P24 note 修正（官方 fork 走 header+seedLength；P24=定值估算非 b64 长度）；verify.ps1 加 skip-* 桶 + P26 锚 + manifest 加 UTF-8 BOM（PS5.1 编码坑）。**终态：HOST 32 项 PASS=29 PENDING(skip)=2 SKIPPED(P5)=1 FAIL=0；PROFILE V1-V4+P5 5/5。**
- 审查B 校正记录：G4 视频/计价表述已纠偏（真绿点=像素级蓝色真值+ftyp 附件块）；"02:38 启动"应为 02:43；"agent-preset/selected 显式提交"仅 fork-to-preset 路径触发、官方分支按钮不触发（如实改 P9 note）。

**L1 回滚修订（审查C 致命缺口，取代 §3-L1 原文）**：rc.2 树无 dsh-client-store → L1 现文字会毁组D 8 插件。正确步骤：①停壳 ②robocopy kernel-unpacked /MIR ③重放 P20–P25（**用 rc.2 形态老脚本**，p24_replay_v205 类 v205 变体禁用）④**跳过 P26**（rc.2 原生 .events getter）⑤**回退组D**：17 个 *.bak-agentos-p2d（实测计数，复审修正） 还原 + 删 profiles/node_modules/@deepseek-ai/dsh-client-store junction ⑥fallback 农场只重建 profiles 两root（.dsh-module-fallback 归官方 rmSync 管，勿照抄 before.tsv）。

**新事实（用户晨间决策，唯一可吞掉整个升级窗口的风险）**：
1. **更新器未被 yml 改名冻死**——state.json 已升 v3、提示 **2.0.9**（feed 读在编译层）。选项：a) 硬冻结（防火墙 block 更新 feed / 注册表关自更新）b) 直接再追 2.0.9（先做 2.0.9-vs-2.0.5 内核漂移评估，32 项重放成本已文档化）。**现状 2.0.5 运行不受影响，但下次任何重启都可能弹升级框**。
2. 计划任务 4 项目前保持禁用；DSH-Fix-Serve 建议长期禁（tailscale 基线端口 57224 已死，恢复=重开远程暴露）；voice-auto-patch 只写旧壳（C:\Program Files\DeepSeek Harness），要新壳语音需移植 media 补丁后再谈恢复；GLM53-Shim 恢复取决于你是否还依赖它。
3. 旧壳目录清理与否（它是"第二壳"断言干扰源）。
4. 桌面版 02:43 起至今零对话轮次（审查B）——请在桌面版随手发一条消息作最终 real-shell 烟测，我在日志端盯 health。

## 附6：二轮复审销项（2026-09-11 04:20-04:40）
1. P26 diff 已重建（LF 纯净、hunk 头 1333 正确，严格 `git apply -R --check` 无 ignore **PASS**）；生产文件缩进同步归一（node --check 过）。
2. 视频漂移 manifest：P18 条改指 api-session-controller 新落点+重哈希、appVersion→2.0.5（node+PS 双解析复核，apiproxy 残留引用=0）。
3. L1 步骤⑤计数 14→17 已订正（附5 原地改）。
4. **G6/P13 降级选项明文放弃**：首字延迟 A/B 探针未交付，按二轮复审要求改判——P13 合批为常开功能（帧序 5/5 单测+背压水位已证），不设"回退逐条 send"选项；后续如现蹦字滞后按新缺陷直接开工单，不再引用未建成的探针。
5. verify.ps1 P11 锚改指原生 seedLength 证据文件（假红消除）；双 scope 终跑 FAIL=0。
6. 更新器 2.0.9 与计划任务恢复 = 用户晨间决策（附5 已列）。**桌面版烟测通过后，本次升级宣告完成。**

## 附7：2.0.9/0.1.5 迁移与 asar 完整性 fuse 处置（2026-09-11）

**背景**：上游 2.0.7+ 把内核整体装进 `resources/app.asar`（`app.asar.unpacked` 只剩 node-pty/@img 等原生件），并启用 Electron fuse `EnableEmbeddedAsarIntegrityValidation`。我们补丁后必须 repack app.asar（32 项全落，权威源树 `{{USERPROFILE}}/.dsh/tmp/v209-intel/asar-root/`）。

**为什么 repack 必配关 fuse**：`EnableEmbeddedAsarIntegrityValidation=on` 时 Electron 按安装方写入 exe 的哈希只认官方 app.asar，任何 repack 都会让主程序拒绝启动。repack 唯一配套动作 = `npx @electron/fuses write --app "DSH Desktop.exe" EnableEmbeddedAsarIntegrityValidation=off`（改的是 exe 内 fuse 配置字节，exe 已整份备份：`{{USERPROFILE}}/.dsh/tmp/v209-intel/exe-backup.bin`，`{{USERPROFILE}}/.dsh/backups/v209-pristine-20260911/` 内另有同名副本+sha256）。**`OnlyLoadAppFromAsar` 保持 on 不动**——它只禁 asar 外目录/文件劫持，与 repack 不冲突，留着是安全增益。

**运维提示（补丁全灭风险）**：下次官方自动更新（更新器会重写 exe + resources）会把 fuse **重置回 on** 并覆盖 repacked app.asar——补丁集整体瞬间失效（表现为行为回退，非崩溃）。因此：**任何官方更新后、启动桌面端前**，先重放 repack（按 `patches/manifest.json` `baseline.applied.v209` 与各 patch `v209` 落点核对）再翻 fuse，或先走还原路径（`backups/v209-pristine-20260911/README.txt`）。更新器是否自动跑由用户晨间决策项控制（附5/附6），建议保持手动更新。补丁态验证统一走 `patches/host/verify.ps1` v4：`-Source asar-root`（源树，默认）/ `-Source installed`（解包装机 app.asar 到 `patches/host/.asar-cache/` 缓存复用），exit 语义不变（skip-*/pending 不算 FAIL）。2026-09-11 双模式实跑均 FAIL=0（P12 在 0.1.5 已被官方吸收→skip-absorbed；P13 落点重写至 dsh-api-gateway 写链 WRITE_* 常量区；V6 嵌套副本改 void-superseded，farm 自愈接管）。

## 附8：2.0.9 实机矩阵期新发现（2026-09-11 15:0x）
- **P27（第 33 项，v209-drift）**：0.1.5 新增 session-format v2→v3 迁移层的 `assertContentKind` 白名单不含我们自定义的 `video` content kind → 含视频消息的会话（如昨晚 fork 子会话 dbf15a30）**历史加载直接失败**。修复=CONTENT_KINDS 加 "video"（迁移其余逻辑原样透传内容，grep 证实该文件无其他 video 分支）。已实测验证：P27 后 dbf15a30 历史加载成功、"蓝色"视频答案完整渲染。diff=`rc2-diffs/P27-format-v2v3-video-kind.diff`，manifest 已登记。**教训（第三次同类）**：官方每加一层"格式/校验/迁移"新关卡，都会对自定义模态说"不认识"——以后升级把「新校验层对 video kind 的态度」列入锚点预检固定项（G4 门禁必须含"旧视频会话历史加载"而非只测新会话）。
- **待诊断**（agent-62 进行中）：凌晨失败 create 留下的 202 字节 header-only 空壳会话（5 个）点开报 "failed to project s…"，并诱发客户端 `/api/commands/list` 无限重试风暴（898 次/页，ERR_INSUFFICIENT_RESOURCES）；另有 voice/config 404/405（voice webServer register 重写后路由未挂上）。
- **运维提醒**：当前安装的 asar = packed-final（31 项时点），P27+后续修复**尚未 repack 进安装树**——agent-62 结论出来后统一重打一次并重启桌面版。
- **P28（第 34 项，官方 bug 非我方补丁）**：68cdbcc8 全帧解码取证——历史加载失败元凶是 source.kind 白名单缺 `fallback`（0.1.1 时代 session/title 兜底）与 `instruction-hint`（dsh-agent-instructions 注入），**0.1.5 v2→v3 迁移层不认识自己近期祖先写的合法 artifact**（whitelist 仅 15 kinds）。修复=SOURCE_KINDS 加 2 项（迁移其余为断言+透传）。全 233 会话后台扫描中（bash-f045e57c），若还有第三种未知 kind 会并入。verify 34 项 FAIL=0。此发现同时大概率解释 commands/list 风暴（agent-62 验证中）：会话历史 500→客户端重试循环。
- **结构事实（P0 待办，agent 空闲后执行）**：0.1.5 桌面运行时经 `profiles/node_modules` 农场（484 条）与 {{AI_FILES}} 嵌套 junction 实际**依赖 `~/.dsh/tmp/v209-intel/asar-root/` 实体目录存在**（CLI 解析根 + 插件裸 import 落点）。tmp 被清理=全农场悬空、桌面版/CLI 双炸。计划：迁移至稳定路径 `{{USERPROFILE}}/.dsh/runtime/v209-patched-tree/`，批量重指 junction（脚本化：profiles 三层 + {{AI_FILES}} 两处），迁移后农场会被下次 boot 自愈机制以新 closure 路径重写核对。执行窗口=等 agent-62/63 完成（它们正在读 asar-root）。

## 附9：v209 三切面独立审查与整改（2026-09-11 晚）
**审查结果**：A 完整性 **0 BLOCKER**（22094 条目逐项 sha 穷尽比对，28 个差异文件 1:1 归属 35 项，0 意外；P26-P29 diff 严格反向可 apply）；B 功能证据**打假成功**；C 操作安全给出真实更新器架构（非 electron-updater！是壳自研 desktop-updates，feed=dshdesktop.cn，双确认弹窗无静默安装，风险大幅低于附7 假设）。
**B 打假记录（诚实更正）**：①"V7OK 往返成功"= **假绿**——我误读 UI（innerText 命中我自己发的消息），磁盘帧证据显示该轮 turn/end reason=user-aborted，回复未落盘；真往返取证列入未办②。②voice"200 验证"为真（我对终审员的日志检索范围有异议：curl 输出在 shell 不在 log 文件），但其代码有三实洞（无界 body/无 try-catch/无 method 守卫）已列加固。③P29 三洞（force 无限速、fetchCommands 无超时、pending 永挂）成立。④V7 桥"首写者独占全局+掩盖真实缺失"成立→改局部闭包 fallback。⑤68cdbcc8 的 provider/verifier-guide kind 不在此会话（来自全库扫描），我表述混拼，已更正。
**账目修正（已做）**：P20-P24 patchFile 悬空→指实文件（dangling 清零）；top-level baseline→2.0.9/0.1.5-rc.1；V2 并 surface-fold V2.2；V5/6/7 补 file 字段；rc2-diffs README 补 v209 索引；pristine README xcopy→robocopy /MIR+shasum cd 注记。
**加固（agent-68）**：voice fix4（405 守卫/4MB 上限/Buffer.concat/try-catch 信封错误）；P29 补洞（15s 超时/250ms force 合并/pending 不双发）；V7 局部化（去全局污染，`__bsModuleSystem` fallback）；**P30**=lib/updates.js enabled default→false（打补丁式冻结自动更新，重打包入机）。
**仍欠（终报前必做）**：①真往返取证（CLI 发起→等 turn/end 正常落帧→curl 再验）；②content-kind 全库扫描（现只扫了 source.kind）；③asar-root 迁移 `runtime/v209-patched-tree`（484 链依赖 tmp，清理=双炸）；④桌面壳内人肉烟测（用户）。
- **v209-config-drift #4（persona text→prefix，已修+用户实测通过）**：0.1.5 `dsh-persona` Config 把可选 `text` 改为必填 `prefix`（`z.object({prefix: z.string().required(), ...})`）→ 13 个 preset 的 `agent.cordis.yml` persona 段挂载失败（`session resume: preset failed to mount persona: invalid config S.prefix missing`）。批量修复器（行级，仅动 `- id: persona` 后 config 块的 `text:`→`prefix:`，保内容不变）13/13 落，各留 `.bak-v209-persona`，YAML 全合法、各文件恰好 1 prefix。前瞻扫描（agent-69）核对其余 11 类 preset 行是否有同类 required/strict 收紧。**模式定论**：v209 升级后累计 4 类"新校验层拒旧产物"（P27 video content kind、P28 六 source kind、persona prefix、+voice 路由 owner fiber）——已全部纳入固定回归项。
- **preset 行 schema 前瞻扫（agent-69，终审响应）**：除 persona 外 28 包全部安全。关键事实：schemastery z.object 默认非 strict（多余键良性透传），真风险面只有三类——`.required()` 新增、字段改名、手写 validateKeys 白名单（compaction 系，键集未变）。tool-subagent 新增均为带默认值可选。**升级 SOP 固化**：升级前跑两树 `Config = z.object(` 文本 diff，盯上述三类。发现记录为 M1 note 附录。

## 附10：加固波完成与真取证（2026-09-11 20:5x-21:3x）
- **scan2b**：1631 会话逐帧全解码（5526s，0 错）——source/content 未知 kind 双双清零，P27/P28 白名单宣告闭合（终审A MINOR-8 解除）。
- **真往返取证 RT-2035（磁盘帧为准）**：新会话 `session-e542812c`——`assistant/message`(seq13，含真实推理与"收到")、`turn/end reason:{kind:"completed"}`(seq15)、`request/header` provider=bai。**新事实**：v209 起新会话文件名=`session.v3.jsonl.zstd`（旧会话保持 .jsonl.zstd；roundtrip-wait/扫描器需双 glob）。13 个 v3 会话复扫无新 kind。
- **persona M1**：用户实测 68cdbcc8 resume 无错（"没有报错了"）。
- **voice fix4 上线验**：POST /voice/ping → 200（engine:native, modelReady:true）；GET → 405（守卫活）。终审B 指出的三洞（无界body/无try-catch/无method守卫）全关，mock 7/7 + 真 HTTP 双证。
- **P29v2**（超时15s/250ms合并窗/pending不双发）+ **P30**（updates.js enabled default=false）+ **V7局部化**（不污染全局，外部优先）全落 runtime 树；diff 严格反向可 apply。终审B 对"日志佐证循环论证"的批评记录在案——本次证据全部换为磁盘帧/真 HTTP。
- **迁移**：asar-root→`runtime/v209-patched-tree`，484 链重指、残留 0；tmp 旧树暂留作对照，复审过后删（释放 500MB 或留）。
- **final2 asar 部署**：sha `21a21b14…`（36 项全含），桌面版 2.0.9 启动干净（7 proc、43120、主窗、无新 diagnostics zip）。
- **环境噪音备忘**：bash 起的 CLI host 里 node-pty 子进程会 AttachConsole failed 崩（无 console 环境特有；桌面版终端 chunk 已实证 xterm 正常）。roundtrip 工具因此仅 CLI 场景需留意。

## 附11：第二轮复审闭环（2026-09-11 22:0x）
复审1（agent-70）判加固波 8/9 闭环 + 3 MAJOR 门禁/账本缺口，全部已修：
- **MAJOR-1 修**：verify.ps1 默认源切 `runtime/v209-patched-tree`（tmp 旧树可删）；新增根层目标解析分支（P30 的 lib/updates.js 在 asar 根不在 node_modules）；P30 符号锚。终态三跑全绿：host[asar-root]=host[installed]=36 项 FAIL=0，profile 9 项 FAIL=0。
- **MAJOR-2 修**：voice fix4 登记 **V8**（含 fix1→fix4 演化史与"无需 repack"链证）；V2 companions 语义改为 sibling 注记；V7 双件 target2。
- **MAJOR-3 修**：`baseline.applied={v205,v209}` 段建立（附7/README 引用的幽灵段落地），v209 段含装机 asar sha `21a21b14…` 与树路径。
- MINOR 修：rc2-diffs README 装机 sha 更新 21a21b14；P27/P28 重放互斥序声明；P21/22/24 补 patchFileFixedA；governance 3 死链与 dsh-client-web→旧壳链记入"第二壳清理"决策关联。
**桌面版当前态**：2.0.9 final2（P29v2+P30 在包内）、43120 监听、无新 diagnostics；真往返 RT-2035 已磁盘帧闭环（turn/end completed）。
