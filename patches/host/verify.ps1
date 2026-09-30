# verify.ps1 - verify oh-my-whale host kernel patches (v4, 2.0.9/0.1.5-rc.1 packed-asar baseline)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\patches\host\verify.ps1 [-Source asar-root|installed] [-KernelDir <path>]
# Exit 0 = PASS / MISSING-PENDING / PENDING-ADJUDICATION / SKIPPED only. Exit 1 = any FAIL.
#
# v4 changes (2.0.9 migration 2026-09-11):
#   - New -Source parameter:
#       asar-root (default): run the symbol/reverse-apply logic directly against the
#         patched asar SOURCE tree $env:USERPROFILE\.dsh\runtime\v209-patched-tree\
#         node_modules (the authoritative 0.1.5-rc.1 landing tree, 32/32 items).
#       installed: extract the LIVE resources\app.asar into
#         patches\host\.asar-cache\ (cached; keyed on asar size+write-time so the
#         169MB unpack happens once) and run the SAME checks against the installed
#         tree. npx @electron/asar extract is used; per-file extract-file is too
#         heavy at this archive size. The install directory is only ever READ.
#   - Explicit -KernelDir still overrides both modes (legacy behaviour).
#   - Symbol P18 extended with 'P18 v205' (attachment pass-through marker); P18
#     manifest target array retargeted to the 6 real v209 files.
#   - P12 status skip-absorbed (client-connection byte-identical to pristine):
#     skip-* keeps the PENDING-ADJUDICATION bucket, never FAIL.
#   - Exit semantics unchanged: skip-*/pending classes never fail the run.
#
# v3 changes (verifyfix 2026-09-10, agent-46 review):
#   - P21 false positive fixed: 'routed' collided with an official dsh-tool-fs
#     variable name. Re-anchored to P21's real traits (type: "video" /
#     mediaType.startsWith("video")). Generalized to a combined criterion:
#     marker(s) must hit inside the entry's target file(s); markers may be an
#     any-of array. Same-file multi-patch ids (P17/P19b/P20/P25, P3/P17c/P23)
#     keep distinctive per-patch anchors.
#   - P5 (file=profile) was silently `continue`d; now recorded and reported as
#     "P5 skipped (profile scope)". Skipped items never touch the exit code.
#   - Array targets supported (P18 v205 fan-out to 7 files): reverse-apply once,
#     symbol check requires EVERY target file to hit at least one marker.
#     Manifest rc.2 paths preserved under rc2Target.
#   - Anchors: P12 -> 'PATCH P12'; P16 lib -> 'PATCH P16'/'externalContinuations'
#     ('preset-mount' belongs to P16b's package.json); P9 -> 'PATCH P9'.
#   - status 'pending-adjudication' (P11 fork ruling, P15 skip-diagnostic-
#     optional) is its own report bucket, never counted as FAIL.
#
# v2 changes (A0 lesson: script aborted since P3 era):
#   - git is invoked through Invoke-GitCheck which sets a FUNCTION-LOCAL
#     $ErrorActionPreference='Continue' and judges by $LASTEXITCODE only.
#     Under the global Stop, `git ... 2>&1` turned any git stderr line into a
#     NativeCommandError terminating error (PS 5.1 trap). The global Stop now
#     only guards cmdlet-level errors, never external commands.
#   - New validation sources besides the legacy host/*.patch reverse-apply:
#       * rc2-diffs/*.diff standard diffs: existence + '--- a/' header check,
#         id->file mapping parsed from the P-xx name chain (combined files ok).
#       * in-tree symbol presence for items whose diff is a combined file
#         (P17/P19/P19b/P20/P25 etc, see $Symbols).
#   - Classification PASS / MISSING-PENDING / FAIL driven by manifest status:
#     items with status 'pending*' missing a diff artifact are reported
#     MISSING-PENDING (warning), active items are FAIL.
param(
  [ValidateSet("asar-root", "installed")]
  [string]$Source = "asar-root",
  [string]$KernelDir = ""
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

# ---------------------------------------------------------------------------
# v4: resolve the kernel tree from -Source (unless -KernelDir overrides)
# ---------------------------------------------------------------------------
if (-not $KernelDir) {
  if ($Source -eq "asar-root") {
    $KernelDir = Join-Path $env:USERPROFILE ".dsh\runtime\v209-patched-tree\node_modules"
  }
  else {
    # installed mode: unpack resources\app.asar into a persistent cache dir and
    # run the same checks against the real shipped tree. Cache key = size +
    # last-write ticks of the asar; a stale/absent cache is rebuilt from scratch.
    $Asar = Join-Path $env:LOCALAPPDATA "Programs\DSH Desktop\resources\app.asar"
    if (-not (Test-Path $Asar)) { throw "installed mode: app.asar not found: $Asar" }
    $CacheRoot = Join-Path $PSScriptRoot ".asar-cache"
    $CacheTree = Join-Path $CacheRoot "app"
    $StampFile = Join-Path $CacheRoot ".stamp"
    $asi = Get-Item $Asar
    $key = ("{0}|{1}" -f $asi.Length, $asi.LastWriteTimeUtc.Ticks)
    $fresh = $false
    if ((Test-Path (Join-Path $CacheTree "node_modules")) -and (Test-Path $StampFile)) {
      if ((Get-Content $StampFile -Raw).Trim() -eq $key) { $fresh = $true }
    }
    if (-not $fresh) {
      Write-Host "asar-cache: extracting $Asar (~170MB, one-time; cache kept for reuse)..."
      if (Test-Path $CacheTree) { Remove-Item $CacheTree -Recurse -Force }
      New-Item -ItemType Directory -Force -Path $CacheTree | Out-Null
      $ErrorActionPreference = 'Continue'
      & npx --yes @electron/asar extract $Asar $CacheTree 2>&1 | Out-String | Out-Null
      $code = $LASTEXITCODE
      $ErrorActionPreference = 'Stop'
      if ($code -ne 0 -or -not (Test-Path (Join-Path $CacheTree "node_modules"))) {
        throw "asar extract failed (exit $code); cache dir: $CacheTree"
      }
      Set-Content -Path $StampFile -Value $key -NoNewline
      Write-Host "asar-cache: extraction complete"
    } else {
      Write-Host "asar-cache: reusing cached extraction ($CacheTree)"
    }
    $KernelDir = Join-Path $CacheTree "node_modules"
  }
}
Write-Host "Source: $Source"
Write-Host "KernelDir: $KernelDir"
if (-not (Test-Path $KernelDir)) { throw "KernelDir not found: $KernelDir" }

$HasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)
if (-not $HasGit) { Write-Host "WARN: git not found on PATH; reverse-apply checks disabled, symbol fallback only" }

