# drift-scan.ps1 - Detect drift between oh-my-whale repo and local DSH installation
# Usage:
#   .\scripts\drift-scan.ps1                     # scan, print to terminal, write drift-report.json
#   .\scripts\drift-scan.ps1 -Out report.json    # specify output path
#   .\scripts\drift-scan.ps1 -Compare baseline.json  # compare two reports (delta matrix)
#   .\scripts\drift-scan.ps1 -Installed             # scan the LIVE installed app.asar instead of the runtime tree
# Reuses: manifest.json, verify.ps1 markers, capture.sh kernel detection, template-render.ps1
# Encoding: UTF-8 no-BOM for JSON output (PS 5.1 WriteAllText, not Set-Content)
param(
  [string]$Out = "",                        # output report path (default: drift-report.json)
  [string]$Compare = "",                    # baseline report to compare against
  [string]$Allowlist = "",                  # drift-allowlist.json path (default: docs/drift-allowlist.json)
  [switch]$Installed,                       # (default) scan the LIVE install; kept for explicitness
  [switch]$RuntimeTree,                     # scan the 0.1.5 runtime tree instead (legacy, NOT the running kernel)
  [switch]$Deep                             # iteration 2: --deep not yet implemented
)

$ErrorActionPreference = "Continue"
$Repo = Split-Path -Parent $PSScriptRoot
$ReportPath = if ($Out) { $Out } else { Join-Path (Get-Location) "drift-report.json" }
$AllowlistPath = if ($Allowlist) { $Allowlist } else { Join-Path $Repo "docs\drift-allowlist.json" }

# ── Kernel detection (v209 packed-asar era) ──
# Since shell 2.0.9 / kernel 0.1.5-rc.1 the whole kernel lives INSIDE resources\app.asar
# (app.asar.unpacked only carries node-pty/@img natives — no @deepseek-ai packages).
# The authoritative landing tree for patch scans is the patched runtime tree; -Installed
# mirrors verify.ps1 v4 and checks the live shipped asar via the shared extract cache.
$RuntimeTreeModules = "$env:USERPROFILE\.dsh\runtime\v209-patched-tree\node_modules"
$OldKernel = "C:\Program Files\DeepSeek Harness\resources\host\node_modules"
$ProfileModules = "$env:USERPROFILE\.dsh\profiles\web\node_modules"

if ($Installed -or -not $RuntimeTree) {
  # Desktop shell 2.0.16 (kernel 0.2.0-rc.1) STOPPED packing the app: the tree
  # ships unpacked at resources\app\. Only fall back to the asar extraction cache
  # when that older layout is present (shell <= 2.0.15).
  $UnpackedApp = Join-Path $env:LOCALAPPDATA "Programs\DSH Desktop\resources\app"
  $Asar        = Join-Path $env:LOCALAPPDATA "Programs\DSH Desktop\resources\app.asar"
  if (Test-Path (Join-Path $UnpackedApp "node_modules")) {
    # Unpacked layout: read the install in place. Nothing is copied or extracted.
    $KernelDir = Join-Path $UnpackedApp "node_modules"
    $InstalledLayout = "unpacked (shell 2.0.16+)"
  } elseif (Test-Path $Asar) {
    # Legacy layout: unpack the LIVE resources\app.asar into patches\host\.asar-cache
    # (same cache + stamp scheme as verify.ps1 v4, so the two scripts share one
    # 170MB one-time extraction). The install directory is only ever READ.
    $CacheRoot = Join-Path $Repo "patches\host\.asar-cache"
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
      & npx --yes @electron/asar extract $Asar $CacheTree 2>&1 | Out-String | Out-Null
      $code = $LASTEXITCODE
      if ($code -ne 0 -or -not (Test-Path (Join-Path $CacheTree "node_modules"))) {
        Write-Host "ERROR: asar extract failed (exit $code); cache dir: $CacheTree" -ForegroundColor Red; exit 1
      }
      Set-Content -Path $StampFile -Value $key -NoNewline
      Write-Host "asar-cache: extraction complete"
    } else {
      Write-Host "asar-cache: reusing cached extraction ($CacheTree)"
    }
    $KernelDir = Join-Path $CacheTree "node_modules"
    $InstalledLayout = "app.asar (shell <=2.0.15)"
  } else {
    Write-Host "ERROR: installed mode: neither an unpacked app tree nor app.asar found under $env:LOCALAPPDATA\Programs\DSH Desktop\resources" -ForegroundColor Red
    exit 1
  }
} elseif (Test-Path $RuntimeTreeModules) {
  # The 0.1.5 runtime tree. It is NO LONGER the running kernel (shell 2.0.16 ships
  # 0.2.0-rc.1 unpacked), so scanning it by default reported drift against a tree
  # nothing executes - every patch verdict was about dead code. It now warns loudly.
  $KernelDir = $RuntimeTreeModules
  Write-Host "WARNING: scanning the 0.1.5 runtime tree (v209-patched-tree) - that is NOT the running kernel since shell 2.0.16 (0.2.0-rc.1). Re-run with -Installed to scan the live install." -ForegroundColor Yellow
} else {
  $KernelDir = $OldKernel   # legacy pre-v209 shell fallback
}
$KernelVersion = if (Test-Path "$KernelDir\@deepseek-ai\dsh\package.json") {
  (Get-Content "$KernelDir\@deepseek-ai\dsh\package.json" -Encoding UTF8 -Raw | ConvertFrom-Json).version
} else { "unknown" }

