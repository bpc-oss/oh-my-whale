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

# Collect variable values
$Vars = @{
  "{{DSH_USER_HOME}}"       = $DshHome
  "{{USER_HOME}}"           = $UserHome
  "{{LOCAL_APP_DATA}}"      = "$UserHome\AppData\Local"
  "{{USER_NAME}}"           = $User
    "{{PLUGIN_SOURCES_DIR}}"  = $env:OMW_PLUGIN_SOURCES_DIR
  "{{TAILSCALE_HOST}}"      = ""
  "{{UV_PYTHON_PATH}}"      = ""
  "{{AGENT_OS_DIR}}"        = "$UserHome\AppData\Local\AgentOS"
  "{{AGENT_OS_BRIDGE}}"     = "C:\ProgramData\AgentOS\LCO-Client\agentos-lco-dsh-bridge.exe"
  "{{CHROME_FAITHFUL_DIR}}" = "$UserHome\chrome-faithful"
  "{{VOICE_MODEL_DIR}}"     = "$UserHome/dsh-voice-input/dsh-voice-models"
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
  @("$Repo\profile\global-skill-tools.mjs",         "$OutDir\profiles\web\global-skill-tools.mjs")
)

foreach ($m in $mappings) {
  if (Test-Path $m[0]) { Render-Template $m[0] $m[1] $Vars }
}

Write-Host "Done."
