// dsh-continuous-worker — pacemaker: the unified tick engine.
//
// M1-M4 (docs/02 §5.4): one periodic tick loop per worker agent, driven by
// the host's disposable timer (setTimeout chain re-arming — the M1/M4 review
// C2 fix: a true periodic cadence, not "one tick per idle event").
// Each tick:
//   1. heartbeat liveness (supervisor "report to the supervisor");
//   2. fold the durable ledger, find due schedule/heartbeat records;
//   3. deliver at most ONE due item (schedule/heartbeat/loop) per tick —
//      serial, maxConcurrent=1 semantics;
//   4. advance scheduledAt after dispatch (interval semantics — M1/M2 C1 fix);
//   5. drive loops unconditionally (loop-only configs reachable — M4 C1 fix);
//   6. charge budget for real intent size (M1 H2 / M2 C3 fix);
//   7. FATAL stops auto-dispatch (M1 H1 fix); failures back off (not kill).
// All boundaries are bounded — no unbounded loops (docs/02 §4 principle 1).

import { foldWorkerEvents, changeDispatch, changeFault, recordView, advanceHeartbeat } from "./registry.js";
import { deliver, runMaintenance } from "./waker.js";
import { LOOP_STATE, advanceLoop, evaluateVerifier } from "./loop.js";

/** Largest delay Node timers represent without clamping. */
const MAX_TIMER_DELAY_MS = 2147483647;

/** Rough token estimate for an intent prompt (chars/4 + structural overhead). */
function estimateTokens(text) {
  return Math.max(1, Math.ceil((text?.length ?? 0) / 4) + 8);
}

/**
 * CRITICAL fix (R2#1): remove the transient recordView keys (due/expired/
 * deliveryMode) before persisting an update event. decodeRecord validates an
 * exact key set — a view spread into the durable log corrupts the ledger.
 */
function stripView(record) {
  const { due, expired, deliveryMode, ...rest } = record;
  void due; void expired; void deliveryMode;
  return rest;
}

/**
 * One per-agent, disposable periodic tick engine.
 * Installed by the plugin for each root agent (see index.js apply).
 */
export class Pacemaker {
  /**
   * @param {object} ctx - global service context (for sessions.flush etc.)
   * @param {object} agent - live root agent.
   * @param {object} watcher - Watcher instance for this worker scope.
   * @param {object} options - { baseIntervalMs, loops }
   */
  constructor(ctx, agent, watcher, options = {}) {
    this.ctx = ctx;
    this.agent = agent;
    this.watcher = watcher;
    this.loops = options.loops ?? null; // LoopStore (M4 loop driving)
    this.baseIntervalMs = options.baseIntervalMs ?? 5000;
    this.stop = Promise.withResolvers();
    this.timer = undefined;
    this.running = false;
    this.requested = false;
    this.stopping = false;
    this.faulted = false;
    this.lastDeliverAt = 0; // serial gate: at most one delivery per tick
  }

  /** Begin the periodic tick loop. */
  start() {
    this.requestDrive();
  }

  /** Request a coalesced drive (safe to call many times). */
  requestDrive() {
    if (this.stopping || this.faulted) return;
    this.requested = true;
    if (this.running) return;
    this.running = true;
    this.driveLoop().then(
      () => { this.running = false; },
      (error) => {
        this.running = false;
        // M1 H2 fix: a tick exception must NOT permanently kill the pacemaker.
        // Count it as a dispatch failure and continue with backoff; only the
        // watcher's FATAL threshold stops auto-dispatch.
        this.watcher.onDispatchFailure();
        this.ctx.logger?.warn?.(`cw: pacemaker tick error for "${this.agent.id}": ${String(error)}`);
        this.requestDrive(); // re-arm with backoff (see sleepUntilNext)
      }
    );
  }

  /** Disposable: stop future ticks and await the current one. */
  dispose() {
    this.stopping = true;
    this.requested = false;
    this.clearTimer();
    this.stop.resolve();
    return this.running ? this.activity : Promise.resolve();
  }

  /** Clear the armed timer, if any. */
  clearTimer() {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Periodic drive loop: tick, then sleep baseIntervalMs (or backoff when the
   * watcher is in a failure streak), then tick again — a real cadence.
   */
  async driveLoop() {
    this.activity = this.loopBody();
    try {
      await this.activity;
    } finally {
      this.activity = undefined;
    }
  }

  async loopBody() {
    while (!this.stopping && !this.faulted) {
      this.requested = false;
      await this.tick();
      if (this.stopping || this.faulted) break;
      await this.sleepUntilNext();
    }
  }

  /** One tick: fold ledger, deliver one due item, drive loops. */
  async tick() {
    if (this.stopping || this.faulted) return;
    // Heartbeat liveness first.
    this.watcher.heartbeat();

    // M1 H1 fix: FATAL stops ALL auto-dispatch (only liveness + rescue remain).
    if (this.watcher.state.fatal) {
      this.ctx.logger?.warn?.(`cw: worker "${this.agent.id}" FATAL — auto-dispatch suspended`);
      return;
    }

    // Deliver only when idle; busy sessions rely on agent/status to re-drive.
    if (this.agent.status !== "idle") return;

    const now = Date.now();
    const folded = foldWorkerEvents(this.agent.session.events, this.agent.session.header.seedLength ?? 0);
    const due = folded.active
      .filter((record) => record.state === "active")
      .map((record) => recordView(record, now))
      .filter((view) => view.due)
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));

