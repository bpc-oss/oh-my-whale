import fs from "fs";
import path from "path";

const HOME = process.env.DSH_HOME || "C:\\Users\\Administrator\\.dsh";
const APPLY = process.argv.includes("--apply");
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const log = [];
const bk = (file) => {
  if (APPLY) fs.copyFileSync(file, `${file}.bak-vision-native-${stamp}`);
};

const NEW_BLOCK = `/**
 * Native DSH image reader. \`read_image\` returns the image (or video) itself,
 * so the model looks at a picture with its own multimodal input instead of
 * delegating to an external vision service. Kept resident because looking at
 * an image is a first-class step, not a rare detour.
 */
const RESIDENT_VISION_TOOLS = ['read_image']`;

// ---------- 1. presets: swap the dead 10-name list for read_image -----------
const presetsDir = path.join(HOME, ".agent-presets");
for (const entry of fs.readdirSync(presetsDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
  const file = path.join(presetsDir, entry.name, "tool-bootstrap.mjs");
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("RESIDENT_VISION_TOOLS")) continue;
  if (src.includes("const RESIDENT_VISION_TOOLS = ['read_image']")) {
    log.push(`  [preset] ${entry.name}: already native (skip)`);
    continue;
  }
  const startMarker = /\/\*\*\r?\n \* Native vision tools[^\n]*\r?\n/.exec(src);
  if (!startMarker) { log.push(`  [preset] ${entry.name}: comment marker not found (skip)`); continue; }
  const start = startMarker.index;
  const arrStart = src.indexOf("const RESIDENT_VISION_TOOLS = [", start);
  const arrEnd = src.indexOf("\n]", arrStart);
  if (arrStart < 0 || arrEnd < 0) { log.push(`  [preset] ${entry.name}: array end not found (skip)`); continue; }
  const oldBlock = src.slice(start, arrEnd + 2).replace(/\n$/, "");
  const out = src.slice(0, start) + NEW_BLOCK + src.slice(arrEnd + 2);
  bk(file);
  if (APPLY) fs.writeFileSync(file, out);
  log.push(`  [preset] ${entry.name}/tool-bootstrap.mjs: replaced ${oldBlock.split(/\r?\n/).length} lines with 8 | bytes ${Buffer.byteLength(src)}->${Buffer.byteLength(out)} | still uses RESIDENT_VISION_TOOLS: ${out.includes("...RESIDENT_VISION_TOOLS.filter(")}`);
}

// ---------- 2. web profile: comment out the toolkit config row -------------
{
  const file = path.join(HOME, "profiles", "web", "cordis.patch.yml");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => /^- id: vision-toolkit\s*$/.test(l));
  if (start < 0) log.push("  [profile] cordis.patch.yml: row already disabled (skip)");
  else {
    let end = start + 1;
    while (end < lines.length && (/^\s/.test(lines[end]) || lines[end].trim() === "")) end++;
    const removed = lines.slice(start, end);
    bk(file);
    const block = [
      "# 2026-09-29 卸载遗留外部视觉工具链（改用原生 read_image）。回滚=去掉下面每行的 '# ' 前缀。",
      ...removed.map((l) => (l.trim() === "" ? "#" : `# ${l}`)),
    ];
    if (APPLY) fs.writeFileSync(file, [...lines.slice(0, start), ...block, ...lines.slice(end)].join("\n"));
    log.push(`  [profile] cordis.patch.yml: commented lines ${start + 1}-${end} (${removed.length}) | first='${removed[0]}' last='${removed[removed.length - 1]}'`);
  }
}

// ---------- 3. web profile: drop the bundle + dependency ------------------
{
  const file = path.join(HOME, "profiles", "web", "package.json");
  const before = fs.readFileSync(file, "utf8");
  let src = before
    .replace(/^\s*"@dsh-external\/dsh-vision-toolkit":\s*"[^"]*",?\r?\n/m, "")
    .replace(/^\s*"@dsh-external\/dsh-vision-toolkit",\r?\n/m, "");
  JSON.parse(src);
  if (src !== before) { bk(file); if (APPLY) fs.writeFileSync(file, src); }
  log.push(`  [profile] package.json: dep=${/"@dsh-external\/dsh-vision-toolkit":/.test(src) ? "PRESENT" : "removed"} bundle=${src.includes('"@dsh-external/dsh-vision-toolkit",') ? "PRESENT" : "removed"} valid-JSON=ok bytes ${Buffer.byteLength(before)}->${Buffer.byteLength(src)}`);
}

// ---------- 4. autoprompt: residentTools ---------------------------------
{
  const file = path.join(presetsDir, "autoprompt", "agent.cordis.yml");
  const src = fs.readFileSync(file, "utf8");
  const re = /^(\s*)- vision_(?:glance|ground|detect|crop|long_screenshot_ocr|extract_foreground|dominant_colors|html_screenshot|pixel_diff|trace)\s*$\r?\n/gm;
  const n = (src.match(re) || []).length;
  let out = src.replace(re, "");
  if (!/^\s*- read_image\s*$/m.test(out)) out = out.replace(/^(\s*)- job_list\s*$/m, "$1- job_list\n$1- read_image");
  const changed = out !== src;
  if (changed) { bk(file); if (APPLY) fs.writeFileSync(file, out); }
  log.push(`  [preset] autoprompt/agent.cordis.yml: removed ${n} vision_* entries, read_image present=${/^\s*- read_image\s*$/m.test(out)} | bytes ${Buffer.byteLength(src)}->${Buffer.byteLength(out)}`);
}

console.log(APPLY ? `=== APPLIED (backup suffix .bak-vision-native-${stamp}) ===` : "=== DRY RUN (pass --apply) ===");
console.log(log.join("\n"));
