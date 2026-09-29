# --- oh-my-whale templating shim ---
import os
def __t(s: str) -> str:
    return s.replace("{{DSH_HOME}}", os.path.expanduser("~") + "/.dsh").replace("{{USERPROFILE}}", os.path.expanduser("~"))
import base64, json, struct, sys, urllib.request, urllib.error, zlib

ZCODE = r__t("{{USERPROFILE}}\\.zcode\\v2\\provider_config.json")
cfg = json.load(open(ZCODE, encoding="utf-8"))


def walk(node):
    if isinstance(node, dict):
        if "providerName" in node and isinstance(node.get("config"), dict):
            yield node
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)


cc = next(p for p in walk(cfg) if p.get("providerName") == "commandcode")
key = cc["config"]["access"]["apiKey"]
base = cc["config"]["api"]["baseUrl"].rstrip("/")
print(f"provider found: id={cc.get('providerId')} base={base} "
      f"models={cc['config'].get('personalModelIds')}")

W = H = 64
raw = b"".join(b"\x00" + b"\xff\x00\x00" * W for _ in range(H))

def chunk(t, d):
    c = t + d
    return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(raw))
       + chunk(b"IEND", b""))
data_url = "data:image/png;base64," + base64.b64encode(png).decode()
MODEL = "stealth/space-bunny-alpha"


def call(label, payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        base + "/chat/completions", data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    try:
        r = urllib.request.urlopen(req, timeout=180)
        out = json.loads(r.read().decode())
        msg = out["choices"][0]["message"]
        txt = (msg.get("content") or "")[:200]
        rsn = (msg.get("reasoning_content") or msg.get("reasoning") or "")[:300]
        print(f"[{label}] HTTP 200 | content={txt!r}")
        if rsn:
            print(f"[{label}] reasoning={rsn!r}")
        u = out.get("usage") or {}
        print(f"[{label}] usage={u}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:400]
        print(f"[{label}] HTTP {e.code} | {body}")
    except Exception as e:
        print(f"[{label}] ERR {type(e).__name__} {e}")


# 1) plain text + reasoning_effort=max
call("text+effort=max", {
    "model": MODEL,
    "messages": [{"role": "user", "content": "Reply with the single word: PONG"}],
    "max_tokens": 200,
    "reasoning_effort": "max",
})

# 2) image input
call("image", {
    "model": MODEL,
    "messages": [{"role": "user", "content": [
        {"type": "text", "text": "What is the solid colour of this image? Answer with one word."},
        {"type": "image_url", "image_url": {"url": data_url}},
    ]}],
    "max_tokens": 300,
})
