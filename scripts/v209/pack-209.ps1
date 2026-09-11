# pack-209.ps1 - v209-era repack: patched runtime tree -> app.asar (+ .unpacked natives), with pristine-header validation. Captured from tmp/v209-intel ops runs, 2026-09-11.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\v209\pack-209.ps1                 # dry pack + header compare
#   ... pack-209.ps1 -Apply                                                                          # also install into DSH Desktop resources (close the app first!)
#   ... pack-209.ps1 -Tree <path> -OutDir <path> -PristineAsar <path>
# NOTES (upgrade-v205-plan-v5 附7/附10):
#   - Default -Tree is the authoritative patched tree C:\Users\<user>\.dsh\runtime\v209-patched-tree
#     (migrated off .dsh\tmp\v209-intel\asar-root; see migrate-tree.ps1).
#   - Repacked asars only boot when the Electron fuse EnableEmbeddedAsarIntegrityValidation=off:
#     npx --yes @electron/fuses write --app "$env:LOCALAPPDATA\Programs\DSH Desktop\DSH Desktop.exe" EnableEmbeddedAsarIntegrityValidation=off
#     OnlyLoadAppFromAsar stays ON (anti-hijack, does not conflict with repack).
#   - -Apply backs up the live app.asar as app.asar.pre-patch-<date> first. Any official update
#     rewrites exe+resources -> fuse back ON + patches gone; replay this script + fuse BEFORE starting the desktop app.
param(
  [string]$Tree = "$env:USERPROFILE\.dsh\runtime\v209-patched-tree",
  [string]$OutDir = "",
  [string]$PristineAsar = "$env:USERPROFILE\.dsh\backups\v209-pristine-20260911\app.asar",
  [switch]$Apply
)

$ErrorActionPreference = 'Continue'
if (-not (Test-Path (Join-Path $Tree "node_modules\@deepseek-ai\dsh\package.json"))) {
  Write-Host "ERROR: not a v209 patched tree (no @deepseek-ai/dsh): $Tree" -ForegroundColor Red; exit 1
}
if (-not $OutDir) { $OutDir = Join-Path $env:TEMP ("v209-pack-" + (Get-Date -Format "yyyyMMdd-HHmmss")) }
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Force $OutDir | Out-Null

Write-Host "=== packing $Tree -> $OutDir\app.asar (restoring unpack pattern) ==="
# One --unpack-dir with brace syntax (minimatch alternation) covers the native payload dirs that
# must stay on disk (node-pty spawn, @img/sharp .node, bundled pnpm, addon shims).
npx --yes @electron/asar pack $Tree "$OutDir\app.asar" `
  --unpack-dir "node_modules/{@agents-anywhere,node-pty,pnpm,@img,@koromix,@vscode,node-addon-require-builtin-win32-x64-msvc,node-addon-require-builtin-win32-arm64-msvc}/**" `
  --unpack "build/*.png"
if ($LASTEXITCODE -ne 0) { Write-Host 'PACK FAILED'; exit 1 }
Write-Host ('app.asar size: ' + (Get-Item "$OutDir\app.asar").Length + ' (pristine 168985005; delta = patch content)')
Write-Host ('unpacked dir: ' + (Get-ChildItem "$OutDir\app.asar.unpacked" -Recurse -File | Measure-Object).Count + ' files')

# ---- validation segment: header-level tree compare against the pristine asar ----
if (Test-Path $PristineAsar) {
  $outFwd = ($OutDir -replace '\\', '/')
  python -c "import json,struct
fa=open(r'$PristineAsar','rb'); fa.read(8); hs=struct.unpack('<I',fa.read(4))[0]; js=struct.unpack('<I',fa.read(4))[0]; ha=json.loads(fa.read(js))
fb=open(r'$outFwd/app.asar','rb'); fb.read(8); hs2=struct.unpack('<I',fb.read(4))[0]; js2=struct.unpack('<I',fb.read(4))[0]; hb=json.loads(fb.read(js2))
def walk(n,p,out):
    for k,v in (n.get('files') or {}).items():
        q=p+'/'+k
        if 'files' in v: walk(v,q,out)
        else: out[q]=v.get('unpacked',False)
A={};B={}
walk(ha,'',A); walk(hb,'',B)
miss=[k for k in A if k not in B]; extra=[k for k in B if k not in A]
print('files only in pristine:',len(miss)); print('files only in packed:',len(extra))
print('unpacked-flag mismatches:',sum(1 for k in A if k in B and bool(A[k])!=bool(B[k])))
print('size diffs:',sum(1 for k in A if k in B and A[k].get('size')!=B[k].get('size')))"
} else {
  Write-Host "WARN: pristine baseline asar not found ($PristineAsar); header compare skipped" -ForegroundColor Yellow
}

if (-not $Apply) { Write-Host '=== dry run done; re-run with -Apply to install (then flip fuse, see header notes) ==='; exit 0 }

$res = Join-Path $env:LOCALAPPDATA "Programs\DSH Desktop\resources"
if (-not (Test-Path $res)) { Write-Host "ERROR: install resources dir missing: $res" -ForegroundColor Red; exit 1 }
$stamp = Get-Date -Format "yyyyMMdd"
Copy-Item "$res\app.asar" "$res\app.asar.pre-patch-$stamp" -Force
Copy-Item "$OutDir\app.asar" "$res\app.asar" -Force
Remove-Item "$res\app.asar.unpacked" -Recurse -Force
Copy-Item "$OutDir\app.asar.unpacked" "$res\app.asar.unpacked" -Recurse -Force
Write-Host 'INSTALLED patched asar — verify the fuse is still OFF before launching, then run patches\host\verify.ps1 -Source installed'
