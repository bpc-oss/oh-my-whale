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
# omw: resolve the plugin sources root. One definition, used by the profile templates AND
# the preset deploy — if the two disagree, a preset and the profile point at different
# trees, which is exactly the kind of silent divergence the registry is meant to prevent.
function Get-OmwPluginSources {
  $env_ = $env:OMW_PLUGIN_SOURCES_DIR
  if ($env_) { return $env_ }
  $envFile = Join-Path $PSScriptRoot ".env"
  if (-not (Test-Path $envFile)) { $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) ".env" }
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile -Encoding UTF8) {
      if ($line -match "^\s*(OMW_PLUGIN_SOURCES_DIR|PLUGIN_SOURCES_DIR)\s*=\s*(.+?)\s*$") {
        $v = $Matches[2].Trim().Trim('"').Trim("'")
          $v = $v.Replace('%USERPROFILE%', $env:USERPROFILE)
        if ($v) { return ($v -replace "\\", "/") }
      }
    }
  }
  # Fresh-machine fallback: bootstrap creates this directory and copies every
  # plugins/standalone/<dir> snapshot into it before pnpm install. It is deliberately
  # NOT a fatal error when the directory does not exist yet; requiring the user to
  # pre-create a path was the old behaviour and made the first replay stop at render.
  $conventional = Join-Path $env:USERPROFILE "ai-files"
  return ($conventional -replace "\\", "/")
}
$PluginSources = Get-OmwPluginSources
if (-not $PluginSources) {
  Write-Host "FATAL: cannot resolve PLUGIN_SOURCES_DIR." -ForegroundColor Red
  Write-Host "  Set OMW_PLUGIN_SOURCES_DIR, or put PLUGIN_SOURCES_DIR=<path> in the repo .env (gitignored)" -ForegroundColor Red
  exit 1
}
Write-Host "PLUGIN_SOURCES_DIR: $PluginSources"

$ListenHost = $env:DSH_LISTEN_HOST
if (-not $ListenHost) {
  $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile -Encoding UTF8) {
      if ($line -match "^\s*DSH_LISTEN_HOST\s*=\s*(.+?)\s*$") { $ListenHost = $Matches[1].Trim().Trim('"') }
    }
  }
}
if (-not $ListenHost) {
  # This host has five IPv4 interfaces, and picking the wrong one is silently broken: the
  # first draft of this probe returned the WireGuard address (10.66.66.2) while the phone
  # reaches the box on Ethernet (192.168.x). A proxy bound to a tunnel address binds,
  # reports success, and nothing can connect.
  # So: virtual/tunnel adapters are excluded by name AND by range, and 192.168/16 wins —
  # that is the range a LAN client can actually reach.
  $VirtualIf = "vEthernet|Mihomo|Loopback|Hyper-V|WSL|WireGuard|Wintun|Tailscale|VPN|Docker|VirtualBox"
  $addrs = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.|198\.18\.)" -and $_.InterfaceAlias -notmatch $VirtualIf })
  if ($addrs.Count -eq 0) {
    # Nothing matched the strict filter: fall back to any non-loopback address, still skipping tunnels.
    $addrs = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" -and $_.InterfaceAlias -notmatch $VirtualIf })
  }
  $ListenHost = ($addrs |
    Sort-Object @{ Expression = { if ($_.IPAddress -like "192.168.*") { 0 } elseif ($_.IPAddress -like "10.*") { 2 } else { 1 } } }, IPAddress |
    Select-Object -First 1 -ExpandProperty IPAddress)
}
if ($ListenHost) { Write-Host "DSH_LISTEN_HOST: $ListenHost" } else { Write-Host "DSH_LISTEN_HOST: (none found - set it in .env)" -ForegroundColor Yellow }

# Local OpenAI-compatible endpoints. The author machine used two DGX Spark ports
# (:8888 for GLM-5.3 / main, :8899 for DeepSeek-V4.1). Another machine will almost
# certainly differ, so neither is allowed to stay a hard-coded address. Override with
# DSH_LOCAL_VLLM_BASE_URL / DSH_LOCAL_VLLM_DEEPSEEK_BASE_URL in the environment or
# .env. Loopback defaults keep a fresh replay functional and off the public internet.
function Get-EnvOrDotEnv([string]$name,[string]$fallback) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if (-not $v) {
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
    if (Test-Path $envFile) {
      foreach ($line in Get-Content $envFile -Encoding UTF8) {
        if ($line -match "^\s*$([regex]::Escape($name))\s*=\s*(.+?)\s*$") { $v = $Matches[1].Trim().Trim('"').Trim("'") }
      }
    }
  }
  if (-not $v) { $v = $fallback }
  return $v
}
$LocalVllmBaseUrl = Get-EnvOrDotEnv "DSH_LOCAL_VLLM_BASE_URL" "http://127.0.0.1:8888/v1"
$LocalVllmDeepSeekBaseUrl = Get-EnvOrDotEnv "DSH_LOCAL_VLLM_DEEPSEEK_BASE_URL" "http://127.0.0.1:8899/v1"
Write-Host "DSH_LOCAL_VLLM_BASE_URL: $LocalVllmBaseUrl"
Write-Host "DSH_LOCAL_VLLM_DEEPSEEK_BASE_URL: $LocalVllmDeepSeekBaseUrl"
$TailscaleHost = Get-EnvOrDotEnv "TAILSCALE_HOST" ""

