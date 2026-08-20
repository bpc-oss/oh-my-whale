// dsh-continuous-worker — employee evolution (M4: 反思循环 + 成长轨迹).
//
// 方案 (worker-cognition-architecture.md §2.4): 自我进化两级调度.
//   - 任务后反思 (每次完成): 沉淀语义记忆 (saveKnowledge) + 技能固化判定 (saveSkill) + 成长轨迹 (growth.json)
//   - 技能固化: timeline 同流程重复 ≥3 次且成功 → 固化为程序记忆
//   - growth.json 纯派生可重建 (trajectory 逐次追加, UI 成长页直接读)
// M4 返修 (审查 1375e8a3):
//   - P0-2: 经验沉淀去重 (同 flowKey 已有则跳过, 不重复灌语义记忆)
//   - P1: flowKey 用干净指令 (调用方传 instruction); experienceCount 递增; activeDays 跨天;
//        successCount 持久字段 (不泄漏 _ 前缀); 置信度直接用 successRate; growth 写串行.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { appendTimeline, readTimeline, saveKnowledge, saveSkill, readSkills, searchKnowledge } from "./memory-broker.js";

/** 技能固化阈值: 同流程重复 ≥3 次且成功 ≥2. */
export const SKILL_FIX_THRESHOLD = 3;
const SKILL_MIN_SUCCESS = 2;

/** 从干净任务文本提取流程关键词 (调用方应传 instruction, 非带模板全文). */
export function extractFlowKey(text) {
  const t = String(text ?? "").replace(/\[员工[^\]]*\]/, "").trim();
  const cjk = t.match(/[\u4e00-\u9fff]{2,6}/g) ?? [];
  const en = t.match(/[a-zA-Z]{3,}/g) ?? [];
  return cjk.slice(0, 2).concat(en.slice(0, 2)).join("|") || (t.slice(0, 8) || "unknown");
}

/** 读成长轨迹 (对外视图: 过滤内部 _ 字段). */
export async function readGrowth(workerDir) {
  const raw = await readGrowthRaw(workerDir);
  const { _lastActiveDay, _successCount, ...view } = raw;
  return view;
}

/** 读成长轨迹原始对象 (含内部 _ 字段, 供 updateGrowth 跨天判断). */
async function readGrowthRaw(workerDir) {
  try {
    const g = JSON.parse(await readFile(join(workerDir, "growth.json"), "utf8"));
    return {
      taskCount: g.taskCount ?? 0,
      successCount: g.successCount ?? 0,
      activeDays: g.activeDays ?? 0,
      skillsCount: g.skillsCount ?? 0,
      experienceCount: g.experienceCount ?? 0,
      successRate: g.successRate ?? 0,
      trajectory: Array.isArray(g.trajectory) ? g.trajectory : [],
      _lastActiveDay: g._lastActiveDay ?? null,
    };
  } catch {
    return { taskCount: 0, successCount: 0, activeDays: 0, skillsCount: 0, experienceCount: 0, successRate: 0, trajectory: [], _lastActiveDay: null };
  }
}

async function writeGrowth(workerDir, g) {
  await mkdir(workerDir, { recursive: true });
  await writeFile(join(workerDir, "growth.json"), JSON.stringify(g, null, 2), "utf8");
}

// P1: growth 写串行 (防 reflect 与下一任务并发丢账)
let _gmutex = Promise.resolve();
function _gserial(fn) {
  const run = _gmutex.then(fn, fn);
  _gmutex = run.catch(() => {});
  return run;
}

