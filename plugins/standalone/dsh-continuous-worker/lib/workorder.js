// dsh-continuous-worker — work order: accountability chain (docs/02 §13.4).
//
// P2 (coverage-audit P2): 责任链显式化 —— 每个公开动作 = 可追溯的 work_order。
//   - 存储: audit 事件流 (追加式, 可折叠重建);
//   - gatesPassed/reviewStatus 不由 worker 自填 (M4 返修: 自证边界) —
//     gatesPassed 由插件按实际通过的闸记录, reviewStatus 来自独立审查/人工;
//   - 强制点: guardrails post-execute 对白名单外部副作用工具自动生成
//     (tools/post-execute, 审计钩子先例 dsh-verification)。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

let seq = 0;

/** Build one work order (audit record). */
export function buildWorkOrder({ action, actor, evidenceRef, gatesPassed, revertPath }) {
  seq += 1;
  return Object.freeze({
    workOrderId: `wo-${Date.now().toString(36)}-${seq}`,
    timestamp: new Date().toISOString(),
    actor: actor ?? "worker",
    action: action ?? "",
    evidenceRef: evidenceRef ?? null,
    // gatesPassed recorded by the PLUGIN (not worker): budget/red-line/etc.
    gatesPassed: Array.isArray(gatesPassed) ? Object.freeze([...gatesPassed]) : Object.freeze([]),
    revertPath: revertPath ?? null,
    reviewStatus: "pending", // pending | approved | rejected (from review/audit)
  });
}

/**
 * Durable work-order store (JSONL audit stream).
 */
export class WorkOrderStore {
  constructor(root) {
    this.dir = root;
    this.file = join(root, "workorders.jsonl");
    this.orders = [];
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      for (const line of raw.split("\n")) {
        if (line.trim().length === 0) continue;
        this.orders.push(JSON.parse(line));
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  /** Append one work order (追加式 audit). */
  async add(order) {
    await this.load();
    this.orders.push(order);
    await writeFile(this.file, JSON.stringify(order) + "\n", { flag: "a", encoding: "utf8" });
    return order;
  }

  /** Update one order's reviewStatus (host/panel side, NOT worker). */
  async review(workOrderId, status, reviewer = "human") {
    await this.load();
    const idx = this.orders.findIndex((o) => o.workOrderId === workOrderId);
    if (idx < 0) return { notFound: true };
    const updated = { ...this.orders[idx], reviewStatus: status, reviewedAt: new Date().toISOString(), reviewer };
    this.orders[idx] = updated;
    await writeFile(this.file, this.orders.map((o) => JSON.stringify(o)).join("\n") + "\n", "utf8");
    return updated;
  }

  list({ status } = {}) {
    return this.orders.filter((o) => status === undefined || o.reviewStatus === status);
  }

  snapshot() {
    return {
      total: this.orders.length,
      pending: this.orders.filter((o) => o.reviewStatus === "pending").length,
      approved: this.orders.filter((o) => o.reviewStatus === "approved").length,
      rejected: this.orders.filter((o) => o.reviewStatus === "rejected").length,
    };
  }
}

export const internals = { buildWorkOrder };
