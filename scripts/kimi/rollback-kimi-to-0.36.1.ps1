# rollback-kimi-to-0.36.1.ps1 — one-click revert of the 2.1.1 upgrade.
# Restores the pre-upgrade binary (0.36.1 + maxRetries:-1 patch) that was running
# before 2026-09-29. The 2.1.1 binary is preserved (renamed), nothing is deleted.
# Usage (from any shell):  powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.kimi-code\bin\rollback-kimi-to-0.36.1.ps1"
$ErrorActionPreference = 'Stop'
$bin = "$env:USERPROFILE\.kimi-code\bin"
$exe = "$bin\kimi.exe"
$target = "$bin\kimi.exe.pre-upgrade-20260929-092934"
if (-not (Test-Path $target)) { throw "rollback target missing: $target" }

Get-Process -Name kimi -ErrorAction SilentlyContinue | ForEach-Object { }
Write-Host 'note: running sessions keep their own image; new launches will use the restored binary'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Move-Item $exe "$bin\kimi.exe.2.1.1-archived-$stamp" -Force
Copy-Item $target $exe -Force
$v = & $exe --version 2>&1 | Select-Object -First 1
Write-Host ("restored kimi.exe -> version " + $v)
if ($v -notmatch '^0\.36\.1$') { throw "restore failed: $v" }
Write-Host "ROLLBACK-OK (2.1.1 kept at kimi.exe.2.1.1-archived-$stamp)"