# Authority note for the kernel-patch section below: after the 0.2.0 port the
# per-patch check is a TEXTUAL reverse-apply, and most ports were hand-rewritten
# against a reshaped 0.2.0 file. A rewritten-but-correct patch therefore reports
# LOST here. scriptserify-patch-port.mjs is the authority: it asserts the
# capability each patch exists to provide, not the patch's original text.
$PortMeter = Join-Path $PSScriptRoot "verify-patch-port.mjs"
$AppRoot = Join-Path $env:LOCALAPPDATA "Programs\DSH Desktopesourcespp"
Write-Host "=== oh-my-whale drift scan ===" -ForegroundColor Cyan
Write-Host ("KernelDir : {0} ({1}){2}" -f $KernelDir, $KernelVersion, $(if ($Installed) { " [installed: $InstalledLayout]" } else { "" }))
Write-Host "Repo      : $Repo"
Write-Host ""

# ── Helper functions ──
function Get-Text($path) {
  if (-not (Test-Path $path)) { return $null }
  return [System.IO.File]::ReadAllText($path)
}

function Write-JsonReport($path, $report) {
  $json = $report | ConvertTo-Json -Depth 10
  $dir = Split-Path $path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Report: $path ($([System.IO.FileInfo]::new($path).Length) bytes)" -ForegroundColor DarkGray
}

# ── Section 1: Patch layer ──
Write-Host "[1] Patches" -ForegroundColor Yellow
$ManifestPath = Join-Path $Repo "patches\manifest.json"
$Manifest = [System.IO.File]::ReadAllText($ManifestPath) | ConvertFrom-Json

# Load allowlist (acknowledged known drift)
$allowlistEntries = @{}
if (Test-Path $AllowlistPath) {
  $alJson = [System.IO.File]::ReadAllText($AllowlistPath)
  $al = $alJson | ConvertFrom-Json
  foreach ($e in $al.entries) { $allowlistEntries["$($e.type):$($e.path)"] = $true }
}

$knownApplied = @()
$markerPresent = @()
$lost = @()
$skippedStatus = @()
$unknownModified = @()

# v209: the asar source tree root (parent of node_modules). Some patch targets live
# at the tree root, not under node_modules — P30's lib/updates.js is the canonical
# case (desktop-updates policy file sits at the app.asar root). Same three-branch
# resolution as verify.ps1 v4: KernelDir hit -> TreeRoot hit -> KernelDir (report miss).
$TreeRoot = Split-Path $KernelDir -Parent

# id -> in-tree symbol anchors, kept in lockstep with patches/host/verify.ps1 v4
# ($Symbols). String or any-of array; a marker only counts inside the entry's
# target file(s); array targets require EVERY file to hit. P26-P30 anchors included
# so the whole 36-item manifest stays in the drift view.
$Symbols = @{
  "P1"   = "parentEntry"
  "P2"   = "descLocationCache"
  "P3"   = "api.b.ai"
  "P4"   = "continuous-worker/change"
  "P6"   = "registerTransitionGuard"
  "P7"   = "LIST_PROJECTION_EXCLUDED"
  "P8"   = "ui-subagent: @ source"
  "P9"   = @('agentPreset','fork-to-preset')
  "P10"  = @('agentPreset: opts.agentPreset','PATCH P10')
  "P11"  = "seedLength"
  "P12"  = "PATCH P12"
  "P13"  = "BATCH_MAX = 20"
  "P14"  = "Promise.resolve(fiber.dispose())"
  "P15"  = "error.stack"
  "P16"  = @('PATCH P16','externalContinuations')
  "P16b" = "dshRoutedSubagentPatch"
  "P17"  = "video_url"
  "P17b" = "video_url"
  "P17c" = "video_url"
  "P18"  = @('PATCH P18','literal("video")','P18 v205')
  "P18b" = "bytesToBase64"
  "P18c" = "playsInline"
  "P19"  = "contentHasVideo"
  "P19b" = "containsVideo"
  "P20"  = "MAX_FRAMES"
  "P21"  = @('type: "video"','mediaType.startsWith("video")')
  "P22"  = "video_url"
  "P23"  = "hasVideos"
  "P24"  = "VIDEO_BLOCK_TOKENS"
  "P25"  = "offloadOldVideos"
  "P26"  = "P26 v205 compat shim"
  "P27"  = @('"video",')
  "P28"  = '"instruction-hint"'
  "P29"  = "backoffDelayMs"
  "P30"  = "keep auto-update checks opt-in"
  "P37"  = "applyP37Video"
  "P38"  = "a module loaded by file:// URL that lives OUTSIDE every"
}

