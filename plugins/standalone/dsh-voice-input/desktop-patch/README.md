# 桌面麦克风权限自动补丁（dsh-voice-input 配套）

## 背景
DSH 桌面应用（Electron）在 `app.asar` 内置 `hardenSession()`，**拒绝一切权限请求**
（含麦克风），导致桌面窗口内无法使用任何语音输入插件。

本补丁仅放行 `media`（麦克风/摄像头）权限，其余权限仍一律拒绝。

## 机制（全自动，无需手动操作）
- 计划任务 `dsh-voice-auto-patch`（登录时） + `dsh-voice-auto-patch-tick`（每 10 分钟）
  运行 `auto-patch.ps1`；
- 脚本发现 `app.asar` 未含补丁时：应用运行中则等其退出（≤30 分钟），退出后自动替换，
  原版备份为 `resources\app.asar.orig-dshvoice`；
- 应用更新覆盖 `app.asar` 后，脚本会在下个周期自动重新补丁（持久生效）。

## 文件
- `app.asar.patched` —— 补丁版参照（由官方 `resources\app.asar.new` 建立）
- `auto-patch.ps1` —— 自动补丁脚本
- `patch.log` —— 执行日志

## 撤销
```powershell
schtasks /Delete /TN "dsh-voice-auto-patch" /F
schtasks /Delete /TN "dsh-voice-auto-patch-tick" /F
# 应用退出时恢复原版：
Copy-Item "C:\Program Files\DeepSeek Harness\resources\app.asar.orig-dshvoice" `
          "C:\Program Files\DeepSeek Harness\resources\app.asar" -Force
```

## 验证
桌面窗口打开会话 → 点 🎤 → 应直接进入红色聆听态（不再报权限拒绝）。