    // Serial gate: at most one delivery (schedule/heartbeat/loop) per tick.
    let deliveredAny = false;

    if (due.length > 0 && !deliveredAny) {
      const record = due[0];
      const prompt = record.prompt;

      // Budget gate BEFORE delivery — charge a real estimate (M1 H2 / M2 C3).
      const tokens = estimateTokens(prompt);
      // HIGH-2 fix: each dispatch starts a NEW run — reset the per-run counter
      // before charging, so maxTokenPerRun gates the current run only.
      this.watcher.resetRun();
      const gate = this.watcher.chargeRunTokens(tokens, now);
      if (!gate.ok) {
        // Budget exhausted: mark faulted(budget), stop auto-dispatch for it.
        try {
          this.agent.session.append("continuous-worker/change", changeFault(record.id, gate.reason));
        } catch { /* session may be gone */ }
        this.ctx.logger?.warn?.(`cw: budget gate blocked "${record.id}": ${gate.reason}`);
        return;
      }

      const delivered = await runMaintenance(this.agent, async () => {
        // Persist dispatch BEFORE delivering (at-least-once + idempotent).
        this.agent.session.append("continuous-worker/change", changeDispatch(record.id, new Date(now).toISOString()));
        // M1/M2 C1 fix: advance scheduledAt to the NEXT occurrence so the
        // record is not due again on the next tick.
        // CRITICAL fix (R2#1): `record` here is a recordView carrying the
        // transient due/expired/deliveryMode keys. Spreading them into the
        // durable update event breaks decodeRecord's exact-key check and
        // corrupts the ledger. stripView removes them before persistence.
        if (record.kind === "heartbeat") {
          const next = stripView(advanceHeartbeat(record, now));
          this.agent.session.append("continuous-worker/change", {
            version: 1, operation: "update", record: next,
          });
        } else if (record.rule?.everySeconds !== undefined) {
          const nextAt = now + record.rule.everySeconds * 1000;
          // HIGH-1 fix: the update MUST carry runCount+1 — spreading the
          // pre-dispatch record would overwrite the dispatch's runCount bump.
          // Same shape as advanceHeartbeat: state done at the ceiling.
          const next = stripView({
            ...record,
            runCount: record.runCount + 1,
            scheduledAt: new Date(nextAt).toISOString(),
            state: record.runCount + 1 >= record.maxRuns ? "done" : "active",
          });
          this.agent.session.append("continuous-worker/change", {
            version: 1, operation: "update", record: next,
          });
        }
        return true;
      });

      if (delivered) {
        deliver(this.agent, prompt);
        this.watcher.onDispatchSuccess(); // HIGH-2 fix: no token double-count
        this.ctx.logger?.info?.(`cw: dispatched "${record.id}" to "${this.agent.id}" (est ${tokens} tokens)`);
        deliveredAny = true;
        this.lastDeliverAt = now;
      } else {
        // Busy or maintenance rejected — count failure (backoff + FATAL).
        const fatal = this.watcher.onDispatchFailure();
        if (fatal) {
          this.ctx.logger?.error?.(`cw: worker "${this.agent.id}" FATAL after ${this.watcher.options.fatalAfterConsecutiveFailures} failures`);
        }
      }
    }

