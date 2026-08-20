// dsh-continuous-worker — durable registry over the session event log.
//
// M1 scope: schedule + heartbeat records folded from session events, in the
// same append-only fold style as dsh-schedule's `schedule/change` stream.
// Every create/update/delete/dispatch is a durable event; the live view is a
// disposable projection rebuilt by folding. This mirrors the evidence in
// docs/01 (session.append + fold) and docs/02 §6.2 (账本追加到 worker 持久会话).

const CHANGE_VERSION = 1;

/** Stable plugin-owned event type prefix (session-local namespace). */
export const EVENT_PREFIX = "continuous-worker/change";

/** Closed record kinds for M1. */
export const RECORD_KIND = Object.freeze({
  SCHEDULE: "schedule",
  HEARTBEAT: "heartbeat",
});

/**
 * Allocate the next readable id without reusing any prior session-local id.
 * @param {Set<string>} seen - every previously used id.
 * @returns {string} a fresh `cw-<N>` identity.
 */
export function allocateRecordId(seen) {
  let sequence = seen.size + 1;
  let candidate = `cw-${sequence}`;
  while (seen.has(candidate)) {
    sequence += 1;
    candidate = `cw-${sequence}`;
  }
  return candidate;
}

/** Require exactly the named durable object keys (v1: no optional keys). */
function hasExactKeys(value, expected) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

/**
 * UI v4 (专家审查 P0①): 可选键白名单 — project/task 属展示增强字段,
 * 历史记录无此键也必须能 decode (向前兼容)。校验规则: 核心键必须存在,
 * 可选键只在存在时校验类型。
 */
const OPTIONAL_RECORD_KEYS = ["project", "task", "createdAt"];

function hasCoreKeys(value, expected) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  for (const want of expected) if (!keys.includes(want)) return false;
  for (const key of keys) {
    if (!expected.includes(key) && !OPTIONAL_RECORD_KEYS.includes(key)) return false;
  }
  return true;
}

/** Decode the exact v1 schedule record shape (with optional project/task). */
function decodeScheduleRecord(value) {
  if (!hasCoreKeys(value, ["id", "kind", "rule", "prompt", "maxRuns", "expiresIn", "scheduledAt", "runCount", "state"])) {
    throw new Error("cw: schedule record must contain exactly id/kind/rule/prompt/maxRuns/expiresIn/scheduledAt/runCount/state (+ optional project/task)");
  }
  const { id, kind, rule, prompt, maxRuns, expiresIn, scheduledAt, runCount, state } = value;
  if (typeof id !== "string" || id.length === 0) throw new Error("cw: schedule id must be a non-empty string");
  if (kind !== RECORD_KIND.SCHEDULE) throw new Error("cw: schedule record kind mismatch");
  if (typeof rule !== "object" || rule === null) throw new Error("cw: schedule rule must be an object");
  if (typeof prompt !== "string" || prompt.length === 0) throw new Error("cw: schedule prompt must be a non-empty string");
  if (typeof maxRuns !== "number" || !Number.isSafeInteger(maxRuns) || maxRuns <= 0) throw new Error("cw: schedule maxRuns must be a positive safe integer");
  if (typeof expiresIn !== "string" || expiresIn.length === 0) throw new Error("cw: schedule expiresIn must be a non-empty string");
  if (typeof scheduledAt !== "string") throw new Error("cw: schedule scheduledAt must be a string");
  if (typeof runCount !== "number" || !Number.isSafeInteger(runCount) || runCount < 0) throw new Error("cw: schedule runCount must be a non-negative safe integer");
  if (state !== "active" && state !== "paused" && state !== "faulted" && state !== "done") {
    throw new Error("cw: schedule state must be active|paused|faulted|done");
  }
  const project = value.project === undefined ? null : value.project;
  const task = value.task === undefined ? null : value.task;
  if (project !== null && typeof project !== "string") throw new Error("cw: schedule project must be a string or null");
  if (task !== null && typeof task !== "string") throw new Error("cw: schedule task must be a string or null");
  return Object.freeze({ id, kind, rule: Object.freeze({ ...rule }), prompt, maxRuns, expiresIn, scheduledAt, runCount, state, project, task });
}

