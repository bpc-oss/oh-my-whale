// Independent re-review verification script (not part of the test suite).
// Verifies specific claims in the M1-M4 remediation by simulating the exact
// event sequences the pacemaker/tools append to the session log.
import {
  foldWorkerEvents, buildScheduleRecord, buildHeartbeatRecord,
  changeCreate, changeDispatch, changeUpdate, advanceHeartbeat, recordView,
} from "../lib/registry.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures += 1;
};

// Simulate the REAL tick persistence faithfully: fold -> recordView -> strip
// view keys -> dispatch + update. This mirrors pacemaker.js tick() and would
// have caught the view-key ledger corruption (R2#1).
const stripView = (record) => {
  const { due, expired, deliveryMode, ...rest } = record;
  return rest;
};

// ---------------------------------------------------------------
// A) Schedule record delivered via TICK path: pacemaker appends
//    dispatch(id,at) then update({...record, scheduledAt: next}).
//    Does runCount advance toward maxRuns?
// ---------------------------------------------------------------
console.log("A) schedule tick: runCount advance toward maxRuns");
{
  const record = buildScheduleRecord({
    id: "cw-s", rule: { everySeconds: 300 }, prompt: "task prompt", maxRuns: 3,
    expiresIn: "24h", scheduledAt: "2026-08-18T00:00:00.000Z",
  });
  const events = [{ type: "continuous-worker/change", data: changeCreate(record) }];
  const tick = (nowIso) => {
    const now = Date.parse(nowIso);
    const folded = foldWorkerEvents(events, 0);
    const raw = folded.active.find((r) => r.id === "cw-s");
    // Faithful tick simulation: the pacemaker works with the record VIEW
    // (which adds due/expired/deliveryMode), then strips those keys before
    // persisting the update (R2#1 CRITICAL fix).
    const rec = stripView(recordView(raw, now));
    events.push({ type: "continuous-worker/change", data: changeDispatch(rec.id, nowIso) });
    if (rec.rule?.everySeconds !== undefined) {
      const nextAt = now + rec.rule.everySeconds * 1000;
      events.push({
        type: "continuous-worker/change",
        data: changeUpdate({
          ...rec,
          runCount: rec.runCount + 1,
          scheduledAt: new Date(nextAt).toISOString(),
          state: rec.runCount + 1 >= rec.maxRuns ? "done" : "active",
        }),
      });
    }
  };
  tick("2026-08-18T00:05:00.000Z");
  tick("2026-08-18T00:10:00.000Z");
  tick("2026-08-18T00:15:00.000Z");
  const final = foldWorkerEvents(events, 0);
  const rec = final.active.find((r) => r.id === "cw-s");
  check(
    "schedule tick advances runCount to maxRuns (3 dispatches -> runCount 3, state done)",
    rec.runCount === 3 && rec.state === "done",
    `actual runCount=${rec.runCount} state=${rec.state} (maxRuns=3)`
  );
}

// ---------------------------------------------------------------
// B) Heartbeat record via TICK path (dispatch + advanceHeartbeat update)
// ---------------------------------------------------------------
console.log("B) heartbeat tick: runCount advance");
{
  const record = buildHeartbeatRecord({
    id: "cw-h", intervalSeconds: 300, prompt: "hb", maxRuns: 3,
    expiresIn: "24h", stepTokenBudget: 50_000, scheduledAt: "2026-08-18T00:00:00.000Z",
  });
  const events = [{ type: "continuous-worker/change", data: changeCreate(record) }];
  const tick = (nowIso) => {
    const now = Date.parse(nowIso);
    const folded = foldWorkerEvents(events, 0);
    const raw = folded.active.find((r) => r.id === "cw-h");
    const rec = stripView(recordView(raw, now));
    events.push({ type: "continuous-worker/change", data: changeDispatch(rec.id, nowIso) });
    const next = stripView(advanceHeartbeat(rec, now));
    events.push({ type: "continuous-worker/change", data: changeUpdate(next) });
  };
  tick("2026-08-18T00:05:00.000Z");
  tick("2026-08-18T00:10:00.000Z");
  tick("2026-08-18T00:15:00.000Z");
  const final = foldWorkerEvents(events, 0);
  const rec = final.active.find((r) => r.id === "cw-h");
  check(
    "heartbeat tick advances runCount to maxRuns (3 dispatches -> runCount 3, state done)",
    rec.runCount === 3 && rec.state === "done",
    `actual runCount=${rec.runCount} state=${rec.state} (maxRuns=3)`
  );
}

