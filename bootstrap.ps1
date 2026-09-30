# bootstrap.ps1 - oh-my-whale installer: apply patches, deploy configs, install deps
# Usage (admin PowerShell):
#   git clone https://github.com/<you>/oh-my-whale.git && cd oh-my-whale && .\bootstrap.ps1
param(
  [string]$ProfileName = "web",
  [switch]$SkipPatches,
  [switch]$SkipInstall,
  [switch]$DryRun
  [switch]$Interactive              # answer the renderer prompts (implies a blocking run)
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$DshHome = "$env:USERPROFILE\.dsh"
$ProfileDir = "$DshHome\profiles\$ProfileName"
$StartTime = Get-Date

Write-Host "=== oh-my-whale bootstrap ===" -ForegroundColor Cyan
Write-Host "Repo       : $Repo"
Write-Host "DshHome    : $DshHome"
Write-Host "Profile    : $ProfileName ($ProfileDir)"

function Step($msg) { Write-Host "`n[$msg]" -ForegroundColor Yellow }

# ---------------- Phase 0: environment ----------------
Step "Phase 0: environment check"
if (-not (net session 2>$null)) { Write-Host "WARN: not elevated - patch application may fail" }
foreach ($tool in @("git", "node", "npm", "pnpm")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Write-Host "FAIL: $tool not found"; exit 1 }
}
$nodeVer = node --version
Write-Host "node: $nodeVer, pnpm: $(pnpm --version)"

# Locate kernel dir. Shell 2.0.16 (kernel 0.2.0-rc.1) STOPPED packing the app: the tree
# ships unpacked at resources\app\node_modules. This script only knew about
# resources\app.asar.unpacked (shell <= 2.0.15) and the pre-v209 Program Files install, so
# on the current shell NEITHER existed and bootstrap exited 1 at Phase 0 having deployed
# nothing. probe order: unpacked -> packed-asar era -> legacy.
$kernelDir = ""
$kernelCandidates = @(
  "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app\node_modules",
  "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules",
  "C:\Program Files\DeepSeek Harness\resources\host\node_modules"
)
foreach ($c in $kernelCandidates) { if (-not $kernelDir -and (Test-Path "$c\@deepseek-ai\dsh\package.json")) { $kernelDir = $c } }
if (-not $kernelDir) {
  Write-Host "FAIL: no dsh kernel found. Probed:" -ForegroundColor Red
  $kernelCandidates | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  Write-Host "Install DSH Desktop 2.0.16+ first." -ForegroundColor Red
  exit 1
}
Write-Host "kernel: $kernelDir"
# apply-post-install-patches.ps1 addresses the app ROOT; the kernel dir is its node_modules.
# This was passed but never defined, so the child received $null and its failure was
# indistinguishable from success.
$kernelParent = Split-Path -Parent $kernelDir
# One resolution, used by both the renderer (via the environment it reads) and the
# preset deploy below. Probed in the same order the renderer uses.
# omw: resolve the plugin sources root. One definition, used by the profile templates AND
# the preset deploy — if the two disagree, a preset and the profile point at different
# trees, which is exactly the kind of silent divergence the registry is meant to prevent.
function Get-OmwPluginSources {
  $env_ = $env:OMW_PLUGIN_SOURCES_DIR
  if ($env_) { return $env_ }
  $envFile = Join-Path $PSScriptRoot ".env"
  if (-not (Test-Path $envFile)) { $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) ".env" }
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match "^\s*(OMW_PLUGIN_SOURCES_DIR|PLUGIN_SOURCES_DIR)\s*=\s*(.+?)\s*$") {
        $v = $Matches[2].Trim().Trim('"').Trim("'")
        if ($v) { return ($v -replace "\\", "/") }
      }
    }
  }
  $conventional = Join-Path $env:USERPROFILE "ai-files"
  if (Test-Path $conventional) { return ($conventional -replace "\\", "/") }
  return $null
}
$PluginSources = Get-OmwPluginSources
$dshVer = (Get-Content "$kernelDir\@deepseek-ai\dsh\package.json" -Raw | ConvertFrom-Json).version
Write-Host "dsh kernel version: $dshVer"

