// dsh-continuous-worker — employee prompt store (M1: 灵魂版本管理).
//
// workers/<id>/prompt/
//   current.json     # 当前生效 (软指针 → 实际是完整 prompt 副本 + version)
//   history.jsonl    # append-only 不可变快照 {version, prompt, changedBy, reason, diff, at}
//   drafts/          # evolution 产生的草稿 (需用户批准才升为正式版本)
//
// 来源分级: human/llm-generated 直接生效; evolution 只能 draft (人格字段必须批准).

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createPromptJson, validatePrompt, defaultLimits } from "./prompt-schema.js";

/** 深度合并, 默认值优先 (limits 引擎强制: 传入不能覆盖默认). */
function mergeLimits(defaults, incoming) {
  if (incoming === null || typeof incoming !== "object") return defaults;
  const out = { ...defaults };
  for (const k of Object.keys(incoming)) {
    const d = defaults[k], i = incoming[k];
    if (d && typeof d === "object" && !Array.isArray(d) && i && typeof i === "object" && !Array.isArray(i)) {
      out[k] = mergeLimits(d, i);
    } else {
      out[k] = d ?? i; // 默认优先 (数组/原始值用默认)
    }
  }
  return out;
}

export class PromptStore {
  constructor(workerDir) {
    this.dir = join(workerDir, "prompt");
    this._mutex = Promise.resolve(); // in-process 串行化 (并发版本唯一)
  }

  /** 串行化执行 (防并发 save 重复版本). */
  _serial(fn) {
    const run = this._mutex.then(fn, fn);
    this._mutex = run.catch(() => {});
    return run;
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    await mkdir(join(this.dir, "drafts"), { recursive: true });
  }

  /** 读当前生效 prompt; 无则返回 null. */
  async getCurrent() {
    try {
      const raw = await readFile(join(this.dir, "current.json"), "utf8");
      return JSON.parse(raw);
    } catch { return null; }
  }

  /** 读历史 (newest first); 返回 [{version, changedBy, reason, at}]. */
  async listHistory() {
    try {
      const raw = await readFile(join(this.dir, "history.jsonl"), "utf8");
      return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l)).reverse();
    } catch { return []; }
  }

  /** 版本号 = history 行数 + 1 (在 _serial 内读, 原子唯一). */
  async #nextVersion() {
    const hist = await this.listHistory();
    return hist.length + 1;
  }

  /**
   * 写入新版本. changedBy: human | llm-generated.
   * limits 引擎强制: 每次保存合并 defaultLimits, 调用方(模型/演化)永远改不了 limits.
   * evolution 必须走 saveDraft (直写被拒); 内部批准用 force.
   */
  async save(prompt, { changedBy = "human", reason = "", force = false } = {}) {
    if (!force && changedBy === "evolution") throw new Error("evolution must use saveDraft (approval required)");
    return this._serial(async () => {
      await this.init();
      const nextVersion = await this.#nextVersion();
      // limits 引擎强制: 默认值优先, 传入(模型/演化)永远不能覆盖 (防自我授权)
      const enforcedLimits = mergeLimits(defaultLimits(), prompt.limits ?? {});
      const p = {
        ...prompt,
        limits: enforcedLimits,
        meta: { ...prompt.meta, version: nextVersion, updatedAt: new Date().toISOString(), source: changedBy },
      };
      const check = validatePrompt(p);
      if (!check.ok) throw new Error("invalid prompt: " + check.errors.join("; "));
      // 不可变历史快照
      const hist = { version: nextVersion, prompt: p, changedBy, reason, at: new Date().toISOString() };
      await writeFile(join(this.dir, "history.jsonl"), JSON.stringify(hist) + "\n", { flag: "a" });
      await writeFile(join(this.dir, "current.json"), JSON.stringify(p, null, 2), "utf8");
      return p;
    });
  }

  /** 创建 evolution 草稿 (不直接生效). 人格字段 (identity/persona/values/rules) 必须用户批准. */
  async saveDraft(prompt, { reason = "" } = {}) {
    return this._serial(async () => {
      await this.init();
      const v = await this.getCurrent();
      const version = (v?.meta?.version ?? 0) + 1;
      const p = { ...prompt, meta: { ...prompt.meta, version, updatedAt: new Date().toISOString(), source: "evolution-draft" } };
      const check = validatePrompt(p);
      if (!check.ok) throw new Error("invalid draft: " + check.errors.join("; "));
      const id = `d-${Date.now().toString(36)}`;
      const draft = { id, version, prompt: p, reason, at: new Date().toISOString() };
      await writeFile(join(this.dir, "drafts", `${id}.json`), JSON.stringify(draft, null, 2), "utf8");
      return draft;
    });
  }

  /** 列出草稿. */
  async listDrafts() {
    try {
      const files = await readdir(join(this.dir, "drafts"));
      const out = [];
      for (const f of files) {
        if (f.endsWith(".json")) {
          try { out.push(JSON.parse(await readFile(join(this.dir, "drafts", f), "utf8"))); } catch {}
        }
      }
      return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    } catch { return []; }
  }

  /** 批准草稿 → 成为正式版本 (changedBy=evolution, 用户批准, force 允许内部写). */
  async approveDraft(id) {
    const drafts = await this.listDrafts();
    const d = drafts.find((x) => x.id === id);
    if (!d) return { notFound: true };
    const p = await this.save(d.prompt, { changedBy: "evolution", reason: "approved draft " + id, force: true });
    await rm(join(this.dir, "drafts", `${id}.json`), { force: true });
    return p;
  }

  /** 回滚到历史版本 (回滚本身记一次变更). */
  async rollback(version, { reason = "rollback" } = {}) {
    const history = await this.listHistory();
    const h = history.find((x) => x.version === version);
    if (!h) return { notFound: true };
    const p = await this.save({ ...h.prompt, meta: { ...h.prompt.meta } }, { changedBy: "human", reason });
    return { rolledBack: true, version: p.meta.version, from: version };
  }
}

export const internals = { PromptStore };
