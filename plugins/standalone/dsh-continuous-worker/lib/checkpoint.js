// dsh-continuous-worker — checkpoint: durable intent ledger + idempotent resume.
//
// M2 scope (docs/02 §6.2/§9.3): each executed intent is persisted with an
// idempotency key BEFORE its external side effects run. On cold start we fold
// the checkpoint store and classify in-flight intents:
//   - completed (dispatch event exists) -> skip (no repeat side effects);
//   - intent persisted but not confirmed   -> retryable (verify-before-retry).
//
// The store lives on the host filesystem under the profile home (NOT in the
// model-visible workspace), matching the design's "意图日志落盘" (docs/02 §6.2).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/** One durable intent record. */
export class CheckpointStore {
  /**
   * @param {string} root - directory to persist checkpoint records (JSONL).
   */
  constructor(root) {
    this.root = root;
    this.file = join(root, "intents.jsonl");
    this.records = new Map(); // key: intentKey -> { key, recordId, at, status }
    this.loaded = false;
  }

  /** Load the durable store once (idempotent). 坏行跳过 (防一行损坏炸整个账本). */
  async load() {
    if (this.loaded) return;
    await mkdir(this.root, { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      for (const line of raw.split("\n")) {
        if (line.trim().length === 0) continue;
        try {
          const record = JSON.parse(line);
          if (record?.key) this.records.set(record.key, record);
        } catch { /* skip corrupt line */ }
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error; // missing file = empty store
    }
    this.loaded = true;
  }

  /**
   * Persist one intent BEFORE side effects. Returns the idempotency key.
   * Calling twice with the same (recordId, at) returns the same key and does
   * NOT double-write (verify-before-retry semantics).
   * @param {object} intent - { recordId, at, action }
   * @returns {Promise<string>} the idempotency key.
   */
  async begin(intent) {
    await this.load();
    const key = `${intent.recordId}@${intent.at}`;
    if (!this.records.has(key)) {
      const record = Object.freeze({ key, recordId: intent.recordId, at: intent.at, action: intent.action, status: "in-flight", createdAt: new Date().toISOString() });
      this.records.set(key, record);
      await this.append(record);
    }
    return key;
  }

  /** Mark one intent completed (after the side effect is confirmed). */
  async complete(key) {
    await this.load();
    const prev = this.records.get(key);
    if (prev === undefined) return false;
    const next = { ...prev, status: "completed", completedAt: new Date().toISOString() };
    this.records.set(key, next);
    await this.append(next);
    return true;
  }

  /**
   * Classify an in-flight intent at cold start.
   * @param {string} key - idempotency key.
   * @returns {"completed"|"retryable"|"unknown"}
   */
  classify(key) {
    const record = this.records.get(key);
    if (record === undefined) return "unknown";
    return record.status === "completed" ? "completed" : "retryable";
  }

  /** Append one line to the store (atomic-ish: single write per mutation). */
  async append(record) {
    const line = JSON.stringify(record);
    await writeFile(this.file, line + "\n", { flag: "a", encoding: "utf8" });
  }

  /** Snapshot for cw_status / audit (no secrets). */
  snapshot(limit = 10) {
    const all = [...this.records.values()];
    const recent = all
      .slice()
      .sort((a, b) => Date.parse(b.at ?? b.createdAt) - Date.parse(a.at ?? a.createdAt))
      .slice(0, limit)
      .map((r) => ({ key: r.key, recordId: r.recordId, at: r.at, action: r.action, status: r.status }));
    return {
      loaded: this.loaded,
      total: all.length,
      inFlight: all.filter((r) => r.status === "in-flight").length,
      completed: all.filter((r) => r.status === "completed").length,
      recent,
    };
  }
}

export const internals = {};
