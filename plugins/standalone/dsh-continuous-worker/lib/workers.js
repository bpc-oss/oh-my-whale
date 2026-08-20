// dsh-continuous-worker — worker store: 员工实体 (M1: 目录化 + Prompt 灵魂).
//
// 三方设计定稿 (worker-team-design.md): 员工 = Prompt(灵魂) + 记忆(经历) + 进化(成长).
// 员工从单 JSON 升级为目录 (老格式 <id>.json 兼容迁移):
//   workers/<id>/
//     employee.json   # 元数据 (name/cwd/model/status + prompt 版本指针 + 治理)
//     prompt/         # PromptStore: current.json + history.jsonl + drafts/
//     chat.jsonl      # 工作记忆 (对话历史)
//     timeline.jsonl  # 情景记忆 (M2+)
//     knowledge/      # 语义记忆 (M3+)
//     skills/         # 程序记忆 (M3+)
//     habits.json     # 习惯记忆 (M3+)
//     thinking/       # 思维留痕 (M4+)
//     growth.json     # 成长轨迹 (M4+, 派生)

import { readFile, writeFile, mkdir, readdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { createPromptJson, emptySoul, validatePrompt } from "./employee/prompt-schema.js";
import { PromptStore } from "./employee/prompt-store.js";

/** id 格式校验 (防路径穿越): 只允许 [a-z0-9-]. */
const ID_RE = /^[a-z0-9-]+$/;
export function isValidWorkerId(id) {
  return typeof id === "string" && ID_RE.test(id);
}
/** 路径穿越防护: 任何拼接 dir 的 id 必须合法. */
function assertSafeId(id) {
  if (!isValidWorkerId(id)) throw new Error(`unsafe worker id: ${id}`);
}

export function createWorker({ name, cwd = null, model = null, prompt = null, role = "" } = {}) {
  if (typeof name !== "string" || name.trim().length === 0) throw new Error("worker name required");
  const id = `w-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  // 有效默认灵魂: 用 name 填充身份, 保证过校验
  const effectivePrompt = prompt ?? createPromptJson({
    soul: {
      ...emptySoul(),
      identity: { name: name.trim(), role, emoji: "", visual: {} },
      description: role ? `${role}：负责用户指派的任务` : `负责用户指派的任务`,
      values: ["如实汇报", "不越权限"],
    },
  });
  const meta = {
    id,
    name: name.trim(),
    cwd: typeof cwd === "string" && cwd.length > 0 ? cwd : null,
    model,
    role,
    tasks: [],       // task ids (registry records)
    chat: [],        // 兼容旧字段: 对话历史 (迁移时用)
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "active", // active | paused
    promptVersion: 0, // 当前 prompt 版本 (0 = 未设置灵魂)
    _pendingPrompt: effectivePrompt, // 创建时的初始灵魂 (create 时落盘)
  };
  return Object.freeze(meta);
}

/** 员工存储 (目录化, 插件自管, 独立于 DSH 会话). */
export class WorkerStore {
  constructor(root) {
    this.dir = join(root, "workers");
    this.workers = new Map(); // id -> employee meta
    this.chats = new Map();   // id -> chat array
    this.prompts = new Map(); // id -> PromptStore
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    await mkdir(this.dir, { recursive: true });
    try {
      const entries = await readdir(this.dir, { withFileTypes: true });
      for (const e of entries) {
        // 目录化: workers/<id>/
        if (e.isDirectory()) {
          const id = e.name;
          if (!isValidWorkerId(id)) continue; // 跳过非法目录 (防穿越)
          try {
            const emp = JSON.parse(await readFile(join(this.dir, id, "employee.json"), "utf8"));
            this.workers.set(id, emp);
            this.prompts.set(id, new PromptStore(join(this.dir, id)));
            // chat
            try {
              const raw = await readFile(join(this.dir, id, "chat.jsonl"), "utf8");
              this.chats.set(id, raw.split("\n").filter(Boolean).map((l) => JSON.parse(l)));
            } catch { this.chats.set(id, []); }
          } catch { /* skip corrupt */ }
        }
        // 老格式: workers/<id>.json + <id>.chat.jsonl → 迁移
        // P1 (DEV): 先判 .chat.jsonl (避免被 .json 分支当 JSON 解析后删掉)
        else if (e.name.endsWith(".chat.jsonl")) {
          // chat 文件会随对应 <id>.json 迁移处理; 若 <id>.json 已不存在 (仅剩 chat) 则忽略
          const base = e.name.slice(0, -".chat.jsonl".length);
          try { await access(join(this.dir, `${base}.json`)); } catch { continue; }
        }
        else if (e.name.endsWith(".json")) {
          try {
            const raw = await readFile(join(this.dir, e.name), "utf8");
            const w = JSON.parse(raw);
            if (!isValidWorkerId(w.id)) { await rm(join(this.dir, e.name), { force: true }); continue; } // 恶意 id 直接删
            await this.#migrateLegacy(w);
          } catch { /* skip corrupt */ }
        } else if (e.name.endsWith(".chat.jsonl")) {
          // 老格式 chat 会被迁移流程处理; 这里忽略 (防重复)
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  /** 老格式迁移: <id>.json + <id>.chat.jsonl → <id>/ 目录. */
  async #migrateLegacy(w) {
    if (this.workers.has(w.id)) return; // 已迁移
    assertSafeId(w.id); // 防穿越
    const dir = join(this.dir, w.id);
    await mkdir(dir, { recursive: true });
    const promptStore = new PromptStore(dir);
    await promptStore.init();
    // 迁移 prompt: 老格式无 prompt → 用 meta 生成有效最小灵魂 (保证过校验)
    if (!w.prompt) {
      const p = createPromptJson({
        soul: {
          ...emptySoul(),
          identity: { name: w.name, role: w.role ?? "", emoji: "", visual: {} },
          description: (w.role ? `${w.role}：` : "") + "负责用户指派的任务",
          values: ["如实汇报", "不越权限"],
        },
      });
      await promptStore.save(p, { changedBy: "llm-generated", reason: "legacy migration" });
    } else {
      await promptStore.save(w.prompt, { changedBy: "llm-generated", reason: "legacy migration" });
    }
    // employee.json (去掉 chat 字段, 保留旧字段)
    const { chat, prompt, _pendingPrompt, ...meta } = w;
    meta.promptVersion = 1;
    await writeFile(join(dir, "employee.json"), JSON.stringify(meta, null, 2), "utf8");
    this.workers.set(w.id, meta);
    this.prompts.set(w.id, promptStore);
    // 迁移 chat
    try {
      const raw = await readFile(join(this.dir, `${w.id}.chat.jsonl`), "utf8");
      const entries = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      this.chats.set(w.id, entries);
      await writeFile(join(dir, "chat.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    } catch { this.chats.set(w.id, []); }
    // 删除老文件
    await rm(join(this.dir, `${w.id}.json`), { force: true });
    await rm(join(this.dir, `${w.id}.chat.jsonl`), { force: true });
  }

  /** 创建员工: 建目录 + 初始灵魂必落盘 (不吞失败) + employee.json. */
  async create(worker) {
    await this.load();
    assertSafeId(worker.id);
    const dir = join(this.dir, worker.id);
    await mkdir(dir, { recursive: true });
    const promptStore = new PromptStore(dir);
    await promptStore.init();
    // 初始灵魂: 用 createWorker 的 _pendingPrompt (已保证有效); 无效则抛错 (不静默)
    const p = worker._pendingPrompt ?? createPromptJson({ soul: { ...emptySoul(), identity: { name: worker.name, role: worker.role ?? "", emoji: "", visual: {} }, description: "负责用户指派的任务", values: ["如实汇报", "不越权限"] } });
    const saved = await promptStore.save(p, { changedBy: "llm-generated", reason: "worker creation" });
    const { _pendingPrompt, ...meta } = worker;
    const final = { ...meta, promptVersion: saved.meta.version };
    this.workers.set(worker.id, final);
    this.prompts.set(worker.id, promptStore);
    await writeFile(join(dir, "employee.json"), JSON.stringify(final, null, 2), "utf8");
    await writeFile(join(dir, "chat.jsonl"), "", "utf8");
    return final;
  }

  async save(worker) {
    await this.load();
    const updated = { ...worker, updatedAt: new Date().toISOString() };
    this.workers.set(worker.id, updated);
    await writeFile(join(this.dir, worker.id, "employee.json"), JSON.stringify(updated, null, 2), "utf8");
    return updated;
  }

  async appendChat(id, entry) {
    await this.load();
    const chat = this.chats.get(id) ?? [];
    chat.push(entry);
    this.chats.set(id, chat);
    // P1 (DEV): 追加写 (flag:a) 而非全量重写 (O(n²)); 内存 cap 500 条
      const entry2 = chat[chat.length - 1];
      if (entry2) await writeFile(join(this.dir, id, "chat.jsonl"), JSON.stringify(entry2) + "\n", { flag: "a" });
      if (chat.length > 500) { this.chats.set(id, chat.slice(-300)); }
  }

  getChat(id) { return this.chats.get(id) ?? []; }

  get(id) { return this.workers.get(id); }

  list() {
    return [...this.workers.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  getPromptStore(id) { return this.prompts.get(id) ?? null; }

  async remove(id) {
    await this.load();
    if (!this.workers.has(id)) return { notFound: true };
    this.workers.delete(id);
    this.chats.delete(id);
    this.prompts.delete(id);
    await rm(join(this.dir, id), { recursive: true, force: true });
    return { removed: true };
  }

  async setWorkspace(id, cwd) {
    await this.load();
    const w = this.workers.get(id);
    if (!w) return { notFound: true };
    return this.save({ ...w, cwd });
  }

  async setModel(id, model) {
    await this.load();
    const w = this.workers.get(id);
    if (!w) return { notFound: true };
    return this.save({ ...w, model });
  }

  async setPrompt(id, prompt, opts = {}) {
    await this.load();
    const w = this.workers.get(id);
    if (!w) return { notFound: true };
    const ps = this.prompts.get(id);
    if (!ps) return { notFound: true, reason: "no prompt store" };
    const saved = await ps.save(prompt, opts);
    await this.save({ ...w, promptVersion: saved.meta.version });
    return saved;
  }

  async getPrompt(id) {
    const ps = this.prompts.get(id);
    return ps ? ps.getCurrent() : null;
  }
}

export const internals = { createWorker };