# ---------------------------------------------------------------------------
# stderr-safe git wrapper: function-local Continue, exit code decides
# ---------------------------------------------------------------------------
function Invoke-GitCheck {
  param([string[]]$GitArgs)
  # This assignment is function-scoped: the global Stop stays in force for
  # cmdlets, but git stderr becomes plain data instead of NativeCommandError.
  $ErrorActionPreference = 'Continue'
  $out = (& git @GitArgs 2>&1 | Out-String)
  $code = $LASTEXITCODE
  $text = ($out -replace "`r", "" ).Trim()
  return [pscustomobject]@{ Code = $code; Out = $text }
}

function Get-TreeHit {
  param([string]$Target, [string]$Marker)
  $hits = (Select-String -Path $Target -Pattern $Marker -SimpleMatch -ErrorAction SilentlyContinue | Measure-Object).Count
  return $hits
}

# id -> in-tree symbol anchor. Value = string, or array of alternative markers
# (any-of). Combined criterion (v3): a symbol only counts when found inside the
# entry's target file(s); for array targets EVERY file must hit. v2 legacy note:
# used when patchFile reverse-apply fails or no patchFile exists yet (pending
# items, combined diffs).
$Symbols = @{
  "P1"   = "parentEntry";
  "P2"   = "descLocationCache";
  "P3"   = "api.b.ai";
  "P4"   = "continuous-worker/change";
  "P6"   = "registerTransitionGuard";
  "P7"   = "LIST_PROJECTION_EXCLUDED";
  "P8"   = "ui-subagent: @ source";
  "P9"   = @('PATCH P9','PATCH (fork-to-preset');
  "P10"  = @('agentPreset: opts.agentPreset','PATCH P10');
  "P11" = "seedLength"
  "P12"  = "PATCH P12";
  "P13"  = "BATCH_MAX = 20";
  "P14"  = "Promise.resolve(fiber.dispose())";
  "P15"  = "error.stack";
  "P16"  = @('PATCH P16','externalContinuations');
  "P16b" = "dshRoutedSubagentPatch";
  "P17"  = "video_url";
  "P17b" = "video_url";
  "P17c" = "video_url";
  "P18"  = @('PATCH P18','literal("video")','P18 v205');
  "P18b" = "bytesToBase64";
  "P18c" = "playsInline";
  "P19"  = "contentHasVideo";
  "P19b" = "containsVideo";
  "P20"  = "MAX_FRAMES";
  "P21"  = @('type: "video"','mediaType.startsWith("video")');
  "P22"  = "video_url";
  "P23"  = "hasVideos";
  "P24"  = "VIDEO_BLOCK_TOKENS";
  "P25"  = "__p25OffloadOldVideos";
  "P26"  = "P26 v205 compat shim";
  "P27"  = @('"video",');
  "P28"  = '"instruction-hint"';
  "P30"  = "keep auto-update checks opt-in";
  "P31"  = "P31 (2026-09-12): hide duplicate expand button";
  "P37"  = "VIDEO_BODY_ID$P37";
  "P29"  = "backoffDelayMs"
}

