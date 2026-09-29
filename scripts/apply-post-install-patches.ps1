# apply-post-install-patches.ps1 — re-apply every kernel patch that lives inside the vendor tree.
#
# Run this AFTER any DSH Desktop shell upgrade / auto-update / repair. The shell
# ships unpacked (2.0.16+), so upgrading overwrites the patched vendor files.
# Skipping this silently loses every custom provider (see p20-video-modality.mjs).
#
# Usage:
#   .\scripts\apply-post-install-patches.ps1
#   .\scripts\apply-post-install-patches.ps1 -AppRoot "C:\...\resources\app"
#   .\scripts\apply-post-install-patches.ps1 -Check      # verify only, change nothing
#
# Exit 0 = clean (already applied, or applied now), 1 = something failed.
param(
  [string]$AppRoot = "",
  [switch]$Check
)

$ErrorActionPreference = "Continue"
$Repo = Split-Path -Parent $PSScriptRoot
$PatchDir = Join-Path $Repo "patches\post-install"

if (-not $AppRoot) {
  $AppRoot = Join-Path $env:LOCALAPPDATA "Programs\DSH Desktop\resources\app"
}
if (-not (Test-Path $AppRoot)) {
  Write-Host "FAIL  app root not found: $AppRoot" -ForegroundColor Red
  Write-Host "      Pass -AppRoot explicitly if the shell lives elsewhere." -ForegroundColor Red
  exit 1
}

Write-Host ("app root: {0}" -f $AppRoot)
if ($Check) {
  Write-Host "mode    : CHECK ONLY (no files will be written)" -ForegroundColor Yellow
} else {
  Write-Host "mode    : APPLY"
}
Write-Host ""

$scripts = @(Get-ChildItem -Path $PatchDir -Filter *.mjs -ErrorAction SilentlyContinue | Sort-Object Name)
if ($scripts.Count -eq 0) {
  Write-Host "FAIL  no patch scripts found in $PatchDir" -ForegroundColor Red
  exit 1
}

$fail = 0
foreach ($s in $scripts) {
  Write-Host ("--- {0}" -f $s.Name)
  if ($Check) {
    # --check makes each patch script report-only; nothing is written.
    & node $s.FullName $AppRoot --check
    if ($LASTEXITCODE -ne 0) {
      Write-Host ("        -> would patch / needs attention (nothing was written)") -ForegroundColor Yellow
      $fail++
    }
  } else {
    & node $s.FullName $AppRoot
    if ($LASTEXITCODE -ne 0) {
      Write-Host ("        -> exit {0}" -f $LASTEXITCODE) -ForegroundColor Red
      $fail++
    }
  }
}

Write-Host ""
Write-Host "--- verification"
$verifyScript = Join-Path $PSScriptRoot "verify-kernel-patches.ps1"
& $verifyScript -AppRoot $AppRoot
$verifyRc = $LASTEXITCODE

if ($fail -gt 0 -or $verifyRc -ne 0) {
  Write-Host "RESULT: post-install patches NOT clean" -ForegroundColor Red
  exit 1
}
Write-Host "RESULT: post-install patches clean" -ForegroundColor Green
exit 0
