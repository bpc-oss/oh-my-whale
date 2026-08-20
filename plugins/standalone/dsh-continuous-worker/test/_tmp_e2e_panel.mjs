// TEMP panel/queue/checkpoint re-verification — deleted after run.
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Config, internals as idxInternals } from "../lib/index.js";
import { CheckpointStore } from "../lib/checkpoint.js";
import { enqueue, dequeue, complete, queueStatus } from "../lib/employee/queue.js";

let passed = 0;
const ok = (label, cond) => {
  if (cond) { passed++; console.log("  [ok] " + label); }
  else { console.error("  [FAIL] " + label); process.exitCode = 1; }
};
const WorkerRuntime = idxInternals.WorkerRuntime;

// ---------- A. checkpoint bad line ----------
console.log("A) checkpoint corrupt line skip");
const cpRoot = await mkdtemp(join(tmpdir(), "cw-cp-"));
await writeFile(join(cpRoot, "intents.jsonl"), '{"key":"a@1","recordId":"a","status":"completed"}\n{corrupt}\n{"key":"b@2","recordId":"b","status":"in-flight"}\n', "utf8");
const cp = new CheckpointStore(cpRoot);
await cp.load();
ok("checkpoint skips bad line, keeps valid records", cp.snapshot().total === 2);
ok("checkpoint classify works after bad line", cp.classify("b@2") === "retryable" && cp.classify("a@1") === "completed");

// ---------- B. queue recovery ----------
console.log("B) employee queue enqueue/dequeue/complete");
const qRoot = await mkdtemp(join(tmpdir(), "cw-queue-"));
const wd = join(qRoot, "workers", "w1");
await import("node:fs/promises").then((m) => m.mkdir(wd, { recursive: true }));
await enqueue(wd, { taskId: "t-1", text: "job one", instruction: "job one" });
await enqueue(wd, { taskId: "t-2", text: "job two", instruction: "job two" });
const q1 = await queueStatus(wd);
ok("queueStatus shows pending count 2", q1.pending === 2);
const slot = await dequeue(wd);
ok("dequeue returns matching taskId + text", slot.taskId === "t-1" && slot.text === "job one");
const q2 = await queueStatus(wd);
ok("dequeue holds lock (running=t-1), remaining pending 1", q2.running === "t-1" && q2.pending === 1);
const done = await complete(wd, "t-1");
ok("complete clears running and returns hasNext", done.hasNext === true && done.next === "t-2");
const q3 = await queueStatus(wd);
ok("after complete: running null, pending 1 (no wedge)", q3.running === null && q3.pending === 1);

// ---------- C. panel control: create id random suffix + run_once budget gate + resume_all ----------
console.log("C) WorkerRuntime.control (panel)");
const ctrlRoot = await mkdtemp(join(tmpdir(), "cw-ctrl-"));
function makeAgent() {
  return {
    id: "agent-1",
    status: "idle",
    session: {
      events: [],
      header: { seedLength: 0 },
      append(type, data) { this.events.push({ type, data }); },
    },
    followup() {},
    inject() {},
  };
}
function makeCtx(agent) {
  return { agent, get: () => undefined, logger: { info() {}, warn() {}, error() {} } };
}
// Mirror the defensive normalization apply() performs before constructing WorkerRuntime.
function normalizeCfg(cfg) {
  cfg.credentials = { requireDeclaredRefs: true, denyDirectAccess: true, ...(cfg.credentials ?? {}) };
  cfg.supplyChain = { verifyOnInstall: true, enforceOnShellTools: true, ...(cfg.supplyChain ?? {}) };
  cfg.supervision = { forbidSelfDowngrade: true, ...(cfg.supervision ?? {}) };
  cfg.skill = { requireSkillReview: true, requireSkillReviewConfirm: true, autoLearnBelowConfidence: 0.7, ...(cfg.skill ?? {}) };
  cfg.memory = { requireRetainReview: true, useAgentOSMemory: false, mcpClient: "dsh", mcpProject: "", ...(cfg.memory ?? {}) };
  cfg.report = { maxReportsPerDay: 10, ...(cfg.report ?? {}) };
  cfg.probe = { enabled: true, baseIntervalMs: 3600000, maxRunsPerDay: 96, dailyBudgetTokens: 50000, anomalyCooldownMs: 1800000, defaultDisposition: ["record", "escalate"], ...(cfg.probe ?? {}) };
  cfg.diagnose = { enabled: true, everyRuns: 50, driftThreshold: 0.3, autoDowngrade: true, ...(cfg.diagnose ?? {}) };
  cfg.persona = { name: "", tone: "professional", outputFormat: "", constraints: [], ...(cfg.persona ?? {}) };
  cfg.guardrails = { enforcePersona: false, requirePersonaConfirm: true, ...(cfg.guardrails ?? {}) };
  cfg.workorder = { autoRecordTools: [], ...(cfg.workorder ?? {}) };
  cfg.heartbeat = { maxConsecutiveWakes: 3, delivery: "wakeup", ...(cfg.heartbeat ?? {}) };
  return cfg;
}

