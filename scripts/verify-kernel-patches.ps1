# verify-kernel-patches.ps1 — assert every post-install kernel patch is present in the LIVE install.
#
# Companion to patches/post-install/*.mjs. The shell ships unpacked (2.0.16+),
# so these markers exist as real files and can be re-checked at any time without
# unpacking anything.
#
# Usage:
#   .\scripts\verify-kernel-patches.ps1
#   .\scripts\verify-kernel-patches.ps1 -AppRoot "C:\...\resources\app"
#
# Exit 0 = all markers present, 1 = at least one drifted (run apply-post-install-patches.ps1).
param(
  [string]$AppRoot = ""
)

$ErrorActionPreference = "Continue"
$Repo = Split-Path -Parent $PSScriptRoot

if (-not $AppRoot) {
  $AppRoot = Join-Path $env:LOCALAPPDATA "Programs\DSH Desktop\resources\app"
}
if (-not (Test-Path $AppRoot)) {
  Write-Host "FAIL  app root not found: $AppRoot" -ForegroundColor Red
  exit 1
}

# id -> @{ Path = relative file; Pattern = regex that must match }
$Checks = @(
  @{
    Id = "P20-video-modality"
    Path = "node_modules\@deepseek-ai\dsh-llm-pi-ai\lib\index.js"
    # The closed modality union must carry video, else settings import drops
    # every custom provider (ValidationError: expected "text" | "image").
    Pattern = 'const MODALITIES = Object\.keys\(\{\s*text: true,\s*image: true,\s*video: true\s*\}\);'
    Why = 'settings schema must accept video, or the whole llm-pi-ai section is rejected'
  }
)

$fail = 0
Write-Host "kernel patch verification"
Write-Host ("  app root : {0}" -f $AppRoot)
$shell = Join-Path $AppRoot "package.json"
if (Test-Path $shell) {
  try {
    $j = Get-Content $shell -Encoding UTF8 -Raw | ConvertFrom-Json
    $kernel = "n/a"
    $kp = Join-Path $AppRoot "node_modules\@deepseek-ai\dsh\package.json"
    if (Test-Path $kp) { $kernel = (Get-Content $kp -Encoding UTF8 -Raw | ConvertFrom-Json).version }
    Write-Host ("  shell    : {0} {1}" -f $j.name, $j.version)
    Write-Host ("  kernel   : {0}" -f $kernel)
  } catch {}
}
Write-Host ""

foreach ($c in $Checks) {
  $f = Join-Path $AppRoot $c.Path
  if (-not (Test-Path $f)) {
    Write-Host ("  MISSING  {0}" -f $c.Id) -ForegroundColor Red
    Write-Host ("          file absent: {0}" -f $c.Path)
    Write-Host ("          {0}" -f $c.Why)
    $fail++
    continue
  }
  $src = Get-Content $f -Raw -Encoding UTF8
  if ($src -match $c.Pattern) {
    Write-Host ("  PASS     {0}" -f $c.Id) -ForegroundColor Green
  } else {
    Write-Host ("  DRIFT    {0}" -f $c.Id) -ForegroundColor Yellow
    Write-Host ("          marker missing in: {0}" -f $c.Path)
    Write-Host ("          {0}" -f $c.Why)
    Write-Host ("          fix: .\scripts\apply-post-install-patches.ps1") -ForegroundColor Yellow
    $fail++
  }
}

Write-Host ""
if ($fail -gt 0) {
  Write-Host ("RESULT: {0} check(s) drifted" -f $fail) -ForegroundColor Red
  exit 1
}
Write-Host "RESULT: all kernel patches present" -ForegroundColor Green
exit 0