# 1a. Check each manifest patch (file == "host" only, P5 is profile-tree)
foreach ($p in $Manifest.patches) {
  if ($p.file -ne "host") {
    Write-Host "  $($p.id): SKIP (profile patch, not in kernel tree)" -ForegroundColor DarkGray
    continue
  }
  # target may be a string or an array (P18 fan-out); resolve each against
  # KernelDir, then TreeRoot (root-layer fallback, P30).
  $relTargets = @($p.target)
  $targetPaths = @($relTargets | ForEach-Object {
    $t = $_ -replace "/", "\"
    $a = Join-Path $KernelDir $t
    $b = Join-Path $TreeRoot $t
    if (Test-Path $a) { $a } elseif (Test-Path $b) { $b } else { $a }
  })
  $patchFile = Join-Path $Repo "patches\$($p.patchFile)"

  $missing = @()
  for ($i = 0; $i -lt $targetPaths.Count; $i++) {
    if (-not (Test-Path $targetPaths[$i])) { $missing += $relTargets[$i] }
  }
  if ($missing.Count -gt 0) {
    Write-Host "  $($p.id): LOST (target missing: $($missing -join ', '))" -ForegroundColor Red
    $lost += @{ "id" = $p.id; "reason" = "target_missing"; "target" = ($missing -join ", ") }
    continue
  }
  if (-not (Test-Path $patchFile)) {
    Write-Host "  $($p.id): CANNOT VERIFY (patch file missing)" -ForegroundColor Yellow
    $lost += @{ "id" = $p.id; "reason" = "patch_file_missing"; "target" = $p.target }
    continue
  }

  # reverse-apply check — from node_modules root; if the entry resolved to the
  # tree root (P30-class), retry the check from there so git can find the paths.
  $applyRoot = $KernelDir
  foreach ($tp in $targetPaths) {
    if (-not $tp.StartsWith($KernelDir)) { $applyRoot = $TreeRoot; break }
  }
  $revCheck = & git -C $applyRoot apply -p1 -R --check $patchFile 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  $($p.id): applied" -ForegroundColor Green
    $knownApplied += $p.id
  } else {
    # fallback to symbol markers (any-of per file, every target file must hit)
    $marker = $Symbols[$p.id]
    $missedFiles = @()
    if ($marker) {
      foreach ($tp in $targetPaths) {
        $hit = $false
        foreach ($mm in @($marker)) {
          if (Select-String -Path $tp -Pattern $mm -SimpleMatch -Quiet) { $hit = $true; break }
        }
        if (-not $hit) { $missedFiles += (Split-Path $tp -Leaf) }
      }
    } else { $missedFiles = @("(no anchor)") }
    if ($marker -and $missedFiles.Count -eq 0) {
      Write-Host "  $($p.id): applied (marker '$(@($marker) -join "'|'")')" -ForegroundColor Green
      $markerPresent += $p.id
    } elseif ($p.status -like "skip-*") {
      # manifest says skip-* (P11 skip-native, P12 skip-absorbed, P15
      # skip-optional-diagnostic): absence in the v209 tree is the registered
      # state, same non-FAIL semantics as verify.ps1 v4 PENDING-ADJUDICATION.
      Write-Host "  $($p.id): SKIP-STATUS ($($p.status)) — not drift" -ForegroundColor DarkGray
      $skippedStatus += @{ "id" = $p.id; "status" = [string]$p.status }
    } else {
      Write-Host "  $($p.id): LOST (reverse-apply fails + marker absent in $($missedFiles -join ', '))" -ForegroundColor Red
      $lost += @{ "id" = $p.id; "reason" = "reverse_check_failed_marker_absent"; "target" = $p.target }
    }
  }
}

# 1b. Scan for .bak / .orig files not in manifest (unknown modifications)
Write-Host "  --- scanning for unknown modifications ---" -ForegroundColor DarkGray
$knownSourcePaths = @{}
foreach ($p in $Manifest.patches) {
  if ($p.sourcePath) {
    $norm = $p.sourcePath -replace "/", "\"
    $knownSourcePaths[$norm] = $true
  }
}

# Collect all .bak* and .orig files under @deepseek-ai / @earendil-works, and —
# v209 addition — under $TreeRoot\lib (root-layer patch targets like P30's
# lib/updates.js keep their pre-patch .bak snapshots there, not in node_modules).
$bakFiles = @(Get-ChildItem "$KernelDir\@deepseek-ai" -Recurse -Filter "*.bak*" -ErrorAction SilentlyContinue)
$bakFiles += @(Get-ChildItem "$KernelDir\@deepseek-ai" -Recurse -Filter "*.orig" -ErrorAction SilentlyContinue)
$bakFiles += @(Get-ChildItem "$KernelDir\@earendil-works" -Recurse -Filter "*.bak*" -ErrorAction SilentlyContinue)
$bakFiles += @(Get-ChildItem "$TreeRoot\lib" -Recurse -Filter "*.bak*" -ErrorAction SilentlyContinue)
$bakFiles += @(Get-ChildItem "$TreeRoot\lib" -Recurse -Filter "*.orig" -ErrorAction SilentlyContinue)