function Get-MarkerHit {
  # any-of over the marker list, scoped to exactly one file (file+symbol combo)
  param([string]$Target, $Symbol)
  foreach ($m in @($Symbol)) {
    $n = Get-TreeHit -Target $Target -Marker $m
    if ($n -gt 0) { return [pscustomobject]@{ Hit = $true; Marker = $m; Count = $n } }
  }
  return [pscustomobject]@{ Hit = $false; Marker = $null; Count = 0 }
}

# ---------------------------------------------------------------------------
# rc2-diffs scan: existence + '--- a/' header + id -> file mapping
# ---------------------------------------------------------------------------
$Rc2Dir = Join-Path $Repo "patches\rc2-diffs"
$Rc2ById = @{}
$Rc2Files = @()
$Rc2Problems = @()
if (Test-Path $Rc2Dir) {
  foreach ($d in (Get-ChildItem $Rc2Dir -Filter *.diff | Sort-Object Name)) {
    $lines = Get-Content $d.FullName -Encoding UTF8
    $hasHdr = [bool]($lines | Where-Object { $_ -like '--- a/*' } | Select-Object -First 1)
    $Rc2Files += [pscustomobject]@{ Name = $d.Name; Header = $hasHdr }
    if (-not $hasHdr) { $Rc2Problems += ("{0}: no '--- a/' header" -f $d.Name) }
    # leading dash-separated P-token chain: P01, P16b, P17-P19b-P20-P25-...
    $parts = ($d.BaseName -split '-')
    $ids = @()
    foreach ($part in $parts) {
      if ($part -match '^P(\d{1,2})([a-z]?)$') {
        $ids += ('P' + [int]$Matches[1] + $Matches[2])
      } else { break }
    }
    foreach ($id in $ids) {
      if (-not $Rc2ById.ContainsKey($id)) { $Rc2ById[$id] = @() }
      $Rc2ById[$id] += $d.Name
    }
  }
} else {
  $Rc2Problems += "rc2-diffs directory missing: $Rc2Dir"
}