/** Decode the exact v1 heartbeat record shape (with optional project/task). */
function decodeHeartbeatRecord(value) {
  if (!hasCoreKeys(value, ["id", "kind", "intervalSeconds", "prompt", "maxRuns", "expiresIn", "stepTokenBudget", "scheduledAt", "runCount", "state"])) {
    throw new Error("cw: heartbeat record must contain exactly id/kind/intervalSeconds/prompt/maxRuns/expiresIn/stepTokenBudget/scheduledAt/runCount/state (+ optional project/task)");
  }
  const { id, kind, intervalSeconds, prompt, maxRuns, expiresIn, stepTokenBudget, scheduledAt, runCount, state } = value;
  if (typeof id !== "string" || id.length === 0) throw new Error("cw: heartbeat id must be a non-empty string");
  if (kind !== RECORD_KIND.HEARTBEAT) throw new Error("cw: heartbeat record kind mismatch");
  if (typeof intervalSeconds !== "number" || !Number.isSafeInteger(intervalSeconds) || intervalSeconds < 30) {
    throw new Error("cw: heartbeat intervalSeconds must be a safe integer >= 30");
  }
  if (typeof prompt !== "string" || prompt.length === 0) throw new Error("cw: heartbeat prompt must be a non-empty string");
  if (typeof maxRuns !== "number" || !Number.isSafeInteger(maxRuns) || maxRuns <= 0) throw new Error("cw: heartbeat maxRuns must be a positive safe integer");
  if (typeof expiresIn !== "string" || expiresIn.length === 0) throw new Error("cw: heartbeat expiresIn must be a non-empty string");
  if (typeof stepTokenBudget !== "number" || !Number.isSafeInteger(stepTokenBudget) || stepTokenBudget <= 0) {
    throw new Error("cw: heartbeat stepTokenBudget must be a positive safe integer");
  }
  if (typeof scheduledAt !== "string") throw new Error("cw: heartbeat scheduledAt must be a string");
  if (typeof runCount !== "number" || !Number.isSafeInteger(runCount) || runCount < 0) throw new Error("cw: heartbeat runCount must be a non-negative safe integer");
  if (state !== "active" && state !== "paused" && state !== "faulted" && state !== "done") {
    throw new Error("cw: heartbeat state must be active|paused|faulted|done");
  }
  const project = value.project === undefined ? null : value.project;
  const task = value.task === undefined ? null : value.task;
  if (project !== null && typeof project !== "string") throw new Error("cw: heartbeat project must be a string or null");
  if (task !== null && typeof task !== "string") throw new Error("cw: heartbeat task must be a string or null");
  const createdAt = value.createdAt === undefined ? null : value.createdAt;
  if (createdAt !== null && typeof createdAt !== "string") throw new Error("cw: heartbeat createdAt must be a string or null");
  return Object.freeze({ id, kind, intervalSeconds, prompt, maxRuns, expiresIn, stepTokenBudget, scheduledAt, runCount, state, project, task, createdAt });
}

/** Decode one record variant by its exact discriminator. */
export function decodeRecord(value) {
  if (typeof value !== "object" || value === null) throw new Error("cw: record must be an object");
  switch (value.kind) {
    case RECORD_KIND.SCHEDULE:
      return decodeScheduleRecord(value);
    case RECORD_KIND.HEARTBEAT:
      return decodeHeartbeatRecord(value);
    default:
      throw new Error(`cw: v1 record kind must be "schedule" or "heartbeat"`);
  }
}

