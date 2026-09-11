# capture-sources.ps1 - Capture current local plugin source fingerprints into plugins/FINGERPRINTS.json
# Usage:
#   .\scripts\capture-sources.ps1                     # scan local install, write FINGERPRINTS.json
#   .\scripts\capture-sources.ps1 -ProfileDir <dir>   # custom profile dir
# Reuses: SOURCES.json (plugin inventory), profiles/web/package.json (live install)
# Output: plugins/FINGERPRINTS.json - one entry per locally-sourced plugin:
#   { id, spec, source, install_type, version, gitHead, dirty, sha256 }
#   - gitHead/dirty: for git repos (link/file-dir sources)
#   - sha256: for vendor tgz archives
# Encoding: JSON written UTF-8 no-BOM (PS 5.1 safe, WriteAllText)
param(
  [string]$ProfileDir = "",
  [string]$OutPath = "",
  [switch]$Quiet
)

$ErrorActionPreference = "Continue"
$Repo = Split-Path -Parent $PSScriptRoot
if (-not $ProfileDir) { $ProfileDir = "$env:USERPROFILE\.dsh\profiles\web" }

$SourcesJson = Join-Path $Repo "plugins\SOURCES.json"
if (-not $OutPath) { $OutPath = Join-Path $Repo "plugins\FINGERPRINTS.json" }

function Get-Text($path) {
  if (-not (Test-Path $path)) { return $null }
  return [System.IO.File]::ReadAllText($path)
}

if (-not (Test-Path $SourcesJson)) { Write-Host "ERROR: $SourcesJson not found" -ForegroundColor Red; exit 1 }
if (-not (Test-Path "$ProfileDir\package.json")) { Write-Host "ERROR: profile package.json not found: $ProfileDir" -ForegroundColor Red; exit 1 }

$sources = Get-Text $SourcesJson | ConvertFrom-Json
$pkg = Get-Text "$ProfileDir\package.json" | ConvertFrom-Json