# Collect variable values. Path values are emitted with forward slashes so templates
# that embed them in quoted YAML or file:// URLs stay consistent on Windows.
$Vars = @{
  "{{DSH_USER_HOME}}"       = ($DshHome -replace '\\', '/')
  "{{USER_HOME}}"           = ($UserHome -replace '\\', '/')
  "{{LOCAL_APP_DATA}}"      = ("$UserHome\AppData\Local" -replace '\\', '/')
  "{{USER_NAME}}"           = $User
    # Resolved here, not by the caller. The four link:/… plugin specs render to a bare
    # "link:/" when this is empty, which installs nothing and still reports success.
    # drift-scan had its own copy of this detect and set the variable before shelling out,
    # so it passed while bootstrap — the real deploy path — produced a broken manifest.
    # One definition, in the one place that does the substitution.
    "{{PLUGIN_SOURCES_DIR}}"  = ($PluginSources -replace '\\', '/')
  "{{TAILSCALE_HOST}}"      = $TailscaleHost
  "{{UV_PYTHON_PATH}}"      = ""
  "{{AGENT_OS_DIR}}"        = ("$UserHome\AppData\Local\AgentOS" -replace '\\', '/')
  "{{AGENT_OS_BRIDGE}}"     = "C:/ProgramData/AgentOS/LCO-Client/agentos-lco-dsh-bridge.exe"
  "{{CHROME_FAITHFUL_DIR}}" = ("$UserHome\chrome-faithful" -replace '\\', '/')
  "{{VOICE_MODEL_DIR}}"     = "$UserHome/dsh-voice-input/dsh-voice-models"
  # Inbound reverse-proxy bind address. Machine-specific and NOT reliably guessable:
  # this host alone has five IPv4 interfaces (vEthernet, WireGuard, Tailscale, Ethernet,
  # Mihomo) and binding the wrong one produces a proxy nothing can reach. Resolution order:
  #   1. DSH_LISTEN_HOST in the environment, or DSH_LISTEN_HOST= in the repo .env
  #   2. the first private-range IPv4 that is not loopback / link-local / virtual
  # The probe prints what it picked — a wrong guess must be visible, not silent.
  "{{DSH_LISTEN_HOST}}"     = $ListenHost
  "{{LOCAL_VLLM_BASE_URL}}" = $LocalVllmBaseUrl
  "{{LOCAL_VLLM_DEEPSEEK_BASE_URL}}" = $LocalVllmDeepSeekBaseUrl
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
    @("{{LOCAL_VLLM_BASE_URL}}", "Local OpenAI-compatible vLLM base URL"),
    @("{{LOCAL_VLLM_DEEPSEEK_BASE_URL}}", "Second local vLLM base URL (dgx-spark-deepseek-v41)"),
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
  # Optional list members: an empty TAILSCALE_HOST must remove the whole YAML list
  # item. Leaving "- " behind makes trustedHosts contain null, and the schema is
  # z.array(String), so the whole client-connection plugin fails to load.
  if ([string]::IsNullOrWhiteSpace([string]$vars["{{TAILSCALE_HOST}}"]) -and $text.Contains('{{TAILSCALE_HOST}}')) {
    $text = [regex]::Replace($text, '(?m)^[ \t]*-[ \t]*\{\{TAILSCALE_HOST\}\}[ \t]*\r?\n', '')
  }
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
# 2026-10-20: config/settings.yaml.template is legacy (0.1.x-era provider catalog).
# On 0.2.1 the live profile has NO ~/.dsh/settings.yaml; all model/provider/permission
# settings are carried by profile/cordis.patch.yml. Rendering the old file on a fresh
# machine would reintroduce a second, conflicting source of truth, so it is not mapped.
$mappings = @(
  @("$Repo\profile\package.json.template",          "$OutDir\profiles\web\package.json"),
  @("$Repo\profile\cordis.patch.yml.template",      "$OutDir\profiles\web\cordis.patch.yml"),
  @("$Repo\profile\pnpm-workspace.yaml.template",   "$OutDir\profiles\web\pnpm-workspace.yaml"),
  @("$Repo\profile\cordis.yml",                     "$OutDir\profiles\web\cordis.yml"),
  @("$Repo\profile\session-tool-unlock.mjs",        "$OutDir\profiles\web\session-tool-unlock.mjs"),
  @("$Repo\profile\global-skill-tools.mjs",         "$OutDir\profiles\web\global-skill-tools.mjs"),
  # 2026-09-30: the local-presets layer (15 files) holds every preset mount, and the
  # profile points at it with "file:./local-presets". It was in the registry but in no
  # mapping, so a replay produced a profile whose bundle had no payload at all.
  @("$Repo\profile\local-presets",                 "$OutDir\profiles\web\local-presets"),
  # 2026-09-30: super-injector/ was an empty, UNTRACKED directory, so the registry template
  # never existed and dsh-super-injector (which defaults registryFile to
  # ~/.dsh/super-injector/registry.json and auto-restores its entries on restart) had nothing
  # to read: a fresh machine lost its only entry, m2-demo-plugin, with no way back. Rendered
  # here rather than copied raw by bootstrap, because the entry carries a machine path.
  @("$Repo\super-injector\registry.json.template",  "$OutDir\super-injector\registry.json")
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