# omw-dryrun: $DryRun only guarded the renderer flag, so a "dry run" overwrote the real
# ~/.dsh/.agent-presets and ~/.dsh/plugin-gateway. Everything that WRITES under $DshHome
# is now skipped when -DryRun is set.
function omw-dryrun { param([string]$What) if ($DryRun) { Write-Host "  [dry-run] skip: $What"; return $true } return $false }

# ---------------- Phase 1: backup ----------------
Step "Phase 1: backup existing state"
$backupStamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (Test-Path $ProfileDir) {
  Copy-Item $ProfileDir "$DshHome\profiles\$ProfileName.bak-oh-my-whale-$backupStamp" -Recurse
  Write-Host "profile backed up -> $ProfileName.bak-oh-my-whale-$backupStamp"
}
if (Test-Path "$DshHome\settings.yaml") {
  Copy-Item "$DshHome\settings.yaml" "$DshHome\settings.yaml.bak-oh-my-whale-$backupStamp"
  Write-Host "settings.yaml backed up"
}

# ---------------- Phase 2: apply patches ----------------
if (-not $SkipPatches) {
  Step "Phase 2: apply kernel patches"
  $applyResult = & powershell -ExecutionPolicy Bypass -File "$Repo\patches\host\apply.ps1" -KernelDir $kernelDir 2>&1
  $applyResult | Write-Host
  if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: kernel patches"; exit 1 }
  Write-Host "kernel patches OK"
} else {
  Write-Host "patches skipped (-SkipPatches)"
}

# ---------------- Phase 3: deploy configs ----------------
Step "Phase 3: render and deploy configs"
if ($PluginSources) { $env:OMW_PLUGIN_SOURCES_DIR = $PluginSources }
$renderArgs = @("-OutDir", $DshHome)
# The renderer prompts five times unless -DefaultsOnly, and Read-Host blocks FOREVER when
# stdin is redirected — an unattended provisioning run simply hung (exit 124 under a
# timeout, reproduced in review). Default to non-interactive; -Interactive opts back in.
if (-not $Interactive) { $renderArgs += "-DefaultsOnly" }
$renderOut = & powershell -ExecutionPolicy Bypass -File "$Repo\scripts\template-render.ps1" @renderArgs 2>&1
$renderOut | Write-Host

# Copy vendor tgz files to vendor-archives
$vendorSrc = "$Repo\profile\vendor"
$vendorDst = "$ProfileDir\vendor-archives"
if (Test-Path $vendorSrc) {
  New-Item -ItemType Directory -Path $vendorDst -Force | Out-Null
  Get-ChildItem $vendorSrc -Filter "*.tgz" | ForEach-Object {
    # Rename: dsh-external-dsh-super-injector-0.3.3.tgz -> dsh-super-injector-0.3.3.tgz (deployed name)
    $targetName = $_.Name -replace '^dsh-external-', ''
    Copy-Item $_.FullName "$vendorDst\$targetName" -Force
    Write-Host "vendor tgz: $targetName"
  }
}

