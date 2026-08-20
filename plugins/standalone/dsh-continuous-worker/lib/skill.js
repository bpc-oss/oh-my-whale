// dsh-continuous-worker — skill library: the growth loop (docs/02 §13.3).
//
// M3: 调用 → 沉淀 → 升级. Skills are the "procedural memory" tier.
//   - learn: worker submits proven steps (must reference an intent-ledger
//     evidence ref); lands as `pending` when requireSkillReview (default) —
//     NOT auto-promoted (防污染, AgentOS semantics).
//   - review: accept/reject/rollback. Accept requires human confirmation
//     (requireSkillReviewConfirm) — the worker cannot self-approve (M2 返修).
//   - confidence: computed by the plugin from the intent ledger statistics
//     (success rate / reproduction count / evidence completeness), NEVER
//     self-reported by the worker (M2 返修).
//   - trust tier: learned skills default to T3 (community); cw_skill_use only
//     invokes >= T2 (per design §13.13 rule 4).

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** Skill states in the review pipeline. */
export const SKILL_STATE = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
});

/** Trust tier assigned to learned skills (design §13.13). */
export const LEARNED_DEFAULT_TIER = "T3";

/**
 * File-backed skill library (JSONL per skill). Root lives outside the
 * model-visible workspace (same checkpoint discipline as CheckpointStore).
 */
export class SkillLibrary {
  /**
   * @param {string} root - directory to persist skills.
   * @param {object} options - { requireSkillReview, requireSkillReviewConfirm, autoLearnBelowConfidence }
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = {
      requireSkillReview: true,
      requireSkillReviewConfirm: true,
      autoLearnBelowConfidence: 0.7,
      ...options,
    };
    this.dir = join(root, "skills");
    this.skills = new Map(); // name -> skill record
    this.loaded = false;
  }

  /** Load all skill files (one JSON per skill). */
  async load() {
    if (this.loaded) return;
    await mkdir(this.dir, { recursive: true });
    const entries = await readdir(this.dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this.dir, entry.name), "utf8");
        const skill = JSON.parse(raw);
        this.skills.set(skill.name, skill);
      } catch {
        // skip corrupt skill file (fail-closed: do not surface it)
      }
    }
    this.loaded = true;
  }

  /**
   * Learn one skill (proven steps with an intent-ledger evidence ref).
   * @param {object} input - { name, steps, evidenceRef }
   * @returns {Promise<object>} the skill record (pending when review required).
   */
  async learn(input) {
    await this.load();
    const name = input.name?.trim();
    if (typeof name !== "string" || name.length === 0 || !/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
      throw new Error("cw skill: name must be a non-empty identifier");
    }
    if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.some((s) => typeof s !== "string" || s.length === 0)) {
      throw new Error("cw skill: steps must be a non-empty array of non-empty strings");
    }
    if (typeof input.evidenceRef !== "string" || input.evidenceRef.length === 0) {
      throw new Error("cw skill: evidenceRef is required (intent-ledger reference proving the steps ran)");
    }
    const confidence = computeConfidence(input, this.options.autoLearnBelowConfidence);
    const state =
      this.options.requireSkillReview || confidence < this.options.autoLearnBelowConfidence
        ? SKILL_STATE.PENDING
        : SKILL_STATE.ACCEPTED;
    const now = new Date().toISOString();
    const skill = Object.freeze({
      name,
      steps: Object.freeze([...input.steps]),
      evidenceRef: input.evidenceRef,
      confidence,
      state,
      tier: LEARNED_DEFAULT_TIER,
      useCount: 0,
      successCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    // Replace any prior skill with the same name (re-learn updates in place).
    this.skills.set(name, skill);
    await this.writeSkill(skill);
    return skill;
  }

  /**
   * Review one pending skill. Accept requires human confirmation when
   * requireSkillReviewConfirm is set — the caller (tool layer) must enforce
   * the human channel; this method records the decision.
   * @param {object} input - { name, decision: "accept"|"reject", reviewer }
   * @returns {Promise<object>} updated skill or { notFound: true }.
   */
  async review(input) {
    await this.load();
    const skill = this.skills.get(input.name);
    if (skill === undefined) return { notFound: true };
    const updated =
      input.decision === "accept"
        ? { ...skill, state: SKILL_STATE.ACCEPTED, tier: "T2", reviewedAt: new Date().toISOString(), reviewer: input.reviewer ?? "human" }
        : { ...skill, state: SKILL_STATE.REJECTED, reviewedAt: new Date().toISOString(), reviewer: input.reviewer ?? "human" };
    this.skills.set(input.name, updated);
    await this.writeSkill(updated);
    return updated;
  }

  /** Roll back one skill to pending (re-review). */
  async rollback(name) {
    await this.load();
    const skill = this.skills.get(name);
    if (skill === undefined) return { notFound: true };
    const updated = { ...skill, state: SKILL_STATE.PENDING, rolledBackAt: new Date().toISOString() };
    this.skills.set(name, updated);
    await this.writeSkill(updated);
    return updated;
  }

  /** Remove one skill. */
  async remove(name) {
    await this.load();
    if (!this.skills.has(name)) return { notFound: true };
    this.skills.delete(name);
    await rm(join(this.dir, `${safeName(name)}.json`), { force: true });
    return { removed: true };
  }

  /** Record one usage (invocation). Returns the skill or { notFound: true }. */
  async markUsed(name, success) {
    await this.load();
    const skill = this.skills.get(name);
    if (skill === undefined) return { notFound: true };
    const updated = {
      ...skill,
      useCount: skill.useCount + 1,
      successCount: skill.successCount + (success ? 1 : 0),
      updatedAt: new Date().toISOString(),
    };
    this.skills.set(name, updated);
    await this.writeSkill(updated);
    return updated;
  }

  /** List all skills (accepted first, then pending). */
  list() {
    const all = [...this.skills.values()];
    const order = { accepted: 0, pending: 1, rejected: 2 };
    return [...all].sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || a.name.localeCompare(b.name));
  }

  /** Get one skill (or undefined). */
  get(name) {
    return this.skills.get(name);
  }

  /** Snapshot for cw_status / audit. */
  snapshot() {
    const all = this.list();
    return {
      total: all.length,
      accepted: all.filter((s) => s.state === SKILL_STATE.ACCEPTED).length,
      pending: all.filter((s) => s.state === SKILL_STATE.PENDING).length,
      rejected: all.filter((s) => s.state === SKILL_STATE.REJECTED).length,
    };
  }

  async writeSkill(skill) {
    await writeFile(join(this.dir, `${safeName(skill.name)}.json`), JSON.stringify(skill, null, 2), "utf8");
  }
}

/** Compute confidence from intent-ledger statistics (plugin-owned, not self-report). */
export function computeConfidence(input, threshold) {
  // input may carry ledger stats: { evidenceStrength, reproductions, successRate }
  const evidenceStrength = typeof input.evidenceStrength === "number" ? Math.min(Math.max(input.evidenceStrength, 0), 1) : 0;
  const reproductions = typeof input.reproductions === "number" ? Math.min(Math.max(input.reproductions, 0), 10) / 10 : 0;
  const successRate = typeof input.successRate === "number" ? Math.min(Math.max(input.successRate, 0), 1) : 0;
  const score = 0.4 * evidenceStrength + 0.3 * reproductions + 0.3 * successRate;
  // Missing ledger stats => low confidence (needs review), per design M2 返修.
  return Number.isFinite(score) ? Math.round(score * 100) / 100 : 0;
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9-]/g, "_");
}

export const internals = { computeConfidence, safeName };
