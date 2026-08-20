// dsh-continuous-worker — probe: self-initiated supervision (docs/02 §13.7).
//
// P0 (v0.5 设计项，coverage-audit P0): 自驱巡检 —— "自己找活干"。
//   - kind: disk | cost | dependency | external (MVP 固定集合, L-G 返修);
//   - check: 确定性检查表达式 (宿主侧执行, 不由模型自由发挥);
//   - onAnomaly: record -> handle -> escalate (三级, 默认 record+escalate);
//   - 防失控: maxRunsPerDay (项级) + dailyBudgetTokens (全局巡检预算) +
//     异常风暴抑制 (同信号降温), 不产生无限任务流;
//   - 与 schedule 分工: schedule=雇主派的活, probe=自己找的活; 共享统一节拍
//     引擎但注册表与预算独立 (M-A 返修)。

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

export const PROBE_KIND = Object.freeze({
  DISK: "disk",
  COST: "cost",
  DEPENDENCY: "dependency",
  EXTERNAL: "external",
});

export const ANOMALY_DISPOSITION = Object.freeze({
  RECORD: "record",
  HANDLE: "handle",
  ESCALATE: "escalate",
});

/** Create one probe definition (validated, bounded). */
export function createProbe(input) {
  if (typeof input.id !== "string" || input.id.length === 0) throw new Error("cw probe: id required");
  if (!Object.values(PROBE_KIND).includes(input.kind)) {
    throw new Error(`cw probe: kind must be one of ${Object.values(PROBE_KIND).join("|")}`);
  }
  if (typeof input.check !== "string" || input.check.trim().length === 0) {
    throw new Error("cw probe: check expression required (deterministic)");
  }
  if (!Number.isSafeInteger(input.intervalSeconds) || input.intervalSeconds < 60) {
    throw new Error("cw probe: intervalSeconds must be a safe integer >= 60");
  }
  const dispositions = Array.isArray(input.onAnomaly)
    ? input.onAnomaly
    : typeof input.onAnomaly === "string"
      ? [input.onAnomaly]
      : ["record", "escalate"];
  for (const d of dispositions) {
    if (!Object.values(ANOMALY_DISPOSITION).includes(d)) {
      throw new Error(`cw probe: onAnomaly must be record|handle|escalate (got ${d})`);
    }
  }
  return Object.freeze({
    id: input.id,
    kind: input.kind,
    check: input.check.trim(),
    intervalSeconds: input.intervalSeconds,
    onAnomaly: Object.freeze(dispositions),
    scope: input.scope ?? "profile",
    enabled: input.enabled !== false,
    maxRunsPerDay: input.maxRunsPerDay ?? 96,
    anomalyCooldownMs: input.anomalyCooldownMs ?? 30 * 60_000,
    lastRunAt: null,
    runCountToday: 0,
    anomalyCount: 0,
    lastAnomalyAt: null,
    lastResult: null,
  });
}

/**
 * Evaluate one deterministic probe check against observed signals.
 * Pure logic — the host provides `observed` values (disk free bytes, cost,
 * dependency state, HTTP status). No model involvement (L-G 返修).
 * @param {object} probe - probe definition.
 * @param {object} observed - { value, threshold, status?, output? }
 * @returns {{ ok: boolean, detail: string, anomaly: boolean }}
 */
export function evaluateProbe(probe, observed) {
  const value = observed.value;
  const threshold = observed.threshold;
  let ok = true;
  let detail = "";
  switch (probe.kind) {
    case PROBE_KIND.DISK: {
      const freeBytes = typeof value === "number" ? value : 0;
      const minFree = typeof threshold === "number" ? threshold : 1_000_000_000; // 1GB default
      ok = freeBytes >= minFree;
      detail = `disk free ${freeBytes} bytes (min ${minFree})`;
      break;
    }
    case PROBE_KIND.COST: {
      const spent = typeof value === "number" ? value : 0;
      const cap = typeof threshold === "number" ? threshold : 50_000;
      ok = spent <= cap;
      detail = `cost ${spent} tokens (cap ${cap})`;
      break;
    }
    case PROBE_KIND.DEPENDENCY: {
      const healthy = observed.status === "ok";
      ok = healthy;
      detail = observed.output ?? `dependency status ${String(observed.status)}`;
      break;
    }
    case PROBE_KIND.EXTERNAL: {
      const status = observed.status ?? -1;
      ok = status >= 200 && status < 400;
      detail = `HTTP ${status} ${observed.output ?? ""}`.trim();
      break;
    }
    default:
      ok = false;
      detail = `unknown kind ${String(probe.kind)}`;
  }
  return Object.freeze({ ok, detail, anomaly: !ok });
}

/** Advance one probe after a run (storm suppression + daily cap). */
export function advanceProbe(probe, result, now = Date.now()) {
  const sameDay = probe.lastRunAt !== null && new Date(probe.lastRunAt).toDateString() === new Date(now).toDateString();
  const runCountToday = sameDay ? probe.runCountToday + 1 : 1;
  const anomaly = result.anomaly;
  // Storm suppression: same-signal anomalies within cooldown are recorded once.
  // Use <= so an anomaly exactly at the cooldown boundary is still suppressed.
  const suppressed =
    anomaly && probe.lastAnomalyAt !== null && now - Date.parse(probe.lastAnomalyAt) <= probe.anomalyCooldownMs;
  const anomalyCount = anomaly ? probe.anomalyCount + (suppressed ? 0 : 1) : probe.anomalyCount;
  return Object.freeze({
    ...probe,
    lastRunAt: new Date(now).toISOString(),
    runCountToday,
    anomalyCount,
    lastAnomalyAt: anomaly ? new Date(now).toISOString() : probe.lastAnomalyAt,
    lastResult: Object.freeze({ ...result, suppressed }),
  });
}

/** Whether a probe is due (interval elapsed and under daily cap). */
export function probeDue(probe, now = Date.now()) {
  if (!probe.enabled) return false;
  if (probe.runCountToday >= probe.maxRunsPerDay) return false;
  if (probe.lastRunAt === null) return true;
  return now - Date.parse(probe.lastRunAt) >= probe.intervalSeconds * 1000;
}

/**
 * Durable probe store (JSONL per probe, same discipline as LoopStore).
 */
export class ProbeStore {
  constructor(root) {
    this.dir = root;
    this.file = join(root, "probes.jsonl");
    this.probes = new Map();
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      for (const line of raw.split("\n")) {
        if (line.trim().length === 0) continue;
        const probe = JSON.parse(line);
        this.probes.set(probe.id, probe);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  async save(probe) {
    await this.load();
    this.probes.set(probe.id, probe);
    const lines = [...this.probes.values()].map((p) => JSON.stringify(p));
    await writeFile(this.file, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
  }

  get(id) {
    return this.probes.get(id);
  }

  list() {
    return [...this.probes.values()];
  }

  async remove(id) {
    await this.load();
    if (!this.probes.has(id)) return { notFound: true };
    this.probes.delete(id);
    const lines = [...this.probes.values()].map((p) => JSON.stringify(p));
    await writeFile(this.file, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
    return { removed: true };
  }

  snapshot() {
    const all = this.list();
    return {
      total: all.length,
      enabled: all.filter((p) => p.enabled).length,
      anomalies: all.filter((p) => p.anomalyCount > 0).length,
    };
  }
}

export const internals = { PROBE_KIND, ANOMALY_DISPOSITION };
