# apply.ps1 - apply oh-my-whale host patches to the kernel tree
# Usage: .\patches\host\apply.ps1 [-KernelDir <path>] [-CheckOnly]
param(
  [string]$KernelDir = "",
  [switch]$CheckOnly
)

$ErrorActionPreference = "Continue"
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ManifestPath = Join-Path $Repo "patches\manifest.json"
try { $Manifest = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json }
catch { Write-Host "FATAL: cannot read $ManifestPath - $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
if (-not $Manifest -or -not $Manifest.patches) {
  Write-Host "FATAL: $ManifestPath parsed but carries no patches. Refusing to report success on an empty registry." -ForegroundColor Red
  exit 1
}

if (-not $KernelDir) {
  # 2026-10-19: the shell has shipped UNPACKED since 2.0.x; resources\app.asar.unpacked
  # no longer exists. Point at the app tree, and verify the directory really holds the
  # kernel packages before accepting it.
  $unpacked = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app\node_modules"
  $legacy = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules"
  $old = "C:\Program Files\DeepSeek Harness\resources\host\node_modules"
  if (Test-Path (Join-Path $unpacked "@deepseek-ai\dsh\package.json")) { $KernelDir = $unpacked }
  elseif (Test-Path $legacy) { $KernelDir = $legacy }
  elseif (Test-Path $old) { $KernelDir = $old }
}
Write-Host "KernelDir: $KernelDir"
if (-not (Test-Path $KernelDir)) { Write-Host "FATAL: KernelDir not found"; exit 1 }

$fail = 0

# Which kernel line this tree is. Patch files in this repo were authored against a
# specific line; running a 0.1.5 patch on a 0.2.0 tree fails its context check, which is
# correct behaviour for the file and NOT a deploy failure. The manifest records which
# line each entry targets, so only the matching ones are attempted here — the others are
# verified by marker through scripts/verify-patch-port.mjs instead.
$targetLine = "unknown"
try { $targetLine = (Get-Content "$KernelDir\@deepseek-ai\dsh\package.json" -Encoding UTF8 -Raw | ConvertFrom-Json).version } catch {}
$skipped = 0
$skippedIds = @()
foreach ($p in $Manifest.patches) {
  if ($p.file -ne "host") { continue }
  # P18 (and other fan-out entries) declare target as an ARRAY. Join-Path does
  # not accept an array, so the old code threw and silently skipped the entry.
  # Resolve every target; one missing target means the patch is not applicable.
  $targetPaths = @($p.target | ForEach-Object { Join-Path $KernelDir ($_ -replace "/", "\") })
  $target = $targetPaths[0]
  $patchFile = Join-Path $Repo ("patches\" + $p.patchFile)
  Write-Host "--- $($p.id): $($p.target -join ' ')"
  $missingTarget = @($targetPaths | Where-Object { -not (Test-Path $_) })
  if ($missingTarget.Count -gt 0) { Write-Host "  SKIP: target missing: $($missingTarget -join ', ')"; continue }
  if (-not (Test-Path $patchFile)) { Write-Host "  SKIP: patch missing"; continue }

  # version check
  $dshPkg = Join-Path $KernelDir "@deepseek-ai\dsh\package.json"
  if (Test-Path $dshPkg) {
    $ver = (Get-Content $dshPkg -Encoding UTF8 -Raw | ConvertFrom-Json).version
    if ($ver -ne $Manifest.baseline.kernel) { Write-Host "  WARN: kernel $ver != baseline $($Manifest.baseline.kernel)" }
  }

  # P2 special: patch content transforms pristine -> patched; target = index.js
  if ($p.diffTarget -eq "patched-gpd") {
    # Build temp tree mirroring @deepseek-ai/cordis/lib/index.js
    $tmp = Join-Path $env:TEMP "omw-p2-$(Get-Random)"
    $mirror = Join-Path $tmp "@deepseek-ai\cordis\lib"
    New-Item -ItemType Directory -Path $mirror -Force | Out-Null
    Copy-Item $target "$mirror\index.js"
    $check = & git -C $tmp apply -p1 --check $patchFile 2>&1
    if ($LASTEXITCODE -ne 0) {
      # maybe already applied -> reverse check
      $rev = & git -C $tmp apply -p1 -R --check $patchFile 2>&1
      if ($LASTEXITCODE -eq 0) { Write-Host "  ALREADY APPLIED" } else { Write-Host "  CHECK FAILED: $check"; $fail = 1 }
      Remove-Item $tmp -Recurse -Force
      continue
    }
    if (-not $CheckOnly) {
      & git -C $tmp apply -p1 $patchFile 2>&1 | Out-Null
      # patched result now at $mirror\index.js; copy back
      Copy-Item "$mirror\index.js" $target -Force
      Write-Host "  APPLIED (via temp mirror + copy back)"
    } else { Write-Host "  CHECK OK" }
    Remove-Item $tmp -Recurse -Force
    continue
  }

  # normal patches: git apply -p1 directly on kernel tree
  # Skip entries authored for a different kernel line, and say so.
  $entryLine = if ($p.kernelLine) { $p.kernelLine } else { "0.1.5-rc.1" }
  if ($entryLine -ne $targetLine) {
    $skipped++
    $skippedIds += $p.id
    continue
  }
  $check = & git -C $KernelDir apply -p1 --check $patchFile 2>&1
  if ($LASTEXITCODE -ne 0) {
    # maybe already applied -> reverse check
    $rev = & git -C $KernelDir apply -p1 -R --check $patchFile 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "  ALREADY APPLIED" } else { Write-Host "  CHECK FAILED: $check"; $fail = 1 }
    continue
  }
  if (-not $CheckOnly) { & git -C $KernelDir apply -p1 $patchFile 2>&1 | Out-Null; Write-Host "  APPLIED" } else { Write-Host "  CHECK OK" }
}

Write-Host ""
if ($skipped -gt 0) {
  Write-Host ("  $skipped entr(y/ies) target another kernel line and were not applied: {0}" -f ($skippedIds -join ", ")) -ForegroundColor DarkGray
  Write-Host ("  they are verified by marker instead: node scripts\verify-patch-port.mjs <app-root>") -ForegroundColor DarkGray
}
if ($fail -eq 0) { Write-Host "HOST PATCHES OK" } else { Write-Host "SOME PATCHES FAILED"; exit 1 }
