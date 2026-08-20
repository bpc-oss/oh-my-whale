// dsh-continuous-worker — loop: bounded worker-verifier iteration (docs/02 §5.3).
//
// M4: 每轮 worker 执行 → verifier 判定 → 直到 PASS 或撞上限.
//   - bounded: maxIterations + maxTimeMs are REQUIRED (no unbounded loops —
//     agentic resource exhaustion defense, design §4 principle 1);
//   - verifier: a deterministic shell check (command string) or a structured
//     pass criterion; the loop driver is host-side (pacemaker tick), the
//     worker step is delivered to the agent session via the waker;
//   - loop state is durable (registry-style events) so a host restart can
//     resume at the last committed iteration.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export const LOOP_STATE = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  PASSED: "passed",
  LIMIT: "limit", // hit maxIterations without pass
  TIMEOUT: "timeout", // hit maxTimeMs
  STOPPED: "stopped",
  FAULTED: "faulted",
});

/** Stable event prefix for loop changes (session-scoped, foldable). */
export const LOOP_EVENT_PREFIX = "continuous-worker/loop";

/**
 * One bounded loop definition (validated).
 * @param {object} input - { id, workerPrompt, verifier, maxIterations, maxTimeMs, intervalMs }
 */
export function createLoop(input) {
  if (typeof input.id !== "string" || input.id.length === 0) throw new Error("cw loop: id required");
  if (typeof input.workerPrompt !== "string" || input.workerPrompt.trim().length === 0) throw new Error("cw loop: workerPrompt required");
  if (typeof input.maxIterations !== "number" || !Number.isSafeInteger(input.maxIterations) || input.maxIterations <= 0) {
    throw new Error("cw loop: maxIterations must be a positive safe integer");
  }
  if (typeof input.maxTimeMs !== "number" || !Number.isSafeInteger(input.maxTimeMs) || input.maxTimeMs <= 0) {
    throw new Error("cw loop: maxTimeMs must be a positive safe integer");
  }
  const verifier =
    input.verifier === undefined
      ? null
      : typeof input.verifier === "string"
        ? { kind: "shell", command: input.verifier }
        : { kind: "structured", passWhen: input.verifier.passWhen ?? "all", ...input.verifier };
  const intervalMs = input.intervalMs ?? 60_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new Error("cw loop: intervalMs must be a positive safe integer");
  }
  return Object.freeze({
    id: input.id,
    workerPrompt: input.workerPrompt,
    verifier,
    maxIterations: input.maxIterations,
    maxTimeMs: input.maxTimeMs,
    intervalMs,
    state: LOOP_STATE.IDLE,
    iteration: 0,
    lastResult: null,
    startedAt: null,
    updatedAt: null,
  });
}

/** Advance one loop by an iteration outcome. Pure fold for durable events. */
export function advanceLoop(loop, outcome, now = Date.now()) {
  const iteration = loop.iteration + 1;
  let state = LOOP_STATE.RUNNING;
  if (outcome.passed) state = LOOP_STATE.PASSED;
  else if (iteration >= loop.maxIterations) state = LOOP_STATE.LIMIT;
  else if (loop.startedAt !== null && now - Date.parse(loop.startedAt) > loop.maxTimeMs) state = LOOP_STATE.TIMEOUT;
  return Object.freeze({
    ...loop,
    iteration,
    lastResult: Object.freeze({ ...outcome }),
    state,
    updatedAt: new Date(now).toISOString(),
  });
}

/** Start a loop (record startedAt, set running). */
export function startLoop(loop, now = Date.now()) {
  if (loop.state !== LOOP_STATE.IDLE && loop.state !== LOOP_STATE.STOPPED) {
    throw new Error(`cw loop: cannot start in state ${loop.state}`);
  }
  return Object.freeze({ ...loop, state: LOOP_STATE.RUNNING, iteration: 0, startedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
}

/** Stop a loop (human or host-initiated). */
export function stopLoop(loop, now = Date.now()) {
  return Object.freeze({ ...loop, state: LOOP_STATE.STOPPED, updatedAt: new Date(now).toISOString() });
}

/**
 * Evaluate one verifier result.
 * @param {object|null} verifier - { kind, command | passWhen }
 * @param {object} observed - { exitCode, output }
 * @returns {{ passed: boolean, reason: string }}
 */
export function evaluateVerifier(verifier, observed) {
  if (verifier === null) {
    // No verifier: worker output is accepted as pass (bounded by iterations).
    return { passed: true, reason: "no verifier — accepted" };
  }
  if (verifier.kind === "shell") {
    const ok = observed.exitCode === 0;
    return { passed: ok, reason: ok ? "shell check passed" : `shell check failed (exit ${observed.exitCode})` };
  }
  if (verifier.kind === "structured") {
    const ok = observed.output !== undefined && observed.output.trim().length > 0;
    return { passed: ok, reason: ok ? "structured output present" : "no structured output" };
  }
  return { passed: false, reason: `unknown verifier kind ${String(verifier.kind)}` };
}

/** Snapshot for cw_loop_status / audit. */
export function loopSnapshot(loop, now = Date.now()) {
  return Object.freeze({
    id: loop.id,
    state: loop.state,
    iteration: loop.iteration,
    maxIterations: loop.maxIterations,
    maxTimeMs: loop.maxTimeMs,
    intervalMs: loop.intervalMs,
    startedAt: loop.startedAt,
    updatedAt: loop.updatedAt,
    lastResult: loop.lastResult,
    elapsedMs: loop.startedAt === null ? null : now - Date.parse(loop.startedAt),
    passed: loop.state === LOOP_STATE.PASSED,
  });
}

/**
 * Durable loop store (JSONL, same discipline as CheckpointStore). Survives
 * host restarts so a bounded loop can resume at the last committed iteration.
 */
export class LoopStore {
  /**
   * @param {string} root - directory to persist loops.
   */
  constructor(root) {
    this.dir = root;
    this.file = join(root, "loops.jsonl");
    this.loops = new Map();
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      for (const line of raw.split("\n")) {
        if (line.trim().length === 0) continue;
        const loop = JSON.parse(line);
        this.loops.set(loop.id, loop);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  /** Upsert one loop. */
  async save(loop) {
    await this.load();
    // Rewrite the file with the updated loop (single-owner, small N).
    this.loops.set(loop.id, loop);
    const lines = [...this.loops.values()].map((l) => JSON.stringify(l));
    await writeFile(this.file, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
  }

  get(id) {
    return this.loops.get(id);
  }

  list() {
    return [...this.loops.values()];
  }

  /** Snapshot for cw_status / audit. */
  snapshot() {
    const all = this.list();
    return {
      total: all.length,
      running: all.filter((l) => l.state === LOOP_STATE.RUNNING).length,
      passed: all.filter((l) => l.state === LOOP_STATE.PASSED).length,
    };
  }
}

export const internals = { LOOP_STATE, evaluateVerifier, LoopStore };
