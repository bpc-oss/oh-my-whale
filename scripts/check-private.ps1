# check-private.ps1 - scan for machine-private paths before committing
# Usage: .\scripts\check-private.ps1 [-RepoDir <path>]
# Exit 0 = clean; exit 1 = found private data
param([string]$RepoDir = "")

if (-not $RepoDir) { $RepoDir = Split-Path -Parent $PSScriptRoot }
$fail = 0

$patterns = @(
  "C:\\Users\\Administrator",
  "C:/Users/Administrator",
  "E:\\ai-files",
  "E:/ai-files",
  "C:\\ProgramData\\AgentOS",
  "C:/ProgramData/AgentOS",
  "\.credentials\.yaml$",
  "\.env$",
  "apiKey\s*=",
  "api_key\s*=",
  "sk-[a-zA-Z0-9]{20,}",
  "\.ts\.net",
  "file:///C:/Users/Administrator",
  "file:///C:\\Users\\Administrator"
)

Get-ChildItem -Path $RepoDir -Recurse -File -Exclude @("*.bak*", "*.log", "*.exe", "*.tgz", "*.tar") | ForEach-Object {
  $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
  if (-not $content) { return }
  foreach ($pat in $patterns) {
    if ($content -match $pat) {
      Write-Host "PRIVATE: $($_.Name) matches '$pat'"
      $fail = 1
    }
  }
}

if ($fail -eq 0) { Write-Host "OK: no private data found" }
exit $fail