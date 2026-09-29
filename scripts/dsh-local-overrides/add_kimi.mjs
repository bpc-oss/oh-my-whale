import path from "node:path";
// --- oh-my-whale templating shim: {{DSH_HOME}} / {{USERPROFILE}} are rendered at runtime ---
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
const __H = homedir().replace(/\\/g, "/");
const __T = (s) => s.replace("{{DSH_HOME}}", __H + "/.dsh").replace("{{USERPROFILE}}", __H);
import fs from "fs";

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const APPLY = process.argv.includes("--apply");
const CFG = "__T({{USERPROFILE}}/.kimi-code/config.toml)";
const ZCODE = "__T({{USERPROFILE}}/.zcode/v2/provider_config.json)";

// resolve the commandcode API key from the existing zcode provider config
const walk = (n) => {
  const out = [];
  if (n && typeof n === "object") {
    if (n.providerName && n.config && typeof n.config === "object") out.push(n);
    for (const v of Object.values(n)) out.push(...walk(v));
  }
  return out;
};
const cc = walk(JSON.parse(fs.readFileSync(ZCODE, "utf8"))).find((p) => p.providerName === "commandcode");
const key = cc.config.access.apiKey;
const baseUrl = cc.config.api.baseUrl.replace(/\/+$/, "");

const src = fs.readFileSync(CFG, "utf8");
if (src.includes("space-bunny-alpha")) {
  console.log("already configured (skip)");
  process.exit(0);
}

const lines = src.split(/\r?\n/);
const iProviders = lines.findIndex((l) => /^\[models\./.test(l));
const iThinking = lines.findIndex((l) => /^\[thinking\]/.test(l));
if (iProviders < 0 || iThinking < 0) throw new Error("anchors not found");

const providerBlock = [
  "",
  "[providers.commandcode]",
  'type = "openai"',
  `api_key = "${key}"`,
  `base_url = "${baseUrl}"`,
];
const modelBlock = [
  "",
  '[models."commandcode/space-bunny-alpha"]',
  'provider = "commandcode"',
  'model = "stealth/space-bunny-alpha"',
  "max_context_size = 1000000",
  "max_output_size = 128000",
  'capabilities = [ "thinking", "tool_use", "vision" ]',
  'display_name = "Space Bunny Alpha (CommandCode)"',
  'reasoning_key = "reasoning"',
  'support_efforts = [ "low", "medium", "high", "xhigh", "max" ]',
];

const withProvider = [...lines.slice(0, iProviders), ...providerBlock, ...lines.slice(iProviders)];
const jThinking = withProvider.findIndex((l) => /^\[thinking\]/.test(l));
const out = [...withProvider.slice(0, jThinking), ...modelBlock, ...withProvider.slice(jThinking)].join("\n");

if (APPLY) {
  fs.copyFileSync(CFG, `${CFG}.bak-bunny-${stamp}`);
  fs.writeFileSync(CFG, out);
}
console.log(`${APPLY ? "APPLIED" : "DRY RUN"} | provider inserted at line ${iProviders + 1}, model at line ${jThinking + 1} | bytes ${Buffer.byteLength(src)}->${Buffer.byteLength(out)}`);
console.log("--- inserted ---");
console.log([...providerBlock.filter((l) => l && !l.startsWith("api_key")), ...modelBlock].join("\n"));
