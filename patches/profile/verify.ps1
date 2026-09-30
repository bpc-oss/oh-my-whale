# verify.ps1 - verify oh-my-whale PROFILE patches: P5 + vendor patches V1-V4 (v2, governed 2026-09-10)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\patches\profile\verify.ps1 [-ProfileDir <path>]
# Exit 0 = PASS / MISSING-PENDING only. Exit 1 = any FAIL.
#
# v2 changes (mirror of host/verify.ps1 governance):
#   - git (P5 reverse-apply check) runs through Invoke-GitCheck with a
#     function-local $ErrorActionPreference='Continue' + $LASTEXITCODE verdict;
#     git stderr can no longer abort the script as NativeCommandError under the
#     global Stop (PS 5.1 trap fixed in host/verify.ps1 - the profile v1 script
#     had no git call at all, so this is a preventive guard, not a live bug).
#   - P5 additionally cross-checked against rc2-diffs/P05-super-injector-gateway.diff.
#   - NEW: vendorPatches V1-V4 existence validation (targets, V1 twin-copy hash
#     parity, V4 rebuilt tgz members).
param(
  [string]$ProfileDir = ""
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ManifestPath = Join-Path $Repo "patches\manifest.json"
try { $Manifest = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json }
catch { Write-Host "FATAL: cannot read $ManifestPath - $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
if (-not $Manifest -or -not $Manifest.patches) {
  Write-Host "FATAL: $ManifestPath parsed but carries no patches. Refusing to report success on an empty registry." -ForegroundColor Red
  exit 1
}

if (-not $ProfileDir) { $ProfileDir = "$env:USERPROFILE\.dsh\profiles\web\node_modules" }
Write-Host "ProfileDir: $ProfileDir"
if (-not (Test-Path $ProfileDir)) { throw "ProfileDir not found: $ProfileDir" }
$WebRoot = Split-Path -Parent $ProfileDir   # .../profiles/web

$HasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)
if (-not $HasGit) { Write-Host "WARN: git not found on PATH; reverse-apply disabled, marker fallback only" }

# stderr-safe git wrapper (identical contract to host/verify.ps1)
function Invoke-GitCheck {
  param([string[]]$GitArgs)
  $ErrorActionPreference = 'Continue'
  $out = (& git @GitArgs 2>&1 | Out-String)
  $code = $LASTEXITCODE
  $text = ($out -replace "`r", "").Trim()
  return [pscustomobject]@{ Code = $code; Out = $text }
}

$results = @()

# ---------------------------------------------------------------------------
# registered patches (file == profile): P5
# ---------------------------------------------------------------------------
$Rc2Dir = Join-Path $Repo "patches\rc2-diffs"
foreach ($p in $Manifest.patches) {
  if ($p.file -ne "profile") { continue }
  $id = [string]$p.id
  $status = [string]$p.status
  if (-not $status) { $status = "active" }

  $target = Join-Path $ProfileDir ($p.target -replace "/", "\")
  $patchFile = Join-Path $Repo ("patches\" + ($p.patchFile -replace "/", "\"))
  # P5 rc2-diffs artifact (id chain P05 -> P5)
  $rc2 = Join-Path $Rc2Dir "P05-super-injector-gateway.diff"
  $rc2Ok = $false
  if (Test-Path $rc2) {
    $rc2Ok = [bool]((Get-Content $rc2 -Encoding UTF8) | Where-Object { $_ -like '--- a/*' } | Select-Object -First 1)
  }

  $klass = $null; $detail = $null
  if (-not (Test-Path $target)) {
    $klass = "FAIL"; $detail = "target file missing: $($p.target)"
  } else {
    $applied = $false; $how = $null
    if ((Test-Path $patchFile) -and $HasGit) {
      $g = Invoke-GitCheck -GitArgs @('-C', $ProfileDir, 'apply', '-p1', '-R', '--check', $patchFile)
      if ($g.Code -eq 0) { $applied = $true; $how = "reverse-apply $($p.patchFile)" }
    }
    if (-not $applied) {
      $hits = (Select-String -Path $target -Pattern "plugin-gateway" -SimpleMatch -ErrorAction SilentlyContinue | Measure-Object).Count
      if ($hits -gt 0) { $applied = $true; $how = "marker 'plugin-gateway' x$hits" }
    }
    if ($applied) {
      $art = @()
      if (Test-Path $patchFile) { $art += $p.patchFile }
      if ($rc2Ok) { $art += "rc2-diffs/P05-super-injector-gateway.diff" }
      if ($art.Count -gt 0) { $klass = "PASS"; $detail = "applied ($how); artifacts: " + ($art -join ", ") }
      elseif ($status -like "pending*") { $klass = "MISSING-PENDING"; $detail = "applied ($how) but no diff artifact registered yet (status=$status)" }
      else { $klass = "FAIL"; $detail = "applied ($how) but no valid diff artifact (patchFile missing, rc2 header invalid)" }
    } else {
      $klass = "FAIL"; $detail = "NOT APPLIED: reverse-apply failed and marker absent ($($p.target))"
    }
  }
  $results += [pscustomobject]@{ Id = $id; Class = $klass; Detail = $detail }
}

# ---------------------------------------------------------------------------
function Render-Placeholders([string]$s) {
  # render manifest template placeholders (same token as profile/*.template)
  return ($s -replace '\{\{USERPROFILE\}\}', $env:USERPROFILE)
}

# vendor patches V1-V4 (manifest vendorPatches, file == profile): existence
# ---------------------------------------------------------------------------
foreach ($v in $Manifest.vendorPatches) {
  if ($v.file -ne "profile") { continue }
  $id = [string]$v.id
  $status = [string]$v.status
  if (-not $status) { $status = "active" }
  $root = Render-Placeholders ([string]$v.root)
  if (-not $v.root) { $root = $ProfileDir }

  $klass = $null; $detail = $null
  if ($id -eq "V4") {
    # rebuilt bpc-oss archives: each member must exist under the vendor-archives root
    $missing = @(); $found = 0
    foreach ($m in $v.members) {
      if (Test-Path (Join-Path $root ($m -replace "/", "\"))) { $found++ } else { $missing += $m }
    }
    if ($missing.Count -eq 0) { $klass = "PASS"; $detail = "$found/$($v.members.Count) rebuilt tgz present under $root" }
    else { $klass = "FAIL"; $detail = "missing member(s): " + ($missing -join ", ") }
  }
  else {
    $t = Join-Path $root ($v.target -replace "/", "\")
    if (-not (Test-Path $t)) {
      $klass = "FAIL"; $detail = "target missing: $t"
    } else {
      $klass = "PASS"; $detail = "target present: $($v.target)"
      if ($v.companions) {
        # V1: twin copy (manifest: 'same content - must co-edit') -> hash parity
        $twin = Render-Placeholders (($v.companions | Select-Object -First 1) -replace '\s*\(.*$', '')
        $relTail = ($v.target -replace "^[^/]+/[^/]+/", "")   # e.g. lib/index.js
        $twinFile = Join-Path ($twin -replace "/", "\") $relTail
        if (-not (Test-Path $twinFile)) {
          $klass = "FAIL"; $detail = "target present but twin copy missing: $twinFile"
        } else {
          $h1 = (Get-FileHash -Algorithm SHA256 -Path $t).Hash
          $h2 = (Get-FileHash -Algorithm SHA256 -Path $twinFile).Hash
          if ($h1 -eq $h2) { $detail += "; twin parity OK (sha256 $($h1.Substring(0,12)))" }
          else { $klass = "FAIL"; $detail = "TWIN DRIFT: $t and $twinFile differ (must co-edit)" }
        }
      }
    }
  }
  if ($klass -ne "PASS" -and $status -like "pending*") { $klass = "MISSING-PENDING" }
  $results += [pscustomobject]@{ Id = $id; Class = $klass; Detail = $detail }
}

# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------
$pass     = @($results | Where-Object { $_.Class -eq "PASS" })
$pendingR = @($results | Where-Object { $_.Class -eq "MISSING-PENDING" })
$failR    = @($results | Where-Object { $_.Class -eq "FAIL" })

Write-Host ""
Write-Host ("=== PASS ({0}) ===" -f $pass.Count)
foreach ($r in $pass)     { Write-Host ("  {0,-5} {1}" -f $r.Id, $r.Detail) }
Write-Host ("=== MISSING-PENDING ({0}) ===" -f $pendingR.Count)
foreach ($r in $pendingR) { Write-Host ("  {0,-5} {1}" -f $r.Id, $r.Detail) }
Write-Host ("=== FAIL ({0}) ===" -f $failR.Count)
foreach ($r in $failR)    { Write-Host ("  {0,-5} {1}" -f $r.Id, $r.Detail) }

Write-Host ""
Write-Host ("PROFILE SUMMARY: {0} item(s) (patches file=profile + vendorPatches) -> PASS={1} MISSING-PENDING={2} FAIL={3}" -f `
  $results.Count, $pass.Count, $pendingR.Count, $failR.Count)
if ($failR.Count -eq 0) { Write-Host "PROFILE PATCHES VERIFIED" } else { Write-Host "SOME PROFILE CHECKS FAILED" }
exit ([int][bool]$failR.Count)
