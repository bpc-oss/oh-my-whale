// dsh-continuous-worker — persona: the worker's identity & red lines
// (docs/02 §13.1 人格 + §13.4 persona 红线 + M5 双轨).
//
// P1 (coverage-audit P1): Kimi Claw 对标 —— "tell once, apply forever".
//   - persona 固化: name / tone / outputFormat / constraints (版本化, 可审阅);
//   - constraints 双轨 (M5 返修):
//       * 提示性自约束 (默认): 注入 prompt, 供模型自觉遵守;
//       * enforcePersona: true → 宿主强制闸 (guardrails pre-execute 拦截,
//         cw_persona_set 对已启用强制闸字段要求人工确认)。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_PERSONA = Object.freeze({
  name: "",
  tone: "professional",
  outputFormat: "",
  constraints: Object.freeze([]),
  version: 1,
  updatedAt: null,
});

/**
 * Durable persona store (single JSON document, versioned).
 */
export class PersonaStore {
  constructor(root) {
    this.dir = root;
    this.file = join(root, "persona.json");
    this.persona = { ...DEFAULT_PERSONA };
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      this.persona = { ...DEFAULT_PERSONA, ...parsed };
    } catch (error) {
      if (error.code !== "ENOENT") throw error; // missing = default
    }
    this.loaded = true;
  }

  get() {
    return this.persona;
  }

  /**
   * Update one persona field (versioned).
   * When `requireConfirm` is set for a protected field, the caller (tool layer)
   * must route through the human channel — this method only records.
   * @param {object} patch - { name?, tone?, outputFormat?, constraints? }
   * @param {string} updater - "worker" | "human"
   */
  async update(patch, updater = "worker") {
    await this.load();
    const next = {
      ...this.persona,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.tone !== undefined ? { tone: patch.tone } : {}),
      ...(patch.outputFormat !== undefined ? { outputFormat: patch.outputFormat } : {}),
      ...(Array.isArray(patch.constraints) ? { constraints: Object.freeze([...patch.constraints]) } : {}),
      version: this.persona.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: updater,
    };
    this.persona = next;
    await writeFile(this.file, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  /**
   * Persona red-line enforcement (M5): decide whether a tool call violates a
   * persona constraint. Pure predicate — the guardrails pre-execute hook calls
   * it when enforcePersona is enabled.
   * @param {object} call - { toolName, argsText }
   * @returns {{ blocked: boolean, reason?: string }}
   */
  enforce(call) {
    const constraints = this.persona.constraints ?? [];
    if (constraints.length === 0) return { blocked: false };
    const text = `${call.toolName ?? ""} ${call.argsText ?? ""}`.toLowerCase();
    for (const c of constraints) {
      if (typeof c !== "string" || c.length === 0) continue;
      const needle = c.toLowerCase();
      // Constraint syntax: "no <pattern>" | "<pattern>" — match substring.
      if (text.includes(needle.replace(/^no\s+/, ""))) {
        return { blocked: true, reason: `persona constraint: ${c}` };
      }
    }
    return { blocked: false };
  }

  /** Snapshot for cw_status / audit (no secrets). */
  snapshot() {
    return {
      name: this.persona.name,
      tone: this.persona.tone,
      outputFormat: this.persona.outputFormat,
      constraintCount: (this.persona.constraints ?? []).length,
      version: this.persona.version,
      updatedAt: this.persona.updatedAt,
    };
  }
}

export const internals = { DEFAULT_PERSONA };
