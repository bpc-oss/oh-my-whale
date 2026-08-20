# apply.ps1 - apply oh-my-whale PROFILE patches (P5 archive; actual fix = rebuilt vendor tgz)
# Usage: .\patches\profile\apply.ps1 [-ProfileDir <path>] [-CheckOnly]
param(
  [string]$ProfileDir = "",
  [switch]$CheckOnly
)

$ErrorActionPreference = "Continue"
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ManifestPath = Join-Path $Repo "patches\manifest.json"
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

if (-not $ProfileDir) { $ProfileDir = "$env:USERPROFILE\.dsh\profiles\web\node_modules" }
Write-Host "ProfileDir: $ProfileDir"
if (-not (Test-Path $ProfileDir)) { Write-Host "FATAL: ProfileDir not found"; exit 1 }

$fail = 0
foreach ($p in $Manifest.patches) {
  if ($p.file -ne "profile") { continue }
  $target = Join-Path $ProfileDir ($p.target -replace "/", "\")
  $patchFile = Join-Path $Repo ("patches\" + $p.patchFile)
  Write-Host "--- $($p.id): $($p.target)"
  if (-not (Test-Path $target)) { Write-Host "  SKIP: target missing"; continue }
  if (-not (Test-Path $patchFile)) { Write-Host "  SKIP: patch missing"; continue }

  $check = & git -C $ProfileDir apply -p1 --check $patchFile 2>&1
  if ($LASTEXITCODE -ne 0) {
    $rev = & git -C $ProfileDir apply -p1 -R --check $patchFile 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "  ALREADY APPLIED (or tgz has it baked)" } else { Write-Host "  CHECK FAILED: $check"; $fail = 1 }
    continue
  }
  if (-not $CheckOnly) { & git -C $ProfileDir apply -p1 $patchFile 2>&1 | Out-Null; Write-Host "  APPLIED" } else { Write-Host "  CHECK OK" }
}

Write-Host ""
if ($fail -eq 0) { Write-Host "PROFILE PATCHES OK" } else { Write-Host "SOME PATCHES FAILED"; exit 1 }