/** 更新成长轨迹 (每次任务完成). success: boolean; experienceAdded: 本次是否新增经验 (并入串行, 消除锁外写). */
export function updateGrowth(workerDir, { success = true, experienceAdded = false } = {}) {
  return _gserial(async () => {
    const g = await readGrowthRaw(workerDir);
    g.taskCount += 1;
    if (success) g.successCount += 1;
    if (experienceAdded) g.experienceCount += 1;
    g.successRate = g.taskCount > 0 ? Math.round((g.successCount / g.taskCount) * 1000) / 10 : 0;
    const skills = await readSkills(workerDir);
    g.skillsCount = skills.length;
    // P1: activeDays 跨天计数 (读原始 _lastActiveDay, 不被视图剥离)
    const today = new Date().toISOString().slice(0, 10);
    if (g._lastActiveDay !== today) {
      g.activeDays = (g._lastActiveDay ? g.activeDays : 0) + 1;
      g._lastActiveDay = today;
    }
    g.trajectory.push({ at: new Date().toISOString(), skills: g.skillsCount, exp: g.experienceCount, successRate: g.successRate });
    if (g.trajectory.length > 200) g.trajectory = g.trajectory.slice(-200);
    await writeGrowth(workerDir, g);
    return g;
  });
}

/**
 * 技能固化判定: 统计 timeline 里同流程 key 的记录, 重复 ≥3 且成功 ≥2 → saveSkill.
 * successRate = successCount/same.length (不 +0.5 饱和).
 */
export async function tryFixSkill(workerDir, flowKey, taskText) {
  const tl = await readTimeline(workerDir, 100);
  const same = tl.filter((e) => e.flowKey === flowKey);
  const successCount = same.filter((e) => e.result === "completed" || e.result === "success").length;
  if (same.length >= SKILL_FIX_THRESHOLD && successCount >= SKILL_MIN_SUCCESS) {
    const existing = await readSkills(workerDir);
    if (!existing.some((s) => s.name === flowKey)) {
      const steps = same.slice(0, 5).map((e) => (e.summary ?? "").slice(0, 40));
      const confidence = Math.min(0.95, successCount / same.length);
      const saved = await saveSkill(workerDir, { name: flowKey, steps, keywords: [flowKey], confidence });
      return { fixed: true, skillId: saved.id, occurrences: same.length, confidence };
    }
  }
  return { fixed: false };
}

/**
 * 任务后反思 (每次任务完成调用): 沉淀经验 + 技能固化 + 成长轨迹.
 * @param {object} opts - { workerDir, taskId, instruction (干净指令), taskText (完整), result, keyFacts }
 *   result: "completed" | "timeout" | "failed" — 仅 completed/success 算成功
 */
export async function reflect(workerDir, { taskId, instruction = "", taskText = "", result = "completed", keyFacts = [] } = {}) {
  const clean = (instruction || taskText).replace(/\[员工[^\]]*\]/, "").trim();
  const flowKey = extractFlowKey(clean);
  const summary = clean.slice(0, 80);
  const success = result === "completed" || result === "success";
  // 1. 情景记忆 (若调用方未写; flowKey 用干净指令算)
  const tl = await readTimeline(workerDir, 5);
  if (!tl.some((e) => e.taskId === taskId)) {
    await appendTimeline(workerDir, { taskId, kind: "task", summary, result, flowKey, keyFacts });
  }
  let experienceAdded = false;
  // 2. 经验沉淀 (P0-2 去重: 同 flowKey 已有经验则跳过; 只沉淀成功且有内容的)
  if (success && summary.length >= 4) {
    const existing = await searchKnowledge(workerDir, { tags: [flowKey], limit: 1 });
    if (existing.length === 0) {
      await saveKnowledge(workerDir, { fact: `${summary} (流程: ${flowKey})`, source: "reflection", tags: [flowKey], confidence: 0.6 });
      experienceAdded = true;
    }
  }
  // 3. 技能固化 (只统计成功; timeout/failed 不计)
  const fix = await tryFixSkill(workerDir, flowKey, summary);
  // 4. 成长轨迹 (success 只认 completed/success; experienceAdded 并入串行区, 无锁外写)
  const g = await updateGrowth(workerDir, { success, experienceAdded });
  return { flowKey, skillFixed: fix.fixed, experienceAdded, growth: g };
}

export const internals = { extractFlowKey, readGrowth, updateGrowth, tryFixSkill, reflect };