foreach ($bf in $bakFiles) {
  # node_modules files report KernelDir-relative (manifest sourcePath convention);
  # tree-root files (lib/...) report TreeRoot-relative so the manifest target
  # comparison below still matches ("lib\updates.js" == P30 target).
  if ($bf.FullName.StartsWith($KernelDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    $rel = $bf.FullName.Substring($KernelDir.Length + 1)
  } else {
    $rel = $bf.FullName.Substring($TreeRoot.Length + 1)
  }
  # Check if this is a known sourcePath
  if ($knownSourcePaths.ContainsKey($rel)) { continue }
  # Check if the target (without .bak suffix) is a known patch target
  $base = $rel -replace '\.bak[^\\]*$', ''
  $isKnownPatch = $false
  foreach ($p in $Manifest.patches) {
    $t = $p.target -replace "/", "\"
    if ($base -eq $t) { $isKnownPatch = $true; break }
  }
  if (-not $isKnownPatch) {
    $relFwd = $rel -replace '\\', "/"   # allowlist 键统一正斜杠（unknownModified 类型）
    $key = "unknownModified:$relFwd"
    if ($allowlistEntries.ContainsKey($key)) {
      Write-Host "  ACKED: $rel (allowlist)" -ForegroundColor DarkGray
      continue
    }
    Write-Host "  UNKNOWN: $rel" -ForegroundColor Yellow
    $unknownModified += @{
      "type" = "bak_without_manifest"
      "bakFile" = $relFwd
      "suggestion" = "review: new patch to capture or clean up"
    }
  }
}

$patchesStatus = if ($lost.Count -eq 0 -and $unknownModified.Count -eq 0) { "CLEAN" } else { "HAS_DRIFT" }
$sections = @{
  "patches" = @{
    "status" = $patchesStatus
    "knownApplied" = $knownApplied
    "markerPresent" = $markerPresent
    "skippedStatus" = $skippedStatus
    "lost" = $lost
    "unknownModified" = $unknownModified
  }
}

# ── Section 2: Config layer (via template-render.ps1) ──
Write-Host "[2] Config" -ForegroundColor Yellow
$configDiffers = @()
$configMatches = @()

$tmpRender = Join-Path $env:TEMP "omw-drift-render-$(Get-Random)"
try {
  # 自动推断 PLUGIN_SOURCES_DIR（本机 E:\ai-files）
  if (-not $env:OMW_PLUGIN_SOURCES_DIR) {
    if (Test-Path "E:\ai-files") { $env:OMW_PLUGIN_SOURCES_DIR = "E:/ai-files" }
    elseif (Test-Path "$env:USERPROFILE\ai-files") { $env:OMW_PLUGIN_SOURCES_DIR = "$env:USERPROFILE/ai-files" }
  }
  & "$Repo\scripts\template-render.ps1" -OutDir $tmpRender -DefaultsOnly 2>&1 | Out-Null
  $DshHome = "$env:USERPROFILE\.dsh"

  # 脱敏函数（迭代 2 配置层输出 diff 摘要时接入：先 diff 后脱敏，终端 + JSON 报告双路径）
  # 当前配置层只报文件名差异不输出内容，暂不调用。凭据模式继承自 check-private.ps1
  $credPatterns = @('api[_-]?key', 'sk-[a-zA-Z0-9]{20,}', 'password', 'token', 'secret', 'credential', 'auth')

  $mappings = @(
    @("settings.yaml", "$DshHome\settings.yaml"),
    @("profiles\web\package.json", "$DshHome\profiles\web\package.json"),
    @("profiles\web\cordis.patch.yml", "$DshHome\profiles\web\cordis.patch.yml"),
    @("profiles\web\pnpm-workspace.yaml", "$DshHome\profiles\web\pnpm-workspace.yaml"),
    @("profiles\web\cordis.yml", "$DshHome\profiles\web\cordis.yml"),
    @("profiles\web\session-tool-unlock.mjs", "$DshHome\profiles\web\session-tool-unlock.mjs"),
    @("profiles\web\global-skill-tools.mjs", "$DshHome\profiles\web\global-skill-tools.mjs")
  )

  foreach ($m in $mappings) {
    $rendered = Join-Path $tmpRender $m[0]
    $actual = $m[1]
    if (-not (Test-Path $rendered)) { continue }
    if (-not (Test-Path $actual)) {
      # Kernel 0.2.0 (desktop 2.0.16+) migrated the settings document out of
      # ~/.dsh/settings.yaml into the live config layer: profiles/web/cordis.patch.yml
      # under the llm-pi-ai row. A missing old path is therefore not a missing file,
      # it is the completed migration -- PROVIDED the new location carries the
      # settings root. Verify that, then move on silently.
      if ($m[0] -eq "settings.yaml") {
        $migratedTo = Join-Path $DshHome "profiles\web\cordis.patch.yml"
        if ((Test-Path $migratedTo) -and (Select-String -Path $migratedTo -Pattern "^- id: llm-pi-ai" -Quiet)) {
          Write-Host "  settings.yaml: migrated into profiles\web\cordis.patch.yml (kernel 0.2.0 layout) - OK" -ForegroundColor DarkGreen
          $configMatched += "settings.yaml"
          continue
        }
      }
      Write-Host "  $($m[0]): missing (actual)" -ForegroundColor Yellow
      $configDiffers += @{ "file" = $m[0]; "reason" = "actual_missing" }
      continue
    }
    # 运行态豁免：settings.yaml / cordis.yml / cordis.patch.yml 是部署后累积演化的
    # 运行配置（凭据引用、插件插桩、机器特有路径），模板只保证新机骨架，不强制逐行一致。
    $rtKey = "config-runtime:$($m[0])"
    if ($allowlistEntries.ContainsKey($rtKey)) {
      Write-Host "  $($m[0]): runtime-ack (allowlist)" -ForegroundColor DarkGray
      $configMatches += $m[0]
      continue
    }
    $rText = Get-Text $rendered
    $aText = Get-Text $actual
    # package.json 用 JSON 语义对比（忽略键顺序/斜杠转义，聚焦结构漂移：deps 集合 + bundles 数组）
    if ($m[0] -like "profiles\web\package.json") {
      try {
        $rObj = $rText | ConvertFrom-Json
        $aObj = $aText | ConvertFrom-Json
        $rDeps = @{}; foreach ($p in $rObj.dependencies.PSObject.Properties) { $rDeps[$p.Name] = $p.Value -replace '\\\\', '/' -replace '\\', '/' }
        $aDeps = @{}; foreach ($p in $aObj.dependencies.PSObject.Properties) { $aDeps[$p.Name] = $p.Value -replace '\\\\', '/' -replace '\\', '/' }
        $rBundles = @($rObj.dsh.profile.bundles | Sort-Object)
        $aBundles = @($aObj.dsh.profile.bundles | Sort-Object)
        $depsDiff = @()
        foreach ($k in ($rDeps.Keys + $aDeps.Keys | Sort-Object -Unique)) {
          if (-not $rDeps.ContainsKey($k)) { $depsDiff += "dep removed: $k" }
          elseif (-not $aDeps.ContainsKey($k)) { $depsDiff += "dep added: $k" }
          elseif ($rDeps[$k] -ne $aDeps[$k]) { $depsDiff += "dep spec differs: $k" }
        }
        $bundleDiff = @(Compare-Object $rBundles $aBundles | ForEach-Object { "$($_.SideIndicator -replace '=>','added' -replace '<=','removed') $($_.InputObject)" })
        if ($depsDiff.Count -eq 0 -and $bundleDiff.Count -eq 0) {
          Write-Host "  $($m[0]): match (semantic)" -ForegroundColor Green
          $configMatches += $m[0]
        } else {
          # 语义差异逐项 allowlist 豁免（config-semantic:<类型>:<id>）
          $semanticBlocking = @()
          foreach ($d in ($depsDiff + $bundleDiff)) {
            $parts = $d -split " ", 2
            $type = $parts[0]; $id = if ($parts.Count -gt 1) { $parts[1] } else { "" }
            $ackKey = "config-semantic:$d"
            if ($allowlistEntries.ContainsKey($ackKey)) {
              Write-Host "    ACKED (semantic): $d" -ForegroundColor DarkGray
            } else {
              $semanticBlocking += $d
            }
          }
          if ($semanticBlocking.Count -eq 0) {
            Write-Host "  $($m[0]): match (semantic, all ack'ed)" -ForegroundColor Green
            $configMatches += $m[0]
          } else {
            Write-Host "  $($m[0]): DIFFERS (semantic)" -ForegroundColor Yellow
            foreach ($d in $semanticBlocking) { Write-Host "    $d" -ForegroundColor DarkGray }
            $configDiffers += @{ "file" = $m[0]; "reason" = "semantic_differs"; "details" = $semanticBlocking }
          }
        }
        continue
      } catch {
        Write-Host "  $($m[0]): parse error, fallback to text diff" -ForegroundColor DarkGray
      }
    }
    if ($rText -eq $aText) {
      Write-Host "  $($m[0]): match" -ForegroundColor Green
      $configMatches += $m[0]
    } else {
      Write-Host "  $($m[0]): DIFFERS" -ForegroundColor Yellow
      $configDiffers += @{ "file" = $m[0]; "reason" = "content_differs" }
    }
  }
} finally {
  if (Test-Path $tmpRender) { Remove-Item $tmpRender -Recurse -Force -ErrorAction SilentlyContinue }
}

$configStatus = if ($configDiffers.Count -eq 0) { "CLEAN" } else { "HAS_DRIFT" }
$sections["config"] = @{
  "status" = $configStatus
  "differs" = $configDiffers
  "matches" = $configMatches
}

# ── Section 3: Plugin layer ──
Write-Host "[3] Plugins" -ForegroundColor Yellow
$unregistered = @()
$removed = @()
$installTypeDrift = @()

$profilePkg = "$DshHome\profiles\web\package.json"
$sourcesJson = Join-Path $Repo "plugins\SOURCES.json"

if ((Test-Path $profilePkg) -and (Test-Path $sourcesJson)) {
  $pkg = Get-Content $profilePkg -Encoding UTF8 -Raw | ConvertFrom-Json
  $sources = Get-Content $sourcesJson -Encoding UTF8 -Raw | ConvertFrom-Json

  # Build SOURCES lookup: id -> install_type
  $sourceMap = @{}
  foreach ($s in $sources.plugins) { $sourceMap[$s.id] = $s.install_type }

  # Kernel-internal bundles (not in SOURCES)
  $kernelInternal = @{
    "@deepseek-ai/dsh-base" = $true
    "@deepseek-ai/dsh-web-app" = $true
  }

  # Bundles -> SOURCES (skip kernel-internal)
  $bundles = $pkg.dsh.profile.bundles
  foreach ($b in $bundles) {
    if ($kernelInternal.ContainsKey($b)) { continue }
    if (-not $sourceMap.ContainsKey($b)) {
      $key = "unregistered-bundle:$b"
      if ($allowlistEntries.ContainsKey($key)) {
        Write-Host "  ACKED (bundle): $b (allowlist)" -ForegroundColor DarkGray
        continue
      }
      Write-Host "  UNREGISTERED (bundle): $b" -ForegroundColor Yellow
      $unregistered += @{ "id" = $b; "source" = "bundle" }
    } elseif ($sourceMap[$b] -ne "npm") {
      # Basic install_type check (only non-npm packages have meaningful type)
      $spec = $pkg.dependencies.$b
      if (-not $spec) {
        # bundle with no dependency spec: wild/link plugin (e.g. dsh-web-billing via node_modules junction).
        # install_type contract is enforced by Section 4 fingerprints, skip here.
        Write-Host "  (no deps spec, skip type check): $b" -ForegroundColor DarkGray
        continue
      }
      $expectedType = if ($spec -match "^file:vendor-archives") { "vendor-archive" }
        elseif ($spec -match "^file:.*bundles") { "file-dir" }
        elseif ($spec -match "^link:") { "link" }
        elseif ($spec -match "^github:") { "github" }
        elseif ($spec -match "^file:") { "file-dir" }
        elseif ($spec -match "^[0-9^~]") { "npm" }
        else { "npm" }
      if ($expectedType -ne $sourceMap[$b]) {
        Write-Host "  INSTALL_TYPE_DRIFT: $b (expected $expectedType, sources $($sourceMap[$b]))" -ForegroundColor Yellow
        $installTypeDrift += @{ "id" = $b; "expected" = $expectedType; "sources" = $sourceMap[$b] }
      }
    }
  }

  # SOURCES -> bundles (removed from bundles but still in SOURCES)
  foreach ($sId in $sourceMap.Keys) {
    if ($bundles -notcontains $sId) {
      # Check if it's in dependencies (third direction)
      $inDeps = $pkg.dependencies.$sId -ne $null
      if (-not $inDeps) {
        # allowlist-ackable: registered-but-uninstalled is a valid state
        # (e.g. @agentos/dsh-lco after A5 — kept in SOURCES for reinstall)
        $rKey = "removed-source:$sId"
        if ($allowlistEntries.ContainsKey($rKey)) {
          Write-Host "  ACKED (removed): $sId (allowlist)" -ForegroundColor DarkGray
          continue
        }
        # SOURCES may record this entry as deliberately off (user turn-off, a
        # local-preset-plugin that never lives in bundles, an uninstalled plugin).
        # Those are the registered state, not drift — reporting them as "REMOVED"
        # made four intentional entries read as four losses.
        $sAll = Get-Content $sourcesJson -Encoding UTF8 -Raw | ConvertFrom-Json
        $sList = if ($sAll -is [array]) { $sAll } elseif ($sAll.plugins) { $sAll.plugins } else { @() }
        $sEntry = @($sList) | Where-Object { $_.id -eq $sId } | Select-Object -First 1
        $byDesign = $sEntry -and ($sEntry.status -eq "not-mounted" -or $sEntry.removed_from_profile -or $sEntry.removed_reason -or $sEntry.kind -eq "local-preset-plugin")
        if ($byDesign) {
          Write-Host "  NOT MOUNTED (by design): $sId" -ForegroundColor DarkGray
        } else {
          Write-Host "  REMOVED: $sId (in SOURCES, not in bundles or dependencies)" -ForegroundColor Yellow
          $removed += @{ "id" = $sId; "reason" = "not_in_bundles_or_deps" }
        }
      }
    }
  }

  # Dependencies -> SOURCES (third direction, catch unregistered deps)
  foreach ($dep in $pkg.dependencies.PSObject.Properties) {
    if ($kernelInternal.ContainsKey($dep.Name)) { continue }
    if ($bundles -contains $dep.Name) { continue }  # already checked above
    if (-not $sourceMap.ContainsKey($dep.Name)) {
      $key = "unregistered-dependency:$($dep.Name)"
      if ($allowlistEntries.ContainsKey($key)) {
        Write-Host "  ACKED (dependency): $($dep.Name) (allowlist)" -ForegroundColor DarkGray
        continue
      }
      Write-Host "  UNREGISTERED (dependency): $($dep.Name)" -ForegroundColor Yellow
      $unregistered += @{ "id" = $dep.Name; "source" = "dependency" }
    }
  }
}

$pluginsStatus = if ($unregistered.Count -eq 0 -and $removed.Count -eq 0 -and $installTypeDrift.Count -eq 0) { "CLEAN" } else { "HAS_DRIFT" }
$sections["plugins"] = @{
  "status" = $pluginsStatus
  "unregistered" = $unregistered
  "removed" = $removed
  "installTypeDrift" = $installTypeDrift
}

# ── Section 3.5: Junction layer (upgrade wipes junction pattern, 5 incidents) ──
Write-Host "[3.5] Junctions" -ForegroundColor Yellow
$junctionIssues = @()
$junctionOK = @()

$newKernelPath = "C:\Users\Administrator\AppData\Local\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules"
$oldKernelPath = "C:\Program Files\DeepSeek Harness\resources\host\node_modules"

if (Test-Path $profilePkg) {
  $pkg = Get-Content $profilePkg -Encoding UTF8 -Raw | ConvertFrom-Json
  foreach ($dep in $pkg.dependencies.PSObject.Properties) {
    $spec = $dep.Value
    if ($spec -notmatch "^link:") { continue }
    $srcDir = $spec.Substring(5) -replace '\\\\', "\" -replace '\\', "\"
    if (-not (Test-Path $srcDir)) {
      Write-Host "  LINK-SOURCE MISSING: $($dep.Name) -> $srcDir" -ForegroundColor Yellow
      $junctionIssues += @{ "plugin" = $dep.Name; "issue" = "link_source_missing"; "path" = $srcDir }
      continue
    }
    $nmDir = Join-Path $srcDir "node_modules"
    # 断链检测：Test-Path 跟随链接（断链返回 false），先用 dir /AL 看链接条目本身
    $linkEntry = cmd /c dir "/AL" $srcDir 2>$null | Select-String "node_modules" | Select-Object -First 1
    if (-not (Test-Path $nmDir)) {
      if ($linkEntry) {
        Write-Host "  BROKEN: $($dep.Name) junction exists but target missing" -ForegroundColor Red
        $junctionIssues += @{ "plugin" = $dep.Name; "issue" = "broken_junction"; "path" = $srcDir }
      } else {
        Write-Host "  NO node_modules: $($dep.Name) ($srcDir)" -ForegroundColor DarkGray
      }
      continue  # 无 node_modules junction 的 link 插件（自身无宿主依赖）——OK
    }
    $item = Get-Item $nmDir -Force -ErrorAction SilentlyContinue
    $isLink = $item -and ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
    if (-not $isLink) {
      Write-Host "  NOT-LINK (real dir): $($dep.Name)" -ForegroundColor DarkGray
      $junctionOK += @{ "plugin" = $dep.Name; "state" = "real_dir" }
      continue
    }
    $target = $item.Target
    if ($target -eq $null) { $target = (cmd /c dir "$nmDir" 2>$null | Select-String "\\]") -replace ".*\] " -replace "\[.*" }
    # git-bash symlink target read
    $linkTarget = $null
    try { $linkTarget = (Get-Item $nmDir).Target } catch {}
    if (-not $linkTarget) {
      # fallback: cmd dir
      $dirOut = cmd /c dir $nmDir 2>$null
      foreach ($line in $dirOut) { if ($line -match "SYMLINK|JUNCTION|->") { $linkTarget = ($line -split "\[|->")[-1].Trim(); break } }
    }
    if ($linkTarget) {
      $normTarget = $linkTarget -replace '\\', "/"
      if ($normTarget -match "DeepSeek Harness/resources/host/node_modules") {
        Write-Host "  STALE: $($dep.Name) junction -> old shell rc.7" -ForegroundColor Red
        $junctionIssues += @{ "plugin" = $dep.Name; "issue" = "stale_old_shell"; "target" = $linkTarget }
      } elseif ($normTarget -match "\.dsh/runtime/v209-patched-tree/node_modules") {
        Write-Host "  OK: $($dep.Name) -> v209 patched tree" -ForegroundColor Green
        $junctionOK += @{ "plugin" = $dep.Name; "state" = "v209_tree" }
      } elseif ($normTarget -match "DSH Desktop/resources/app.asar.unpacked/node_modules") {
        Write-Host "  OK: $($dep.Name) -> new shell" -ForegroundColor Green
        $junctionOK += @{ "plugin" = $dep.Name; "state" = "new_shell" }
      } else {
        Write-Host "  OTHER-TARGET: $($dep.Name) -> $linkTarget" -ForegroundColor DarkGray
        $junctionOK += @{ "plugin" = $dep.Name; "state" = "other"; "target" = $linkTarget }
      }
    } else {
      Write-Host "  UNKNOWN-TARGET: $($dep.Name) junction target unreadable" -ForegroundColor Yellow
      $junctionIssues += @{ "plugin" = $dep.Name; "issue" = "target_unreadable" }
    }
  }
}

$junctionStatus = if ($junctionIssues.Count -eq 0) { "CLEAN" } else { "HAS_DRIFT" }
$sections["junctions"] = @{
  "status" = $junctionStatus
  "issues" = $junctionIssues
  "ok" = $junctionOK
}

# ── Section 4: Plugin source fingerprints (capture-sources vs repo FINGERPRINTS.json) ──
Write-Host "[4] Plugin sources" -ForegroundColor Yellow
$fpDrift = @()
$fpOK = @()
$FpRepo = Join-Path $Repo "plugins\FINGERPRINTS.json"
if (Test-Path $FpRepo) {
  $tmpFp = Join-Path $env:TEMP "omw-fp-$(Get-Random).json"
  try {
    & "$Repo\scripts\capture-sources.ps1" -Quiet -OutPath $tmpFp 2>&1 | Out-Null
    if (Test-Path $tmpFp) {
      $live = [System.IO.File]::ReadAllText($tmpFp) | ConvertFrom-Json
      $repo = [System.IO.File]::ReadAllText($FpRepo) | ConvertFrom-Json
      $liveMap = @{}; foreach ($e in $live.entries) { $liveMap[$e.id] = $e }
      $repoMap = @{}; foreach ($e in $repo.entries) { $repoMap[$e.id] = $e }
      foreach ($e in $repo.entries) {
        if (-not $liveMap.ContainsKey($e.id)) {
          Write-Host "  REMOVED-FROM-LIVE: $($e.id)" -ForegroundColor Yellow
          $fpDrift += @{ "id" = $e.id; "reason" = "removed_from_live" }
          continue
        }
        $l = $liveMap[$e.id]
        $diffs = @()
        if ($l.gitHead -and $e.gitHead -and $l.gitHead -ne $e.gitHead) { $diffs += "HEAD $($e.gitHead.Substring(0,8)) -> $($l.gitHead.Substring(0,8))" }
        if ($l.sha256 -and $e.sha256 -and $l.sha256 -ne $e.sha256) { $diffs += "sha256 changed" }
        if ($l.version -and $e.version -and $l.version -ne $e.version) { $diffs += "v$($e.version) -> v$($l.version)" }
        if ($l.dirty -ge 0 -and $e.dirty -ge 0 -and $l.dirty -ne $e.dirty) { $diffs += "dirty $($e.dirty) -> $($l.dirty)" }
        if ($diffs.Count -eq 0) {
          Write-Host "  OK: $($e.id)" -ForegroundColor Green
          $fpOK += $e.id
        } else {
          Write-Host "  CHANGED: $($e.id) ($($diffs -join '; '))" -ForegroundColor Yellow
          $fpDrift += @{ "id" = $e.id; "reason" = "fingerprint_changed"; "diffs" = $diffs }
        }
      }
      foreach ($e in $live.entries) {
        if (-not $repoMap.ContainsKey($e.id)) {
          Write-Host "  NEW-UNREGISTERED: $($e.id) (run capture-sources.ps1 to add)" -ForegroundColor Yellow
          $fpDrift += @{ "id" = $e.id; "reason" = "new_unregistered"; "source" = $e.source }
        }
      }
    } else {
      Write-Host "  capture-sources.ps1 produced no output (check profile)" -ForegroundColor Yellow
      $fpDrift += @{ "id" = "capture"; "reason" = "capture_failed" }
    }
  } finally {
    if (Test-Path $tmpFp) { Remove-Item $tmpFp -Force -ErrorAction SilentlyContinue }
  }
} else {
  Write-Host "  no FINGERPRINTS.json in repo (run capture-sources.ps1 first)" -ForegroundColor Yellow
  $fpDrift += @{ "id" = "repo"; "reason" = "fingerprints_missing" }
}

$fpStatus = if ($fpDrift.Count -eq 0) { "CLEAN" } else { "HAS_DRIFT" }
$sections["pluginSources"] = @{
  "status" = $fpStatus
  "drift" = $fpDrift
  "ok" = $fpOK
}

# ── Build report ──
$report = @{
  "generatedAt" = (Get-Date -Format "o")
  "kernel" = @{
    "dir" = $KernelDir
    "version" = $KernelVersion
  }
  "sections" = $sections
}
$report["verdict"] = if ($patchesStatus -eq "CLEAN" -and $configStatus -eq "CLEAN" -and $pluginsStatus -eq "CLEAN" -and $junctionStatus -eq "CLEAN" -and $fpStatus -eq "CLEAN") { "CLEAN" } else { "HAS_DRIFT" }

Write-Host ""
Write-JsonReport $ReportPath $report
# The report is written BEFORE the verdict is acted on. An `exit` placed above this line
# short-circuits the script, so the file on disk stays whatever the previous run left
# behind (it is gitignored) — which is how a run that reported HAS_DRIFT still left a
# report claiming CLEAN.
if ($report.verdict -eq "CLEAN") {
  Write-Host "VERDICT: CLEAN" -ForegroundColor Green
  exit 0
} else {
  Write-Host "VERDICT: HAS_DRIFT" -ForegroundColor Yellow
  # A gate that prints HAS_DRIFT and exits 0 cannot fail anything. The independent review
  # removed a package from dsh.profile.bundles, watched drift-scan detect it, and then
  # watched the script still return success to the shell.
  exit 1
}

# ── Write report ──
Write-JsonReport $ReportPath $report

# ── Compare mode (delta matrix) ──
if ($Compare) {
  if (-not (Test-Path $Compare)) { Write-Host "ERROR: baseline report not found: $Compare" -ForegroundColor Red; exit 1 }
  try {
    $baselineJson = [System.IO.File]::ReadAllText($Compare)
    $baseline = $baselineJson | ConvertFrom-Json
  } catch {
    Write-Host "ERROR: baseline report parse failed: $Compare" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)"
    exit 1
  }
  if ($null -eq $baseline -or $null -eq $baseline.sections) {
    Write-Host "ERROR: baseline report has no sections (wrong format?): $Compare" -ForegroundColor Red
    exit 1
  }
  Write-Host ""
  Write-Host "=== Delta matrix (current vs baseline) ===" -ForegroundColor Cyan

  $blocking = @()
  $allowlistEntries = @{}
  if (Test-Path $AllowlistPath) {
    $alJson = [System.IO.File]::ReadAllText($AllowlistPath)
    $al = $alJson | ConvertFrom-Json
    foreach ($e in $al.entries) { $allowlistEntries["$($e.type):$($e.path)"] = $true }
  }

  # 1. new-lost: manifest patches that were APPLIED/MARKER-PRESENT in baseline, now LOST
  $baselineApplied = @{}
  foreach ($id in $baseline.sections.patches.knownApplied) { $baselineApplied[$id] = "applied" }
  foreach ($id in $baseline.sections.patches.markerPresent) { $baselineApplied[$id] = "marker" }
  $currentLost = @{}
  foreach ($l in $report.sections.patches.lost) { $currentLost[$l.id] = $l.reason }

  foreach ($bId in $baselineApplied.Keys) {
    if ($currentLost.ContainsKey($bId)) {
      Write-Host "  new-lost: $bId (was $($baselineApplied[$bId]), now $($currentLost[$bId]))" -ForegroundColor Red
      $blocking += @{ "type" = "new-lost"; "id" = $bId; "was" = $baselineApplied[$bId]; "now" = $currentLost[$bId] }
    }
  }

  # 2. gone-from-baseline: baseline UNKNOWN-MODIFIED that are absent in current report
  $baselineUnknown = @{}
  foreach ($u in $baseline.sections.patches.unknownModified) {
    $baselineUnknown[($u.bakFile -replace '\\', "/")] = $true
  }
  $currentUnknown = @{}
  foreach ($u in $report.sections.patches.unknownModified) {
    $currentUnknown[($u.bakFile -replace '\\', "/")] = $true
  }
  foreach ($bFile in $baselineUnknown.Keys) {
    if (-not $currentUnknown.ContainsKey($bFile)) {
      $key = "unknownModified:$bFile"
      if ($allowlistEntries.ContainsKey($key)) {
        Write-Host "  gone-from-baseline: $bFile (ACKed in allowlist)" -ForegroundColor DarkGray
      } else {
        Write-Host "  gone-from-baseline: $bFile (baseline UNKNOWN, now absent — may be P6-class loss!)" -ForegroundColor Red
        $blocking += @{ "type" = "gone-from-baseline"; "bakFile" = $bFile; "reason" = "absent_from_current" }
      }
    }
  }

  # 3. new-unknown: new .bak files that appeared
  foreach ($u in $report.sections.patches.unknownModified) {
    if (-not $baselineUnknown.ContainsKey($u.bakFile)) {
      Write-Host "  new-unknown: $($u.bakFile)" -ForegroundColor Yellow
      $blocking += @{ "type" = "new-unknown"; "bakFile" = $u.bakFile }
    }
  }

  # 4. new-removed-baseline: baseline LOST that are gone now (handled or silently drifted)
  #    EXCLUDE recovered: baseline LOST now in knownApplied/markerPresent = 修复成功，不阻断
  $baselineLost = @{}
  foreach ($l in $baseline.sections.patches.lost) { $baselineLost[$l.id] = $true }
  $currentLostIds = @{}
  foreach ($l in $report.sections.patches.lost) { $currentLostIds[$l.id] = $true }
  $currentAppliedIds = @{}
  foreach ($id in $report.sections.patches.knownApplied) { $currentAppliedIds[$id] = $true }
  foreach ($id in $report.sections.patches.markerPresent) { $currentAppliedIds[$id] = $true }
  foreach ($bId in $baselineLost.Keys) {
    if ($currentAppliedIds.ContainsKey($bId)) { continue }  # recovered — 不阻断
    if (-not $currentLostIds.ContainsKey($bId)) {
      Write-Host "  new-removed-baseline: $bId (was LOST, now absent)" -ForegroundColor Yellow
      $blocking += @{ "type" = "new-removed-baseline"; "id" = $bId }
    }
  }

  # 5. recovered: baseline LOST now APPLIED
  foreach ($bId in $baselineLost.Keys) {
    if ($baselineApplied.ContainsKey($bId) -or $report.sections.patches.knownApplied -contains $bId -or $report.sections.patches.markerPresent -contains $bId) {
      Write-Host "  recovered: $bId" -ForegroundColor Green
    }
  }

  # Build delta report
  $delta = @{
    "generatedAt" = $report.generatedAt
    "baselineAt" = $baseline.generatedAt
    "blocking" = $blocking
    "allowlist" = $AllowlistPath
  }
  $deltaPath = ($ReportPath -replace "\.json$", "") + "-delta.json"
  Write-JsonReport $deltaPath $delta

  Write-Host ""
  if ($blocking.Count -eq 0) {
    Write-Host "DELTA: CLEAN (no blocking items)" -ForegroundColor Green
  } else {
    Write-Host "DELTA: $($blocking.Count) blocking item(s) — resolve or add to drift-allowlist.json" -ForegroundColor Red
    Write-Host "  To acknowledge: add entries to $AllowlistPath and re-run --compare" -ForegroundColor Yellow
  }
}