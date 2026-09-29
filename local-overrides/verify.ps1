# read-only drift check for the registered local overrides (20260929)
# Exits 0 when every registered override is still present in the live install, 1 on drift.
$ErrorActionPreference = 'Stop'
$dsh = Join-Path $HOME '.dsh'
$whale = Split-Path -Parent $PSScriptRoot
$fail = 0
function Check([string]$name, [bool]$ok, [string]$detail) {
  $tag = if ($ok) { 'PASS' } else { 'DRIFT' }
  if (-not $ok) { $script:fail++ }
  "{0,-5} {1} :: {2}" -f $tag, $name, $detail
}

# 1. preset tool-bootstrap copies
foreach ($p in @('ai-tube-daily','anchored-standard','enforce-rsi-standard','enforce-standard','j-space-standard','verifier-standard')) {
  $live = Join-Path $dsh ".agent-presets\$p\tool-bootstrap.mjs"
  $src = Join-Path $whale "config\.agent-presets\$p\tool-bootstrap.mjs"
  $ok = (Test-Path $live) -and (Test-Path $src) -and
        ((Get-FileHash $live).Hash -eq (Get-FileHash $src).Hash)
  Check "preset/$p/tool-bootstrap.mjs" $ok "live vs config/.agent-presets source"
}

# 2. autoprompt residentTools
$ap = Join-Path $dsh '.agent-presets\autoprompt\agent.cordis.yml'
$ok = (Test-Path $ap) -and ((Select-String -Path $ap -Pattern '^\s*- read_image\s*$' -Quiet)) -and
      -not (Select-String -Path $ap -Pattern '^\s*- vision_' -Quiet)
Check 'preset/autoprompt/residentTools' $ok 'read_image resident, no vision_* entries'

# 2b. cordis rows: promise-guard mount + compaction cap
$guardMissing = @(); $capLow = @()
Get-ChildItem (Join-Path $dsh '.agent-presets') -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $yml = Join-Path $_.FullName 'agent.cordis.yml'
  if (-not (Test-Path $yml)) { return }
  $s = Get-Content $yml -Raw
  if ($s -match '- id: promise-guard' -and (Test-Path (Join-Path $_.FullName 'promise-guard.mjs'))) { }
  elseif (Test-Path (Join-Path $_.FullName 'promise-guard.mjs')) { $guardMissing += $_.Name }
  $m = [regex]::Match($s, "dsh-compaction-basic[\s\S]{0,200}?maxTokens:\s*(\d+)")
  if ($m.Success -and [int]$m.Groups[1].Value -lt 32768) { $capLow += ($_.Name + '=' + $m.Groups[1].Value) }
}
Check 'preset cordis: promise-guard mount' ($guardMissing.Count -eq 0) ("plugin file without mount row: " + ($guardMissing -join ', '))
Check 'preset cordis: compaction maxTokens >= 32768' ($capLow.Count -eq 0) ("below cap: " + ($capLow -join ', '))
# 3. promise-guard installed and mounted
$installed = (Get-ChildItem (Join-Path $dsh '.agent-presets') -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName 'promise-guard.mjs') }).Count
$mounted = (Get-ChildItem (Join-Path $dsh '.agent-presets') -Directory -ErrorAction SilentlyContinue |
  Where-Object { $f = Join-Path $_.FullName 'agent.cordis.yml'; (Test-Path $f) -and (Select-String -Path $f -Pattern '- id: promise-guard' -Quiet) }).Count
Check 'plugin/promise-guard' ($installed -ge 7 -and $mounted -ge 7) "installed=$installed mounted=$mounted (expect >=7/7)"
$live = Join-Path $dsh '.agent-presets\enforce-rsi-standard\promise-guard.mjs'
$src = Join-Path $whale 'plugins\standalone\dsh-promise-guard\promise-guard.mjs'
Check 'plugin/promise-guard source' ((Test-Path $live) -and (Test-Path $src) -and ((Get-FileHash $live).Hash -eq (Get-FileHash $src).Hash)) 'live == plugins/standalone copy'

# 4. legacy toolkit stays uninstalled
$pkg = Join-Path $dsh 'profiles\web\package.json'
$listed = (Test-Path $pkg) -and ((Get-Content $pkg -Raw) -match 'dsh-vision-toolkit')
Check 'web profile bundle removed' (-not $listed) 'no dsh-vision-toolkit in profiles/web/package.json'
$patch = Join-Path $dsh 'profiles\web\cordis.patch.yml'
$disabled = (Test-Path $patch) -and (Select-String -Path $patch -Pattern '^- id: vision-toolkit' -Context 0,1 |
  Where-Object { $_.Context.PostContext -match 'disabled: true' } | Measure-Object).Count
Check 'web profile disabled row' ($disabled -ge 1) 'id: vision-toolkit + disabled: true present'

# 5. client configs
$set = Join-Path $dsh 'settings.yaml'
$bunny = (Test-Path $set) -and (Select-String -Path $set -Pattern 'stealth/space-bunny-alpha' -Context 0,12 |
  Where-Object { $_.Context.PostContext -match 'input:' } | Measure-Object).Count
Check 'dsh settings bunny caps' ($bunny -ge 1) 'space-bunny-alpha declares input + reasoningEfforts'
$zc = Join-Path $HOME '.zcode\v2\provider_config.json'
$zcObj = if (Test-Path $zc) { Get-Content $zc -Raw | ConvertFrom-Json } else { $null }
$zcStr = if ($zcObj) { ($zcObj | ConvertTo-Json -Depth 40 -Compress) } else { '' }
$zcAt = $zcStr.IndexOf('"modelId":"stealth/space-bunny-alpha"')
$zcSeg = if ($zcAt -ge 0) { $zcStr.Substring($zcAt, [Math]::Min(700, $zcStr.Length - $zcAt)) } else { '' }
$zl = ($zcAt -ge 0) -and (-not ($zcSeg -match '"disabled"')) -and ($zcSeg -match '"xhigh"')
Check 'zcode reasoning levels' $zl 'no invalid disabled/enabled values'
$kc = Join-Path $HOME '.kimi-code\config.toml'
$kk = (Test-Path $kc) -and ((Get-Content $kc -Raw) -match 'commandcode/space-bunny-alpha')
Check 'kimi-code model entry' $kk 'commandcode/space-bunny-alpha present'

""
if ($fail -eq 0) { 'RESULT: all registered overrides present'; exit 0 }
"RESULT: $fail drift(s) — re-apply from local-overrides/ (see README.md)"
exit 1
