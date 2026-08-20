// dsh-continuous-worker — watcher: heartbeat liveness + three counters + FATAL.
//
// M1 scope (docs/02 §9.1b/§9.1c/§9.2):
//   - heartbeat liveness: plugin proves it is alive by writing periodic
//     liveness markers (supervisor "report to the supervisor" semantics);
//   - idle counter: N consecutive rounds with no real work -> suggest sleep;
//   - loop counter: N consecutive same-tool rounds -> inject a correction;
//   - budget counter: per-run / step / daily token ceilings (plugin-ledger,
//     NOT tokenMeter gating — see docs/02 §9.4b H2 返修);
//   - FATAL: consecutive dispatch failures beyond threshold stop auto-restart.

export const DEFAULT_OPTIONS = Object.freeze({
  fatalAfterConsecutiveFailures: 5,
  idleRoundsBeforeSleep: 3,
  loopRoundsBeforeCorrect: 3,
  maxTokenPerRun: 200_000,
  stepTokenBudget: 50_000,
  dailyTokenBudget: 2_000_000,
});

/** A tiny, immutable, per-worker state machine for one supervision scope. */
export class Watcher {
  /** @param {Partial<typeof DEFAULT_OPTIONS>} options */
  constructor(options = {}) {
    this.options = Object.freeze({ ...DEFAULT_OPTIONS, ...options });
    this.state = Object.freeze({
      consecutiveDispatchFailures: 0,
      consecutiveIdleRounds: 0,
      consecutiveSameToolRounds: 0,
      lastToolSignature: null,
      runTokenSpent: 0,
      stepTokenSpent: 0,
      dayTokenSpent: 0,
      lastHeartbeatAt: null,
      fatal: false,
      downgrade: "normal", // normal | low | critical
    });
  }

  /** Record a heartbeat liveness tick. */
  heartbeat(now = Date.now()) {
    this.state = { ...this.state, lastHeartbeatAt: now };
    return this.state.lastHeartbeatAt;
  }

  /** 持久化日预算计数 (重启不清零): 返回要落盘的字段. */
  persistState() {
    const { dayTokenSpent, runTokenSpent, consecutiveDispatchFailures } = this.state;
    return { dayTokenSpent, runTokenSpent, consecutiveDispatchFailures, savedAt: new Date().toISOString() };
  }

  /** 恢复持久化的日预算计数 (跨重启). @param {object} saved - persistState 的输出 */
  restoreState(saved) {
    if (!saved || typeof saved !== "object") return;
    const day = typeof saved.dayTokenSpent === "number" ? saved.dayTokenSpent : 0;
    const run = typeof saved.runTokenSpent === "number" ? saved.runTokenSpent : 0;
    const fails = typeof saved.consecutiveDispatchFailures === "number" ? saved.consecutiveDispatchFailures : 0;
    this.state = { ...this.state, dayTokenSpent: day, runTokenSpent: run, consecutiveDispatchFailures: fails };
  }

  /** Whether the worker is still considered alive (heartbeat within window). */
  alive(maxAgeMs = 10 * 60_000, now = Date.now()) {
    return this.state.lastHeartbeatAt !== null && now - this.state.lastHeartbeatAt <= maxAgeMs;
  }

  /**
   * Reset the per-run counter at a new run boundary (M2 C3 返修): each dispatch
   * starts a new run, so runTokenSpent must not accumulate across runs — the
   * per-run ceiling (maxTokenPerRun) gates the current run only. The daily
   * counter persists and rolls at the local-day boundary inside chargeRunTokens.
   */
  resetRun() {
    this.state = Object.freeze({ ...this.state, runTokenSpent: 0 });
  }

  /**
   * Count one successful dispatch (resets failure streak).
   * HIGH-2 fix: this NO LONGER adds tokens — the token charge happens exactly
   * once in chargeRunTokens (the pre-dispatch gate). Adding them here too was
   * the double-count bug (recheck C). Call resetRun() at the start of each new
   * run so maxTokenPerRun gates the current run, not a lifetime total.
   */
  onDispatchSuccess() {
    this.state = Object.freeze({
      ...this.state,
      consecutiveDispatchFailures: 0,
      consecutiveIdleRounds: 0,
    });
  }