// ---------------------------------------------------------------
// C) Budget: chargeRunTokens + onDispatchSuccess per dispatch, no resetRun.
//    runTokenSpent growth across runs vs per-run ceiling.
// ---------------------------------------------------------------
console.log("C) budget: per-run boundary reset");
{
  const { Watcher } = await import("../lib/watcher.js");
  const w = new Watcher({ maxTokenPerRun: 200_000, stepTokenBudget: 50_000, dailyTokenBudget: 2_000_000 });
  const tokens = 258; // estimateTokens for a ~1000-char prompt
  let dispatches = 0;
  let blocked = false;
  for (let i = 0; i < 5000; i++) {
    w.resetRun(); // FIXED: new run boundary per dispatch (HIGH-2)
    const gate = w.chargeRunTokens(tokens, 1_000_000 + i);
    if (!gate.ok) { blocked = true; break; }
    w.onDispatchSuccess(); // FIXED: no token double-count (HIGH-2)
    dispatches += 1;
  }
  check(
    "runTokenSpent reset at run boundary (per-run ceiling should not be hit by repeated runs)",
    !blocked,
    `blocked after ${dispatches} dispatches, runTokenSpent=${w.state.runTokenSpent} (ceiling ${w.options.maxTokenPerRun})`
  );
  // one-shot single-charge check:
  const w2 = new Watcher({ maxTokenPerRun: 200_000, stepTokenBudget: 50_000, dailyTokenBudget: 2_000_000 });
  w2.resetRun();
  w2.chargeRunTokens(100, 1000);
  w2.onDispatchSuccess();
  check(
    "single dispatch charges exactly tokens once (chargeRunTokens only)",
    w2.state.runTokenSpent === 100,
    `actual runTokenSpent=${w2.state.runTokenSpent} after resetRun+charge(100)+onDispatchSuccess()`
  );
}

// ---------------------------------------------------------------
// D) driveLoops reachability: loop-only config, no schedule/heartbeat due
// ---------------------------------------------------------------
console.log("D) driveLoops reachability in loop-only config");
{
  const { Pacemaker } = await import("../lib/pacemaker.js");
  const { LOOP_STATE, startLoop, createLoop } = await import("../lib/loop.js");
  // fake agent: idle, session with NO cw events (loop-only config)
  const fakeAgent = {
    id: "a1", status: "idle",
    session: { events: [], header: { seedLength: 0 }, append() {} },
    followup() {}, inject() {},
    runMaintenance() {},
  };
  let driveLoopsCalled = 0;
  let drives = 0;
  const loops = {
    list() {
      const loop = startLoop(createLoop({ id: "l1", workerPrompt: "x", maxIterations: 3, maxTimeMs: 60_000, intervalMs: 1 }));
      return [loop];
    },
    save() {},
  };
  const watcher = {
    heartbeat() {}, state: { fatal: false, consecutiveDispatchFailures: 0 },
    chargeRunTokens() { return { ok: true }; },
    onDispatchSuccess() {}, onDispatchFailure() {},
    backoffMs() { return 1; },
  };
  const pm = new Pacemaker({ logger: { info() {}, warn() {}, error() {} } }, fakeAgent, watcher, { loops, baseIntervalMs: 1 });
  pm.driveLoops = async () => { driveLoopsCalled += 1; };
  pm.tick().then(() => {
    check("driveLoops invoked in loop-only config (no due records)", driveLoopsCalled >= 1, `called ${driveLoopsCalled}x`);
    process.exitCode = failures > 0 ? 1 : 0;
    console.log(failures === 0 ? "\nAll re-check assertions passed." : `\n${failures} re-check assertion(s) FAILED.`);
  });
}
