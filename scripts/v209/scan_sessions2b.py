# scan_sessions2b.py - full-frame decode of every session recording to find UNKNOWN source.kind / content.kind values (the P27/P28 class of "new validation layer rejects our artifacts"). Proven over all 1631 sessions (0 errors, 附10), 2026-09-11.
# Usage: python scan_sessions2b.py [sessions-root]     (default ~/.dsh/sessions)
# v209 fact: new sessions are session.v3.jsonl.zstd, old ones session.jsonl.zstd -> both globbed.
# WHITELIST PROVENANCE (keep in lockstep with patches/manifest.json):
#   W_SRC = official SOURCE_KINDS (15 in 0.1.5) + P28 additions (fallback, instruction-hint)
#           + plugin-written kinds found by THIS scan's first pass (provider, verifier-guide,
#           jspace-frame, ai-tube-mission) — manifest patch P28.
#   W_CK  = official CONTENT_KINDS + P27 addition "video" — manifest patch P27
#           (dsh-session-format-v2-to-v3 assertContentKind).
# Both whitelists declared CLOSED by the 1631-session full scan + 13-session v3 rescan
# (附10 MINOR-8 resolved); re-run this scanner whenever a new validation/migration layer
# lands in an upgrade (fixed regression item in the v209-era SOP).
import zstandard, re, os, sys, json, time, glob
from collections import Counter
W_SRC = {"user","plugin","model","tool","agent-instructions","session-reference","team-message","goal","skill-invocation","skill-catalog","coordinator","subagent-report","subagent-settled","webhook","agent-message","fallback","instruction-hint","provider","verifier-guide","jspace-frame","ai-tube-mission"}
W_CK = {"text","reasoning","image","file","tool-call","tool-result","video"}
root = os.path.join(os.path.expanduser("~"), ".dsh", "sessions")
if len(sys.argv) > 1: root = sys.argv[1]
d = zstandard.ZstdDecompressor()
unk_src = {}; unk_ck = {}; n = 0; err = Counter()
t0 = time.time()
src_re2 = re.compile(r'"source":\{"kind":"([A-Za-z0-9_.-]+)"')
ck_re = re.compile(r'\{"type":"(video|image|file|audio|document|tool-call|tool-result|tool_call|reasoning|text|data|url)"')
for ws in os.listdir(root):
    wp = os.path.join(root, ws)
    if not os.path.isdir(wp): continue
    for sess in os.listdir(wp):
        fps = glob.glob(os.path.join(wp, sess, 'session*.jsonl.zstd'))
        if not fps: continue
        n += 1
        for fp in fps:
            try:
                raw = open(fp, 'rb').read()
            except Exception as e:
                err['read'] += 1; continue
            pos = 0; decoded = 0
            while pos < len(raw) and decoded < 40_000_000:
                if raw[pos:pos+4] != b'\x28\xb5\x2f\xfd':
                    pos += 1; continue
                do = d.decompressobj()
                try:
                    chunk = do.decompress(raw[pos:])
                except Exception:
                    err['frame'] += 1; break
                s = chunk.decode('utf-8', 'ignore')
                decoded += len(s)
                for m in src_re2.finditer(s):
                    k = m.group(1)
                    if k not in W_SRC: unk_src.setdefault(k, []).append(sess[:22])
                for m in ck_re.finditer(s):
                    if m.group(1) not in W_CK: unk_ck.setdefault(m.group(1), []).append(sess[:22])
                ud = do.unused_data
                if not ud and do.eof:
                    break
                if ud:
                    pos = len(raw) - len(ud)
                else:
                    break
print('sessions:', n, 'elapsed %.0fs' % (time.time()-t0), 'errors:', dict(err))
print('UNKNOWN source kinds:', json.dumps({k: len(v) for k, v in unk_src.items()}))
print('UNKNOWN content types:', json.dumps({k: len(v) for k, v in unk_ck.items()}))
for k, v in list(unk_src.items())[:10]: print('  S', k, v[:2])
for k, v in list(unk_ck.items())[:10]: print('  C', k, v[:2])
