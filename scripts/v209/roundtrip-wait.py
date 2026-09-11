# roundtrip-wait.py - wait for a real CLI/desktop round-trip to land on disk: poll a session's frames until user/message + turn/end (or turn/error) appear. Proven in RT-2035 disk-frame forensics, 2026-09-11.
# Usage: python roundtrip-wait.py <session-id-substr> <deadline-seconds> [sessions-root]
#   sessions-root defaults to ~/.dsh/sessions (pass explicitly on other machines).
# v209 fact: since 0.1.5 NEW sessions write session.v3.jsonl.zstd while old ones keep
# session.jsonl.zstd — the glob below is `session*.jsonl.zstd` on purpose (single-suffix
# globs silently miss every fresh session; 附10).
# Exit: 0 turn/end completed-ish, 2 turn/error, 3 timeout.
import os, sys, time, json, glob
import zstandard
sid = sys.argv[1]; dl = int(sys.argv[2])
root = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.expanduser("~"), ".dsh", "sessions")
d = zstandard.ZstdDecompressor()
t0 = time.time()
def frames(fp):
    raw = open(fp,'rb').read(); pos=0
    while pos < len(raw):
        if raw[pos:pos+4] != b'\x28\xb5\x2f\xfd':
            nxt = raw.find(b'\x28\xb5\x2f\xfd', pos)
            if nxt < 0: return
            pos = nxt
        do = d.decompressobj()
        try: chunk = do.decompress(raw[pos:])
        except Exception: return
        yield chunk
        ud = getattr(do,'unused_data',b'')
        if not ud: return
        pos = len(raw)-len(ud)
while time.time()-t0 < dl:
    for fp in glob.glob(os.path.join(root,'*','session-'+sid+'*','session*.jsonl.zstd')):
        user_seen=0; assistant_text=0; turn_end=None; turn_err=None
        for chunk in frames(fp):
            s = chunk.decode('utf-8','ignore')
            for line in s.split('\n'):
                if '"type":"user/message"' in line: user_seen += 1
                if '"type":"assistant/message"' in line or ('"role":"assistant"' in line and '"type":"session/event"' not in line): assistant_text += 1
                if '"turn/end"' in line:
                    turn_end = line[:200]
                if '"turn/error"' in line: turn_err = line[:200]
        if user_seen and (turn_end or turn_err):
            print(json.dumps({'file':os.path.basename(fp),'user_msgs':user_seen,'assistant_frames':assistant_text,'turn_end':turn_end,'turn_error':turn_err,'waited_s':round(time.time()-t0,1)}))
            sys.exit(0 if turn_end and not turn_err else 2)
    time.sleep(5)
print(json.dumps({'timeout':True,'waited_s':round(time.time()-t0,1)})); sys.exit(3)
