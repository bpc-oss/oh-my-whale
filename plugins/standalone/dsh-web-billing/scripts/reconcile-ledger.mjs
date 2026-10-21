#!/usr/bin/env node
/**
 * 独立账本对账工具：从 DSH 会话源重建 billing 账本（非破坏性）。
 *
 * 用途：当 reprice 曾用裁剪明细重建导致历史丢失时，用会话源（session.jsonl.zstd
 * 多帧 zstd）完整重放事件重建账本。产出的文件为 <out> 与 <out 前缀>-detail.json，
 * 默认不覆盖现网账本（web-billing.json）。
 *
 * 与插件内置 POST /billing/reconcile 等价：同一套扫描/重放/计价/冻结代码
 * （lib/reconcile.js 复用插件本体逻辑，价格与现网一致）。
 *
 * 用法：
 *   node scripts/reconcile-ledger.mjs                        # 默认路径
 *   node scripts/reconcile-ledger.mjs --swap                 # 备份后替换现网账本（建议 DSH 已停止时用）
 *   node scripts/reconcile-ledger.mjs --out X.json --detail Y.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { BillingLedger } from "../lib/index.js";
import { OFFICIAL_PRICING_POLICIES, priceAt, ledgerIntegrity } from "../lib/pricing.js";
import { CODING_PLAN_SOURCE } from "../lib/coding-plans.js";
import { buildReconciledLedger, defaultSessionRoots } from "../lib/reconcile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`dsh-web-billing ${pkg.version} reconcile
  --out <file>      输出账本路径（默认 <DSH_HOME>/storages/web-billing.reconcile.json）
  --detail <file>   现网明细文件（提供已记录会话集；默认 web-billing-detail.json）
  --store <dir>     会话源根（默认 <DSH_HOME>/sessions；可与 --archive 并存）
  --archive <dir>   归档会话源根（默认 <DSH_HOME>/sessions-archive）
  --metering <file> 运行时收费形式（默认 web-billing-metering.json）
  --freeze <n>      冻结窗口天数（默认 7，0=不冻结）
  --swap            备份后把重建结果替换现网账本（web-billing.json + -detail.json）
  --help`);
  process.exit(0);
}

const home = dshHomePath();
const out = arg("--out", path.join(home, "storages", "web-billing.reconcile.json"));
const detailPath = arg("--detail", path.join(home, "storages", "web-billing-detail.json"));
const meteringFile = arg("--metering", path.join(home, "storages", "web-billing-metering.json"));
const freezeDays = Number(arg("--freeze", "7"));
const swap = process.argv.includes("--swap");

const config = {
  currency: "CNY", symbol: "¥", symbolUsd: "$", displayCurrency: "auto",
  timezone: "Asia/Shanghai", peakWindows: [[9, 12], [14, 18]], officialPricing: "auto",
  prices: {}, usdPrices: {}, localProviders: [], localCostPerM: 0, metering: {},
  codingUsdCnyRate: 7.2, policyOverrides: [],
  maxRecent: 20000, maxMessagesPerSession: 500, detailWriteIntervalMs: 60000,
  freezeWindowDays: freezeDays,
  persistPath: out
};
let metering = {};
try { metering = JSON.parse(fs.readFileSync(meteringFile, "utf8")); } catch { metering = {}; }
const pricing = {
  hash: JSON.stringify({
    officialPricing: config.officialPricing, timezone: config.timezone,
    peakWindows: config.peakWindows, prices: config.prices, usdPrices: config.usdPrices,
    policyOverrides: config.policyOverrides, localProviders: config.localProviders,
    localCostPerM: config.localCostPerM, metering, codingUsdCnyRate: config.codingUsdCnyRate,
    codingPlanSource: CODING_PLAN_SOURCE
  }),
  localProviders: config.localProviders,
  localCostPerM: config.localCostPerM,
  metering,
  codingUsdCnyRate: config.codingUsdCnyRate,
  at: (model, time, provider) => priceAt(model, time, {
    official: true, prices: {},
    timezone: config.timezone, peakWindows: config.peakWindows,
    policies: OFFICIAL_PRICING_POLICIES, provider, codingUsdCnyRate: config.codingUsdCnyRate
  })
};

let ids;
try {
  const detail = JSON.parse(fs.readFileSync(detailPath, "utf8"));
  ids = new Set(Object.keys(detail.sessions ?? {}));
  console.log(`[reconcile] live recorded sessions: ${ids.size}`);
} catch {
  console.warn("[reconcile] detail not readable; scanning ALL session files (may include other profiles)");
}

const roots = [arg("--store", path.join(home, "sessions")), arg("--archive", path.join(home, "sessions-archive"))].filter((r, i, a) => r && a.indexOf(r) === i);

const t0 = Date.now();
const { ledger, stats } = await buildReconciledLedger({ ids, config, pricing, roots, rebuildPath: out });
const integrity = ledgerIntegrity(ledger);
console.log(`[reconcile] files scanned: ${stats.filesScanned} | live-session subset: ${stats.sessionsScanned} | usage events: ${stats.usageEvents} | deduped: ${stats.deduped}`);
console.log(`[reconcile] totals: calls=${ledger.totals.calls} cost=${ledger.totals.cost.toFixed(4)} savings=${ledger.totals.savings.toFixed(2)}`);
console.log(`[reconcile] integrity ok=${integrity.ok} checks=${integrity.checks.map((x) => `${x.key}:${x.ok}`).join(",")}`);
await ledger.dispose();
console.log(`[reconcile] written: ${out} (+ -detail.json) in ${Date.now() - t0}ms`);

if (swap) {
  const live = path.join(home, "storages", "web-billing.json");
  const liveDetail = path.join(home, "storages", "web-billing-detail.json");
  const outDetail = `${out.slice(0, out.lastIndexOf("."))}-detail.json`;
  for (const f of [live, liveDetail]) {
    if (fs.existsSync(f)) fs.copyFileSync(f, `${f}.bak-reconcile`);
  }
  fs.copyFileSync(out, live);
  fs.copyFileSync(outDetail, liveDetail);
  console.log(`[reconcile] swapped into live paths (backups: *.bak-reconcile)`);
}
