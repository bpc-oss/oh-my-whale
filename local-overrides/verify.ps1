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

# 4. legacy toolkit stays uninstalled IN THE WEB PROFILE ONLY
$pkg = Join-Path $dsh 'profiles\web\package.json'
$listed = (Test-Path $pkg) -and ((Get-Content $pkg -Raw) -match 'dsh-vision-toolkit')
Check 'web profile bundle removed' (-not $listed) 'no dsh-vision-toolkit in profiles/web/package.json'
$patch = Join-Path $dsh 'profiles\web\cordis.patch.yml'
$disabled = (Test-Path $patch) -and (Select-String -Path $patch -Pattern '^- id: vision-toolkit' -Context 0,1 |
  Where-Object { $_.Context.PostContext -match 'disabled: true' } | Measure-Object).Count
Check 'web profile disabled row' ($disabled -ge 1) 'id: vision-toolkit + disabled: true present'
# the row must also exist in the replay template, otherwise an upgrade replays a
# template that resurrects the toolkit (the live row alone would pass)
$tpl = Join-Path $whale 'profile\cordis.patch.yml.template'
$tplDisabled = (Test-Path $tpl) -and (Select-String -Path $tpl -Pattern '^- id: vision-toolkit' -Context 0,1 |
  Where-Object { $_.Context.PostContext -match 'disabled: true' } | Measure-Object).Count
Check 'template disabled row' ($tplDisabled -ge 1) 'template carries the same disabled row (replay-safe)'
# both id forms must exist in live AND template: `vision-toolkit` blocks the
# bundle patch, `dsh-vision-toolkit` blocks super-injector's package-name id
$dshRowLive = (Select-String -Path $patch -Pattern '^- id: dsh-vision-toolkit' -Context 0,1 |
  Where-Object { $_.Context.PostContext -match 'disabled: true' } | Measure-Object).Count
$dshRowTpl = (Select-String -Path $tpl -Pattern '^- id: dsh-vision-toolkit' -Context 0,1 |
  Where-Object { $_.Context.PostContext -match 'disabled: true' } | Measure-Object).Count
Check 'dsh-vision-toolkit row (live+template)' (($dshRowLive -ge 1) -and ($dshRowTpl -ge 1)) 'super-injector id form present in both, so a replay cannot resurrect it'
# OUT OF SCOPE BY CONTRACT: profiles/bpc-operator is the governed operator agent -
# its AGENTS.md grants "exactly eight MCP tools and a small set of vision
# operations"; stripping the toolkit there would break that profile's contract.
# This check FAILS if someone "cleans up" bpc-operator by mistake.
$bpcPkg = Join-Path $dsh 'profiles\bpc-operator\package.json'
$bpcKept = (Test-Path $bpcPkg) -and ((Get-Content $bpcPkg -Raw) -match 'dsh-vision-toolkit')
Check 'bpc-operator keeps toolkit (by contract)' $bpcKept 'governed operator profile must keep its vision operations'

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

# 6. the four registered diffs must still be APPLICABLE. The 2026-09-29 review
#    found all four had unusable headers: drift was detectable but recovery after
#    an update was impossible. Reverse-apply == "forward-applies to pre-state".
$patches = @(
  @{ name = 'dsh settings';     file = 'dsh-settings-native-vision-and-bunny-model.patch';      live = (Join-Path $dsh 'settings.yaml'); rel = 'settings.yaml'; secret = $false },
  @{ name = 'autoprompt preset'; file = 'dsh-preset-autoprompt-resident-read-image.patch';     live = (Join-Path $dsh '.agent-presets\autoprompt\agent.cordis.yml'); rel = 'agent.cordis.yml'; secret = $false },
  @{ name = 'zcode config';     file = 'zcode-commandcode-reasoning-levels.patch';              live = (Join-Path $HOME '.zcode\v2\provider_config.json'); rel = 'v2/provider_config.json'; secret = $true },
  @{ name = 'kimi-code config'; file = 'kimi-code-0.36.1-commandcode-space-bunny-alpha.patch'; live = (Join-Path $HOME '.kimi-code\config.toml'); rel = 'config.toml'; secret = $true }
)
foreach ($p in $patches) {
  $pf = Join-Path $whale ('local-overrides\' + $p.file)
  $bad = $true
  if ((Test-Path $pf) -and (Test-Path $p.live)) {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
      $text = (Get-Content $pf -Raw) -replace "`r`n", "`n"
      $diff = $text.Substring($text.IndexOf('diff --git'))
      $body = (Get-Content $p.live -Raw) -replace "`r`n", "`n"
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
