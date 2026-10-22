# P2 回滚空跑报告

日期：2026-10-19

## 结论

**PASS**。2.0.18 可在隔离 profile 启动；回滚后基线逐项恢复。

## 1. 正向：2.0.18 安装与启动

| 项 | 结果 |
|---|---|
| 安装器 | `DSH-Desktop-2.0.18-x64-Setup.exe /S`，exit 0 |
| 壳版本 | 2.0.18 |
| 内核 | 0.2.1-rc.2 |
| `resources/app` 文件数 | 27,930（与 pristine 一致） |
| 启动 profile | `verify-0218`（从 `desktop` profile 复制，bundles = base + web-app） |
| 启动结果 | `application` scope 加载、host 正常写入、无插件加载失败 |

### 偏差（重要）

方案 P2.1 原写"`verify` bundles 留空则新建 `verify-0218`"。实测**空/headless 的 verify profile 无法启动 2.0.18 桌面**：

```
Error: profile "verify" must directly include @deepseek-ai/dsh-base before @deepseek-ai/dsh-web-app
```

已改为复制 `desktop` profile（bundles 恰为 `[dsh-base, dsh-web-app]`）。方案应据此修正：隔离 profile 必须是 base + web-app，不能留空。

## 2. 反向：回滚

| 步骤 | 结果 |
|---|---|
| 停止进程 | 0 |
| 删除 `resources\app` | 完成 |
| 重装 2.0.16 | exit 0；pristine 25,965 文件 / 2.0.16 / 0.2.0-rc.1 |
| 恢复 `shell-app.tar` | 25,976 文件；P41 needle 在位 |
| 清空 + 恢复 `~/.dsh` | home-core / sessions / attachments / globals / appdata 全部解包 |
| 链接还原 | `profiles/web` 5 个 link 依赖 `require.resolve` **5/5 OK** |

### tar 非零退出（不影响）

- `home-core rc=2`：仅旧 `releases/*/node_modules` 与 `web.bak-*` 中指向已不存在路径（`app.asar.unpacked`、旧 `Program Files`）的悬空符号链接；活动 profile 不引用。
- `globals rc=2`：`skills/cloudbase` 已由 home-core 解出（"File exists"），非丢失。

## 3. 回滚后基线核验

| 项 | 期望 | 实测 |
|---|---|---|
| 壳版本 | 2.0.16 | 2.0.16 |
| 内核 | 0.2.0-rc.1 | 0.2.0-rc.1 |
| `resources/app` 文件数 | 25,976 | 25,976 |
| `resources/app` 字节 | 774,926,232（739.0 MiB） | 一致 |
| `DSH Desktop.exe` | 244,654,080 | 一致 |
| 插件激活 | 24 健康 | 24 健康 |
| 补丁门禁 | 40 OK / 0 TODO | 一致 |
| 启动 profile | web | web，host 正常 |

## 4. 未完全执行项（如实记录）

方案 P2.5 要求"对 P0 归档做全树 SHA256 清单比对"。P0 只产出 tar 级哈希，没有逐文件清单；本次用**文件数/字节/exe 大小 + 关键文件哈希 + 链接解析 + 实机启动 + 门禁**替代。要补全需先从归档生成 per-file manifest（约 6 GB 解包 + 哈希），可作为 P10 的硬化项。

## 5. 结论

- go/no-go 闸门：**通过**
- 已回到 P0 基线，可进入 P3（正式安装 2.0.18）
