# patch-kimi-maxretries.py — re-apply infinite provider retries to kimi.exe (2.1.1 layout).
# Usage: python patch-kimi-maxretries.py [path-to-kimi.exe]
# Effect: the three provider client constructors (Anthropic + 2x OpenAI) get
#         maxRetries: 0 -> -1  (openai-sdk semantics: -1 = retry forever).
# Constraints discovered 2026-09-29 (read before adapting to a new version):
#   1. The replacement MUST be byte-length preserving. kimi.exe is a Bun
#      single-file executable; growing the embedded JS payload shifts internal
#      offsets and Windows then refuses to load the file ("this version of the
#      application is not built for your processor architecture" - misleading).
#      " 0" -> "-1" is 2 bytes -> 2 bytes, so the patch is neutral.
#   2. Do NOT rewrite kimi.exe in place while sessions are running. Build the
#      patched copy as a separate file, then swap by rename
#      (Move-Item old -> .bak; Move-Item patched -> kimi.exe). In-place rewrite
#      corrupted a running exe once already.
#   3. 2.1.1 carries an Authenticode signature, but that is NOT the blocker -
#      an equal-length content edit still verifies fine (tested). Only length
#      changes break it.
#   4. Re-locate the sites after every kimi release; the 0.36.1 anchors
#      (buildClient/apiKey/baseURL) no longer exist in 2.1.1 (new createClient
#      constructors with `model.apiKey ?? "unused"`).
#   5. Three unrelated `maxRetries: 0` sites belong to fs rm defaults - do not
#      touch them (a `rm` retry storm would be worse than the bug).
import re
import shutil
import sys
import os

TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.environ['USERPROFILE'], '.kimi-code', 'bin', 'kimi.exe')
DST = TARGET + '.patched'

d = open(TARGET, 'rb').read()
tail = rb'(\n\t\}\);)'
patA = re.compile(rb'(return new Anthropic\(\{.*?maxRetries:) 0' + tail, re.S)
patO = re.compile(rb'(return new OpenAI\(\{.*?maxRetries:) 0' + tail, re.S)

na, no = len(patA.findall(d)), len(patO.findall(d))
print('sites: anthropic=%d openai=%d' % (na, no))
if (na, no) != (1, 2):
    print('UNEXPECTED layout - re-locate the sites before patching')
    sys.exit(2)

out = patO.sub(rb'\g<1>-1\g<2>', patA.sub(rb'\g<1>-1\g<2>', d))
markers = len(re.findall(rb'maxRetries:-1', out))
if len(out) != len(d) or markers != 3:
    print('length/marker guard failed (len %d->%d, markers %d)' % (len(d), len(out), markers))
    sys.exit(3)

shutil.copy2(TARGET, TARGET + '.pre-maxretries')
open(DST, 'wb').write(out)
print('wrote %s (equal length, 3 sites). Swap it in with a rename.' % DST)
