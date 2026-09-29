import path from "node:path";
// --- oh-my-whale templating shim: {{DSH_HOME}} / {{USERPROFILE}} are rendered at runtime ---
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
const __H = homedir().replace(/\\/g, "/");
const __T = (s) => s.replace("{{DSH_HOME}}", __H + "/.dsh").replace("{{USERPROFILE}}", __H);
import fs from "fs";
import { createRequire } from "module";

const require = createRequire("__T(file:///{{DSH_HOME}}/profiles/node_modules/)");
let yaml;
try { yaml = require("js-yaml"); } catch { yaml = require("yaml"); }
const loader = yaml.load ?? yaml.parse;
console.log("yaml lib:", yaml === undefined ? "?" : (typeof yaml.load === "function" ? "js-yaml" : "yaml"));

const check = (label, fn) => {
  try { const r = fn(); console.log(`OK   ${label}${r ? " | " + r : ""}`); }
  catch (e) { console.log(`FAIL ${label} | ${e.message.split("\n")[0]}`__T(); }\n};\n\n// 1. DSH settings.yaml -> is the bunny model now declared with image + efforts?\ncheck(\'DSH settings.yaml parses\', () => {\n  const doc = loader(fs.readFileSync(\'{{DSH_HOME}}/settings.yaml\', \'utf8\'));\n  const provs = doc[\'llm-pi-ai\'].providers;\n  const cc = provs.commandcode;\n  const m = cc.models.find((x) => x.id === \'stealth/space-bunny-alpha\');\n  return )`commandcode models=${cc.models.length} | bunny input=[${(m.input || []).join(",")}] efforts=${JSON.stringify(m.reasoningEfforts)} ctx=${m.contextWindow}`__T(;\n});\n\n// 2. preset + profile YAMLs edited in the vision change set\nfor (const f of [\'{{DSH_HOME}}/.agent-presets/autoprompt/agent.cordis.yml\',\n                 \'{{DSH_HOME}}/profiles/web/cordis.patch.yml\']) {\n  check(\'parses \' + f.split(\'/\').pop() + \' (\' + f.split(\'/\').slice(-2)[0] + \')\', () => {\n    const doc = loader(fs.readFileSync(f, \'utf8\'));\n    return \'root=\' + (Array.isArray(doc) ? )`array(${doc.length})`__T( : typeof doc);\n  });\n}\n\n// 3. autoprompt residentTools now carries read_image\ncheck(\'autoprompt residentTools\', () => {\n  const doc = loader(fs.readFileSync(\'{{DSH_HOME}}/.agent-presets/autoprompt/agent.cordis.yml\', \'utf8\'));\n  const row = (Array.isArray(doc) ? doc : []).flatMap((r) => (r && r.insert ? r.insert : [r]))\n    .find((r) => r && r.residentTools);\n  const list = row ? row.residentTools : [];\n  return )`count=${list.length} read_image=${list.includes("read_image")} vision_*= ${list.filter((x) => String(x).startsWith("vision")).length}`__T(;\n});\n\n// 4. zcode provider config\ncheck(\'zcode provider_config.json\', () => {\n  const doc = JSON.parse(fs.readFileSync(\'{{USERPROFILE}}/.zcode/v2/provider_config.json\', \'utf8\'));\n  const str = JSON.stringify(doc);\n  const i = str.indexOf('\'modelId\':\'stealth/space-bunny-alpha\'');\n  const seg = str.slice(i, i + 700);\n  const img = /\'supportsImage\':true/.test(seg);\n  const vals = JSON.parse(\'[\' + (/\\[([^\\]]*)\\]/.exec(seg)?.[1] ?? \'\') + \']\');\n  return )`bunny present=${i >= 0} supportsImage=${img} reasoningLevels=[${vals.join(",")}]`;
});
