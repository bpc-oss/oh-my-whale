# check-env.ps1 - verify new-machine prerequisites before bootstrap
# v209 era (shell 2.0.9 / kernel 0.1.5-rc.1): the kernel ships INSIDE resources\app.asar
# (app.asar.unpacked holds only natives) and the patch landing tree is
# %USERPROFILE%\.dsh\runtime\v209-patched-tree — both checked below.
$fail = 0

Write-Host "=== oh-my-whale environment check ===" -ForegroundColor Cyan

# 1. DSH install + patched runtime tree (v209 layout)
$runtimeTree = "$env:USERPROFILE\.dsh\runtime\v209-patched-tree\node_modules"
$appAsar     = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app.asar"
$packedNm    = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules"
$oldKernel   = "C:\Program Files\DeepSeek Harness\resources\host\node_modules"

if (Test-Path "$runtimeTree\@deepseek-ai\dsh\package.json") {
  $ver = (Get-Content "$runtimeTree\@deepseek-ai\dsh\package.json" -Encoding UTF8 -Raw | ConvertFrom-Json).version
  Write-Host "v209 patched runtime tree: $runtimeTree (kernel $ver)"
} elseif (Test-Path $appAsar) {
  Write-Host "DSH Desktop installed (packed app.asar), but patched runtime tree MISSING: $runtimeTree" -ForegroundColor Yellow
  Write-Host "  -> verify.ps1/drift-scan default source; build it via patches/host/apply.ps1 + scripts/v209/pack-209.ps1"
} elseif (Test-Path "$packedNm\@deepseek-ai\dsh\package.json") {
  # 2.0.1-2.0.7 era: kernel still in app.asar.unpacked
  $ver = (Get-Content "$packedNm\@deepseek-ai\dsh\package.json" -Encoding UTF8 -Raw | ConvertFrom-Json).version
  Write-Host "DSH Desktop (pre-2.0.9 unpacked kernel): $ver — upgrade path expects the packed-asar layout"
} elseif (Test-Path $oldKernel) {
  $ver = (Get-Content "$oldKernel\@deepseek-ai\dsh\package.json" -Encoding UTF8 -Raw | ConvertFrom-Json).version
  Write-Host "legacy kernel: $ver (upgrade to DSH Desktop 2.0.9 recommended)"
} else {
  Write-Host "FAIL: DSH Desktop not installed (install 2.0.9 first)" -ForegroundColor Red
  $fail = 1
}

# 2. Tools
foreach ($tool in @("git", "node", "npm", "pnpm")) {
  if (Get-Command $tool -ErrorAction SilentlyContinue) {
    Write-Host "${tool}: available"
  } else {
    Write-Host "FAIL: ${tool} not found" -ForegroundColor Red
    $fail = 1
  }
}

# 3. Admin rights
$admin = $false
try { $null = net session; $admin = $true } catch {}
if ($admin) { Write-Host "admin rights: yes" } else { Write-Host "WARN: not elevated (run as admin for patches)" }

# 4. Disk space
$free = (Get-PSDrive C).Free / 1GB
Write-Host "disk free: $([math]::Round($free,1)) GB"

# 5. Existing dsh state
$dshHome = "$env:USERPROFILE\.dsh"
if (Test-Path $dshHome) {
  $sessions = (Get-ChildItem "$dshHome\sessions" -ErrorAction SilentlyContinue | Measure-Object).Count
  Write-Host "existing ~/.dsh: $sessions sessions (bootstrap will back up)"
} else {
  Write-Host "~/.dsh: fresh (no existing state)"
}

if ($fail -eq 0) { Write-Host "Environment OK - ready to bootstrap" -ForegroundColor Green }
exit $fail
