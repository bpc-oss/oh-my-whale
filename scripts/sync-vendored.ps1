# sync-vendored.ps1 — vendored/ <-> live plugin sources
# Usage: .\scripts\sync-vendored.ps1 -Pull   (live -> vendored snapshot; run after edits)
#        .\scripts\sync-vendored.ps1 -Push   (vendored -> live restore; fresh machine)
param(
  [ValidateSet("Pull","Push")]
  [string]$Direction = "Pull"
)
$ErrorActionPreference = "Continue"
$Repo = Split-Path -Parent $PSScriptRoot
$map = @(
  @{ name = "dsh-voice-input";        live = "$env:USERPROFILE\dsh-voice-input" },
  @{ name = "dsh-token-meter-hermes"; live = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-token-meter-hermes" }
)
foreach ($e in $map) {
  $v = Join-Path $Repo "vendored\$($e.name)"
  $src = $e.live; $dst = $v
  if ($Direction -eq "Push") {
    if (-not (Test-Path $src)) { New-Item -ItemType Directory -Force $src | Out-Null }
    $src = $v; $dst = $e.live
  }
  if (-not (Test-Path $src)) { Write-Host "SKIP $($e.name): source missing $src"; continue }
  robocopy $src $dst /MIR /XD node_modules .git /XF "*.bak-*" "*.orig" /NFL /NDL /NJH /NP | Out-Null
  Write-Host ("{0} {1} rc={2}" -f $Direction, $e.name, $LASTEXITCODE)
}
if ($Direction -eq "Push") {
  Write-Host "NOTE voice: recreate symlink  profiles/web/node_modules/dsh-voice-input -> %USERPROFILE%\dsh-voice-input (or per profile package.json link:) if missing."
  Write-Host "NOTE after Push: run scripts\capture-sources.ps1 + patches\host\verify.ps1 to re-baseline."
}
