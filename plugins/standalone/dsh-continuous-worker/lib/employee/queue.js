// dsh-continuous-worker — employee dispatch queue (M2c: 派发队列).
//
// 方案 v5 §10: 每员工一个 FIFO 队列 (workers/<id>/queue.json).
//   { pending: [taskId...], running: taskId|null }
// - 串行: 员工同一时刻只干一个任务
// - 超限/暂停: 队列挂起 (不丢), 恢复后续跑
// - 换型: 员工换 preset 类型 = 新 session, 队列按 worker id 组织不中断

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

function emptyQueue() {
  return { pending: [], running: null };
}

/** 读员工队列 (不存在则建空). */
export async function readQueue(workerDir) {
  const file = join(workerDir, "queue.json");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    await mkdir(workerDir, { recursive: true });
    await writeFile(file, JSON.stringify(emptyQueue(), null, 2), "utf8");
    return emptyQueue();
  }
}

async function writeQueue(workerDir, q) {
  await mkdir(workerDir, { recursive: true });
  await writeFile(join(workerDir, "queue.json"), JSON.stringify(q, null, 2), "utf8");
}

// 残留③: 串行锁 (防并发入队/出队读改写丢条)
let _mutex = Promise.resolve();
function _serial(fn) {
  const run = _mutex.then(fn, fn);
  _mutex = run.catch(() => {});
  return run;
}

/** 入队: 追加任务 (worker 暂停/超限时挂起). @returns { queued: true, position } */
export function enqueue(workerDir, task) {
  return _serial(async () => {
    const q = await readQueue(workerDir);
    const id = typeof task === "string" ? task : task.taskId;
    if (q.pending.some((t) => t.taskId === id) || q.running?.taskId === id) return { queued: true, position: q.pending.length + 1 };
    const entry = typeof task === "string" ? { taskId: task, text: "" } : { taskId: task.taskId, text: task.text ?? "", instruction: task.instruction ?? "" };
    q.pending.push(entry);
    await writeQueue(workerDir, q);
    return { queued: true, position: q.pending.length };
  });
}

/** 取下一个可派发任务: 空闲则出队, 否则返回 null (忙). @returns { taskId, text } | { taskId: null, busy } */
export function dequeue(workerDir) {
  return _serial(async () => {
    const q = await readQueue(workerDir);
    if (q.running !== null) return { taskId: null, busy: true };
    if (q.pending.length === 0) return { taskId: null, busy: false };
    const entry = q.pending.shift();
    q.running = entry;
    await writeQueue(workerDir, q);
    return { taskId: entry.taskId, text: entry.text, instruction: entry.instruction ?? "", busy: false };
  });
}

/** 完成任务: 清 running, 返回是否还有后续. */
export function complete(workerDir, taskId) {
  return _serial(async () => {
    const q = await readQueue(workerDir);
    if (q.running?.taskId === taskId) q.running = null;
    q.pending = q.pending.filter((t) => t.taskId !== taskId);
    await writeQueue(workerDir, q);
    return { hasNext: q.pending.length > 0, next: q.pending[0]?.taskId ?? null };
  });
}

/** 查询队列状态. */
export async function queueStatus(workerDir) {
  const q = await readQueue(workerDir);
  return { pending: q.pending.length, running: q.running?.taskId ?? null, idle: q.running === null && q.pending.length === 0 };
}

export const internals = { readQueue, enqueue, dequeue, complete, queueStatus };
