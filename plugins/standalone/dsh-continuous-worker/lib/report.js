// dsh-continuous-worker — reporting cadence (docs/02 §13.9).
//
// M3: milestone / review / handover reports.
//   - reports are *human notifications* — the delivery channel is the host
//     notification/message surface (NOT agent.inject, which is for the agent);
//   - bounded: maxReportsPerDay caps routine reports; URGENT kinds (FATAL,
//     red-line violation, data-leak class) are exempt and deliver immediately;
//   - report content cites ledger/evidence refs (有据，不自说自话).

export const REPORT_KIND = Object.freeze({
  MILESTONE: "milestone",
  REVIEW: "review",
  HANDOVER: "handover",
});

// M3 H3 fix: urgency is a HOST-side decision, not a worker-selectable kind.
// URGENT_KINDS removed — the daily cap applies to ALL worker-initiated
// reports. Host-side paths (watcher/pacemaker fatal/downgrade) may pass
// `urgent: true` explicitly to bypass the cap (emergency channel).

/** Bounded in-memory daily counter for routine reports (per worker). */
export class ReportBudget {
  /**
   * @param {object} options - { maxReportsPerDay }
   */
  constructor(options = {}) {
    this.maxReportsPerDay = options.maxReportsPerDay ?? 10;
    this.day = new Date().toDateString();
    this.count = 0;
  }

  /**
   * Whether a report may be emitted (or must be queued/deferred).
   * @param {object} input - { urgent } — urgent is HOST-decided (fatal/
   *   downgrade/rescue paths only); worker-initiated reports pass urgent:false.
   * @returns {{ ok: boolean, urgent: boolean, reason?: string }}
   */
  admit({ urgent = false } = {}) {
    const today = new Date().toDateString();
    if (today !== this.day) {
      this.day = today;
      this.count = 0; // daily roll
    }
    if (urgent === true) return { ok: true, urgent: true }; // emergency channel
    if (this.count >= this.maxReportsPerDay) {
      return { ok: false, urgent: false, reason: `routine report cap reached (${this.maxReportsPerDay}/day)` };
    }
    this.count += 1;
    return { ok: true, urgent: false };
  }
}

/**
 * Build one report payload (structured, evidence-referencing).
 * @param {object} input - { kind, title, body, evidenceRefs, meta }
 * @returns {object} report payload (JSON-serializable, lossless).
 */
export function buildReport(input) {
  const payload = {
    kind: input.kind,
    title: input.title ?? "",
    body: input.body ?? "",
    createdAt: new Date().toISOString(),
  };
  if (Array.isArray(input.evidenceRefs) && input.evidenceRefs.length > 0) payload.evidenceRefs = input.evidenceRefs;
  if (input.meta !== undefined) payload.meta = input.meta;
  return payload;
}

/**
 * Compose a handover report from worker state (降级/暂停/重启时).
 * Reuses the Paseo-style handoff shape (Task/Context/State/Next).
 * @param {object} state - { status, downgrade, fatal, registrySummary, budget, lastError? }
 * @returns {object} handover payload.
 */
export function buildHandover(state) {
  return buildReport({
    kind: REPORT_KIND.HANDOVER,
    title: "Worker handover",
    body: [
      `status: ${state.status ?? "unknown"}`,
      `downgrade: ${state.downgrade ?? "normal"}`,
      `fatal: ${state.fatal === true}`,
      `active records: ${state.registrySummary?.active ?? 0}`,
      state.lastError ? `last error: ${state.lastError}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    evidenceRefs: state.evidenceRefs ?? [],
  });
}

/** Milestone report (关键节点完成). */
export function buildMilestone({ title, body, evidenceRefs }) {
  return buildReport({ kind: REPORT_KIND.MILESTONE, title, body, evidenceRefs });
}

/** Review report (日/周复盘). */
export function buildReview({ period, summary, quality, cost, nextSteps }) {
  return buildReport({
    kind: REPORT_KIND.REVIEW,
    title: `Review ${period}`,
    body: [summary, quality ? `quality: ${quality}` : null, cost ? `cost: ${cost}` : null, nextSteps ? `next: ${nextSteps}` : null]
      .filter(Boolean)
      .join("\n"),
  });
}

export const internals = { REPORT_KIND };
