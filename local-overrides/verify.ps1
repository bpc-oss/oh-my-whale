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
  $s = Get-Content $yml -Raw -Encoding UTF8
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

# 4. legacy toolkit stays uninstalled IN THE WEB PROFILE ONLY
$pkg = Join-Path $dsh 'profiles\web\package.json'
$listed = (Test-Path $pkg) -and ((Get-Content $pkg -Raw -Encoding UTF8) -match 'dsh-vision-toolkit')
Check 'web profile bundle removed' (-not $listed) 'no dsh-vision-toolkit in profiles/web/package.json'
$patch = Join-Path $dsh 'profiles\web\cordis.patch.yml'
$disabled = (Test-Path $patch) -and (Select-String -Path $patch -Pattern '^- id: vision-toolkit' -Context 0,25 |
  Where-Object { $_.Context.PostContext -match 'disabled: true' } | Measure-Object).Count
Check 'web profile disabled row' ($disabled -ge 1) 'id: vision-toolkit + disabled: true present'
# the row must also exist in the replay template, otherwise an upgrade replays a
# template that resurrects the toolkit (the live row alone would pass)
$tpl = Join-Path $whale 'profile\cordis.patch.yml.template'
$tplDisabled = (Test-Path $tpl) -and (Select-String -Path $tpl -Pattern '^- id: vision-toolkit' -Context 0,25 |
  Where-Object { $_.Context.PostContext -match 'disabled: true' } | Measure-Object).Count
Check 'template disabled row' ($tplDisabled -ge 1) 'template carries the same disabled row (replay-safe)'
# both id forms must exist in live AND template: `vision-toolkit` blocks the
# bundle patch, `dsh-vision-toolkit` blocks super-injector's package-name id
$dshRowLive = (Select-String -Path $patch -Pattern '^- id: dsh-vision-toolkit' -Context 0,25 |
  Where-Object { $_.Context.PostContext -match 'disabled: true' } | Measure-Object).Count
$dshRowTpl = (Select-String -Path $tpl -Pattern '^- id: dsh-vision-toolkit' -Context 0,25 |
  Where-Object { $_.Context.PostContext -match 'disabled: true' } | Measure-Object).Count
Check 'dsh-vision-toolkit row (live+template)' (($dshRowLive -ge 1) -and ($dshRowTpl -ge 1)) 'super-injector id form present in both, so a replay cannot resurrect it'
# OUT OF SCOPE BY CONTRACT: profiles/bpc-operator is the governed operator agent -
# its AGENTS.md grants "exactly eight MCP tools and a small set of vision
# operations"; stripping the toolkit there would break that profile's contract.
# This check FAILS if someone "cleans up" bpc-operator by mistake.
$bpcPkg = Join-Path $dsh 'profiles\bpc-operator\package.json'
$bpcKept = (Test-Path $bpcPkg) -and ((Get-Content $bpcPkg -Raw -Encoding UTF8) -match 'dsh-vision-toolkit')
Check 'bpc-operator keeps toolkit (by contract)' $bpcKept 'governed operator profile must keep its vision operations'

# 5. client configs
# Kernel 0.2.0 (desktop 2.0.16+) migrated the settings document out of
# ~/.dsh/settings.yaml and into the live config layer
# profiles/web/cordis.patch.yml (the `llm-pi-ai` row), renaming the old file to
# settings.yaml.imported. Resolve whichever one the current kernel actually
# reads so these two checks stay meaningful across the upgrade.
$setLegacy = Join-Path $dsh 'settings.yaml'
$setNew    = Join-Path $dsh 'profiles\web\cordis.patch.yml'
$set = if (Test-Path $setLegacy) { $setLegacy } else { $setNew }
$bunny = (Test-Path $set) -and (Select-String -Path $set -Pattern 'stealth/space-bunny-alpha' -Context 0,12 |
  Where-Object { $_.Context.PostContext -match 'input:' } | Measure-Object).Count
