#!/usr/bin/env bash
# capture.sh - capture current dsh kernel patches into patches/*.patch
# Diff baseline: .bak-* snapshot per file (P4 uses npm pack original)
# bash keeps UTF-8 bytes exact (PowerShell 5.1 corrupts Chinese in diffs)
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$REPO/patches/manifest.json"
KERNEL_DIR="${1:-}"
PROFILE_DIR="${2:-}"

if [ -z "$KERNEL_DIR" ]; then
  if [ -d "$LOCALAPPDATA/Programs/DSH Desktop/resources/app.asar.unpacked/node_modules" ]; then
    KERNEL_DIR="$LOCALAPPDATA/Programs/DSH Desktop/resources/app.asar.unpacked/node_modules"
  elif [ -d "/c/Program Files/DeepSeek Harness/resources/host/node_modules" ]; then
    KERNEL_DIR="/c/Program Files/DeepSeek Harness/resources/host/node_modules"
  fi
fi
[ -z "$PROFILE_DIR" ] && PROFILE_DIR="$HOME/.dsh/profiles/web/node_modules"
ALT_ROOTS=(
  "/c/Program Files/DeepSeek Harness/resources/host/node_modules"
  "$HOME/.dsh/backups/host-rc7-20260820/node_modules"
)

echo "KernelDir : $KERNEL_DIR"
echo "ProfileDir: $PROFILE_DIR"
[ -d "$KERNEL_DIR" ] || { echo "FATAL: KernelDir not found: $KERNEL_DIR"; exit 1; }

# Read manifest via python3 (pure json, no comments)
MANIFEST_JSON=$(python3 -c "
import json,sys
print(json.dumps(json.load(open(sys.argv[1], encoding='utf-8'))))
" "$MANIFEST") || { echo "FATAL: manifest parse failed"; exit 1; }

# Emit per-patch plan as TSV: id<TAB>file<TAB>target<TAB>patchFile<TAB>left<TAB>right<TAB>sourceType
PLAN=$(python3 - "$MANIFEST" "$KERNEL_DIR" "$PROFILE_DIR" <<'PYEOF'
import json, os, sys
manifest_path, kernel_dir, profile_dir = sys.argv[1:4]
m = json.load(open(manifest_path, encoding='utf-8'))
alts = ["C:/Program Files/DeepSeek Harness/resources/host/node_modules",
        os.path.expanduser("~/.dsh/backups/host-rc7-20260820/node_modules")]
for p in m["patches"]:
    p = {k: (v.strip() if isinstance(v, str) else v) for k, v in p.items()}
    root = kernel_dir if p["file"] == "host" else profile_dir
    target = os.path.join(root, *p["target"].split("/"))
    right = target
    if p.get("diffTarget") == "patched-gpd":
        right = os.path.join(root, *p["diffTargetPath"].split("/"))
    left = ""
    if p["source"] == "bak":
        cands = [os.path.join(root, *p["sourcePath"].split("/"))]
        cands += [os.path.join(a, *p["sourcePath"].split("/")) for a in alts]
        left = next((c for c in cands if os.path.exists(c)), "")
    elif p["source"] == "npm-pack":
        left = "NPMPACK:" + p.get("sourceSpec", "") + ":" + p.get("sourceFile", "")
    print("\t".join([p["id"], p["file"], p["target"], p["patchFile"], left, right, p["source"]]))
PYEOF
)

echo "$PLAN" | while IFS=$'\t' read -r id file target patchfile left right source; do
  # strip CR (manifest CRLF line endings leak into TSV)
  id="${id%$'\r'}"; file="${file%$'\r'}"; target="${target%$'\r'}"; patchfile="${patchfile%$'\r'}"
  left="${left%$'\r'}"; right="${right%$'\r'}"; source="${source%$'\r'}"
  echo "=== $id: $target ==="
  outfile="$REPO/patches/$patchfile"
  mkdir -p "$(dirname "$outfile")"

  # Resolve npm-pack source: download + extract to temp
  if [ "$source" = "npm-pack" ]; then
    spec="${left#NPMPACK:}"; spec="${spec%%:*}"; srcfile="${left##*:}"
    tmpd=$(mktemp -d /tmp/omw-pack.XXXXXX)
    (cd "$tmpd" && npm pack "$spec" --silent >/dev/null 2>&1)
    tgz=$(ls "$tmpd"/*.tgz 2>/dev/null | head -1)
    if [ -z "$tgz" ]; then echo "  SKIP: npm pack failed"; rm -rf "$tmpd"; continue; fi
    (cd "$tmpd" && tar -xzf "$(basename "$tgz")")
    left="$tmpd/package/$srcfile"
  fi

  if [ -z "$left" ]; then echo "  SKIP: source not found"; continue; fi
  if [ ! -f "$right" ]; then echo "  SKIP: target missing: $right"; continue; fi
  if [ ! -f "$left" ]; then echo "  SKIP: source missing: $left"; continue; fi

  # diff -u --strip-trailing-cr (exit 1 = differences, normal)
  diffout=$(diff -u --strip-trailing-cr "$left" "$right" 2>/dev/null)
  rc=$?
  if [ $rc -gt 1 ]; then echo "  ERROR: diff exit $rc"; continue; fi
  if [ -z "$diffout" ]; then echo "  WARN: empty diff (unpatched?)"; continue; fi

  # Rewrite ---/+++ to a/<target> b/<target>, prefix with metadata header
  {
    echo "# From: oh-my-whale"
    echo "# Target: $target"
    echo "# Status: active"
    echo ""
    echo "$diffout" | sed -e "s|^--- .*|--- a/$target|" -e "s|^+++ .*|+++ b/$target|"
  } > "$outfile"
  echo "  WROTE: $outfile ($(wc -c < "$outfile") bytes)"
done

echo ""
echo "Done."
