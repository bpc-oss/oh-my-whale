// dsh-continuous-worker — long-term memory: layered memory (docs/02 §13.2).
//
// M3: 工作记忆（会话上下文，不固化）/ 情景记忆（意图账本 + 交接物，已有）/
//     长期记忆（本模块：已验证持久事实）/ 程序记忆（技能库，skill.js）。
//
// 治理（设计 §13.2 规则）:
//   - requireRetainReview (default true): EVERY write (incl. explicit retain)
//     lands as `pending` until human confirm — 防一次性观察变规则;
//   - 只存已验证事实、不存密钥; 带来源/时间戳/作用域/过期;
//   - 无旁路: worker 只能经 cw_memory_* 访问（M3 返修 — 插件持有唯一访问面）。

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

export const MEMORY_STATE = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  EXPIRED: "expired",
});

/**
 * File-backed long-term memory store (JSONL per entry, one JSON per entry).
 * Production deployments may swap the backend for Agent OS memory MCP; the
 * plugin stays a *consumer* of that seam (docs/02 §13.2 rule 3) — this local
 * store is the M3 default so the plugin is self-contained.
 */
export class MemoryStore {
  /**
   * @param {string} root - directory to persist memory entries.
   * @param {object} options - { requireRetainReview }
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = { requireRetainReview: true, ...options };
    // Agent OS MCP 对接（剩余项 3）: when `mcpBackend` is provided
    // ({ recall, retain, forget } functions — the plugin holds the MCP seam,
    // the worker only reaches it through cw_memory_*), retain/recall prefer it
    // while the local file store mirrors as fallback (offline-safe).
    this.mcpBackend = options.mcpBackend ?? null;
    this.dir = join(root, "memory");
    this.entries = new Map(); // id -> memory entry
    this.loaded = false;
  }

  /** Load all memory entries. */
  async load() {
    if (this.loaded) return;
    await mkdir(this.dir, { recursive: true });
    const entries = await readdir(this.dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this.dir, entry.name), "utf8");
        const mem = JSON.parse(raw);
        this.entries.set(mem.id, mem);
      } catch {
        // skip corrupt entry (fail-closed)
      }
    }
    this.loaded = true;
  }

  /**
   * Retain one verified fact.
   * @param {object} input - { fact, scope, source, expiresAt? }
   * @returns {Promise<object>} entry (pending when review required).
   */
  async retain(input) {
    await this.load();
    if (typeof input.fact !== "string" || input.fact.trim().length === 0) {
      throw new Error("cw memory: fact must be a non-empty string");
    }
    if (typeof input.source !== "string" || input.source.length === 0) {
      throw new Error("cw memory: source is required (provenance)");
    }
    const id = `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const entry = Object.freeze({
      id,
      fact: input.fact.trim(),
      scope: input.scope ?? "profile",
      source: input.source,
      expiresAt: input.expiresAt ?? null,
      state: this.options.requireRetainReview ? MEMORY_STATE.PENDING : MEMORY_STATE.ACTIVE,
      createdAt: now,
      updatedAt: now,
    });
    this.entries.set(id, entry);
    await this.writeEntry(entry);
    return entry;
  }

  /** Recall active (and optionally pending) entries, newest first.
   *  When an Agent OS MCP backend is configured, its distilled entries are
   *  merged in (marked mcp:true). Local store remains authoritative for the
   *  plugin's own review lifecycle. */
  async recall({ includePending = false, scope } = {}) {
    const local = [...this.entries.values()]
      .filter((e) => e.state === MEMORY_STATE.ACTIVE || (includePending && e.state === MEMORY_STATE.PENDING))
      .filter((e) => (scope === undefined ? true : e.scope === scope))
      .filter((e) => e.expiresAt === null || Date.parse(e.expiresAt) > Date.now())
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    if (this.mcpBackend?.recall === undefined) return local;
    try {
      // P1 (DEV): recall 是 async (返回 Promise) — 必须 await, 否则 Array.isArray(Promise) 恒 false
      const mcp = await this.mcpBackend.recall({ scope: this.options.mcpProject ?? scope });
      const mcpEntries = (Array.isArray(mcp) ? mcp : []).map((m) => ({
        id: `mcp-${m.id ?? m.fact?.slice(0, 12) ?? Math.random().toString(36).slice(2, 8)}`,
        fact: m.fact ?? m.content ?? String(m),
        scope: scope ?? "profile",
        source: "agent-os-mcp",
        state: MEMORY_STATE.ACTIVE,
        mcp: true,
        updatedAt: m.updatedAt ?? new Date().toISOString(),
      }));
      return [...mcpEntries, ...local];
    } catch {
      return local; // MCP unavailable: local only (fail-soft)
    }
  }

  /** Review one pending entry (accept/reject). Human channel enforced by caller. */
  async review(id, decision, reviewer = "human") {
    await this.load();
    const entry = this.entries.get(id);
    if (entry === undefined) return { notFound: true };
    const updated =
      decision === "accept"
        ? { ...entry, state: MEMORY_STATE.ACTIVE, reviewedAt: new Date().toISOString(), reviewer }
        : { ...entry, state: MEMORY_STATE.EXPIRED, reviewedAt: new Date().toISOString(), reviewer };
    this.entries.set(id, updated);
    await this.writeEntry(updated);
    // Agent OS MCP 对接: only ACCEPTED (verified) facts reach the shared MCP —
    // never pending ones (设计 §13.2: 只存已验证事实). Fail-soft if MCP down.
    if (decision === "accept" && this.mcpBackend?.retain !== undefined) {
      try {
        await this.mcpBackend.retain({
          fact: entry.fact,
          client: this.options.mcpClient ?? "dsh",
          project: this.options.mcpProject ?? undefined,
          scope: entry.scope === "global" ? "global" : undefined,
        });
        updated.mcpSynced = true;
        this.entries.set(id, updated);
        await this.writeEntry(updated);
      } catch (error) {
        updated.mcpSyncError = String(error?.message ?? error);
        this.entries.set(id, updated);
        await this.writeEntry(updated);
      }
    }
    return updated;
  }

  /** Forget one entry (local + MCP mirror). */
  async forget(id) {
    await this.load();
    const entry = this.entries.get(id);
    if (entry === undefined) return { notFound: true };
    this.entries.delete(id);
    await rm(join(this.dir, `${safeId(id)}.json`), { force: true });
    if (this.mcpBackend?.forget !== undefined && entry?.mcpSynced === true) {
      try {
        await this.mcpBackend.forget({ fact: entry.fact, client: this.options.mcpClient ?? "dsh" });
      } catch { /* fail-soft */ }
    }
    return { forgotten: true };
  }

  /** Snapshot for cw_status / audit. */
  snapshot() {
    const all = [...this.entries.values()];
    return {
      total: all.length,
      active: all.filter((e) => e.state === MEMORY_STATE.ACTIVE).length,
      pending: all.filter((e) => e.state === MEMORY_STATE.PENDING).length,
    };
  }

  async writeEntry(entry) {
    await writeFile(join(this.dir, `${safeId(entry.id)}.json`), JSON.stringify(entry, null, 2), "utf8");
  }
}

function safeId(id) {
  return id.replace(/[^a-zA-Z0-9-]/g, "_");
}

export const internals = { safeId };
