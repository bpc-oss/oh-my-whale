# ============================================================
# dsh-voice-input 桌面麦克风权限自动补丁（持久化）
#
# 目标：应用每次重启后，桌面窗口的麦克风权限自动放行。
# 原理：DSH 桌面应用（Electron）的 app.asar 内置 hardenSession 拒绝一切权限；
#       本脚本维护一份补丁版 app.asar（仅放行 media），在应用退出后自动替换，
#       并保留原版备份。应用更新覆盖 app.asar 后，本脚本会在下个周期自动重新补丁。
#
# 触发：登录时 + 每 10 分钟（计划任务 dsh-voice-auto-patch*）。
# 逻辑：
#   1. 参照补丁版缺失 → 从 resources\app.asar.new 建立参照
#   2. 当前 app.asar 已含补丁 → 无事退出
#   3. 未补丁：应用运行中 → 等它退出（最多 30 分钟）→ 补丁；未运行 → 直接补丁
# ============================================================
$ErrorActionPreference = 'Continue'
$res  = 'C:\Program Files\DeepSeek Harness\resources'
$proj = 'C:\Users\Administrator\dsh-voice-input\desktop-patch'
$ref  = Join-Path $proj 'app.asar.patched'
$log  = Join-Path $proj 'patch.log'

function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Out-File $log -Append }

New-Item -ItemType Directory -Force $proj | Out-Null

# 1) 建立参照（首次）
if (-not (Test-Path $ref)) {
    if (Test-Path (Join-Path $res 'app.asar.new')) {
        Copy-Item (Join-Path $res 'app.asar.new') $ref -Force
        Log '参照已建立: app.asar.new → app.asar.patched'
    } else {
        Log '无参照来源（resources\app.asar.new 缺失），跳过'
        exit
    }
}

# 2) 当前是否已补丁
$patched = $false
$active  = Join-Path $res 'app.asar'
if (Test-Path $active) {
    $bytes = [System.IO.File]::ReadAllBytes($active)
    $text  = [System.Text.Encoding]::ASCII.GetString($bytes)
    $patched = $text.Contains('permission === "media"')
}
if ($patched) { exit }   # 已生效，无事

# 3) 未补丁：等应用退出
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ((Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue) -and $sw.Elapsed.TotalMinutes -lt 30) {
    Start-Sleep -Seconds 3
}
Start-Sleep -Seconds 3
if (Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue) {
    Log '应用 30 分钟内未退出，本次跳过（下个周期重试）'
    exit
}

# 4) 执行补丁
try {
    if (Test-Path $active) {
        $bak = Join-Path $res 'app.asar.orig-dshvoice'
        if (-not (Test-Path $bak)) { Copy-Item $active $bak -Force }
    }
    Copy-Item $ref $active -Force
    Log '补丁已应用 ✓（桌面麦克风权限已放行，下次启动生效）'
} catch {
    Log "补丁失败: $_"
}
