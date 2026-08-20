# capture.ps1 - capture current dsh kernel patches into patches/*.patch
# Usage: .\scripts\capture.ps1 [-KernelDir <path>] [-ProfileDir <path>]
# Diff baseline: each file's .bak-* snapshot (P4 uses npm pack original)
param(
  [string]$KernelDir = "",
  [string]$ProfileDir = "",
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Continue"
$Repo = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $Repo "patches\manifest.json"
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

# Default kernel dir: prefer new shell v2.0.1 (app.asar.unpacked), fallback old shell
if (-not $KernelDir) {
  $new = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules"
  $old = "C:\Program Files\DeepSeek Harness\resources\host\node_modules"
  if (Test-Path $new) { $KernelDir = $new } elseif (Test-Path $old) { $KernelDir = $old }
}
if (-not $ProfileDir) { $ProfileDir = "$env:USERPROFILE\.dsh\profiles\web\node_modules" }

# Fallback roots for .bak snapshots (old shell tree + backup dir)
$AltRoots = @(
  "C:\Program Files\DeepSeek Harness\resources\host\node_modules",
  "$env:USERPROFILE\.dsh\backups\host-rc7-20260820\node_modules"
)

Write-Host "KernelDir : $KernelDir"
Write-Host "ProfileDir: $ProfileDir"
if (-not (Test-Path $KernelDir)) { throw "KernelDir not found: $KernelDir" }

$tmp = Join-Path $env:TEMP "oh-my-whale-capture"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

foreach ($p in $Manifest.patches) {
  $root = if ($p.file -eq "host") { $KernelDir } else { $ProfileDir }
  $targetPath = Join-Path $root ($p.target -replace "/", "\")
  $outFile = Join-Path $Repo ("patches\" + $p.patchFile)

  Write-Host ""
  Write-Host ("=== " + $p.id + ": " + $p.target + " ===")

  if (-not (Test-Path $targetPath)) { Write-Host "SKIP: target missing"; continue }

  $right = $targetPath
  if ($p.diffTarget -eq "patched-gpd") {
    $right = Join-Path $root (($p.diffTargetPath) -replace "/", "\")
    if (-not (Test-Path $right)) { Write-Host "SKIP: diffTarget missing: $right"; continue }
  }

  $left = ""
  switch ($p.source) {
    "bak" {
      # Look for .bak in: kernel tree -> old shell tree -> backup dir
      $left = Join-Path $root (($p.sourcePath) -replace "/", "\")
      if (-not (Test-Path $left)) {
        foreach ($alt in $AltRoots) {
          $cand = Join-Path $alt (($p.sourcePath) -replace "/", "\")
          if (Test-Path $cand) { $left = $cand; break }
        }
      }
      if (-not (Test-Path $left)) { Write-Host "SKIP: source bak missing: $left"; continue }
    }
    "npm-pack" {
      $packDir = Join-Path $tmp $p.id
      New-Item -ItemType Directory -Path $packDir -Force | Out-Null
      Push-Location $packDir
      try {
        $spec = $p.sourceSpec
        npm pack $spec --silent 2>$null | Out-Null
        $tgz = Get-ChildItem *.tgz | Select-Object -First 1
        if (-not $tgz) { Write-Host "SKIP: npm pack failed for $spec"; Pop-Location; continue }
        tar -xzf $tgz.Name
        $pkgDir = Get-ChildItem -Directory | Select-Object -First 1
        $rel = if ($p.sourceFile) { $p.sourceFile } else { ($p.target -split "/")[2..99] -join "/" }
        $left = Join-Path $pkgDir.FullName $rel
      } finally { Pop-Location }
      if (-not (Test-Path $left)) { Write-Host "SKIP: npm pack source missing: $left"; continue }
    }
    default { throw "Unknown source type: $($p.source)" }
  }

  $header = "# From: oh-my-whale`n# Target: $($p.target)`n# DSH version: $($Manifest.baseline.kernel)`n# Purpose: $($p.purpose)`n# Status: $($p.status)`n"
  # Use GNU diff -u (standard unified format, no quote-escaped paths like git diff on Windows)
  # --strip-trailing-cr: ignore CRLF/LF line-ending differences (patches stay small & portable)
  $diffLines = & "C:\Program Files\Git\usr\bin\diff.exe" -u --strip-trailing-cr $left $right 2>$null
  $exit = $LASTEXITCODE
  if ($exit -gt 1) { Write-Host "ERROR: diff failed (exit $exit)"; continue }
  if (-not $diffLines -or $diffLines.Count -eq 0) { Write-Host "WARN: empty diff (already unpatched?)"; continue }
  $diff = $diffLines -join "`n"

  # Rewrite --- / +++ header lines to use the portable target path (a/<target>, b/<target>)
  $body = ($diffLines | ForEach-Object {
    $line = $_
    if ($line -match "^--- ") { "--- a/$($p.target)" }
    elseif ($line -match "^\+\+\+ ") { "+++ b/$($p.target)" }
    else { $line }
  }) -join "`n"

  $content = $header + "`n" + $body
  # Write without BOM (PowerShell Set-Content defaults to BOM; use .NET directly)
  [System.IO.File]::WriteAllText($outFile, $content, [System.Text.UTF8Encoding]::new($false))
  $sz = (Get-Item $outFile).Length
  Write-Host "WROTE: $outFile ($sz bytes)"
}

Write-Host ""
Write-Host "Done. Patches in: $(Join-Path $Repo 'patches')"