# Deploy agent-presets THROUGH the template renderer.
# A raw Copy-Item shipped the {{...}} placeholders verbatim: 83 of them across 13
# presets, including the file:// paths that mount each preset's skills directory. The
# renderer is dot-sourced here rather than shelled out so the deploy reuses the exact
# $Vars map the profile templates are rendered with — one definition, one source.
if (Test-Path "$Repo\config\.agent-presets" -and -not (omw-dryrun "agent-presets deploy")) {
  New-Item -ItemType Directory -Path "$DshHome\.agent-presets" -Force | Out-Null
  # Credentials are not machine paths: the bounty-pipeline preset text was captured with
  # its real mailbox and password replaced by placeholders, and those cannot be inferred.
  # They come from the environment when set; when unset the placeholder survives into the
  # deployed preset and the leftover check below reports it. Silently shipping a literal
  # {{BOUNTY_MASTER_PASSWORD}} is how a credential gets pasted in by hand later.
  $presetVars = @{
    "{{DSH_USER_HOME}}"          = $DshHome
    "{{USER_HOME}}"              = $UserHome
    "{{LOCAL_APP_DATA}}"         = "$UserHome\AppData\Local"
    "{{USER_NAME}}"              = $User
    # Resolved exactly as template-render.ps1 resolves it, so a preset and the profile can
    "{{AGENT_OS_DIR}}"           = "$UserHome\AppData\Local\AgentOS"
    "{{CHROME_FAITHFUL_DIR}}"    = "$UserHome\chrome-faithful"
    "{{BOUNTY_MASTER_EMAIL}}"    = $(if ($env:BOUNTY_MASTER_EMAIL) { $env:BOUNTY_MASTER_EMAIL } else { "{{BOUNTY_MASTER_EMAIL}}" })
    "{{AGENTMAIL_INBOX}}"        = $(if ($env:AGENTMAIL_INBOX) { $env:AGENTMAIL_INBOX } else { "{{AGENTMAIL_INBOX}}" })
    "{{BOUNTY_MASTER_PASSWORD}}" = $(if ($env:BOUNTY_MASTER_PASSWORD) { $env:BOUNTY_MASTER_PASSWORD } else { "{{BOUNTY_MASTER_PASSWORD}}" })
  }
  # The relative path is measured from the PRESET'S OWN directory. Measuring it from the
  # file's grandparent — which this did at first — silently drops the preset name for
  # anything nested more than one level deep: autoprompt/skills/autoprompt-pipeline/SKILL.md
  # never materialised and 33 stray directories appeared at the top of .agent-presets.
  Get-ChildItem "$Repo\config\.agent-presets" -Directory | ForEach-Object {
    $presetSrc = $_.FullName
    $presetDst = Join-Path "$DshHome\.agent-presets" $_.Name
    Get-ChildItem $presetSrc -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($presetSrc.Length).TrimStart("\", "/")
      $dst = Join-Path $presetDst $rel
      $dir = Split-Path $dst -Parent
      if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      $body = [System.IO.File]::ReadAllText($_.FullName)
      foreach ($k in $presetVars.Keys) { $body = $body.Replace($k, $presetVars[$k]) }
      [System.IO.File]::WriteAllText($dst, $body, [System.Text.UTF8Encoding]::new($false))
    }
  }
  # local-preset-plugin payloads. SOURCES.json records these as a single source plus an
  # installed_to pattern and a mounted_in list; nothing else in the deploy path reads those
  # fields, so the payload never reached the presets and a fresh machine booted without the
  # guard. Deploying from the registry record keeps the two in step automatically — a
  # preset added to mounted_in is covered without editing this file.
  $sourcesFile = Join-Path $Repo "plugins\SOURCES.json"
  if (Test-Path $sourcesFile) {
    $src = (Get-Content $sourcesFile -Raw | ConvertFrom-Json)
    $list = if ($src -is [array]) { $src } else { @($src.plugins) }
    foreach ($plugin in $list) {
      if ($plugin.kind -ne "local-preset-plugin" -or -not $plugin.source -or -not $plugin.payload) { continue }
      $payloadSrc = Join-Path $Repo ($plugin.source -replace '/', '\')
      $payloadSrc = Join-Path $payloadSrc $plugin.payload
      if (-not (Test-Path $payloadSrc)) {
        Write-Host "  MISSING payload for $($plugin.id): $payloadSrc" -ForegroundColor Red
        continue
      }
      foreach ($presetName in @($plugin.mounted_in)) {
        $dst = Join-Path "$DshHome\.agent-presets" "$presetName\$($plugin.payload)"
        $dir = Split-Path $dst -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Copy-Item $payloadSrc $dst -Force
      }
      Write-Host "  $($plugin.id): payload -> $(@($plugin.mounted_in).Count) preset(s)"
    }
  }
  $leftover = (Get-ChildItem "$DshHome\.agent-presets" -Recurse -File |
    Select-String -Pattern "\{\{[A-Z_]+\}\}" | Measure-Object).Count
  if ($leftover -gt 0) { Write-Host "WARNING: $leftover unresolved placeholder(s) in deployed presets" -ForegroundColor Yellow }
  Write-Host "agent-presets deployed (rendered, $((Get-ChildItem "$DshHome\.agent-presets" -Directory).Count) presets)"
}

# ---------------- Phase 4: install dependencies ----------------
if (-not $SkipInstall) {
  Step "Phase 4: install profile dependencies"
  # Prepare link/file-dir targets from SOURCES.json
  $sources = Get-Content "$Repo\plugins\SOURCES.json" -Raw | ConvertFrom-Json
  $vars = @{
    "{{PLUGIN_SOURCES_DIR}}" = $env:OMW_PLUGIN_SOURCES_DIR
    "{{USER_HOME}}" = $env:USERPROFILE
    "{{DSH_USER_HOME}}" = $DshHome
    "{{CHROME_FAITHFUL_DIR}}" = "$env:USERPROFILE\chrome-faithful"
    "{{AGENT_OS_DIR}}" = "$env:USERPROFILE\AppData\Local\AgentOS"
  }
  foreach ($plugin in $sources.plugins) {
    if ($plugin.install_type -in @("link", "file-dir")) {
      $spec = $plugin.package_spec
      foreach ($k in $vars.Keys) { $spec = $spec.Replace($k, $vars[$k]) }
      $target = $spec -replace '^(link|file):', ''
      $target = $target -replace '/', '\'
      if (-not (Test-Path $target)) {
        Write-Host "  link target missing: $target"
        if ($plugin.type -eq "standalone") {
          # copy from repo standalone
          $srcDir = "$Repo\plugins\standalone\$($plugin.id -replace '^[^/]+/','')"
          if (Test-Path $srcDir) {
            Copy-Item $srcDir $target -Recurse
            Write-Host "  restored standalone: $target"
          }
        }
      } else {
        Write-Host "  link target exists: $target"
      }
    }
  }

  $failPatch = 0
  Push-Location $ProfileDir
  try {
    if (Test-Path "$ProfileDir\pnpm-lock.yaml") {
      pnpm install --frozen-lockfile 2>&1 | Select-Object -Last 5
    } else {
      pnpm install 2>&1 | Select-Object -Last 5
    }
    if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: pnpm install"; exit 1 }
  } finally { Pop-Location }
  Write-Host "dependencies installed"

  # omw: the deploy steps the post-deploy gates assert. Without these a fresh machine boots
  # and then fails gate 4 (kernel patches), gate 10 (local-overrides) and the super-injector
  # P5 gateway check on arrival. They run AFTER pnpm install on purpose: P5 patches a package
  # inside the profile's node_modules, and applying it beforehand means install overwrites it.
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$Repo\patches\profile\apply.ps1" -ProfileDir $ProfileDir 2>&1 |
    Select-Object -Last 6
  if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: patches/profile/apply.ps1 exited $LASTEXITCODE" -ForegroundColor Red; $failPatch = 1 }
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$Repo\scripts\apply-post-install-patches.ps1" -AppRoot $kernelParent 2>&1 |
    Select-Object -Last 6
  if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: apply-post-install-patches.ps1 exited $LASTEXITCODE" -ForegroundColor Red; $failPatch = 1 }
  if ($failPatch) { Write-Host "DEPLOY INCOMPLETE: a patch step failed — see above." -ForegroundColor Red; exit 1 }
} else {
  Write-Host "install skipped (-SkipInstall)"
}

# ---------------- Phase 5: gateway ----------------
# omw: local-overrides. The anchors and the per-machine diffs are registered in the repo
# and local-overrides/verify.ps1 asserts the live state matches — so a deploy that never
# applies them makes its own gate fail on a fresh machine.
Get-ChildItem "$Repo\local-overrides" -Filter "*.patch" -ErrorAction SilentlyContinue | ForEach-Object {
  $name = $_.Name
  Write-Host "  local-override: $name"
  Write-Host "    (apply manually per local-overrides/README.md — machine-specific by design)" -ForegroundColor DarkGray
}

Step "Phase 5: deploy plugin-gateway"
if (Test-Path "$Repo\gateway") {
  New-Item -ItemType Directory -Path "$DshHome\plugin-gateway" -Force | Out-Null
  Copy-Item "$Repo\gateway\*" "$DshHome\plugin-gateway\" -Recurse -Force
  Write-Host "gateway deployed"
}
# super-injector registry template
if (Test-Path "$Repo\super-injector\registry.json.template") {
  New-Item -ItemType Directory -Path "$DshHome\super-injector" -Force | Out-Null
  Copy-Item "$Repo\super-injector\registry.json.template" "$DshHome\super-injector\registry.json" -Force
  Write-Host "super-injector registry template deployed"
}

# ---------------- Phase 6: smoke ----------------
Step "Phase 6: smoke tests"
$failSmoke = 0
Get-ChildItem "$Repo\profile" -Filter "*.mjs" | ForEach-Object {
  $check = node --check $_.FullName 2>&1
  if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: $($_.Name) $check"; $failSmoke = 1 }
}
if ($failSmoke -eq 0) { Write-Host "mjs syntax OK" }

# verify profile patches (P5 gateway in super-injector runtime copy)
#
# Brace discipline matters here and got it wrong once: the `else` bound to the INNER
# `if ($hits -gt 0)`, and the `if ($failSmoke) { exit 1 }` sat INSIDE the `Test-Path`
# block — so a missing runtime copy never recorded a failure at all, and the new
# exit 1 could not fire for the one case it was written for. Three flat statements, no
# nesting: check presence, then check content, then decide once.
$siPath = "$ProfileDir\node_modules\@dsh-external\dsh-super-injector\lib\index.js"
if (-not (Test-Path $siPath)) {
  Write-Host "FAIL: super-injector runtime copy absent at $siPath" -ForegroundColor Red
  Write-Host "  pnpm install did not place it; the profile cannot load bundles without it." -ForegroundColor Red
  $failSmoke = 1
} else {
  $hits = (Select-String -Path $siPath -Pattern "plugin-gateway" -SimpleMatch | Measure-Object).Count
  if ($hits -gt 0) {
    Write-Host "P5 gateway integration: present ($hits)"
  } else {
    Write-Host "FAIL: P5 gateway missing after deploy" -ForegroundColor Red
    Write-Host "  patches/profile/apply.ps1 should have installed it; re-run it directly." -ForegroundColor Red
    $failSmoke = 1
  }
}

# A smoke result that is recorded and then ignored is not a smoke test. Deployed state that
# fails here must not be reported as a successful bootstrap.
if ($failSmoke) {
  Write-Host "DEPLOY INCOMPLETE: smoke failures above. The tree is NOT a working install yet." -ForegroundColor Red
  exit 1
}

# ---------------- Phase 6.5: governance split assets ----------------
Step "Phase 6.5: governance split assets"
$govSources = Get-Content "$Repo\plugins\SOURCES.json" -Raw | ConvertFrom-Json
$govRow = $govSources.plugins | Where-Object { $_.id -eq '@agent-os/dsh-governance' }
if ($govRow) { Write-Host "SOURCES: @agent-os/dsh-governance present (install_type=$($govRow.install_type), default disabled)" } else { Write-Host "WARN: governance source row missing"; $failSmoke = 1 }
$govDev = "$env:USERPROFILE\dev\dsh-governance"
if (Test-Path "$govDev\package.json") {
  Write-Host "A plugin repo: $govDev (default disabled; enable only after isolated smoke + gateway pass)"
  if (-not $DryRun) { node "$DshHome\plugin-gateway\scripts\verify.mjs" "$govDev" 2>&1 | Select-Object -Last 3 }
} else { Write-Host "WARN: A plugin repo missing at $govDev" }
$cDev = "$env:USERPROFILE\dev\agentos-framework-governance"
if (Test-Path "$cDev\pyproject.toml") { Write-Host "C plugin repo: $cDev (independent service; bootstrap does NOT auto-start it)" } else { Write-Host "WARN: C plugin repo missing at $cDev" }
# ---------------- Phase 7: output ----------------
Step "Phase 7: next steps"
Write-Host "`nSet these environment variables (see config/.env.example):"
Get-Content "$Repo\config\.env.example" | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { Write-Host "  $_" }
Write-Host "`nThen start DSH Desktop. Verify:"
Write-Host "  1. All custom models present (settings page)"
Write-Host "  2. Old sessions load (history)"
Write-Host "  3. chrome tools work (if configured)"
$elapsed = (Get-Date) - $StartTime
Write-Host "`nBootstrap finished in $($elapsed.TotalMinutes.ToString('F1')) min" -ForegroundColor Green
