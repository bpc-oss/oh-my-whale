// dsh-continuous-worker — replay: intent-log time travel for audit (docs/02 §12 M3).
//
// M4: 时间旅行/回放 — 仅回放 checkpoint 意图日志（审计），明确不回放 LLM 执行
// (L4 返修: 可重放的是意图日志，不是模型输出). This is read-only: it reads
// the durable intent store and presents the ordered history for review.

/**
 * Replay the intent log for one record (audit view).
 * @param {object} checkpoint - CheckpointStore instance (loaded).
 * @param {object} options - { recordId?, from?, to? }
 * @returns {Promise<object>} { entries, summary }
 */
export async function replayIntents(checkpoint, options = {}) {
  await checkpoint.load();
  let entries = [...checkpoint.records.values()];
  if (options.recordId !== undefined) {
    entries = entries.filter((e) => e.recordId === options.recordId);
  }
  if (options.from !== undefined) {
    const fromMs = Date.parse(options.from);
    entries = entries.filter((e) => Date.parse(e.at) >= fromMs);
  }
  if (options.to !== undefined) {
    const toMs = Date.parse(options.to);
    entries = entries.filter((e) => Date.parse(e.at) <= toMs);
  }
  entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const summary = {
    total: entries.length,
    completed: entries.filter((e) => e.status === "completed").length,
    inFlight: entries.filter((e) => e.status === "in-flight").length,
  };
  return { entries, summary };
}

/**
 * Replay the registry event log from a session (audit view).
 * Returns the ordered change operations for one record id.
 * @param {object} folded - result of foldWorkerEvents.
 * @param {string} recordId - record id to trace.
 * @returns {object} { events, summary }
 */
export function replayRegistry(folded, recordId) {
  const events = [];
  for (const record of folded.active) {
    if (record.id === recordId) events.push({ at: record.scheduledAt, op: "active-record", state: record.state, runCount: record.runCount });
  }
  // Note: the fold keeps only *active* records; deleted/terminal records are
  // not recoverable from the fold (they remain in the raw event log for a
  // full audit — see audit events).
  return {
    events,
    summary: { activeEvents: events.length },
  };
}

export const internals = {};
