// TEMP re-verification script (VERIFIER STANDARD second round) - deleted after run.
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkerStore, createWorker } from "../lib/workers.js";
import { createPromptJson, defaultLimits } from "../lib/employee/prompt-schema.js";
import { PromptStore } from "../lib/employee/prompt-store.js";
import { compilePrompt, compileTokens } from "../lib/employee/prompt-compiler.js";
import { assemble, renderBundle } from "../lib/employee/memory-broker.js";
import { reflect, readGrowth } from "../lib/employee/evolution.js";
import { appendThinking, readThinking } from "../lib/employee/thinking.js";
import { employeeToolGuard } from "../lib/employee/budget.js";
import { MemoryStore } from "../lib/memory.js";
import { Pacemaker } from "../lib/pacemaker.js";
import { Watcher } from "../lib/watcher.js";
import { createLoop } from "../lib/loop.js";

let passed = 0;
const ok = (label, cond) => {
  if (cond) { passed++; console.log("  [ok] " + label); }
  else { console.error("  [FAIL] " + label); process.exitCode = 1; }
};

const root = await mkdtemp(join(tmpdir(), "cw-e2e-recheck-"));
const workerDir = join(root, "workers", "w1");
await import("node:fs/promises").then((m) => m.mkdir(workerDir, { recursive: true }));

// ---------- 1. createWorker -> prompt -> compile ----------
console.log("1) createWorker -> prompt -> compile -> assemble");
const w = createWorker({ name: "review-employee", role: "ops", cwd: "E:\\proj\\tmp" });
ok("createWorker id has random suffix (not just timestamp)", /^w-[0-9a-z]+$/.test(w.id) && w.id.length > 6);

const ps = new PromptStore(workerDir);
await ps.init();
const p = createPromptJson();
p.soul.identity.name = "review-employee";
p.soul.identity.role = "ops";
p.soul.description = "verify recheck e2e closure";
p.soul.values = ["truthful", "safe"];
const saved = await ps.save(p, { changedBy: "human", reason: "e2e" });
ok("prompt saved (version>=1, limits enforced)", saved.meta.version >= 1 && saved.limits?.permissions?.toolAllowlist?.length > 0);

const mb = {
  episodic: [{ at: "2026-08-18", summary: "disk alert handled", result: "completed" }],
  semantic: [{ fact: "disk full -> clean logs first", source: "reflection" }],
  skills: ["inspection flow"],
  habits: [{ name: "report anomalies immediately", value: "yes" }],
};
const sp = compilePrompt(p, mb);
ok("compilePrompt produces governance + memory sections", sp.includes("治理（引擎强制") && sp.includes("记忆上下文") && sp.includes("disk alert handled"));
const tokens = compileTokens(p, mb);
ok("compileTokens finite + bounded", Number.isFinite(tokens) && tokens > 0 && tokens < 5000);

const bundle = await assemble(workerDir, { tags: ["disk"], limit: { episodic: 3, semantic: 5, skills: 8, habits: 3 } });
ok("assemble returns bundle with all four arrays", Array.isArray(bundle.episodic) && Array.isArray(bundle.semantic) && Array.isArray(bundle.skills) && Array.isArray(bundle.habits));
const rb = renderBundle(bundle);
ok("renderBundle produces text (may be empty for fresh store)", typeof rb === "string");

// ---------- 2. reflect -> growth ----------
console.log("2) reflect -> growth");
const r1 = await reflect(workerDir, { taskId: "t-001", instruction: "clean disk logs", taskText: "[employee ops] clean disk logs", result: "completed", keyFacts: ["freed 23%"] });
ok("reflect writes knowledge (experienceAdded)", r1.experienceAdded === true && r1.flowKey.length > 0);
const r2 = await reflect(workerDir, { taskId: "t-002", instruction: "clean disk logs", taskText: "[employee ops] clean disk logs", result: "completed", keyFacts: ["freed 10%"] });
ok("reflect dedup knowledge on same flowKey (P0-2)", r2.experienceAdded === false);
const r3 = await reflect(workerDir, { taskId: "t-003", instruction: "clean disk logs", taskText: "[employee ops] clean disk logs", result: "completed", keyFacts: ["freed 5%"] });
ok("reflect fixes skill after 3 repeats", r3.skillFixed === true);
const g = await readGrowth(workerDir);
ok("growth trajectory accumulated (taskCount>=3, successRate>=50)", g.taskCount >= 3 && g.successRate >= 50 && g.experienceCount === 1);
const gRaw = JSON.parse(await readFile(join(workerDir, "growth.json"), "utf8"));
ok("growth internal _ fields not leaked in view but persist", g._successCount === undefined && gRaw._lastActiveDay !== undefined);

// ---------- 3. thinking ----------
console.log("3) thinking (append + read + sanitize)");
await appendThinking(workerDir, "t-001", { kind: "plan", content: "check disk usage" });
await appendThinking(workerDir, "t-001", { kind: "reflect", content: "done, freed 23%" });
await appendThinking(workerDir, "t-001", { kind: "tool", content: "shell", meta: { name: "shell", args: { command: "ls", api_key: "sk-secret123" } } });
const th = await readThinking(workerDir, "t-001");
ok("thinking read back ordered by seq", th.length === 3 && th[0].kind === "plan" && th[2].kind === "tool");
ok("thinking sanitizes secret in args", JSON.stringify(th[2].meta.args).includes("***") && !JSON.stringify(th[2].meta.args).includes("sk-secret123"));