// C1: create_schedule id random suffix
{
  const agent = makeAgent();
  const cfg = Config({ checkpointRoot: join(ctrlRoot, "c1") });
  normalizeCfg(cfg);
  const rt = new WorkerRuntime(makeCtx(agent), agent, cfg, new Map());
  const r = await rt.control("create_schedule", null, { intervalSeconds: 60, prompt: "sched task", maxRuns: 3, expiresIn: "24h" });
  ok("create_schedule returns random-suffixed id", typeof r.id === "string" && /^cw-[0-9a-z]+$/.test(r.id) && r.id.length > 6);
  const r2 = await rt.control("create_schedule", null, { intervalSeconds: 60, prompt: "sched task 2", maxRuns: 3, expiresIn: "24h" });
  ok("create_schedule ids differ (random suffix)", r.id !== r2.id);
}

// C2: run_once budget gate (dailyBudgetTokens too small -> blocked before dispatch)
{
  const agent = makeAgent();
  const cfg = Config({ checkpointRoot: join(ctrlRoot, "c2"), dailyTokenBudget: 1, maxTokenPerRun: 1 });
  normalizeCfg(cfg);
  const rt = new WorkerRuntime(makeCtx(agent), agent, cfg, new Map());
  const rec = await rt.control("create_schedule", null, { intervalSeconds: 60, prompt: "x", maxRuns: 3, expiresIn: "24h" });
  const out = await rt.control("run_once", rec.id);
  ok("run_once blocked by budget gate (no bypass)", out.ok === false && /budget|exhausted|gate/i.test(out.reason ?? ""));
  ok("budget-gated run_once wrote no dispatch event", agent.session.events.filter((e) => e.type === "continuous-worker/change" && (e.data?.operation === "dispatch" || e.data?.operation === "update")).length === 0);
}

// C3: run_once happy path (checkpoint begin+complete, dispatch event, delivered)
{
  const agent = makeAgent();
  const cfg = Config({ checkpointRoot: join(ctrlRoot, "c3") });
  normalizeCfg(cfg);
  const rt = new WorkerRuntime(makeCtx(agent), agent, cfg, new Map());
  const rec = await rt.control("create_schedule", null, { intervalSeconds: 60, prompt: "happy task", maxRuns: 3, expiresIn: "24h" });
  const out = await rt.control("run_once", rec.id);
  ok("run_once delivered", out.ok === true && out.delivered === true);
  const folded = idxInternals.foldWorkerEvents(agent.session.events, 0);
  ok("run_once dispatched record (runCount 1)", folded.active.find((x) => x.id === rec.id)?.runCount === 1);
  await rt.checkpoint.load();
  const snap = rt.checkpoint.snapshot();
  ok("run_once checkpoint completed (0 in-flight)", snap.total >= 1 && snap.inFlight === 0);
}