# Resolve {{VAR}} placeholders used in SOURCES.json
$envMap = @{
  "AGENT_OS_DIR"    = if (Test-Path "C:\Users\Administrator\AppData\Local\AgentOS") { "C:/Users/Administrator/AppData/Local/AgentOS" } else { "{{AGENT_OS_DIR}}" }
  "USER_HOME"       = $env:USERPROFILE
  "PLUGIN_SOURCES_DIR" = if (Test-Path "E:\ai-files") { "E:/ai-files" } else { "{{PLUGIN_SOURCES_DIR}}" }
  "CHROME_FAITHFUL_DIR" = if (Test-Path "C:\Users\Administrator\chrome-faithful") { "C:/Users/Administrator/chrome-faithful" } else { "{{CHROME_FAITHFUL_DIR}}" }
}
# Reverse templating: replace machine-specific paths back to {{VAR}} so the
# committed FINGERPRINTS.json stays portable (privacy + cross-machine diff).
# Longest value first so nested prefixes (e.g. USER_HOME inside AGENT_OS_DIR)
# match correctly.
function Unresolve-Var([string]$s) {
  foreach ($k in ($envMap.Keys | Sort-Object { $envMap[$_].Length } -Descending)) {
    $v = $envMap[$k]
    if ($v -and $v -notlike "{{*") {
      $vFwd = $v.Replace('\', '/')
      $vBak = $v.Replace('/', '\')
      $vBak2 = $vBak.Replace('\', '\\')  # JSON-escaped doubled backslash form
      $s = $s.Replace($vFwd, "{{$k}}").Replace($vBak, "{{$k}}").Replace($vBak2, "{{$k}}")
    }
  }
  return $s
}
function Resolve-Var([string]$s) {
  foreach ($k in $envMap.Keys) { $s = $s -replace [regex]::Escape("{{$k}}"), $envMap[$k] }
  # relative paths (file:vendor-archives/... etc) resolve against profile dir
  if ($s -and -not ($s -match "^[A-Za-z]:|^/|^\\|^{{")) {
    $s = Join-Path $ProfileDir $s
  }
  return $s
}

# find nearest .git walking up (max 3 levels) - for packages inside a parent repo
function Find-GitRoot([string]$dir) {
  $cur = $dir
  for ($i = 0; $i -lt 3 -and $cur; $i++) {
    if (Test-Path (Join-Path $cur ".git")) { return $cur }
    $cur = Split-Path $cur -Parent
  }
  return $null
}

$entries = @()

# ── 1. Live install: profile dependencies with link:/file: specs ──
foreach ($dep in $pkg.dependencies.PSObject.Properties) {
  $id = $dep.Name
  $spec = $dep.Value
  $src = $null
  $installType = "npm"
  if ($spec -match "^link:(.+)$") { $src = Resolve-Var $Matches[1]; $installType = "link" }
  elseif ($spec -match "^file:(.+)$") {
    $src = Resolve-Var $Matches[1]
    $installType = if ($src -match "\.tgz$") { "local-tgz" } elseif ($src -match "bundles") { "file-dir" } else { "file-dir" }
  }

  if (-not $src) { continue }  # npm-range / github specs: version tracked in SOURCES only

  $entry = @{ "id" = $id; "spec" = $spec; "source" = $src; "install_type" = $installType }

  # git repo? (direct or nearest parent repo)
  $gitRoot = Find-GitRoot $src
  if ($gitRoot) {
    Push-Location $gitRoot
    try {
      $head = (git rev-parse HEAD 2>$null).Trim()
      $dirtyLines = @(git status --porcelain 2>$null)
      $entry.gitHead = $head
      $entry.dirty = $dirtyLines.Count
      $entry.dirtyFiles = @($dirtyLines | Select-Object -First 20)
      if ($gitRoot -ne $src) { $entry.gitRoot = $gitRoot }
    } finally { Pop-Location }
  } elseif (Test-Path "$src\package.json") {
    $entry.gitHead = ""
    $entry.dirty = -1
  }

  # version from source package.json
  if (Test-Path "$src\package.json") {
    try { $entry.version = (Get-Text "$src\package.json" | ConvertFrom-Json).version } catch {}
  }
  # tgz sha256
  if ($src -match "\.tgz$" -and (Test-Path $src)) {
    $entry.sha256 = (Get-FileHash $src -Algorithm SHA256).Hash.ToLower()
  }

  $entries += $entry
}

# ── 3. Live node_modules links not declared in dependencies (wild plugins) ──
# MUST run before Section 2 (SOURCES-only) so live link plugins get full version detection
$nmDir = Join-Path $ProfileDir "node_modules"
if (Test-Path $nmDir) {
  $knownIds = @{}
  foreach ($e in $entries) { $knownIds[$e.id] = $true }
  # PS 5.1: FileSystemInfo.Target unreliable; enumerate parent links via cmd dir /AL
  $linkLines = cmd /c dir /AL $nmDir 2>$null
  $linkTargets = @{}
  foreach ($line in $linkLines) {
    if ($line -notmatch "SYMLINK|JUNCTION") { continue }
    if ($line -notmatch "\]") { continue }
    $name = ($line -split "\s+")[-2]
    $tgt = ($line -split "\[")[-1] -replace '\]+$', ""     # strip trailing ]
    $tgt = $tgt -replace '^\\\?\?\\', ""                    # strip \??\ prefix
    if ($name -and $tgt) { $linkTargets[$name] = $tgt }
  }
  foreach ($name in $linkTargets.Keys) {
    if ($knownIds.ContainsKey($name)) { continue }
    $target = $linkTargets[$name] -replace '\\', "/"
    # only local filesystem targets (skip npm store / pnpm virtual dirs)
    if ($target -notmatch "^[A-Za-z]:") { continue }
    $entry = @{
      "id" = $name
      "spec" = "link:$($linkTargets[$name])"
      "source" = $target
      "install_type" = "link"
      "unlisted_in_deps" = $true
    }
    $gitRoot = Find-GitRoot $target
    if ($gitRoot) {
      Push-Location $gitRoot
      try {
        $entry.gitHead = (git rev-parse HEAD 2>$null).Trim()
        $entry.dirty = @(git status --porcelain 2>$null).Count
        if ($gitRoot -ne $target) { $entry.gitRoot = $gitRoot }
      } finally { Pop-Location }
    }
    if (Test-Path "$target\package.json") {
      try { $entry.version = (Get-Text "$target\package.json" | ConvertFrom-Json).version } catch {}
    }
    $entries += $entry
  }
}

# ── 2. SOURCES-only local entries (registered in SOURCES.json but not in live deps or links) ──
foreach ($s in $sources.plugins) {
  if ($s.install_type -eq "npm" -or $s.install_type -eq "github" -or $s.install_type -eq "vendor-archive") { continue }
  $already = $entries | Where-Object { $_.id -eq $s.id }
  if ($already) { continue }
  if (-not $s.source) { continue }
  $src = Resolve-Var $s.source
  $entry = @{ "id" = $s.id; "spec" = ""; "source" = $src; "install_type" = $s.install_type; "registered_only" = $true }
  $gitRoot = Find-GitRoot $src
  if ($gitRoot) {
    Push-Location $gitRoot
    try {
      $entry.gitHead = (git rev-parse HEAD 2>$null).Trim()
      $entry.dirty = @(git status --porcelain 2>$null).Count
    } finally { Pop-Location }
  }
  if (Test-Path "$src\package.json") {
    try { $entry.version = (Get-Text "$src\package.json" | ConvertFrom-Json).version } catch {}
  }
  $entries += $entry
}

foreach ($e in $entries) {
  $e.source = Unresolve-Var $e.source
  $e.spec = Unresolve-Var $e.spec
  if ($e.gitRoot) { $e.gitRoot = Unresolve-Var $e.gitRoot }   # v209: gitRoot escaped the templating before (chrome-faithful parent repo)
}
$report = @{
  "version" = "1"
  "generatedAt" = (Get-Date -Format "o")
  "profileDir" = Unresolve-Var $ProfileDir
  "notes" = "v209-era baseline (shell 2.0.9 / kernel 0.1.5-rc.1, packed app.asar). Dirty counts on link: sources are EXPECTED and are NOT drift-to-fix: dsh-voice-input carries the V8 fix4 hardening edited straight into the symlink source ({{USER_HOME}}/dsh-voice-input) - no repack needed, edits are live. {{PLUGIN_SOURCES_DIR}} link plugins (dsh-fork-to-preset, dsh-web-billing, dsh-routed-subagent, dsh-subagent-model, dsh-global-tool-discovery, dsh-continuous-worker) show whatever their local dev trees carry, incl. nested-copy patch residues (V5/V6 @deepseek-ai/dsh-subagent twins). V7 (dsh-better-sidebar) and V2/V2.1 (dsh-token-meter-hermes) live in the INSTALLED copies under profiles/web/node_modules, so the vendor tgz sha and the hermes file: source stay unchanged - reinstall reverts them (see plugins/SOURCES.json descriptions)."
  "entries" = ($entries | Sort-Object id)
}

$json = $report | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($OutPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "WROTE: $OutPath ($($entries.Count) entries)"
foreach ($e in $entries) {
  $v = if ($e.version) { "v$($e.version)" } else { "no-pkg" }
  $g = if ($e.gitHead) { "HEAD=$($e.gitHead)" } elseif ($e.sha256) { "sha=$($e.sha256.Substring(0,12))" } else { "no-git" }
  $d = if ($e.dirty -ge 0) { "dirty=$($e.dirty)" } else { "" }
  Write-Host ("  {0,-42} {1,-12} {2} {3}" -f $e.id, $v, $g, $d)
}
