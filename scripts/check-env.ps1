# check-env.ps1 - verify new-machine prerequisites before bootstrap
$fail = 0

Write-Host "=== oh-my-whale environment check ===" -ForegroundColor Cyan

# 1. DSH Desktop installed?
$newKernel = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules"
$oldKernel = "C:\Program Files\DeepSeek Harness\resources\host\node_modules"
if (Test-Path $newKernel) {
  $ver = (Get-Content "$newKernel\@deepseek-ai\dsh\package.json" -Raw | ConvertFrom-Json).version
  Write-Host "DSH Desktop v2.0.1 kernel: $ver"
} elseif (Test-Path $oldKernel) {
  $ver = (Get-Content "$oldKernel\@deepseek-ai\dsh\package.json" -Raw | ConvertFrom-Json).version
  Write-Host "legacy kernel: $ver (upgrade to DSH Desktop v2.0.1 recommended)"
} else {
  Write-Host "FAIL: DSH Desktop not installed (install v2.0.1 first)" -ForegroundColor Red
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