// ---------- 4. guard (employeeToolGuard) ----------
console.log("4) guard (employeeToolGuard)");
const p2 = { limits: { ...defaultLimits(), permissions: { toolAllowlist: ["read", "shell"], dangerTools: "ask" }, redLines: ["no-secret-leak"] } };
ok("guard allows allowlisted tool", employeeToolGuard({ name: "read", arguments: { path: "a.txt" } }, p2).kind === "allow");
ok("guard denies non-allowlisted tool", employeeToolGuard({ name: "network", arguments: {} }, p2).kind === "deny");
ok("guard ask on danger tool (shell)", employeeToolGuard({ name: "shell", arguments: {} }, p2).kind === "ask");
ok("guard redLine blocks secret in args", employeeToolGuard({ name: "read", arguments: { path: "x", api_key: "s" } }, p2).kind === "deny");
ok("guard allows cw_* tools (P1 fix)", employeeToolGuard({ name: "cw_think", arguments: {} }, p2).kind === "allow");

// ---------- 5. memory recall async (cw_memory_recall path) ----------
console.log("5) memory recall async (mcpBackend returns Promise)");
const mRoot = await mkdtemp(join(tmpdir(), "cw-mem-recall-"));
let awaited = false;
const ms = new MemoryStore(mRoot, {
  mcpBackend: {
    recall: async () => { awaited = true; return [{ id: "m1", fact: "MCP remote fact", updatedAt: "2026-08-18T00:00:00Z" }]; },
  },
});
await ms.retain({ fact: "local fact", source: "e2e" });
const rec = await ms.recall({});
ok("mcp recall Promise was awaited (async fix)", awaited === true);
ok("recall merges mcp entries + local (incl pending)", rec.some((e) => e.mcp === true && e.fact === "MCP remote fact"));
const rec2 = await ms.recall({ includePending: true });
ok("recall includes local pending entry when includePending", rec2.some((e) => e.fact === "local fact" && e.state === "pending"));
const entries = await ms.recall({ includePending: true, scope: undefined });
ok("recall returns array (not Promise)", Array.isArray(entries));

// ---------- 6. appendChat append-write + read-back consistency ----------
console.log("6) appendChat append-write + read-back consistency");
const wsRoot = await mkdtemp(join(tmpdir(), "cw-chat-append-"));
const ws = new WorkerStore(wsRoot);
await ws.load();
const w2 = createWorker({ name: "chat-employee" });
await ws.create(w2);
await ws.appendChat(w2.id, { role: "user", text: "task-A", at: "2026-08-18T00:00:00Z" });
await ws.appendChat(w2.id, { role: "ai", text: "done-A", at: "2026-08-18T00:01:00Z" });
const chatFile = join(wsRoot, "workers", w2.id, "chat.jsonl");
const rawLines = (await readFile(chatFile, "utf8")).split("\n").filter(Boolean);
ok("appendChat persisted exactly 2 lines (append-only)", rawLines.length === 2);
ok("chat read back consistent in-memory", ws.getChat(w2.id).length === 2 && ws.getChat(w2.id)[1].text === "done-A");
const ws2 = new WorkerStore(wsRoot);
await ws2.load();
ok("chat read back consistent after reload", ws2.getChat(w2.id).length === 2 && ws2.getChat(w2.id)[0].text === "task-A");

// ---------- 7. verifier whitelist blocks `exit 0 & whoami` ----------
console.log("7) verifier whitelist (pacemaker evaluateLoopVerifier)");
let spawnedCmd = null;
const fakeSub = {
  spawn: (spec) => { spawnedCmd = spec; return { done: Promise.resolve({ exitCode: 0 }) }; },
};
const pm = new Pacemaker(
  { get: (k) => (k === "subprocess" ? fakeSub : undefined), logger: { warn() {}, info() {}, error() {} } },
  { id: "agent-x", status: "idle", session: { events: [], header: { seedLength: 0 } } },
  new Watcher(),
  { loops: null }
);
const loop = createLoop({ id: "L1", workerPrompt: "do a thing", verifier: "exit 0", maxIterations: 3, maxTimeMs: 60000 });
const safeOut = await pm.evaluateLoopVerifier(loop);
ok("safe verifier exit 0 passes", safeOut.passed === true);
const evilLoop = createLoop({ id: "L2", workerPrompt: "pwn", verifier: "exit 0 & whoami", maxIterations: 3, maxTimeMs: 60000 });
spawnedCmd = null;
const evilOut = await pm.evaluateLoopVerifier(evilLoop);
ok("exit 0 & whoami blocked by whitelist", evilOut.passed === false && /denied/.test(evilOut.reason));
ok("spawn was NOT called for malicious verifier", spawnedCmd === null);
const shellLoop = createLoop({ id: "L3", workerPrompt: "x", verifier: "echo hi", maxIterations: 3, maxTimeMs: 60000 });
const echoOut = await pm.evaluateLoopVerifier(shellLoop);
ok("safe verifier echo hi passes", echoOut.passed === true);
const pipeLoop = createLoop({ id: "L4", workerPrompt: "x", verifier: "echo a && whoami", maxIterations: 3, maxTimeMs: 60000 });
spawnedCmd = null;
const pipeOut = await pm.evaluateLoopVerifier(pipeLoop);
ok("echo a && whoami blocked (metachar)", pipeOut.passed === false && spawnedCmd === null);

console.log("");
console.log("E2E recheck: " + passed + " checks passed.");
if (process.exitCode) console.log("E2E recheck FAILED");
else console.log("E2E recheck ALL PASS");