Check 'dsh settings bunny caps' ($bunny -ge 1) ("space-bunny-alpha declares input + reasoningEfforts (in {0})" -f (Split-Path -Leaf $set))
$zc = Join-Path $HOME '.zcode\v2\provider_config.json'
# 2026-09-29: the old check sliced 700 chars after the modelId string and grepped
# for "disabled". Because the key is ABSENT when the model is enabled, the window
# ran past this rule into the next one in providerModelRules and reported a false
# DRIFT on a correct config. Assert on the rule object instead.
$zl = $false
if (Test-Path $zc) {
  # The file is user-owned and zcode rewrites it whenever it saves. PowerShell
  # 5.1's ConvertFrom-Json throws on shapes node cannot handle (deep nesting,
  # duplicate keys, some escapes); an exception here used to abort the WHOLE gate
  # and report nothing at all, which reads as "no drift" if the exit code is
  # ignored. Parse defensively and report a real DRIFT instead.
  $zcObj = $null
  try { $zcObj = Get-Content $zc -Encoding UTF8 -Raw | ConvertFrom-Json }
  catch { Write-Host ('  zcode config unreadable by PowerShell 5.1 JSON: ' + $_.Exception.Message) }
  $rule = if ($zcObj) { @($zcObj.config.modelConfigRules.providerModelRules) |
    Where-Object { $_.modelId -eq 'stealth/space-bunny-alpha' } | Select-Object -First 1 } else { $null }
  if ($rule) {
    $cfg = $rule.config
    $levels = @($cfg.optionSpecs.reasoningLevel.values)
    # enabled means: either no `enabled` key at all, or explicitly true.
    $enabledOk = ($null -eq $cfg.PSObject.Properties['enabled']) -or ($cfg.enabled -eq $true)
    $hasDisabled = $null -ne $cfg.PSObject.Properties['disabled']
    # The retired zcode patch asserted exactly this: the provider rejects the
    # `disabled` and `enabled` levels (HTTP 400) and accepts only this set.
    $valid = @('low','medium','high','xhigh','max')
    $zl = $enabledOk -and (-not $hasDisabled) -and (($levels -join ',') -eq ($valid -join ','))
  }
}
# 2026-09-30: PowerShell 5.1's ConvertFrom-Json throws on this user-owned file
# (node parses it fine), which made the gate report a DRIFT on a good config.
# Read the facts with node instead - scripts/zcode-facts.mjs prints KEY=VALUE.
$zfacts = @{}
$zscript = Join-Path $whale 'scripts\zcode-facts.mjs'
if (Test-Path $zscript) {
  $zout = & node $zscript $zc 2>$null
  foreach ($line in $zout) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $zfacts[$matches[1]] = $matches[2] }
  }
}
if ($zfacts.ContainsKey('PARSE') -and $zfacts['PARSE'] -eq 'ok') {
  $zl = ($zfacts['RULE_FOUND'] -eq 'true') -and
        ($zfacts['ENABLED_OK'] -eq 'true') -and
        ($zfacts['HAS_DISABLED'] -eq 'false') -and
        ($zfacts['LEVELS'] -eq 'low,medium,high,xhigh,max')
} elseif ($zfacts.ContainsKey('PARSE')) {
  $zl = $false
}
Check 'zcode reasoning levels' $zl 'space-bunny-alpha: reasoningLevel == low,medium,high,xhigh,max; enabled, no disabled key'
$kc = Join-Path $HOME '.kimi-code\config.toml'
$kk = (Test-Path $kc) -and ((Get-Content $kc -Raw -Encoding UTF8) -match 'commandcode/space-bunny-alpha')
Check 'kimi-code model entry' $kk 'commandcode/space-bunny-alpha present'

