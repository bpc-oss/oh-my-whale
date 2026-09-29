import path from "node:path";
// --- oh-my-whale templating shim: {{DSH_HOME}} / {{USERPROFILE}} are rendered at runtime ---
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
const __H = homedir().replace(/\\/g, "/");
const __T = (s) => s.replace("{{DSH_HOME}}", __H + "/.dsh").replace("{{USERPROFILE}}", __H);
import fs from "fs";
import { createRequire } from "module";

const require = createRequire("__T(file:///{{DSH_HOME}}/profiles/node_modules/)");
const yaml = require("js-yaml");

const files = [
  "__T({{DSH_HOME}}/.agent-presets/autoprompt/agent.cordis.yml)",
  "__T({{DSH_HOME}}/profiles/web/cordis.patch.yml)",
];

for (const f of files) {
  const raw = fs.readFileSync(f, "utf8").replace(/!!js\/[A-Za-z]+/g, "null");
  try {
    const d = yaml.load(raw);
    const rows = Array.isArray(d) ? d.length : Object.keys(d || {}).length;
    console.log(`OK   ${f} | rows=${rows} (${Array.isArray(d) ? "array" : "map"})`);
  } catch (e) {
    console.log(`FAIL ${f} | ${e.message.split("\n")[0]}`);
  }
}

// residentTools sanity on the parsed doc
const doc = yaml.load(fs.readFileSync(files[0], "utf8").replace(/!!js\/[A-Za-z]+/g, "null"));
const all = (Array.isArray(doc) ? doc : []).flatMap((r) => (r && r.insert ? r.insert : [r])).filter(Boolean);
const row = all.find((r) => r.residentTools);
console.log("residentTools:", row ? `count=${row.residentTools.length} read_image=${row.residentTools.includes("read_image")} vision_*=${row.residentTools.filter((x) => String(x).startsWith("vision")).length}` : "row not found");

// the commented vision-toolkit row must NOT be an active row any more
const web = yaml.load(fs.readFileSync(files[1], "utf8").replace(/!!js\/[A-Za-z]+/g, "null"));
const webAll = (Array.isArray(web) ? web : []).flatMap((r) => (r && r.insert ? r.insert : [r])).filter(Boolean);
console.log("web patch active rows:", webAll.length, "| vision-toolkit active:", webAll.some((r) => r.id === "vision-toolkit"));
