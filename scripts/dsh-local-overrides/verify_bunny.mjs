import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = os.homedir();
const dsh = path.join(home, ".dsh");
const yamlTargets = [
  path.join(dsh, "profiles", "web", "cordis.patch.yml"),
  path.join(dsh, "settings.yaml"),
].filter((f) => fs.existsSync(f));
const zcode = path.join(home, ".zcode", "v2", "provider_config.json");
const wantedReasoning = ["low", "medium", "high", "xhigh", "max"];
let failures = 0;

function ok(label, detail = "") { console.log(`OK   ${label}${detail ? " | " + detail : ""}`); }
function fail(label, detail = "") { failures++; console.log(`FAIL ${label}${detail ? " | " + detail : ""}`); }

function modelBlocks(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*-\s+id:\s*stealth\/space-bunny-alpha\s*$/.test(lines[i])) continue;
    const indent = (lines[i].match(/^\s*/) || [""])[0];
    let j = i + 1;
    while (j < lines.length && !new RegExp(`^${indent}-\\s+id:`).test(lines[j])) j++;
    out.push(lines.slice(i, j).join("\n"));
  }
  return out;
}

for (const file of yamlTargets) {
  const blocks = modelBlocks(fs.readFileSync(file, "utf8"));
  if (!blocks.length) { fail(`${file}: bunny model absent`); continue; }
  for (const [i, block] of blocks.entries()) {
    const hasImage = /input:\s*\n\s*-\s*text\s*\n\s*-\s*image/.test(block);
    const hasEffort = /reasoningEfforts:\s*\n\s*low:\s*low\s*\n\s*high:\s*high\s*\n\s*max:\s*max/.test(block);
    if (hasImage && hasEffort) ok(`${file}: bunny[${i}] input+reasoning`);
    else fail(`${file}: bunny[${i}] missing input/effort`, `image=${hasImage} effort=${hasEffort}`);
  }
}

if (!fs.existsSync(zcode)) {
  fail(`${zcode}: absent`);
} else {
  const doc = JSON.parse(fs.readFileSync(zcode, "utf8"));
  let found = 0;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.modelId === "stealth/space-bunny-alpha") {
      found++;
      const vals = node?.config?.optionSpecs?.reasoningLevel?.values;
      const image = node?.config?.properties?.inputFormat?.supportsImage === true;
      if (image && JSON.stringify(vals) === JSON.stringify(wantedReasoning)) {
        ok("zcode bunny", `image=${image} levels=[${(vals || []).join(",")}]`);
      } else {
        fail("zcode bunny", `image=${image} levels=${JSON.stringify(vals)}`);
      }
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(doc);
  if (!found) fail("zcode bunny missing");
}

console.log(failures ? `\nRESULT: ${failures} failure(s)` : "\nRESULT: bunny config OK");
process.exit(failures ? 1 : 0);