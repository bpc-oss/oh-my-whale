// dsh-continuous-worker — employee memory broker (M3: 三层记忆).
//
// 方案 (worker-cognition-architecture.md §2.1): 员工记忆四层 → memoryBundle 注入.
//   - 情景记忆: timeline.jsonl (append-only) — 任务完成/异常/交接时写
//   - 语义记忆: knowledge/ (每条一 JSON) — 反思沉淀/用户反馈
//   - 程序记忆: skills/ (复用 SkillLibrary 模式) — 技能固化
//   - 习惯记忆: habits.json — 用户反馈演化
// assemble(workerDir, task) → { episodic[], semantic[], skills[], habits[], working }
// 派发时经 employee_memory 变量通道注入 (M2 已预留).

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const MEMORY_DEFAULT_MAX = 2000; // tokens 硬上限 (与 compileMemory 对齐)

/** 追加情景记忆 (任务完成/异常/交接). */
export async function appendTimeline(workerDir, entry) {
  const file = join(workerDir, "timeline.jsonl");
  await mkdir(workerDir, { recursive: true });
  const rec = { id: entry.id ?? `e-${Date.now().toString(36)}`, taskId: entry.taskId ?? null, kind: entry.kind ?? "task", summary: entry.summary ?? "", result: entry.result ?? null, keyFacts: entry.keyFacts ?? [], at: new Date().toISOString(), ...entry };
  await writeFile(file, JSON.stringify(rec) + "\n", { flag: "a" });
  return rec;
}

/** 读情景记忆 (newest first). 单行损坏跳过 (不因一行坏数据全灭). */
export async function readTimeline(workerDir, limit = 100) {
  try {
    const raw = await readFile(join(workerDir, "timeline.jsonl"), "utf8");
    const all = [];
    for (const line of raw.split("\n").filter(Boolean)) {
      try { all.push(JSON.parse(line)); } catch { /* skip corrupt line */ }
    }
    return all.slice(-limit).reverse();
  } catch { return []; }
}

/** 沉淀语义记忆 (反思/反馈). @returns { ok, id } */
export async function saveKnowledge(workerDir, { fact, source = "reflection", tags = [], confidence = 1 }) {
  await mkdir(join(workerDir, "knowledge"), { recursive: true });
  const id = `k-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const rec = { id, fact, source, tags, confidence, at: new Date().toISOString() };
  await writeFile(join(workerDir, "knowledge", `${id}.json`), JSON.stringify(rec, null, 2), "utf8");
  return { ok: true, id };
}

/** 读语义记忆 (按 tag/关键词轻量检索 top-n). */
export async function searchKnowledge(workerDir, { tags = [], query = "", limit = 5 } = {}) {
  try {
    const files = await readdir(join(workerDir, "knowledge"));
    const out = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const k = JSON.parse(await readFile(join(workerDir, "knowledge", f), "utf8"));
        let score = 0;
        if (tags.some((t) => (k.tags ?? []).includes(t))) score += 2;
        if (query && (k.fact ?? "").toLowerCase().includes(query.toLowerCase())) score += 1;
        if (score > 0 || (tags.length === 0 && !query)) out.push({ ...k, score });
      } catch {}
    }
    return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
  } catch { return []; }
}

/** 记录/更新习惯记忆. */
export async function upsertHabit(workerDir, { name, value }) {
  const file = join(workerDir, "habits.json");
  await mkdir(workerDir, { recursive: true });
  let habits = {};
  try { habits = JSON.parse(await readFile(file, "utf8")); } catch {}
  habits[name] = { value, at: new Date().toISOString() };
  await writeFile(file, JSON.stringify(habits, null, 2), "utf8");
  return habits;
}

/** 读习惯记忆 → 列表. */
export async function readHabits(workerDir) {
  try {
    const h = JSON.parse(await readFile(join(workerDir, "habits.json"), "utf8"));
    return Object.entries(h).map(([name, v]) => ({ name, ...v }));
  } catch { return []; }
}

/** 记录技能 (程序记忆, 员工级). */
export async function saveSkill(workerDir, { name, steps, keywords = [], confidence = 1 }) {
  await mkdir(join(workerDir, "skills"), { recursive: true });
  const id = `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const rec = { id, name, steps, keywords, confidence, at: new Date().toISOString() };
  await writeFile(join(workerDir, "skills", `${id}.json`), JSON.stringify(rec, null, 2), "utf8");
  return { ok: true, id };
}

