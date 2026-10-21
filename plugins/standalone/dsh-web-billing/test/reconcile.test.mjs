/**
 * Reconcile (session-source ledger rebuild) regression tests.
 * Guards the data-recovery path: multi-frame zstd decode, replay pricing with
 * live semantics, frozen-day handling and in-place state swap.
 * Run: node --test test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import z from "node:zlib";
import { BillingLedger } from "../lib/index.js";
import { OFFICIAL_PRICING_POLICIES, priceAt } from "../lib/pricing.js";
import { buildReconciledLedger, swapLedgerState, decompressSessionLog } from "../lib/reconcile.js";

const OFFICIAL = { provider: "deepseek-official", model: "deepseek-v4-flash" };
const FREE = { provider: "openrouterfree", model: "stealth/ox-alpha" };

function eHeader(time) {
  return JSON.stringify({ type: "session", version: 0, id: "abc-1", createdAt: time });
}
function eRequestHeader(provider, model) {
  return JSON.stringify({ type: "request/header", seq: 1, time: 1, data: { header: { config: { provider, model } } } });
}
function eAssistant(seq, time, source, usage, id, fromHeaderOnly) {
  const msg = fromHeaderOnly
    ? { role: "assistant", content: [], id }
    : { role: "assistant", content: [], source, id };
  return JSON.stringify({
    type: "assistant/message",
    seq,
    time,
    data: { message: msg, usage }
  });
}
function eNoUsage(seq, time, source, id) {
  return JSON.stringify({ type: "assistant/message", seq, time, data: { message: { role: "assistant", source, id } } });
}
function zstdMultiFrame(parts) {
  return Buffer.concat(parts.map((p) => z.zstdCompressSync(Buffer.from(p))));
}

function testPricing() {
  return {
    metering: { openrouterfree: { mode: "free", monthly: 0 } },
    localProviders: [],
    localCostPerM: 0,
    codingUsdCnyRate: 7.2,
    at: (model, time, provider) => priceAt(model, time, {
      official: true,
      prices: {},
      timezone: "Asia/Shanghai",
      peakWindows: [[9, 12], [14, 18]],
      policies: OFFICIAL_PRICING_POLICIES,
      provider,
      codingUsdCnyRate: 7.2
    })
  };
}

const cfg = (dir) => ({
  persistPath: join(dir, "ledger.json"),
  maxRecent: 5000,
  maxMessagesPerSession: 500,
  detailWriteIntervalMs: 60000,
  freezeWindowDays: 7
});

/** 今天 13:00（off-peak）与今天 10:00（peak）的毫秒时间戳；相对今天构造，避免冻结干扰。 */
function times() {
  const now = new Date();
  const at = (h) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0).getTime();
  return { offPeak: at(13), peak: at(10), today: now.getTime() };
}

test("decompressSessionLog decodes multi-frame private zstd (concatenated frames)", async () => {
  const t = times();
  const buf = zstdMultiFrame([
    eHeader(t.today) + "\n",
    JSON.stringify({ type: "turn/start", seq: 0, time: t.today }) + "\n",
    JSON.stringify({ type: "assistant/chunk", seq: 2, time: t.today }) + "\n"
  ]);
  const out = decompressSessionLog(buf).toString("utf8");
  assert.match(out, /"type":"session"/);
  assert.match(out, /"type":"turn\/start"/);
  assert.match(out, /"type":"assistant\/chunk"/);
});

