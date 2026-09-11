# migrate-tree.ps1 - v209-era one-off: move the patched asar source tree off .dsh\tmp (cleanup-fragile) to a stable runtime path and repoint every dependent junction. Proven 2026-09-11 (asar-root -> runtime/v209-patched-tree, 484 links, 0 residue; 附8-P0/附10).
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\v209\migrate-tree.ps1
#   ... migrate-tree.ps1 -Old <srcTree> -New <dstTree> -Roots @('path1','path2') -Log <logFile>
# WHY: the 0.1.5 desktop runtime farm (profiles/node_modules junctions + nested node_modules
# under the plugin sources dir) resolves kernel packages THROUGH the source tree directory; if
# tmp is wiped the whole farm dangles (desktop + CLI both break). Roots must cover every farm
# layer listed below.
param(
  [string]$Old = "$env:USERPROFILE\.dsh\tmp\v209-intel\asar-root",
  [string]$New = "$env:USERPROFILE\.dsh\runtime\v209-patched-tree",
  [string[]]$Roots = (@(
    "$env:USERPROFILE\.dsh\profiles\node_modules",
    "$env:USERPROFILE\.dsh\profiles\web\node_modules"
  ) + $(if ($env:OMW_PLUGIN_SOURCES_DIR) { @("$env:OMW_PLUGIN_SOURCES_DIR\dsh-routed-subagent\node_modules", "$env:OMW_PLUGIN_SOURCES_DIR\@deepseek-ai\dsh-subagent-rc8\node_modules") } else { @() })),
  [string]$Log = "$env:USERPROFILE\.dsh\backups\v209-migration\migration.log"
)

$ErrorActionPreference = 'Continue'
function Say($m) { Write-Host $m; $ld = Split-Path $Log -Parent; if ($ld -and -not (Test-Path $ld)) { New-Item -ItemType Directory -Force $ld | Out-Null }; Add-Content -Path $Log -Value ("{0} {1}" -f (Get-Date -Format o), $m) }
Say "=== asar-root -> runtime migration ==="
if (-not (Test-Path $New)) { New-Item -ItemType Directory -Force $New | Out-Null }
robocopy $Old $New /MIR /R:1 /W:1 /NFL /NDL /NJH | Out-Null
Say ("robocopy exit {0} (0-7 ok)" -f $LASTEXITCODE)
if ($LASTEXITCODE -gt 7) { Say 'COPY FAILED - ABORT'; exit 2 }
# repoint junctions in farms + nested node_modules
$moved = 0
foreach ($r in $Roots) {
  if (-not (Test-Path $r)) { continue }
  Get-ChildItem $r -Recurse -Force -Depth 4 -EA SilentlyContinue | Where-Object { $_.LinkType -and $_.Target -and ($_.Target[0] -like "$Old*") } | ForEach-Object {
    $t = $_.Target[0] -replace [regex]::Escape($Old), $New
    try { $_.Delete(); New-Item -ItemType Junction -Path $_.FullName -Target $t | Out-Null; $moved++ } catch { Say ("repoint fail: " + $_.FullName) }
  }
}
Say ("junctions repointed: $moved")
# verify no old-tree-pointing links remain in these roots
$left = 0
foreach ($r in $Roots) {
  if (-not (Test-Path $r)) { continue }
  $left += @(Get-ChildItem $r -Recurse -Force -Depth 4 -EA SilentlyContinue | Where-Object { $_.LinkType -and $_.Target -and $_.Target[0] -like "$Old*" }).Count
}
Say ("remaining old-tree links: $left (expect 0)")
Say "=== migration done; old tree kept until final verify, then optional delete ==="
