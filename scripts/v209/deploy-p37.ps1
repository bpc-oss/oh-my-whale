# deploy-p37.ps1 — install the staged P37 (video preview body) app.asar.
# Run while the DSH Desktop app is closing/closed (it stops the app first). After this, start DSH Desktop normally.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\v209\deploy-p37.ps1 [-AsarPath <staged app.asar>] [-NoStart]
param(
  [string]$AsarPath = "$env:USERPROFILE\.dsh\tmp\p37-asar\packed\app.asar",
  [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $AsarPath)) { throw "staged asar missing: $AsarPath" }
$res = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources"
$exe = "$env:LOCALAPPDATA\Programs\DSH Desktop\DSH Desktop.exe"
Write-Host 'stopping DSH Desktop (if running)...'
Get-Process -Name 'DSH Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item "$res\app.asar" "$res\app.asar.pre-p37-$stamp" -Force
Write-Host "backed up live asar -> app.asar.pre-p37-$stamp"
Copy-Item $AsarPath "$res\app.asar" -Force
Write-Host ('deployed: ' + (Get-Item "$res\app.asar").Length + ' bytes')
if (-not $NoStart) {
  Start-Process -FilePath $exe
  Write-Host 'DSH Desktop starting — first launch after deploy may take a moment.'
}