/** Decode one strict version-1 `continuous-worker/change` payload. */
export function decodeChange(value) {
  if (typeof value !== "object" || value === null) throw new Error("cw: change payload must be an object");
  if (value.version !== CHANGE_VERSION) throw new Error(`cw: change version must be ${CHANGE_VERSION}`);
  switch (value.operation) {
    case "create":
      if (!hasExactKeys(value, ["version", "operation", "record"])) throw new Error("cw: create must contain exactly version/operation/record");
      return Object.freeze({ version: CHANGE_VERSION, operation: "create", record: decodeRecord(value.record) });
    case "update":
      if (!hasExactKeys(value, ["version", "operation", "record"])) throw new Error("cw: update must contain exactly version/operation/record");
      return Object.freeze({ version: CHANGE_VERSION, operation: "update", record: decodeRecord(value.record) });
    case "delete":
      if (!hasExactKeys(value, ["version", "operation", "id"])) throw new Error("cw: delete must contain exactly version/operation/id");
      if (typeof value.id !== "string" || value.id.length === 0) throw new Error("cw: delete id must be a non-empty string");
      return Object.freeze({ version: CHANGE_VERSION, operation: "delete", id: value.id });
    case "dispatch":
      if (!hasExactKeys(value, ["version", "operation", "id", "at"])) throw new Error("cw: dispatch must contain exactly version/operation/id/at");
      if (typeof value.id !== "string" || value.id.length === 0) throw new Error("cw: dispatch id must be a non-empty string");
      if (typeof value.at !== "string") throw new Error("cw: dispatch at must be an ISO string");
      return Object.freeze({ version: CHANGE_VERSION, operation: "dispatch", id: value.id, at: value.at });
    case "fault":
      if (!hasExactKeys(value, ["version", "operation", "id", "reason"])) throw new Error("cw: fault must contain exactly version/operation/id/reason");
      if (typeof value.id !== "string" || value.id.length === 0) throw new Error("cw: fault id must be a non-empty string");
      if (typeof value.reason !== "string" || value.reason.length === 0) throw new Error("cw: fault reason must be a non-empty string");
      return Object.freeze({ version: CHANGE_VERSION, operation: "fault", id: value.id, reason: value.reason });
    default:
      throw new Error(`cw: change operation must be create|update|delete|dispatch|fault`);
  }
}

/**
 * Fold the plugin-owned stream after the durable fork seed boundary.
 * @param {Array} events - complete ordered session log.
 * @param {number} seedLength - inherited prefix excluded from ownership.
 * @returns {{ active: Array, seenIds: string[] }} frozen fold result.
 */
export function foldWorkerEvents(events, seedLength = 0) {
  if (!Number.isSafeInteger(seedLength) || seedLength < 0 || seedLength > events.length) {
    throw new Error("cw: seedLength must be within the supplied event log");
  }
  const active = new Map();
  const seen = new Set();
  for (const event of events.slice(seedLength)) {
    if (event.type !== EVENT_PREFIX) continue;
    const change = decodeChange(event.data);
    switch (change.operation) {
      case "create":
        if (seen.has(change.record.id)) throw new Error(`cw: record id ${JSON.stringify(change.record.id)} was reused`);
        seen.add(change.record.id);
        active.set(change.record.id, change.record);
        break;
      case "update": {
        const prev = active.get(change.record.id);
        if (prev === undefined) throw new Error(`cw: update targets inactive id ${JSON.stringify(change.record.id)}`);
        active.set(change.record.id, change.record);
        break;
      }
      case "delete":
        if (!active.delete(change.id)) throw new Error(`cw: delete targets inactive id ${JSON.stringify(change.id)}`);
        break;
      case "dispatch": {
        const record = active.get(change.id);
        if (record === undefined) throw new Error(`cw: dispatch targets inactive id ${JSON.stringify(change.id)}`);
        const next = { ...record, runCount: record.runCount + 1 };
        if (next.runCount >= next.maxRuns) next.state = "done";
        active.set(change.id, Object.freeze(next));
        break;
      }
      case "fault": {
        const record = active.get(change.id);
        if (record === undefined) throw new Error(`cw: fault targets inactive id ${JSON.stringify(change.id)}`);
        active.set(change.id, Object.freeze({ ...record, state: "faulted" }));
        break;
      }
      default:
        throw new Error(`cw: unknown decoded change ${String(change)}`);
    }
  }
  return Object.freeze({ active: Object.freeze([...active.values()]), seenIds: Object.freeze([...seen]) });
}

/** Build a frozen v1 schedule record (validated inputs expected). */
export function buildScheduleRecord({ id, rule, prompt, maxRuns, expiresIn, scheduledAt, project = null, task = null }) {
  return Object.freeze({
    id, kind: RECORD_KIND.SCHEDULE, rule: Object.freeze({ ...rule }), prompt,
    maxRuns, expiresIn, scheduledAt, runCount: 0, state: "active", project, task,
  });
}

