const fs = require("fs");
const zlib = require("zlib");

const file = process.argv[2];
const data = fs.readFileSync(file);
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const offs = [];
for (let i = 0; i + 4 <= data.length; i++) {
  if (data.compare(magic, 0, 4, i, i + 4) === 0) offs.push(i);
}
console.log("file bytes:", data.length, "| magic hits:", offs.length);

let ok = 0;
for (const off of offs.slice(0, 6)) {
  try {
    const out = zlib.zstdDecompressSync(data.subarray(off));
    ok++;
    console.log(`  off=${off} -> ${out.length} bytes | ${JSON.stringify(out.toString("utf8").slice(0, 120))}`);
  } catch (e) {
    console.log(`  off=${off} -> FAIL: ${e.message.slice(0, 70)}`);
  }
}
console.log("decompressible from those offsets:", ok);

// If frames are independent, walk them: decompress from each offset and keep results.
if (ok > 0) {
  const texts = [];
  for (const off of offs) {
    try {
      texts.push(zlib.zstdDecompressSync(data.subarray(off)).toString("utf8"));
    } catch { /* not a frame start */ }
  }
  const all = texts.join("");
  const lines = all.split("\n").filter((l) => l.trim());
  console.log("\nrecovered frames:", texts.length, "| joined bytes:", all.length, "| JSONL lines:", lines.length);
  fs.writeFileSync(process.argv[3] || "recovered.jsonl", all);
  const types = new Map();
  for (const l of lines) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    const t = e.type || e.kind || "?";
    types.set(t, (types.get(t) || 0) + 1);
  }
  console.log("event types:", [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14));
}
