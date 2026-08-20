# bootstrap.ps1 - oh-my-whale installer: apply patches, deploy configs, install deps
# Usage (admin PowerShell):
#   git clone https://github.com/<you>/oh-my-whale.git && cd oh-my-whale && .\bootstrap.ps1
param(
  [string]$ProfileName = "web",
  [switch]$SkipPatches,
  [switch]$SkipInstall,
  [switch]$DryRun
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

# Locate kernel dir (new shell v2.0.1 preferred, old shell fallback)
$kernelDir = ""
$newKernel = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules"
$oldKernel = "C:\Program Files\DeepSeek Harness\resources\host\node_modules"
if (Test-Path $newKernel) { $kernelDir = $newKernel } elseif (Test-Path $oldKernel) { $kernelDir = $oldKernel }
if (-not $kernelDir) { Write-Host "FAIL: no dsh kernel found (install DSH Desktop first)"; exit 1 }
Write-Host "kernel: $kernelDir"
$dshVer = (Get-Content "$kernelDir\@deepseek-ai\dsh\package.json" -Raw | ConvertFrom-Json).version
Write-Host "dsh kernel version: $dshVer"

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
$renderArgs = @("-OutDir", $DshHome)
if ($DryRun) { $renderArgs += "-DefaultsOnly" }
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

# Deploy agent-presets
if (Test-Path "$Repo\config\.agent-presets") {
  New-Item -ItemType Directory -Path "$DshHome\.agent-presets" -Force | Out-Null
  Copy-Item "$Repo\config\.agent-presets\*" "$DshHome\.agent-presets\" -Recurse -Force
  Write-Host "agent-presets deployed ($((Get-ChildItem "$DshHome\.agent-presets" -Directory).Count) presets)"
}

# ---------------- Phase 4: install dependencies ----------------
if (-not $SkipInstall) {
  Step "Phase 4: install profile dependencies"
  # Prepare link/file-dir targets from SOURCES.json
  $sources = Get-Content "$Repo\plugins\SOURCES.json" -Raw | ConvertFrom-Json
  $vars = @{
    "{{PLUGIN_SOURCES_DIR}}" = "E:\ai-files"
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
} else {
  Write-Host "install skipped (-SkipInstall)"
}

# ---------------- Phase 5: gateway ----------------
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
$siPath = "$ProfileDir\node_modules\@dsh-external\dsh-super-injector\lib\index.js"
if (Test-Path $siPath) {
  $hits = (Select-String -Path $siPath -Pattern "plugin-gateway" -SimpleMatch | Measure-Object).Count
  if ($hits -gt 0) { Write-Host "P5 gateway integration: present ($hits)" } else { Write-Host "WARN: P5 gateway missing - run patches/profile/apply.ps1"; $failSmoke = 1 }
}

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