/** Build a frozen v1 heartbeat record (validated inputs expected). */
export function buildHeartbeatRecord({ id, intervalSeconds, prompt, maxRuns, expiresIn, stepTokenBudget, scheduledAt, project = null, task = null, createdAt = null }) {
  return Object.freeze({
    id, kind: RECORD_KIND.HEARTBEAT, intervalSeconds, prompt,
    maxRuns, expiresIn, stepTokenBudget, scheduledAt, runCount: 0, state: "active", project, task,
    // TTL 锚点: 创建时间 (advanceHeartbeat 前移 scheduledAt 不影响 TTL — 防永不过期)
    createdAt: createdAt ?? scheduledAt,
  });
}

/** Parse a TTL string like '24h', '7d', '30m' into milliseconds (NaN if bad). */
export function parseTtlMs(expiresIn) {
  if (typeof expiresIn !== "string") return NaN;
  const m = /^(\d+)(ms|s|m|h|d)$/i.exec(expiresIn.trim());
  if (m === null) return NaN;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * mult;
}

/** Whether a record has expired (TTL elapsed since creation), per M2 H1. */
export function isExpired(record, now) {
  const ttlMs = parseTtlMs(record.expiresIn);
  if (!Number.isFinite(ttlMs)) return false; // unparseable TTL: treat as no expiry
  // TTL 锚点: heartbeat 用 createdAt (advanceHeartbeat 前移 scheduledAt 不影响 TTL);
  // 其余用 scheduledAt (创建锚点).
  const anchorRaw = record.kind === RECORD_KIND.HEARTBEAT ? (record.createdAt ?? record.scheduledAt) : record.scheduledAt;
  const anchor = Date.parse(anchorRaw) || now;
  return now - anchor > ttlMs;
}

/** Canonical view for a record at wall-clock `now`. */
export function recordView(record, now) {
  const due = now >= Date.parse(record.scheduledAt);
  const expired = isExpired(record, now);
  // M2 H1 fix: expired records are surfaced with state expired and never due.
  return Object.freeze({
    ...record,
    state: expired && record.state === "active" ? "expired" : record.state,
    due: expired ? false : due,
    expired,
    deliveryMode: "session-local",
  });
}

/**
 * Produce a paused copy of a record (state -> "paused"). M2: human takeover
 * via cw_pause. The caller appends `changeUpdate(pausedRecord)` to persist it.
 */
export function pauseRecord(record) {
  if (record.state === "done" || record.state === "faulted") {
    throw new Error(`cw: cannot pause record in state ${record.state}`);
  }
  return Object.freeze({ ...record, state: "paused" });
}

/** Produce a resumed copy of a paused record (state -> "active"). */
export function resumeRecord(record) {
  if (record.state !== "paused") {
    throw new Error(`cw: cannot resume record in state ${record.state}`);
  }
  return Object.freeze({ ...record, state: "active" });
}

/** Produce a copy scheduled for the next interval (heartbeat advance). */
export function advanceHeartbeat(record, now) {
  if (record.kind !== RECORD_KIND.HEARTBEAT) {
    throw new Error("cw: advanceHeartbeat requires a heartbeat record");
  }
  const next = now + record.intervalSeconds * 1000;
  return Object.freeze({
    ...record,
    scheduledAt: new Date(next).toISOString(),
    runCount: record.runCount + 1,
    state: record.runCount + 1 >= record.maxRuns ? "done" : "active",
  });
}

/** Stable change payload helpers (caller appends to the session). */
export function changeCreate(record) {
  return { version: CHANGE_VERSION, operation: "create", record };
}
export function changeUpdate(record) {
  return { version: CHANGE_VERSION, operation: "update", record };
}
export function changeDelete(id) {
  return { version: CHANGE_VERSION, operation: "delete", id };
}
export function changeDispatch(id, at) {
  return { version: CHANGE_VERSION, operation: "dispatch", id, at };
}
export function changeFault(id, reason) {
  return { version: CHANGE_VERSION, operation: "fault", id, reason };
}

/** Whether a record is currently dispatchable (active and not budget-faulted). */
export function isDispatchable(record) {
  return record.state === "active";
}

export const internals = {
  CHANGE_VERSION,
  decodeRecord,
  hasExactKeys,
};