test("buildReconciledLedger replays source events into fresh ledger with live pricing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "billing-reconcile-"));
  try {
    const t = times();
    const store = join(dir, "sessions");
    const arc = join(dir, "archive");
    await Promise.all([
      mkdir(join(store, "rootA", "session-aaa-1"), { recursive: true }),
      mkdir(join(arc, "rootB", "session-aaa-2"), { recursive: true })
    ]);
    // 会话 1：多帧 zstd（header+header-event 一帧，两条 assistant/message 一帧）
    const body = [
      eHeader(t.today) + "\n",
      eRequestHeader(OFFICIAL.provider, OFFICIAL.model) + "\n",
      eAssistant(10, t.offPeak, OFFICIAL, { inputTokens: 1000, cacheReadTokens: 0, outputTokens: 50 }, "m1") + "\n",
      eAssistant(20, t.offPeak, FREE, { inputTokens: 2000, cacheReadTokens: 0, outputTokens: 20 }, "m2") + "\n",
      eNoUsage(30, t.offPeak, OFFICIAL, "m3") + "\n"
    ];
    await writeFile(join(store, "rootA", "session-aaa-1", "session.jsonl.zstd"), zstdMultiFrame([body.slice(0, 2).join(""), body.slice(2).join("")]));
    // 会话 2：纯文本 .jsonl（未压缩）+ source 缺失回退 request/header
    await writeFile(join(arc, "rootB", "session-aaa-2", "session.jsonl"),
      eHeader(t.today) + "\n" +
      eRequestHeader("bai", "deepseek-v4-flash") + "\n" +
      eAssistant(10, t.peak, null, { inputTokens: 500, cacheReadTokens: 100, outputTokens: 10 }, "m1", true) + "\n");
    // 会话 3：不在 live 集 → 必须被排除
    await mkdir(join(store, "rootA", "session-bbb-9"), { recursive: true });
    await writeFile(join(store, "rootA", "session-bbb-9", "session.jsonl"),
      eHeader(t.today) + "\n" +
      eAssistant(10, t.peak, OFFICIAL, { inputTokens: 999999, cacheReadTokens: 0, outputTokens: 5 }, "m1") + "\n");

    const ids = new Set(["session-aaa-1", "session-aaa-2"]);
    const { ledger, stats } = await buildReconciledLedger({
      ids,
      config: cfg(dir),
      pricing: testPricing(),
      roots: [store, arc]
    });

    assert.equal(stats.filesScanned, 3, "scans all files under both roots");
    assert.equal(stats.sessionsScanned, 2, "only live-id sessions replayed");
    assert.equal(stats.usageEvents, 3, "2 + 1 usage events (no-usage excluded)");
    // 重建期间防抖写只落在临时路径，绝不能触碰现网账本路径
    assert.equal(fs.existsSync(join(dir, "ledger.json")), false, "live ledger path untouched during rebuild");
    assert.equal(ledger.totals.calls, 3, "three billable messages");
    assert.ok(ledger.totals.cost > 0, "official message costs money");
    // off-peak 13:00: input 1.5 + cacheRead 0.05 + output 4.5 (CNY/1M)
    const expected = (1000 * 1.5 + 0 * 0.05 + 50 * 4.5) / 1e6;
    const officialPm = ledger.byProviderModel.get(`deepseek-official\u0000deepseek-v4-flash`);
    assert.ok(Math.abs((officialPm?.cost ?? 0) - 0.001725) < 1e-9, `official cost ~0.001725, got ${officialPm?.cost}`);
    // bai (10:00 peak: input 3 / cacheRead 0.1 / output 9) + official = total
    const expectedTotal = expected + (500 * 3 + 100 * 0.1 + 10 * 9) / 1e6;
    assert.ok(Math.abs(ledger.totals.cost - expectedTotal) < 1e-9, `total cost ~0.003325, got ${ledger.totals.cost}`);
    // free provider: zero cost + positive savings
    const bpm = ledger.byProviderModel.get(`openrouterfree\x00${FREE.model}`);
    assert.ok(bpm && bpm.calls === 1 && bpm.cost === 0 && bpm.savings > 0, "free provider zero cost, savings>0");
    // header fallback session priced as bai usage-free? bai not in metering → usage → cost>0
    const bai = ledger.byProvider.get("bai");
    assert.ok(bai && bai.calls === 1, "header-fallback provider recorded");
    assert.equal(ledger.byProvider.get("deepseek-official").calls, 1);
    // bySession got both sessions
    assert.equal([...ledger.bySession.keys()].sort().join(","), "session-aaa-1,session-aaa-2");
    await ledger.dispose().catch(() => {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("swapLedgerState replaces live ledger with rebuilt state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "billing-reconcile-swap-"));
  try {
    const t = times();
    const store = join(dir, "sessions");
    await mkdir(join(store, "rootA", "session-aaa-1"), { recursive: true });
    await writeFile(join(store, "rootA", "session-aaa-1", "session.jsonl.zstd"),
      zstdMultiFrame([eHeader(t.today) + "\n", eAssistant(10, t.offPeak, OFFICIAL, { inputTokens: 100, cacheReadTokens: 0, outputTokens: 10 }, "m1") + "\n"]));
    const cfgd = cfg(dir);
    const target = new BillingLedger(cfgd.persistPath + ".live", 5000, 500, 60000, 7);
    // live ledger 已有一条垃圾记录（模拟 reprice 丢失前的现场）
    target.record({ sessionId: "session-zzz-0", messageId: "g1", seq: 1, time: t.today, provider: "bai", model: "deepseek-v4-flash", ...target.price("deepseek-v4-flash", "bai", t.today, { inputTokens: 1, cacheReadTokens: 0, outputTokens: 1 }, testPricing()) });
    target.record({ sessionId: "session-zzz-0", messageId: "g2", seq: 2, time: t.today, provider: "bai", model: "deepseek-v4-flash", ...target.price("deepseek-v4-flash", "bai", t.today, { inputTokens: 1, cacheReadTokens: 0, outputTokens: 1 }, testPricing()) });
    const beforeCalls = target.totals.calls;
    const { ledger: rebuilt } = await buildReconciledLedger({
      ids: new Set(["session-aaa-1"]),
      config: cfgd,
      pricing: testPricing(),
      roots: [store]
    });
    swapLedgerState(target, rebuilt);
    assert.equal(target.totals.calls, 1, "swapped: rebuilt totals replace live");
    assert.equal(target.bySession.has("session-zzz-0"), false, "swapped: garbage session gone");
    assert.equal(target.bySession.has("session-aaa-1"), true);
    assert.notEqual(target.totals.calls, beforeCalls);
    await Promise.all([target.dispose().catch(() => {}), rebuilt.dispose().catch(() => {})]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reconcile freezes days older than cutoff after bulk replay (no totals drift)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "billing-reconcile-freeze-"));
  try {
    // 10 天前 → 必然进入冻结区
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const oldTime = new Date(old.getFullYear(), old.getMonth(), old.getDate(), 13, 0, 0).getTime();
    const store = join(dir, "sessions");
    await mkdir(join(store, "rootA", "session-aaa-1"), { recursive: true });
    await writeFile(join(store, "rootA", "session-aaa-1", "session.jsonl.zstd"),
      zstdMultiFrame([eHeader(oldTime) + "\n", eAssistant(10, oldTime, OFFICIAL, { inputTokens: 100, cacheReadTokens: 0, outputTokens: 10 }, "m1") + "\n"]));
    const { ledger } = await buildReconciledLedger({
      ids: new Set(["session-aaa-1"]),
      config: cfg(dir),
      pricing: testPricing(),
      roots: [store]
    });
    assert.equal(ledger.frozenDays.size, 1, "old day frozen");
    assert.equal(ledger.byDay.size, 0, "frozen day removed from active byDay");
    // totals 为活跃区（减掉了冻结天）；byProvider 是历史累计（含冻结天）
    assert.equal(ledger.totals.calls, 0, "totals is active-window only after freeze");
    assert.equal(ledger.byProvider.get("deepseek-official").calls, 1, "byProvider keeps all-time counts");
    await ledger.dispose().catch(() => {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reconcileInPlace refuses to swap an empty/regressed rebuild over a live ledger", async () => {
  const { reconcileInPlace } = await import("../lib/reconcile.js");
  const dir = await mkdtemp(join(tmpdir(), "billing-reconcile-guard-"));
  const cfgd = cfg(dir);
  const live = new BillingLedger(cfgd.persistPath + ".live", 5000, 500, 60000, 7);
  const t = times();
  for (let i = 1; i <= 12; i++) {
    live.record({ sessionId: "session-aaa-1", messageId: "m" + i, seq: i, time: t.today, provider: "deepseek-official", model: "deepseek-v4-flash", ...live.price("deepseek-v4-flash", "deepseek-official", t.today, { inputTokens: 100, cacheReadTokens: 0, outputTokens: 50 }, testPricing()) });
  }
  // ids 指向一个不存在于 store 的会话 → 重建 0 条 → 必须拒绝换入并保留 live 数据
  let threw = false;
  try {
    await reconcileInPlace(live, cfgd, testPricing(), { ids: new Set(["session-ghost-0"]), roots: [join(dir, "sessions")] });
  } catch (e) { threw = true; assert.match(e.message, /aborted/); }
  assert.equal(threw, true, "empty rebuild must abort instead of swapping");
  assert.equal(live.totals.calls, 12, "live ledger untouched after rejected swap");
  await live.dispose();
  await rm(dir, { recursive: true, force: true });
});

test("resolveReconcileIds falls back to disk detail + consensus session-set when memory set is empty", async () => {
  const { resolveReconcileIds, sessionSetPath } = await import("../lib/reconcile.js");
  const dir = await mkdtemp(join(tmpdir(), "billing-reconcile-ids-"));
  const cfgd = cfg(dir);
  // 共识文件：2 个历史会话（模拟 918 会话种子）
  await writeFile(sessionSetPath(cfgd.persistPath), JSON.stringify({ sessions: ["session-aaa-1", "session-aaa-2"] }), "utf8");
  // 磁盘 detail：1 个会话（模拟宿主空账本但 detail 有残留）
  const detailPath = cfgd.persistPath.slice(0, cfgd.persistPath.lastIndexOf(".")) + "-detail.json";
  await writeFile(detailPath, JSON.stringify({ sessions: { "session-bbb-3": { messages: {} } } }), "utf8");
  // 空内存 ledger
  const live = new BillingLedger(cfgd.persistPath + ".live", 5000, 500, 60000, 7);
  const ids = resolveReconcileIds({ liveLedger: live, config: cfgd });
  const arr = [...ids].sort();
  assert.deepEqual(arr, ["session-aaa-1", "session-aaa-2", "session-bbb-3"], "memory ∪ detail ∪ consensus set");
  await live.dispose();
  await rm(dir, { recursive: true, force: true });
});

test("reconcileInPlace persists the consensus session-set after a successful swap", async () => {
  const { readFile } = await import("node:fs/promises");
  const { reconcileInPlace, sessionSetPath } = await import("../lib/reconcile.js");
  const dir = await mkdtemp(join(tmpdir(), "billing-reconcile-set-"));
  const cfgd = cfg(dir);
  const store = join(dir, "sessions");
  await mkdir(join(store, "rootA", "session-aaa-1"), { recursive: true });
  await writeFile(join(store, "rootA", "session-aaa-1", "session.jsonl.zstd"), zstdMultiFrame([eHeader(times().today) + "\n", eAssistant(10, times().offPeak, OFFICIAL, { inputTokens: 100, cacheReadTokens: 0, outputTokens: 10 }, "m1") + "\n"]));
  const live = new BillingLedger(cfgd.persistPath + ".live", 5000, 500, 60000, 7);
  // live 里已有另一条（确保防呆允许 swap：rebuilt 1 > live 0? 需要 live>0 且 rebuilt>50%: 让 live=0 也可——0 条时防呆不触发）
  const res = await reconcileInPlace(live, cfgd, testPricing(), { ids: new Set(["session-aaa-1"]), roots: [store] });
  assert.equal(res.afterCalls, 1, "swapped in 1 call");
  const setFile = JSON.parse(await readFile(sessionSetPath(cfgd.persistPath), "utf8"));
  assert.ok(setFile.sessions.includes("session-aaa-1"), "consensus set persisted for next-boot reconcile");
  await live.dispose();
  await rm(dir, { recursive: true, force: true });
});

test("empty rebuild never overwrites an existing consensus session-set", async () => {
  const { readFile } = await import("node:fs/promises");
  const { reconcileInPlace, sessionSetPath } = await import("../lib/reconcile.js");
  const dir = await mkdtemp(join(tmpdir(), "billing-reconcile-setguard-"));
  const cfgd = cfg(dir);
  await writeFile(sessionSetPath(cfgd.persistPath), JSON.stringify({ sessions: ["session-known-1"] }), "utf8");
  const live = new BillingLedger(cfgd.persistPath + ".live", 5000, 500, 60000, 7);
  // 空 live + ids 指向不存在的会话 → rebuilt=0（before=0 不触发 >10 防呆）——共识必须原样保留
  await reconcileInPlace(live, cfgd, testPricing(), { ids: new Set(["session-ghost-0"]), roots: [join(dir, "sessions")] });
  const setFile = JSON.parse(await readFile(sessionSetPath(cfgd.persistPath), "utf8"));
  assert.deepEqual(setFile.sessions, ["session-known-1"], "existing consensus kept (never cleared by empty rebuild)");
  await live.dispose();
  await rm(dir, { recursive: true, force: true });
});

test("big session files are skipped (reconcileMaxFileMB) and counted in stats", async () => {
  const dir = await mkdtemp(join(tmpdir(), "billing-reconcile-big-"));
  const cfgd = cfg(dir);
  cfgd.reconcileMaxFileMB = 0.0001; // ~104B 阈值：fixture zstd 帧必然超限
  const store = join(dir, "sessions");
  await mkdir(join(store, "rootA", "session-aaa-1"), { recursive: true });
  await writeFile(join(store, "rootA", "session-aaa-1", "session.jsonl.zstd"), zstdMultiFrame([eHeader(times().today) + "\n", eAssistant(10, times().offPeak, OFFICIAL, { inputTokens: 100, cacheReadTokens: 0, outputTokens: 10 }, "m1") + "\n"]));
  const { ledger, stats } = await buildReconciledLedger({
    ids: new Set(["session-aaa-1"]),
    config: cfgd, pricing: testPricing(), roots: [store]
  });
  assert.equal(stats.skippedBigFiles, 1, "oversized file skipped");
  assert.ok((stats.skippedBigBytes ?? 0) > 0, "skipped bytes reported");
  assert.equal(stats.sessionsScanned, 1, "still counted as scanned session (skipped at replay)");
  assert.equal(ledger.totals.calls, 0, "no events from skipped file");
  await ledger.dispose();
  await rm(dir, { recursive: true, force: true });
});

test("scanSessionFileWorker parses the same events as the main-thread scanner (parity)", async () => {
  const { scanSessionFileWorker, terminateScanWorker } = await import("../lib/reconcile.js");
  const dir = await mkdtemp(join(tmpdir(), "billing-reconcile-worker-"));
  const store = join(dir, "sessions");
  await mkdir(join(store, "rootA", "session-aaa-1"), { recursive: true });
  const file = join(store, "rootA", "session-aaa-1", "session.jsonl.zstd");
  await writeFile(file, zstdMultiFrame([eHeader(times().today) + "\n", eAssistant(10, times().offPeak, OFFICIAL, { inputTokens: 100, cacheReadTokens: 0, outputTokens: 10 }, "m1") + "\n", eNoUsage(11, times().offPeak, OFFICIAL, "m2") + "\n"]));
  const r = await scanSessionFileWorker(file, "session-aaa-1");
  assert.equal(r.ok, true);
  assert.equal(r.events, 1, "worker found the one billable event (no-usage skipped)");
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].provider, "deepseek-official");
  assert.equal(r.records[0].usage.outputTokens, 10);
  await terminateScanWorker();
  await rm(dir, { recursive: true, force: true });
});
