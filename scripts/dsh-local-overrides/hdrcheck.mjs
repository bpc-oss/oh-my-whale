import fs from "fs";

const path = process.argv[2];
const lines = fs.readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
const evs = [];
for (const l of lines) { try { evs.push(JSON.parse(l)); } catch { /* skip */ } }
console.log("events:", evs.length, "| first seq:", evs[0]?.seq, "| last seq:", evs[evs.length - 1]?.seq);
console.log("last time:", new Date(evs[evs.length - 1]?.time || 0).toISOString());

const hdrs = evs.filter((e) => e.type === "request/header");
console.log("\nrequest/header count:", hdrs.length);

const names = (obj, out) => {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if ((k === "name" || k === "toolName") && typeof v === "string") out.add(v);
      names(v, out);
    }
  }
};
const pat = /"(?:vision|glance|ground|detect|crop|trace|pixel|dominant|extract|html_screenshot|long_screenshot|read_image|skill|chrome)[A-Za-z0-9_]*"/g;

for (const h of hdrs.slice(-4)) {
  const s = JSON.stringify(h);
  const set = new Set();
  names(h.data, set);
  const rx = new Set((s.match(pat) || []).map((x) => x.replace(/"/g, "")));
  const toolsArr = (s.match(/"type":"function"/g) || []).length;
  console.log(`\n--- seq=${h.seq} time=${new Date(h.time || 0).toISOString()} ---`);
  console.log(`  header bytes=${s.length} | "type":"function" entries=${toolsArr}`);
  console.log(`  name-ish strings=${set.size}`);
  console.log(`  vision/skill/chrome hits: ${[...rx].sort().join(", ") || "(none)"}`);
  const all = [...set].sort();
  console.log(`  first 30 names: ${all.slice(0, 30).join(", ")}`);
  const readish = all.filter((n) => /image|read|file|vision|attach/i.test(n));
  console.log(`  image/file-ish tools: ${readish.join(", ") || "(none)"}`);
}

console.log("\n=== guard / nudge markers across whole log ===");
const marks = ["护栏", "说了没做", "corrective turn", "promise-guard"];
for (const m of marks) {
  const hits = evs.filter((e) => JSON.stringify(e).includes(m));
  console.log(`  ${m}: ${hits.length}` + (hits.length ? ` | last seq=${hits[hits.length - 1].seq} time=${new Date(hits[hits.length - 1].time || 0).toISOString()}` : ""));
}

console.log("\n=== last 12 events (type / seq / time / short) ===");
for (const e of evs.slice(-12)) {
  const s = JSON.stringify(e.data ?? {});
  console.log(`  ${String(e.type).padEnd(22)} seq=${String(e.seq).padEnd(6)} ${new Date(e.time || 0).toISOString().slice(11, 19)} ${s.slice(0, 110)}`);
}

const tc = evs.filter((e) => /"toolCall|tool_calls"/.test(JSON.stringify(e)));
console.log("\n=== events mentioning tool calls (last 6) ===");
for (const e of tc.slice(-6)) {
  const s = JSON.stringify(e);
  const m = s.match(/"name":"([A-Za-z0-9_]+)"/g) || [];
  console.log(`  seq=${e.seq} ${String(e.type).padEnd(20)} names=${[...new Set(m)].slice(0, 6).join(",")}`);
}
