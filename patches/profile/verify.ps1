# verify.ps1 - verify oh-my-whale PROFILE patches (P5)
# Usage: .\patches\profile\verify.ps1 [-ProfileDir <path>]
# Exit 0 = applied. Exit 1 = missing.
param(
  [string]$ProfileDir = ""
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ManifestPath = Join-Path $Repo "patches\manifest.json"
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

if (-not $ProfileDir) { $ProfileDir = "$env:USERPROFILE\.dsh\profiles\web\node_modules" }
Write-Host "ProfileDir: $ProfileDir"
if (-not (Test-Path $ProfileDir)) { throw "ProfileDir not found" }

$fail = 0
foreach ($p in $Manifest.patches) {
  if ($p.file -ne "profile") { continue }
  $target = Join-Path $ProfileDir ($p.target -replace "/", "\")
  $hits = (Select-String -Path $target -Pattern "plugin-gateway" -SimpleMatch -ErrorAction SilentlyContinue | Measure-Object).Count
  if ($hits -gt 0) { Write-Host "$($p.id): applied (plugin-gateway x$hits)" }
  else { Write-Host "$($p.id): NOT APPLIED"; $fail = 1 }
}
Write-Host ""
if ($fail -eq 0) { Write-Host "PROFILE PATCHES VERIFIED" } else { Write-Host "SOME MISSING"; exit 1 }