/** 读技能 (程序记忆). */
export async function readSkills(workerDir, limit = 20) {
  try {
    const files = await readdir(join(workerDir, "skills"));
    const out = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try { out.push(JSON.parse(await readFile(join(workerDir, "skills", f), "utf8"))); } catch {}
    }
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
  } catch { return []; }
}

/**
 * MemoryBroker.assemble: 组装记忆注入包 (≤maxTokens, 按优先级裁剪).
 * 优先级: working > skills > episodic > semantic > habits.
 */
export async function assemble(workerDir, { query = "", tags = [], limit = { episodic: 3, semantic: 5, skills: 8, habits: 3 }, maxTokens = MEMORY_DEFAULT_MAX } = {}) {
  const [episodic, semantic, skills, habits] = await Promise.all([
    readTimeline(workerDir, limit.episodic * 4), // 多取几倍 (过滤后裁剪)
    searchKnowledge(workerDir, { tags, query, limit: limit.semantic }),
    readSkills(workerDir, limit.skills),
    readHabits(workerDir),
  ]);
  // 裁剪 (估算 token: 中文 1/字, 其他 4 字符/token)
  const est = (s) => { let c = 0, o = 0; for (const ch of String(s ?? "")) { if (/[\u4e00-\u9fff]/.test(ch)) c++; else o++; } return Math.ceil(c + o / 4); };
  const bundle = { episodic: [], semantic: [], skills: [], habits: [], working: "" };
  let used = 0;
  const push = (arr, item, text) => {
    const t = est(text);
    if (used + t > maxTokens) return false;
    arr.push(item); used += t; return true;
  };
  // skills 优先 (名+一句话)
  for (const s of skills) if (!push(bundle.skills, s, `${s.name}: ${(s.steps ?? []).join("; ").slice(0, 80)}`)) break;
  // episodic (数量上限 limit.episodic + token 预算)
  for (const e of episodic.slice(0, limit.episodic)) if (!push(bundle.episodic, e, `${e.summary ?? ""} ${e.result ?? ""}`)) break;
  // semantic (searchKnowledge 已 limit)
  for (const k of semantic) if (!push(bundle.semantic, k, k.fact ?? "")) break;
  // habits (数量上限 limit.habits)
  for (const h of habits.slice(0, limit.habits)) if (!push(bundle.habits, h, `${h.name}: ${h.value}`)) break;
  return bundle;
}

/** 把 memoryBundle 渲染成注入文本 (employee_memory 变量值). */
export function renderBundle(bundle) {
  const parts = [];
  if (bundle.working) parts.push(`【会话摘要】${bundle.working}`);
  if (bundle.skills.length) parts.push(`【技能】${bundle.skills.map((s) => `- ${s.name}`).join("\n")}`);
  if (bundle.episodic.length) parts.push(`【相关经历】${bundle.episodic.map((e) => `- [${(e.at ?? "").slice(0, 10)}] ${e.summary ?? ""}${e.result ? ` → ${e.result}` : ""}`).join("\n")}`);
  if (bundle.semantic.length) parts.push(`【已知经验】${bundle.semantic.map((k) => `- ${k.fact ?? ""}`).join("\n")}`);
  if (bundle.habits.length) parts.push(`【习惯】${bundle.habits.map((h) => `- ${h.name}: ${h.value}`).join("\n")}`);
  return parts.join("\n\n");
}

export const internals = { appendTimeline, readTimeline, saveKnowledge, searchKnowledge, upsertHabit, readHabits, saveSkill, readSkills, assemble, renderBundle };