  /**
   * Count one dispatch failure with exponential-backoff awareness.
   * @returns {boolean} true when FATAL is reached (stop auto-restart).
   */
  onDispatchFailure() {
    const failures = this.state.consecutiveDispatchFailures + 1;
    const fatal = failures >= this.options.fatalAfterConsecutiveFailures;
    this.state = Object.freeze({
      ...this.state,
      consecutiveDispatchFailures: failures,
      fatal: fatal || this.state.fatal,
    });
    return fatal;
  }

  /** Backoff delay (ms) for the current failure streak: 1s,2s,4s,..., capped 5min. */
  backoffMs() {
    const exp = Math.min(this.state.consecutiveDispatchFailures, 8);
    return Math.min(1000 * 2 ** exp, 5 * 60_000);
  }

  /** Count one idle round; returns true when the idle threshold is crossed. */
  onIdleRound() {
    const rounds = this.state.consecutiveIdleRounds + 1;
    this.state = { ...this.state, consecutiveIdleRounds: rounds };
    return rounds >= this.options.idleRoundsBeforeSleep;
  }

  /**
   * Count one tool round; returns true when the same-tool threshold is crossed
   * (loop detection — inject a correction, per automaton semantics).
   */
  onToolRound(signature) {
    if (signature === this.state.lastToolSignature) {
      const rounds = this.state.consecutiveSameToolRounds + 1;
      this.state = { ...this.state, consecutiveSameToolRounds: rounds };
      return rounds >= this.options.loopRoundsBeforeCorrect;
    }
    this.state = { ...this.state, consecutiveSameToolRounds: 1, lastToolSignature: signature };
    return false;
  }

  /**
   * Charge tokens against the plugin ledger for one run.
   * The daily counter rolls automatically at the local-day boundary (compare
   * the stored charge date against today). The daily figure is always *today's
   * accumulated spend* — never a timestamp.
   * @param {number} tokens - tokens to charge for this step/run.
   * @param {Date} [now] - current time (defaults to Date.now()).
   * @returns {{ ok: boolean, reason: string | null }} ok=false when a ceiling is hit.
   */
  chargeRunTokens(tokens, now = Date.now()) {
    const today = new Date(now).toDateString();
    const dayBase = this.state.lastChargeDay === today ? this.state.dayTokenSpent : 0;
    const day = dayBase + tokens;
    const run = this.state.runTokenSpent + tokens;
    const step = tokens;
    if (run > this.options.maxTokenPerRun) {
      return { ok: false, reason: `run budget exceeded (${run} > ${this.options.maxTokenPerRun})` };
    }
    if (step > this.options.stepTokenBudget) {
      return { ok: false, reason: `step budget exceeded (${step} > ${this.options.stepTokenBudget})` };
    }
    if (day > this.options.dailyTokenBudget) {
      return { ok: false, reason: `daily budget exceeded (${day} > ${this.options.dailyTokenBudget})` };
    }
    this.state = Object.freeze({
      ...this.state,
      runTokenSpent: run,
      stepTokenSpent: step,
      dayTokenSpent: day,
      lastChargeDay: today,
    });
    return { ok: true, reason: null };
  }

  /** Downgrade one tier (normal -> low -> critical). */
  downgradeTier() {
    const order = ["normal", "low", "critical"];
    const idx = order.indexOf(this.state.downgrade);
    const next = order[Math.min(idx + 1, order.length - 1)];
    this.state = { ...this.state, downgrade: next };
    return next;
  }

  /** Snapshot for cw_status / panel (machine-readable, no secrets). */
  snapshot(now = Date.now()) {
    return Object.freeze({
      alive: this.alive(undefined, now),
      lastHeartbeatAt: this.state.lastHeartbeatAt,
      consecutiveDispatchFailures: this.state.consecutiveDispatchFailures,
      consecutiveIdleRounds: this.state.consecutiveIdleRounds,
      consecutiveSameToolRounds: this.state.consecutiveSameToolRounds,
      fatal: this.state.fatal,
      downgrade: this.state.downgrade,
      budget: {
        runTokenSpent: this.state.runTokenSpent,
        stepTokenSpent: this.state.stepTokenSpent,
        dayTokenSpent: this.state.dayTokenSpent,
        ceilings: {
          maxTokenPerRun: this.options.maxTokenPerRun,
          stepTokenBudget: this.options.stepTokenBudget,
          dailyTokenBudget: this.options.dailyTokenBudget,
        },
      },
    });
  }
}

export const internals = { DEFAULT_OPTIONS };
