# verify.ps1 - verify oh-my-whale patches are applied to the host kernel
# Usage: .\patches\host\verify.ps1 [-KernelDir <path>]
# Exit 0 = all patches applied. Exit 1 = missing patches.
param(
  [string]$KernelDir = ""
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ManifestPath = Join-Path $Repo "patches\manifest.json"
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

if (-not $KernelDir) {
  $new = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules"
  $old = "C:\Program Files\DeepSeek Harness\resources\host\node_modules"
  if (Test-Path $new) { $KernelDir = $new } elseif (Test-Path $old) { $KernelDir = $old }
}
Write-Host "KernelDir: $KernelDir"
if (-not (Test-Path $KernelDir)) { throw "KernelDir not found: $KernelDir" }

$fail = 0
foreach ($p in $Manifest.patches) {
  if ($p.file -ne "host") { continue }
  $target = Join-Path $KernelDir ($p.target -replace "/", "\")
  $patchFile = Join-Path $Repo ("patches\" + $p.patchFile)

  if (-not (Test-Path $target)) { Write-Host "$($p.id): MISSING target $($p.target)"; $fail = 1; continue }
  if (-not (Test-Path $patchFile)) { Write-Host "$($p.id): MISSING patch file"; $fail = 1; continue }

  # P2: verify by marker (descLocationCache)
  if ($p.id -eq "P2") {
    $hits = (Select-String -Path $target -Pattern "descLocationCache" -SimpleMatch -ErrorAction SilentlyContinue | Measure-Object).Count
    if ($hits -gt 0) { Write-Host "$($p.id): applied (descLocationCache x$hits)" }
    else { Write-Host "$($p.id): NOT APPLIED"; $fail = 1 }
    continue
  }

  # normal: re-apply to temp pristine requires original; instead use reverse-apply check
  # git apply -R --check succeeds only if the patch IS applied
  Push-Location (Split-Path $KernelDir -Parent)
  try {
    $rev = & git -C $KernelDir apply -p1 -R --check $patchFile 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "$($p.id): applied" }
    else {
      # maybe not applied; try forward apply --check on pristine? we can't (no pristine in tree)
      # fallback: check marker text presence
      $markers = @{
        "P1" = "parentEntry";
        "P3" = "api.b.ai";
        "P4" = "continuous-worker/change";
        "P6" = "registerTransitionGuard";
        "P7" = "LIST_PROJECTION_EXCLUDED";
        "P8" = "ui-subagent: @ source";
        "P9" = "forkComposition";
        "P10" = "agentPreset: opts.agentPreset";
        "P11" = "seedLength";
        "P12" = "agentPreset: string().optional()";
      }
      $m = $markers[$p.id]
      if ($m) {
        $hits = (Select-String -Path $target -Pattern $m -SimpleMatch -ErrorAction SilentlyContinue | Measure-Object).Count
        if ($hits -gt 0) { Write-Host "$($p.id): applied (marker '$m' found x$hits)" }
        else { Write-Host "$($p.id): NOT APPLIED (marker '$m' absent)"; $fail = 1 }
      } else {
        Write-Host "$($p.id): CANNOT VERIFY (no marker)"; $fail = 1
      }
    }
  } finally { Pop-Location }
}

Write-Host ""
if ($fail -eq 0) { Write-Host "ALL HOST PATCHES VERIFIED" } else { Write-Host "SOME PATCHES MISSING" }
exit $fail