// C4: resume_all only touches paused
{
  const agent = makeAgent();
  const cfg = Config({ checkpointRoot: join(ctrlRoot, "c4") });
  normalizeCfg(cfg);
  const rt = new WorkerRuntime(makeCtx(agent), agent, cfg, new Map());
  const a = await rt.control("create_schedule", null, { intervalSeconds: 60, prompt: "a", maxRuns: 3, expiresIn: "24h" });
  const b = await rt.control("create_schedule", null, { intervalSeconds: 60, prompt: "b", maxRuns: 3, expiresIn: "24h" });
  const paused = await rt.control("pause", a.id);
  ok("pause works", paused.ok === true && paused.state === "paused");
  const resumeAll = await rt.control("resume_all");
  ok("resume_all affected exactly 1 (the paused one)", resumeAll.affected === 1 && resumeAll.action === "resume_all");
  const folded = idxInternals.foldWorkerEvents(agent.session.events, 0);
  const ra = folded.active.find((x) => x.id === a.id);
  const rb = folded.active.find((x) => x.id === b.id);
  ok("resumed record active, untouched record still active", ra?.state === "active" && rb?.state === "active");
}

// ---------- D. tools update 校验 (cw_schedule_update / cw_heartbeat_update) ----------
console.log("D) tools update validation (mirror create)");
{
  const { registerTools } = await import("../lib/tools.js");
  const agent = makeAgent();
  const cfg = Config({ checkpointRoot: join(ctrlRoot, "d1") });
  normalizeCfg(cfg);
  const rt = new WorkerRuntime(makeCtx(agent), agent, cfg, new Map());
  const tools = [];
  const agentCtx = { tools: { register: (t) => { tools.push(t); return () => {}; } } };
  registerTools(makeCtx(agent), agentCtx, rt);
  const sched = tools.find((t) => t.name === "cw_schedule_update");
  const hb = tools.find((t) => t.name === "cw_heartbeat_update");
  ok("cw_schedule_update registered", sched !== undefined);
  ok("cw_heartbeat_update registered", hb !== undefined);

  // create a schedule record via panel so fold has it
  const rec = await rt.control("create_schedule", null, { intervalSeconds: 60, prompt: "orig", maxRuns: 5, expiresIn: "24h" });
  const exec = { agent };

  const bad = await sched.execute({ id: rec.id, maxRuns: 0, expiresIn: "1y" }, exec);
  ok("schedule update rejects invalid maxRuns", bad.code === "invalid_maxRuns" && bad.updated === false);
  const bad2 = await sched.execute({ id: rec.id, expiresIn: "abc" }, exec);
  ok("schedule update rejects invalid expiresIn", bad2.code === "invalid_expiresIn");
  const bad3 = await sched.execute({ id: rec.id, prompt: "   " }, exec);
  ok("schedule update rejects empty prompt", bad3.code === "invalid_prompt");
  const good = await sched.execute({ id: rec.id, prompt: "new prompt", maxRuns: 3 }, exec);
  ok("schedule update applies valid change", good.updated === true && good.record.prompt === "new prompt" && good.record.maxRuns === 3);
  const folded = idxInternals.foldWorkerEvents(agent.session.events, 0);
  ok("schedule update persisted (fold sees new prompt)", folded.active.find((x) => x.id === rec.id)?.prompt === "new prompt");

  // heartbeat update validation
  const hrec = await rt.control("create_heartbeat", null, { intervalSeconds: 60, prompt: "hb", maxRuns: 5, expiresIn: "24h" });
  const hbBad = await hb.execute({ id: hrec.id, intervalSeconds: 10 }, exec);
  ok("heartbeat update rejects interval < 30", hbBad.code === "invalid_interval");
  const hbBad2 = await hb.execute({ id: hrec.id, stepTokenBudget: 0 }, exec);
  ok("heartbeat update rejects invalid budget", hbBad2.code === "invalid_budget");
  const hbGood = await hb.execute({ id: hrec.id, intervalSeconds: 120 }, exec);
  ok("heartbeat update applies valid interval", hbGood.updated === true && hbGood.record.intervalSeconds === 120);
}

console.log("");
console.log("Panel recheck: " + passed + " checks passed.");
if (process.exitCode) console.log("Panel recheck FAILED");
else console.log("Panel recheck ALL PASS");
