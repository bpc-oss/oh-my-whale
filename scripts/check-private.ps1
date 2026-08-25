# check-private.ps1 - scan for machine-private paths before committing
# Usage: .\scripts\check-private.ps1 [-RepoDir <path>]
# Exit 0 = clean; exit 1 = found private data
param([string]$RepoDir = "")

if (-not $RepoDir) { $RepoDir = Split-Path -Parent $PSScriptRoot }
$fail = 0
$SelfScripts = @(
  (Join-Path $RepoDir "scripts\check-private.ps1"),
  (Join-Path $RepoDir "scripts\template-render.ps1"),
  (Join-Path $RepoDir "scripts\drift-scan.ps1"),
  (Join-Path $RepoDir "scripts\capture-sources.ps1"),
  (Join-Path $RepoDir "scripts\pre-commit"),
  (Join-Path $RepoDir "docs\drift-watch-plan.md"),
  (Join-Path $RepoDir ".github\workflows\ci.yml")
)
# Standalone plugin sources may contain legitimate path references in their docs
$AllowedDirs = @(
  (Join-Path $RepoDir "plugins\standalone")
)

# Privacy patterns (case-sensitive matching). Double-backslash JSON-escaped forms included.
$patterns = @(
  "C:\\Users\\Administrator",
  "C:/Users/Administrator",
  "E:\\ai-files",
  "E:/ai-files",
  "E:\\\\ai-files",
  "C:\\ProgramData\\AgentOS",
  "C:/ProgramData/AgentOS",
  "\.ts\.net",
  "file:///C:/Users/Administrator",
  "file:///C:\\Users\\Administrator",
  "sk-[a-zA-Z0-9]{20,}",
  "api[_-]?key['""]?\s*[:=]\s*['""][^'""]{8,}['""]",
  "@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}",
  "password['""]?\s*[:=]\s*['""][^'""]{6,}['""]"
)

$files = Get-ChildItem -Path $RepoDir -Recurse -File |
  Where-Object {
    $f = $_
    $_.FullName -notin $SelfScripts -and
    -not ($AllowedDirs | Where-Object { $f.FullName.StartsWith($_) }) -and
    $_.Name -notmatch '\.(bak|log|exe|tgz|tar|png|jpg|ico)$' -and
    $_.Name -notmatch '^(\.git|node_modules)$'
  }

foreach ($f in $files) {
  $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
  if (-not $content) { continue }
  foreach ($pat in $patterns) {
    if ($content -cmatch $pat) {
      Write-Host "PRIVATE: $($f.FullName.Substring($RepoDir.Length+1)) matches '$pat'"
      $fail = 1
    }
  }
}

if ($fail -eq 0) { Write-Host "OK: no private data found" }
exit $fail
