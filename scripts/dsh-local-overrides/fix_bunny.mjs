import path from "node:path";
// --- oh-my-whale templating shim: {{DSH_HOME}} / {{USERPROFILE}} are rendered at runtime ---
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
const __H = homedir().replace(/\\/g, "/");
const __T = (s) => s.replace("{{DSH_HOME}}", __H + "/.dsh").replace("{{USERPROFILE}}", __H);
import fs from "fs";

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const APPLY = process.argv.includes("--apply");
const log = [];

// ---------- A. DSH settings.yaml: reasoning + vision for space-bunny-alpha ----
{
  const file = "__T({{DSH_HOME}}/settings.yaml)";
  const src = fs.readFileSync(file, "utf8");
  const oldBlock = [
    "        - id: stealth/space-bunny-alpha",
    "          name: Space Bunny Alpha",
    "          contextWindow: 1000000",
  ].join("\n");
  const newBlock = [
    "        - id: stealth/space-bunny-alpha",
    "          name: Space Bunny Alpha",
    "          contextWindow: 1000000",
    "          input:",
    "            - text",
    "            - image",
    "          reasoningEfforts:",
    "            low: low",
    "            high: high",
    "            max: max",
  ].join("\n");
  if (!src.includes(oldBlock)) {
    log.push("  [dsh] settings.yaml: anchor NOT found (already edited?) -> checking presence");
    log.push("  [dsh] has input for space-bunny: " + /space-bunny-alpha[\s\S]{0,200}?input:/.test(src));
  } else {
    if (APPLY) fs.copyFileSync(file, `${file}.bak-bunny-${stamp}`);
    const out = src.replace(oldBlock, newBlock);
    if (APPLY) fs.writeFileSync(file, out);
    log.push(`  [dsh] settings.yaml: added input[text,image] + reasoningEfforts{low,high,max} for stealth/space-bunny-alpha | bytes ${Buffer.byteLength(src)}->${Buffer.byteLength(out)}`__T();\n  }\n}\n\n// ---------- B. zcode: reasoning levels must be the provider-valid set --------\n{\n  const file = \'{{USERPROFILE}}/.zcode/v2/provider_config.json\';\n  const src = fs.readFileSync(file, \'utf8\');\n  const anchor = '\'modelId\': \'stealth/space-bunny-alpha\'';\n  const at = src.indexOf(anchor);\n  if (at < 0) { log.push(\'  [zcode] model anchor NOT found\'); }\n  else {\n    const rl = src.indexOf('\'reasoningLevel\'', at);\n    const vs = src.indexOf('\'values\'', rl);\n    const open = src.indexOf(\'[\', vs);\n    const close = src.indexOf(\']\', open);\n    const inside = src.slice(open + 1, close);\n    const current = [...inside.matchAll(/\'([^\']+)\'/g)].map((m) => m[1]);\n    const wanted = [\'low\', \'medium\', \'high\', \'xhigh\', \'max\'];\n    log.push()`  [zcode] line ${src.slice(0, vs).split("\n").length} | current values: [${current.join(", ")}]`);
    if (current.join(",") === wanted.join(",")) log.push("  [zcode] already the verified set (skip)");
    else {
      // rewrite the array textually, preserving the file's 2-space nesting
      const indent = (src.slice(0, open).match(/[ \t]*$/) ?? [""])[0];
      const inner = wanted.map((v) => `${indent}  "${v}"`).join(",\n");
      const out = src.slice(0, open + 1) + "\n" + inner + "\n" + indent + src.slice(close);
      JSON.parse(out);
      if (APPLY) fs.copyFileSync(file, `${file}.bak-bunny-${stamp}`);
      if (APPLY) fs.writeFileSync(file, out);
      log.push(`  [zcode] values -> [${wanted.join(", ")}] | bytes ${Buffer.byteLength(src)}->${Buffer.byteLength(out)} | JSON valid`);
    }
  }
}

console.log(APPLY ? `=== APPLIED (backups .bak-bunny-${stamp}) ===` : "=== DRY RUN ===");
console.log(log.join("\n"));
