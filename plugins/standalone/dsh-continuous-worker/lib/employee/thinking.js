// dsh-continuous-worker — employee thinking log (M5: 思维留痕).
//
// 方案 (worker-cognition-architecture.md §2.3): 可追溯的思维.
//   thinking/<taskId>.jsonl: {seq, ts, kind: "plan"|"decision"|"reflect"|"step"|"tool", content, meta?}
//   双通道: ① tools/post-execute 自动记录工具调用 (推理骨架, 不依赖模型自觉)
//           ② 模型经 cw_think 工具主动写 plan/decision/reflect
//   不进常规 prompt (省 token), 供 UI 查询 + 反思阶段喂演化.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

/** 追加一条思维记录. seq = 毫秒时间戳 (免读全文件 O(n²), 并发同 ms 用随机后缀排序微乱可接受). */
export async function appendThinking(workerDir, taskId, { kind, content, meta = null }) {
  if (!isValidTaskId(taskId)) return null;
  const dir = join(workerDir, "thinking");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${taskId}.jsonl`);
  const seq = Date.now();
  const rec = { seq, ts: new Date().toISOString(), kind, content: sanitizeText(content), meta: meta ? sanitize(meta) : null };
  await writeFile(file, JSON.stringify(rec) + "\n", { flag: "a" });
  return rec;
}

/** taskId 白名单 (防路径穿越): 只允许 [A-Za-z0-9._-]. */
const TASK_ID_RE = /^[A-Za-z0-9._-]+$/;
export function isValidTaskId(id) {
  return typeof id === "string" && id.length <= 128 && TASK_ID_RE.test(id);
}

/** 读一个任务的思维链 (按 seq). */
export async function readThinking(workerDir, taskId) {
  if (!isValidTaskId(taskId)) return []; // P0-2: 拒绝非法 taskId (防穿越)
  try {
    const raw = await readFile(join(workerDir, "thinking", `${taskId}.jsonl`), "utf8");
    const out = [];
    for (const line of raw.split("\n").filter(Boolean)) {
      try { out.push(JSON.parse(line)); } catch { /* 坏行跳过 (P1-6) */ }
    }
    return out.sort((a, b) => a.seq - b.seq);
  } catch { return []; }
}

/** 列出所有任务的 thinking 文件 (供 UI 任务列表). */
export async function listThinkingTasks(workerDir, limit = 50) {
  try {
    const files = await readdir(join(workerDir, "thinking"));
    const out = [];
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const taskId = f.replace(".jsonl", "");
      const lines = await readThinking(workerDir, taskId);
      if (lines.length === 0) continue;
      out.push({ taskId, entries: lines.length, lastAt: lines[lines.length - 1].ts, firstKind: lines[0].kind });
    }
    return out.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)).slice(0, limit);
  } catch { return []; }
}

/** 工具调用骨架记录 (tools/post-execute 自动通道). */
export function toolThinkingRecord(exec) {
  return {
    kind: "tool",
    content: `${exec?.name ?? "?"}`,
    meta: { name: exec?.name ?? "?", args: sanitize(exec?.arguments) },
  };
}

/** 参数脱敏 (递归 + 键名归一化: 去 _/空格/驼峰后匹配敏感词; 防嵌套/数组/驼峰泄漏). */
function sanitize(args) {
  if (args === null || typeof args !== "object") return sanitizeText(String(args ?? ""));
  if (Array.isArray(args)) {
    return args.map((v) => {
      if (typeof v === "string" && /password|passwd|api[-_]?key|secret|token|credential|authorization|access[-_]?key/.test(v.toLowerCase())) return "***";
      return sanitize(v);
    });
  }
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    const norm = String(k).toLowerCase().replace(/[\s_]/g, "");
    const sensitive = /password|passwd|api[-_]?key|secret|token|credential|authorization|auth|access[-_]?key|client[-_]?secret/.test(norm);
    if (sensitive) out[k] = "***";
    else out[k] = sanitize(v);
  }
  return out;
}

/** 文本脱敏: 截断长文本 + 敏感值打码. */
function sanitizeText(t) {
  const s = String(t ?? "");
  const long = s.length > 120 ? s.slice(0, 120) + "…" : s;
  return long.replace(/(password|passwd|secret|token|api[_-]?key|authorization|credential)\s*[=:]\s*\S+/gi, "$1=***");
}

export const internals = { appendThinking, readThinking, listThinkingTasks, toolThinkingRecord };