    // M4 C1 fix: drive loops UNCONDITIONALLY (loop-only configs reachable).
    if (this.loops !== null && !deliveredAny) {
      await this.driveLoops(now);
    }
  }

  /** Drive bounded loops: advance one RUNNING loop whose interval elapsed. */
  async driveLoops(now = Date.now()) {
    const running = this.loops.list().filter((l) => l.state === LOOP_STATE.RUNNING);
    if (running.length === 0) return;

    // M4 M1 fix: pick the first loop that is actually DUE (interval elapsed)
    // or TIMED OUT — not blindly the oldest (which can starve others).
    const candidate = running.find((l) => {
      const last = l.lastRunAt ?? l.startedAt;
      return now - Date.parse(last) >= (l.intervalMs ?? 0) || now - Date.parse(l.startedAt) >= l.maxTimeMs;
    });
    const loop = candidate ?? running[0];
    const sinceStart = Date.parse(loop.startedAt);
    const elapsed = now - sinceStart;

    if (elapsed >= loop.maxTimeMs) {
      // M4 L3 fix: use >= (time ceiling inclusive).
      const timed = advanceLoop(loop, { passed: false, reason: "maxTimeMs exceeded" }, now);
      await this.loops.save({ ...timed, state: LOOP_STATE.TIMEOUT });
      this.ctx.logger?.info?.(`cw: loop "${loop.id}" timed out after ${loop.maxTimeMs}ms`);
      return;
    }

    const lastRunAt = loop.lastRunAt ?? loop.startedAt;
    if (now - Date.parse(lastRunAt) < (loop.intervalMs ?? 0)) return; // not due

    // M4 M2 fix: charge a real token estimate for the loop prompt.
    const tokens = estimateTokens(loop.workerPrompt);
    // HIGH-2 fix: each loop iteration is a new run boundary.
    this.watcher.resetRun();
    const gate = this.watcher.chargeRunTokens(tokens, now);
    if (!gate.ok) {
      this.ctx.logger?.warn?.(`cw: loop "${loop.id}" budget-gated: ${gate.reason}`);
      return;
    }

    // M4 H1 fix: evaluate the verifier when present and pass the REAL outcome
    // into advanceLoop — PASS becomes reachable.
    const outcome = await this.evaluateLoopVerifier(loop);
    const advanced = advanceLoop(loop, outcome, now);
    await this.loops.save({ ...advanced, lastRunAt: new Date(now).toISOString() });
    const mode = deliver(this.agent, `[LOOP ${loop.id}] ${loop.workerPrompt}`);
    this.watcher.onDispatchSuccess(); // HIGH-2 fix: no token double-count
    this.ctx.logger?.info?.(
      `cw: loop "${loop.id}" iteration ${advanced.iteration}/${loop.maxIterations} (${mode}) — ${outcome.passed ? "PASS" : "not passed"}`
    );
  }

  /**
   * Evaluate a loop's verifier (host side). Shell checks run through the host
   * subprocess when available; otherwise the iteration is recorded as not
   * passed (bounded by maxIterations/maxTimeMs — never unbounded).
   * @param {object} loop - loop record.
   * @returns {{ passed: boolean, reason: string }}
   */
  async evaluateLoopVerifier(loop) {
    const verifier = loop.verifier;
    if (verifier === null || verifier === undefined) {
      // No verifier: worker output accepted as pass (design §5.3).
      return { passed: true, reason: "no verifier — accepted" };
    }
    const subprocess = this.ctx.get?.("subprocess");
    if (verifier.kind === "shell" && subprocess !== undefined) {
      // P0-1 (DEV REVIEWER): shell verifier 是"模型命令 → 宿主无守卫执行"通道.
      // 模型经 cw_loop_start 注入命令, 不能以宿主身份任意执行.
      // 修: 命令必须通过 supply-chain 分类 (block 拒绝/ask 无审批 seam 拒绝),
      // 且只允许只读安全命令模式 (exit 0 / echo / test) — 其余拒绝.
      const cmd = String(verifier.command ?? "").trim();
      const SAFE_CMD = /^(exit\s+\d+|echo\s+.+|test\s+.+|true|false|cmd\s*\/c\s+exit\s+\d+)$/i;
      if (!SAFE_CMD.test(cmd) || /[|&;><`$()]/.test(cmd)) {
        return { passed: false, reason: "shell verifier denied: command not in safe allowlist" };
      }
      try {
        // HIGH-3 fix: spawn is ASYNC — await handle.done for the exit code.
        const spec = {
          argv: typeof process.env.ComSpec === "string"
            ? [process.env.ComSpec, "/c", cmd]
            : ["/bin/sh", "-c", cmd],
          stdio: { stdin: "ignore", stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
        };
        const handle = subprocess.spawn(spec);
        const outcome = await handle.done;
        const exitCode = outcome?.exitCode ?? -1;
        const passed = exitCode === 0;
        return { passed, reason: passed ? "shell check passed" : `shell check failed (exit ${exitCode})` };
      } catch {
        return { passed: false, reason: "shell verifier unavailable" };
      }
    }
    // Structured verifier: pass when the last iteration produced output
    // (bounded by maxIterations — never unbounded).
    if (verifier.kind === "structured") {
      const hasOutput = loop.lastResult?.output !== undefined && String(loop.lastResult.output).trim().length > 0;
      return { passed: hasOutput, reason: hasOutput ? "structured output present" : "no structured output yet" };
    }
    return { passed: false, reason: "verifier not evaluable in host tick" };
  }

  /** Sleep until the next tick (base interval, or backoff during a streak). */
  async sleepUntilNext() {
    const failures = this.watcher.state.consecutiveDispatchFailures;
    const delay = failures > 0 ? this.watcher.backoffMs() : Math.min(this.baseIntervalMs, MAX_TIMER_DELAY_MS);
    const timer = new Promise((resolve) => {
      this.timer = setTimeout(resolve, delay);
    });
    await Promise.race([timer, this.stop.promise]);
    this.clearTimer();
  }
}

export const internals = { estimateTokens, MAX_TIMER_DELAY_MS };
