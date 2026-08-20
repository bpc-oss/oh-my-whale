# DSH 插件准入网关（plugin-gateway）

> 所有进入 web profile 的插件，必须通过本网关验证才允许装配。
> 独立进程、零依赖（node 内置）、不加载任何插件、崩溃不影响 host。

## 用法

```bash
# 验证一个插件目录（APPROVED → exit 0；REJECTED → exit 1）
node ~/.dsh/plugin-gateway/scripts/verify.mjs <plugin-dir>

# 严格模式：任何 WARNING 都视为未通过（需人工复核）
node ~/.dsh/plugin-gateway/scripts/verify.mjs <plugin-dir> --strict
```

验证报告 JSON 存档于 `~/.dsh/plugin-gateway/reports/`。

## 自动接入

`dev_install_package`（super-injector）在装配前自动调用本网关：
- 未通过 → 返回 ERROR，**不写任何 profile 文件**
- gateway 未安装 → 同样拒绝装配（fail-closed）

## 检查项

| # | 检查项 | 级别 | 拦截的事故 |
|---|---|---|---|
| 1 | `dsh.bundle.patch` 声明存在 + YAML 可解析 | 权威 | dsh-preset-subagent 缺声明启动崩 |
| 2 | 入口完整性（files + 本地 import 可解析） | 权威 | dsh-lco dist 缺文件 |
| 3 | 配置不超前于实现（zod enum 启发式） | 启发式 | lco mode: canary |
| 4 | 无裸 Windows 路径（必须 file:///） | 权威 | session-tool-unlock |
| 5 | 工具 schema object 根（defineTool 启发式） | 启发式 | litkit_* 400 |
| 7 | loader 内部访问模式（纪律层 WARNING） | 纪律层 | super-injector 自环 |
| 8 | 写放大上限（maxRecent/maxMessagesPerSession **超阈值 = FAIL 硬拒**） | 值级 | billing 52MB |

权威 FAIL = 硬拒绝；启发式 WARNING = 附报告放行（默认）或拒绝（--strict）；#8 值级超阈值 = FAIL（同权威）。

## 已知边界（诚实声明）

- **#3/#5 是启发式**：静态无法 100% 判定，权威判定靠运行时冒烟（P1 规划：DSH_HOME 沙箱 boot + tools.schemas() + 会话写入）。**#8 是值级策略**（超阈值 FAIL），其「写放大实际体积」仍需冒烟实测校准阈值。
- **#7 是纪律层**：运行时 reload 触发的 loader 自环拦不住（真正兜底是 loader 防环补丁，已上线 2026-08-20）。
- **非 dev_install_package 路径**（`dsh plugin add` / pnpm / vendor-archives / patch insert）当前无自动拦截，规划 audit-profile 定期扫描兜底（P2）。

## 变更记录

- 2026-08-20 v1.0.0：MVP（静态检查 #1/#2/#4 权威 + #3/#5/#7/#8 启发式），接入 dev_install_package。
