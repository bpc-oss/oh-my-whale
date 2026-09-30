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
  $new = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules"
  $old = "C:\Program Files\DeepSeek Harness\resources\host\node_modules"
  if (Test-Path $new) { $KernelDir = $new } elseif (Test-Path $old) { $KernelDir = $old }
}
Write-Host "KernelDir: $KernelDir"
if (-not (Test-Path $KernelDir)) { Write-Host "FATAL: KernelDir not found"; exit 1 }

$fail = 0
foreach ($p in $Manifest.patches) {
  if ($p.file -ne "host") { continue }
  $target = Join-Path $KernelDir ($p.target -replace "/", "\")
  $patchFile = Join-Path $Repo ("patches\" + $p.patchFile)
  Write-Host "--- $($p.id): $($p.target)"
  if (-not (Test-Path $target)) { Write-Host "  SKIP: target missing"; continue }
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
if ($fail -eq 0) { Write-Host "HOST PATCHES OK" } else { Write-Host "SOME PATCHES FAILED"; exit 1 }