# 5b. web-profile custom config ANCHORS (replaces the retired settings diff).
#     Kernel 0.2.0 regenerates profiles/web/cordis.patch.yml on every boot, so a
#     unified diff can never forward-apply. These anchors are the honest
#     drift check: each custom provider / model row must still be present.
$anchorFile = Join-Path $whale 'local-overrides\dsh-web-profile-custom-config.anchors.json'
$webPatch   = Join-Path $dsh 'profiles\web\cordis.patch.yml'
if ((Test-Path $anchorFile) -and (Test-Path $webPatch)) {
  $anchors = (Get-Content $anchorFile -Encoding UTF8 -Raw | ConvertFrom-Json).anchors
  $webSrc = Get-Content $webPatch -Raw -Encoding UTF8
  $missing = @()
  $unexpected = @()
  foreach ($a in $anchors) {
    $n = ([regex]::Matches($webSrc, $a.pattern, [Text.RegularExpressions.RegexOptions]::Multiline)).Count
    if ($n -lt $a.min) { $missing += $a.id }
    # An anchor with `max` asserts the ABSENCE of something — used for rows a decision
    # retired, so a replay that re-adds them is caught. `min: 0` alone would assert nothing.
    if ($null -ne $a.max -and $n -gt $a.max) { $unexpected += "$($a.id) (found $n, allowed $($a.max))" }
  }
  $anchorMsg = if ($missing.Count -or $unexpected.Count) {
    $parts = @()
    if ($missing.Count) { $parts += "missing: $($missing -join ', ')" }
    if ($unexpected.Count) { $parts += "should be absent: $($unexpected -join ', ')" }
    $parts -join '; '
  } else { "$($anchors.Count) custom rows present in cordis.patch.yml" }
  Check 'web profile custom config anchors' (($missing.Count -eq 0) -and ($unexpected.Count -eq 0)) $anchorMsg
} else {
  Check 'web profile custom config anchors' $false 'anchor file or live profile patch missing'
}

# 6. the registered diffs must still be APPLICABLE. The 2026-09-29 review
#    found all four had unusable headers: drift was detectable but recovery after
#    an update was impossible. Reverse-apply == "forward-applies to pre-state".
#    Two entries were dropped on 2026-09-29 because their targets stopped being
#    stable text files: 'dsh settings' moved into a kernel-generated
#    profiles/web/cordis.patch.yml, and 'zcode config' drifted out of the diff's
#    baseline. Both are covered by value assertions above instead.
$patches = @(
  @{ name = 'autoprompt preset'; file = 'dsh-preset-autoprompt-resident-read-image.patch';     live = (Join-Path $dsh '.agent-presets\autoprompt\agent.cordis.yml'); rel = 'agent.cordis.yml'; secret = $false },
  @{ name = 'kimi-code config'; file = 'kimi-code-0.36.1-commandcode-space-bunny-alpha.patch'; live = (Join-Path $HOME '.kimi-code\config.toml'); rel = 'config.toml'; secret = $true }
)
foreach ($p in $patches) {
  $pf = Join-Path $whale ('local-overrides\' + $p.file)
  $bad = $true
  if ((Test-Path $pf) -and (Test-Path $p.live)) {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
      $text = (Get-Content $pf -Raw -Encoding UTF8) -replace "`r`n", "`n"
      $diff = $text.Substring($text.IndexOf('diff --git'))
      $body = (Get-Content $p.live -Raw -Encoding UTF8) -replace "`r`n", "`n"
      if ($p.secret -or $diff -match '\{\{COMMANDCODE_API_KEY\}\}') {
        # keep benign markers (api_key = "local") so hunk context still matches
        # redact only secret-looking values; benign markers (api_key = "local") must
        # stay byte-identical or the hunk context will not match. The placeholder is
        # unquoted because check-private treats a quoted >=8-char value as a secret.
        $body = [regex]::Replace($body, '(?i)(api_key\s*=\s*)"(sk-[^"]+|[A-Za-z0-9_]{16,})"', '$1{{COMMANDCODE_API_KEY}}')
      }
      $tgt = Join-Path $tmp ($p.rel -replace '/', [IO.Path]::DirectorySeparatorChar)
      New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($tgt)) | Out-Null
      [IO.File]::WriteAllText($tgt, $body)
      $dp = Join-Path $tmp 'p.diff'
      [IO.File]::WriteAllText($dp, $diff)
      $prevEap = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      try {
        $null = & git -C $tmp apply -p1 -R --check $dp 2>&1
        $bad = ($LASTEXITCODE -ne 0)
      } catch {
        $bad = $true
      } finally {
        $ErrorActionPreference = $prevEap
      }
    } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  }
  Check ('patch applicable: ' + $p.name) (-not $bad) 'reverse-apply check => forward-applies once an update wipes it'
}

""
if ($fail -eq 0) { 'RESULT: all registered overrides present'; exit 0 }
"RESULT: $fail drift(s) — re-apply from local-overrides/ (see README.md)"
exit 1
