import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const home = os.homedir();
const dsh = path.join(home, ".dsh");
const zcode = path.join(home, ".zcode", "v2", "provider_config.json");
const yamlTargets = [
  path.join(dsh, "profiles", "web", "cordis.patch.yml"),
  path.join(dsh, "settings.yaml"),
].filter((f) => fs.existsSync(f));

const log = [];
const wantedReasoning = ["low", "medium", "high", "xhigh", "max"];

function backup(file) {
  if (APPLY) fs.copyFileSync(file, `${file}.bak-bunny-${stamp}`);
}

function ensureBunnyYaml(file) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*-\s+id:\s*stealth\/space-bunny-alpha\s*$/.test(l));
  if (at < 0) {
    log.push(`  [yaml] ${file}: bunny model absent (skip)`);
    return;
  }
  const indent = (lines[at].match(/^\s*/) || [""])[0];
  const nextModel = lines.findIndex((l, i) => i > at && new RegExp(`^${indent}-\\s+id:`).test(l));
  const end = nextModel < 0 ? lines.length : nextModel;
  const block = lines.slice(at, end).join("\n");
  if (/\binput:\s*\n\s*-\s*text\s*\n\s*-\s*image/.test(block) && /\breasoningEfforts:/.test(block)) {
    log.push(`  [yaml] ${file}: bunny input+reasoning already present`);
    return;
  }
  const contextLine = lines.findIndex((l, i) => i > at && i < end && /^\s*contextWindow:/.test(l));
  if (contextLine < 0) {
    log.push(`  [yaml] ${file}: contextWindow anchor absent (skip)`);
    return;
  }
  const child = `${indent}  `;
  const insert = [];
  if (!/\binput:/.test(block)) insert.push(`${child}input:`, `${child}  - text`, `${child}  - image`);
  if (!/\breasoningEfforts:/.test(block)) insert.push(`${child}reasoningEfforts:`, `${child}  low: low`, `${child}  high: high`, `${child}  max: max`);
  const out = [...lines.slice(0, contextLine + 1), ...insert, ...lines.slice(contextLine + 1)].join("\n");
  if (APPLY) { backup(file); fs.writeFileSync(file, out); }
  log.push(`  [yaml] ${file}: inserted ${insert.length} line(s)`);
}

function walk(node, hit) {
  if (!node || typeof node !== "object") return;
  if (node.modelId === "stealth/space-bunny-alpha") hit(node);
  for (const v of Object.values(node)) walk(v, hit);
}

function ensureZcode(file) {
  if (!fs.existsSync(file)) { log.push(`  [zcode] ${file}: absent (skip)`); return; }
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  let found = 0;
  walk(doc, (m) => {
    found++;
    m.config ??= {};
    m.config.properties ??= {};
    m.config.properties.inputFormat ??= {};
    m.config.properties.inputFormat.supportsImage = true;
    m.config.optionSpecs ??= {};
    m.config.optionSpecs.reasoningLevel ??= {};
    m.config.optionSpecs.reasoningLevel.values = wantedReasoning;
  });
  if (!found) { log.push(`  [zcode] ${file}: bunny model absent (skip)`); return; }
  if (APPLY) { backup(file); fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`); }
  log.push(`  [zcode] ${file}: ${found} bunny row(s) normalized`);
}

for (const f of yamlTargets) ensureBunnyYaml(f);
ensureZcode(zcode);
console.log(APPLY ? `=== APPLIED (backups .bak-bunny-${stamp}) ===` : "=== DRY RUN (use --apply to write) ===");
console.log(log.join("\n"));