$rc2Ok = @($Rc2Files | Where-Object { $_.Header }).Count
Write-Host ("rc2-diffs: {0} file(s), {1} with valid '--- a/' header, {2} id(s) mapped" -f $Rc2Files.Count, $rc2Ok, $Rc2ById.Count)
foreach ($prob in $Rc2Problems) { Write-Host "  RC2-FAIL: $prob" }

# ---------------------------------------------------------------------------
# per-patch verification (file == host; non-host reported as skipped)
# ---------------------------------------------------------------------------
$results = @()
$skipped = @()
foreach ($p in $Manifest.patches) {
  $id = [string]$p.id
  $status = [string]$p.status
  if (-not $status) { $status = "active" }

  if ($p.file -ne "host") {
    # v3 fix: previously a bare `continue` — P5 vanished with no trace.
    $skipped += [pscustomobject]@{ Id = $id; Reason = "skipped ($($p.file) scope)" }
    continue
  }
  $adjudicating = ($status -like "pending-adjudication*") -or ($status -like "skip-*")
  $pending      = ($status -like "pending*") -and (-not $adjudicating)

  # v3: target may be a string or an array (P18 v205 fan-out). Combined
  # criterion: every target file must exist AND carry at least one marker.
  $relTargets  = @($p.target)
  $TreeRoot = Split-Path $KernelDir -Parent
  $targetPaths = @($relTargets | ForEach-Object {
    $t = $_ -replace "/", "\\"
    if (Test-Path (Join-Path $KernelDir $t)) { Join-Path $KernelDir $t }
    elseif (Test-Path (Join-Path $TreeRoot $t)) { Join-Path $TreeRoot $t }
    else { Join-Path $KernelDir $t }
  })
  $patchFile = Join-Path $Repo ("patches\" + ($p.patchFile -replace "/", "\"))

  # diff artifact evidence: manifest patchFile (if present) or mapped rc2-diffs file
  $artifact = $null
  if ((Test-Path $patchFile)) { $artifact = $p.patchFile }
  elseif ($Rc2ById.ContainsKey($id)) { $artifact = "rc2-diffs/" + ($Rc2ById[$id] -join ",rc2-diffs/") }

  $klass = $null; $detail = $null

  $missing = @()
  for ($i = 0; $i -lt $targetPaths.Count; $i++) {
    if (-not (Test-Path $targetPaths[$i])) { $missing += $relTargets[$i] }
  }

  if ($missing.Count -gt 0) {
    $klass = "FAIL"; $detail = "target file missing in kernel tree: " + ($missing -join ", ")
  }
  else {
    $applied = $false; $how = $null
    if ((Test-Path $patchFile) -and ($patchFile -match '\.patch$') -and $HasGit) {
      # legacy path: git reverse-apply check succeeds only if patch IS applied
      $g = Invoke-GitCheck -GitArgs @('-C', $KernelDir, 'apply', '-p1', '-R', '--check', $patchFile)
      if ($g.Code -eq 0) { $applied = $true; $how = "reverse-apply $($p.patchFile)" }
    }
    if (-not $applied) {
      # symbol fallback: combined-dirty tree, .diff artifact, git unavailable,
      # or pending item. File+symbol double condition, per target file.
      $m = $Symbols[$id]
      if ($m) {
        $missed = @(); $parts = @()
        for ($i = 0; $i -lt $targetPaths.Count; $i++) {
          $h = Get-MarkerHit -Target $targetPaths[$i] -Symbol $m
          if ($h.Hit) {
            $label = (($relTargets[$i] -split '/') | Select-Object -Last 2) -join '/'
            $parts += ("{0} [{1}] x{2}" -f $label, $h.Marker, $h.Count)
          } else { $missed += $relTargets[$i] }
        }
        if ($missed.Count -eq 0) { $applied = $true; $how = "symbol " + ($parts -join "; ") }
        else { $detail = "symbol '" + (@($m) -join "'|'") + "' ABSENT in " + ($missed -join ", ") }
      }
    }
    if ($applied) {
      if ($artifact) { $klass = "PASS"; $detail = "applied ($how); artifact: $artifact" }
      elseif ($pending) { $klass = "MISSING-PENDING"; $detail = "applied ($how) but status=$status and no diff artifact registered yet" }
      else { $klass = "FAIL"; $detail = "applied ($how) but no diff artifact (patchFile missing, not in rc2-diffs)" }
    }
    elseif (-not $detail) { $detail = "no tree evidence (no reverse-apply pass, no symbol anchor for $id)" }
  }
  if ($adjudicating) {
    # v3: pending-adjudication (P11 awaiting fork e2e ruling, P15
    # skip-diagnostic-optional) is its own bucket; evidence stays informational.
    # v4: also catches skip-absorbed (P12 in 0.1.5 — native schema, marker gone).
    $klass = "PENDING-ADJUDICATION"; $detail = "status=$status; evidence: $detail"
  }
  elseif (-not $klass) {
    # not applied (tree evidence negative)
    if ($pending -and $detail -like "*ABSENT*") {
      $klass = "FAIL"; $detail = "status=$status but " + $detail + " - contradicts 'applied in-tree' registration"
    } else {
      $klass = "FAIL"; $detail = "NOT APPLIED: " + $detail
    }
  }
  $results += [pscustomobject]@{ Id = $id; Class = $klass; Detail = $detail; Status = $status }
}

# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------
$pass     = @($results | Where-Object { $_.Class -eq "PASS" })
$pendingR = @($results | Where-Object { $_.Class -eq "MISSING-PENDING" })
$adjR     = @($results | Where-Object { $_.Class -eq "PENDING-ADJUDICATION" })
$failR    = @($results | Where-Object { $_.Class -eq "FAIL" })

Write-Host ""
Write-Host ("=== PASS ({0}) ===" -f $pass.Count)
foreach ($r in $pass)     { Write-Host ("  {0,-5} {1}" -f $r.Id, $r.Detail) }
Write-Host ("=== MISSING-PENDING ({0}) ===" -f $pendingR.Count)
foreach ($r in $pendingR) { Write-Host ("  {0,-5} {1}" -f $r.Id, $r.Detail) }
Write-Host ("=== PENDING-ADJUDICATION ({0}) ===" -f $adjR.Count)
foreach ($r in $adjR)     { Write-Host ("  {0,-5} {1}" -f $r.Id, $r.Detail) }
Write-Host ("=== SKIPPED ({0}) ===" -f $skipped.Count)
foreach ($s in $skipped)  { Write-Host ("  {0,-5} {1}" -f $s.Id, $s.Reason) }
Write-Host ("=== FAIL ({0}) ===" -f $failR.Count)
foreach ($r in $failR)    { Write-Host ("  {0,-5} {1}" -f $r.Id, $r.Detail) }
foreach ($prob in $Rc2Problems) {
  Write-Host ("  RC2   {0}" -f $prob)
}

$classified = $results.Count + $skipped.Count
Write-Host ""
Write-Host ("HOST SUMMARY [{0}]: {1} item(s) classified of {2} manifest entries -> PASS={3} MISSING-PENDING={4} PENDING-ADJUDICATION={5} SKIPPED={6} FAIL={7}" -f `
  $Source, $classified, @($Manifest.patches).Count, $pass.Count, $pendingR.Count, $adjR.Count, $skipped.Count, ($failR.Count + $Rc2Problems.Count))
if (($failR.Count + $Rc2Problems.Count) -eq 0) { Write-Host "ALL HOST CHECKS RESOLVED (no FAIL)" } else { Write-Host "SOME HOST CHECKS FAILED" }
exit ([int][bool]($failR.Count + $Rc2Problems.Count))
