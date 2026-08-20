// verify.mjs — plugin-gateway 主入口：静态检查 + 报告 + 退出码
// 用法：node verify.mjs <plugin-dir> [--strict]
// 退出码：0 = APPROVED（或 WARNING 且非 strict）；1 = FAIL/ERROR；2 = 用法错误
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runStaticChecks } from "./static-checks.mjs";

const GATEWAY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS_DIR = join(GATEWAY_ROOT, "reports");
const GATEWAY_VERSION = "1.0.0";

function usage() {
  console.log("Usage: node verify.mjs <plugin-dir> [--strict]");
  console.log("  --strict   any WARNING blocks approval (manual review required)");
  process.exit(2);
}

function readPkg(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const dirArg = args.find((a) => !a.startsWith("--"));
  if (!dirArg) usage();
  const dir = resolve(dirArg);
  if (!existsSync(join(dir, "package.json"))) {
    console.error(`ERROR: no package.json in ${dir}`);
    process.exit(1);
  }

  const pkg = readPkg(dir);
  const checks = runStaticChecks(dir);

  const fails = checks.filter((c) => c.result === "FAIL" || c.result === "ERROR");
  const warnings = checks.filter((c) => c.result === "WARNING");
  const approved = fails.length === 0 && (!strict || warnings.length === 0);
  const verdict = fails.length > 0 ? "REJECTED" : strict && warnings.length > 0 ? "NEEDS_REVIEW" : "APPROVED";

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19) + "-" + String(process.pid);
  const name = pkg?.name || dir.split(/[\\/]/).pop();
  const report = {
    gatewayVersion: GATEWAY_VERSION,
    plugin: name,
    version: pkg?.version ?? "unknown",
    source: dir,
    verifiedAt: now.toISOString(),
    strict,
    checks,
    summary: { total: checks.length, pass: checks.filter((c) => c.result === "PASS").length, warning: warnings.length, fail: fails.length },
    verdict,
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportName = `${stamp}-${name.replace(/[^a-z0-9.-]/gi, "-")}.json`;
  const reportPath = join(REPORTS_DIR, reportName);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  // console output
  console.log(`\n=== plugin-gateway v${GATEWAY_VERSION} ===`);
  console.log(`plugin:   ${report.plugin}@${report.version}`);
  console.log(`source:   ${dir}`);
  console.log(`verified: ${report.verifiedAt}${strict ? " (strict)" : ""}`);
  console.log("");
  for (const c of checks) {
    const mark = c.result === "PASS" ? "PASS    " : c.result === "WARNING" ? "WARNING " : "FAIL    ";
    console.log(`  [${mark}] #${c.id} ${c.name}`);
    console.log(`         ${c.evidence}`);
  }
  console.log("");
  console.log(`verdict:  ${verdict}  (${report.summary.pass}P/${report.summary.warning}W/${report.summary.fail}F)`);
  console.log(`report:   ${reportPath}`);
  console.log("");

  process.exit(approved ? 0 : 1);
}

main();
