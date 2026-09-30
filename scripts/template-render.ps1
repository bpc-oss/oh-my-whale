# template-render.ps1 - render oh-my-whale templates with machine-specific values
# Usage: .\scripts\template-render.ps1 [-OutDir <dir>] [-DefaultsOnly]
# Replaces {{VAR}} placeholders, normalizes file:// URLs to forward slashes.
param(
  [string]$OutDir = "",
  [switch]$DefaultsOnly
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$User = $env:USERNAME
$UserHome = $env:USERPROFILE
$DshHome = "$UserHome\.dsh"

# Plugin sources root. Probed in the same order drift-scan used; hard-fails when nothing
# matches, because the alternative is a manifest full of link:/ with no target.
$PluginSources = $env:OMW_PLUGIN_SOURCES_DIR
if (-not $PluginSources) {
  if (Test-Path "E:\ai-files") { $PluginSources = "E:/ai-files" }
  elseif (Test-Path "$UserHome\ai-files") { $PluginSources = "$UserHome/ai-files" }
}
if (-not $PluginSources) {
  Write-Host "FATAL: cannot resolve PLUGIN_SOURCES_DIR." -ForegroundColor Red
  Write-Host "  Set OMW_PLUGIN_SOURCES_DIR to the directory holding the plugin repos" -ForegroundColor Red
  Write-Host "  (probed: E:\ai-files, $UserHome\ai-files)" -ForegroundColor Red
  exit 1
}
Write-Host "PLUGIN_SOURCES_DIR: $PluginSources"

# Collect variable values
$Vars = @{
  "{{DSH_USER_HOME}}"       = $DshHome
  "{{USER_HOME}}"           = $UserHome
  "{{LOCAL_APP_DATA}}"      = "$UserHome\AppData\Local"
  "{{USER_NAME}}"           = $User
    # Resolved here, not by the caller. The four link:/… plugin specs render to a bare
    # "link:/" when this is empty, which installs nothing and still reports success.
    # drift-scan had its own copy of this detect and set the variable before shelling out,
    # so it passed while bootstrap — the real deploy path — produced a broken manifest.
    # One definition, in the one place that does the substitution.
    "{{PLUGIN_SOURCES_DIR}}"  = $PluginSources
  "{{TAILSCALE_HOST}}"      = ""
  "{{UV_PYTHON_PATH}}"      = ""
  "{{AGENT_OS_DIR}}"        = "$UserHome\AppData\Local\AgentOS"
  "{{AGENT_OS_BRIDGE}}"     = "C:\ProgramData\AgentOS\LCO-Client\agentos-lco-dsh-bridge.exe"
  "{{CHROME_FAITHFUL_DIR}}" = "$UserHome\chrome-faithful"
  "{{VOICE_MODEL_DIR}}"     = "$UserHome/dsh-voice-input/dsh-voice-models"
  # 2026-09-30: the bounty-pipeline preset text was captured into the registry with its
  # real mailbox and password replaced by placeholders. They cannot be guessed, so they
  # come from the environment when set; when unset the placeholder SURVIVES into the
  # deployed preset, which the post-render check reports. Silently shipping a literal
  # "{{BOUNTY_MASTER_PASSWORD}}" into a live preset is how a credential ends up pasted
  # by hand later.
  "{{BOUNTY_MASTER_EMAIL}}"    = $(if ($env:BOUNTY_MASTER_EMAIL) { $env:BOUNTY_MASTER_EMAIL } else { "{{BOUNTY_MASTER_EMAIL}}" })
  "{{AGENTMAIL_INBOX}}"        = $(if ($env:AGENTMAIL_INBOX) { $env:AGENTMAIL_INBOX } else { "{{AGENTMAIL_INBOX}}" })
  "{{BOUNTY_MASTER_PASSWORD}}" = $(if ($env:BOUNTY_MASTER_PASSWORD) { $env:BOUNTY_MASTER_PASSWORD } else { "{{BOUNTY_MASTER_PASSWORD}}" })
}

# Auto-detect uv python if present (plan: UV_PYTHON_PATH 自动探测)
$uvPython = Get-ChildItem "$UserHome\AppData\Roaming\uv\python" -Filter "python.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($uvPython) { $Vars["{{UV_PYTHON_PATH}}"] = $uvPython.FullName }

# Interactive prompts for values that differ per machine (skip with -DefaultsOnly)
if (-not $DefaultsOnly) {
  $prompts = @(
    @("{{PLUGIN_SOURCES_DIR}}", "Plugin sources dir (set OMW_PLUGIN_SOURCES_DIR, e.g. D:\ai-files)"),
    @("{{TAILSCALE_HOST}}", "Tailscale hostname (optional, e.g. host.tailXXXX.ts.net)"),
    @("{{UV_PYTHON_PATH}}", "uv python executable path (optional)"),
    @("{{CHROME_FAITHFUL_DIR}}", "chrome-faithful source dir"),
    @("{{VOICE_MODEL_DIR}}", "voice model dir (optional)")
  )
  foreach ($p in $prompts) {
    $key = $p[0]; $label = $p[1]
    $default = $Vars[$key]
    $input = Read-Host "$label [$default]"
    if ($input) { $Vars[$key] = $input }
  }
}

if (-not $OutDir) { $OutDir = $DshHome }
Write-Host "Rendering to: $OutDir"

# file:// URL normalization + file:/link: spec backslash->forward slash
function Normalize-FileUrls([string]$text) {
  # file:/// URLs (cordis.patch.yml style)
  $text = [regex]::Replace($text, '(file:///)([^\s''"]+)', {
    param($m)
    $url = $m.Groups[2].Value -replace '\\', '/'
    return $m.Groups[1].Value + $url
  })
  # file:/link: specs (package.json style) — normalize backslashes to forward slashes
  # but preserve {{VAR}} placeholders if any remain (they contain no backslashes anyway)
  $text = [regex]::Replace($text, '("(?:file|link):)([^"\\]*(?:\\[^"\\]*)*)(")', {
    param($m)
    $prefix = $m.Groups[1].Value
    $path = $m.Groups[2].Value -replace '\\', '/'
    return $prefix + $path + $m.Groups[3].Value
  })
  return $text
}

# Render a template file
function Render-Template([string]$templatePath, [string]$outPath, [hashtable]$vars) {
  $text = [System.IO.File]::ReadAllText($templatePath)
  foreach ($key in $vars.Keys) {
    $text = $text.Replace($key, $vars[$key])
  }
  $text = Normalize-FileUrls $text
  $dir = Split-Path $outPath -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($outPath, $text, [System.Text.UTF8Encoding]::new($false))
  Write-Host "  $outPath"
}

# Map template files to output locations
$mappings = @(
  @("$Repo\config\settings.yaml.template",         "$OutDir\settings.yaml"),
  @("$Repo\profile\package.json.template",          "$OutDir\profiles\web\package.json"),
  @("$Repo\profile\cordis.patch.yml.template",      "$OutDir\profiles\web\cordis.patch.yml"),
  @("$Repo\profile\pnpm-workspace.yaml.template",   "$OutDir\profiles\web\pnpm-workspace.yaml"),
  @("$Repo\profile\cordis.yml",                     "$OutDir\profiles\web\cordis.yml"),
  @("$Repo\profile\session-tool-unlock.mjs",        "$OutDir\profiles\web\session-tool-unlock.mjs"),
  @("$Repo\profile\global-skill-tools.mjs",         "$OutDir\profiles\web\global-skill-tools.mjs"),
  # 2026-09-30: the local-presets layer (15 files) holds every preset mount, and the
  # profile points at it with "file:./local-presets". It was in the registry but in no
  # mapping, so a replay produced a profile whose bundle had no payload at all.
  @("$Repo\profile\local-presets",                 "$OutDir\profiles\web\local-presets")
)

# Render a whole directory tree through the same substitution. local-presets holds 15
# yaml files that carry {{DSH_USER_HOME}} and {{USER_HOME}}; the single-file renderer
# above cannot reach them, which is how 86 literal placeholders ended up in the deploy
# path. Binary and non-template files are copied verbatim.
function Render-TemplateTree([string]$srcDir, [string]$outDir, [hashtable]$vars) {
  if (-not (Test-Path $srcDir)) { return }
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
  Get-ChildItem $srcDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($srcDir.Length).TrimStart("\", "/")
    $dst = Join-Path $outDir $rel
    if ($_.Extension -match "^.(yml|yaml|json|mjs|js|cjs|ts|md|txt|template)$") {
      Render-Template $_.FullName $dst $vars
    } else {
      $d = Split-Path $dst -Parent
      if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
      Copy-Item $_.FullName $dst -Force
    }
  }
}

foreach ($m in $mappings) {

  if (-not (Test-Path $m[0])) { continue }
  if ((Get-Item $m[0]).PSIsContainer) { Render-TemplateTree $m[0] $m[1] $Vars }
  else { Render-Template $m[0] $m[1] $Vars }
}

# Post-render check: a machine path that survived as literal {{...}} text is the exact
# failure this file exists to prevent (bootstrap copied presets raw, so 83 placeholders
# shipped verbatim). Report them instead of letting them reach a live preset. Agent-runtime
# vars such as {{model}} and {{cwd}} are legitimately literal, so only path-shaped names
# and the credential placeholders are reported.
$leftovers = @(Get-ChildItem $OutDir -Recurse -File -ErrorAction SilentlyContinue |
  Select-String -Pattern "{{[A-Z_]*(HOME|DIR|PATH|CREDENTIAL|EMAIL|INBOX|PASSWORD|KEY)[A-Z_]*}}" -AllMatches |
  ForEach-Object { $_.Matches.Value } | Sort-Object -Unique)
if ($leftovers.Count -gt 0) {
  Write-Host ("WARNING: {0} unresolved placeholder(s) in the rendered output:" -f $leftovers.Count) -ForegroundColor Yellow
  $leftovers | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  Write-Host "  Set the matching environment variable, or fill them in by hand after deploy." -ForegroundColor Yellow
}

Write-Host "Done."
