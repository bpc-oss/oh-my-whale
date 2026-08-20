// dsh-continuous-worker — employee budget ledger (M2b: 运行时强制).
//
// 方案 v5 §11: per-employee ledger (workers/<id>/ledger.json) 每日重置.
//   { date, tokensUsed, runsUsed, dailyTokensLimit, dailyRunsLimit }
// 超限 → paused (队列挂起, 不派发新任务; 工具调用拒绝).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/** 当日 YYYY-MM-DD (本地时区). */
export function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 默认限额 (与 prompt limits.budget 对齐; 调用方可覆盖). */
export function defaultLedger() {
  return { date: today(), tokensUsed: 0, runsUsed: 0, dailyTokensLimit: 200000, dailyRunsLimit: 50 };
}

/** 读 ledger; 跨日自动重置. */
export async function readLedger(workerDir, limits = null) {
  const file = join(workerDir, "ledger.json");
  try {
    const raw = await readFile(file, "utf8");
    const l = JSON.parse(raw);
    if (l.date !== today()) {
      // 跨日重置
      const fresh = defaultLedger();
      if (limits) applyLimits(fresh, limits);
      await writeFile(file, JSON.stringify(fresh, null, 2), "utf8");
      return fresh;
    }
    return l;
  } catch {
    const fresh = defaultLedger();
    if (limits) applyLimits(fresh, limits);
    await mkdir(workerDir, { recursive: true });
    await writeFile(file, JSON.stringify(fresh, null, 2), "utf8");
    return fresh;
  }
}

function applyLimits(ledger, limits) {
  const b = limits?.budget;
  if (b) {
    if (typeof b.dailyTokens === "number") ledger.dailyTokensLimit = b.dailyTokens;
    if (typeof b.dailyRuns === "number") ledger.dailyRunsLimit = b.dailyRuns;
  }
}

/** 记账: 记录一次运行/一次工具 token 消耗; 返回最新 ledger. */
export async function recordUsage(workerDir, { tokens = 0, run = false } = {}, limits = null) {
  const l = await readLedger(workerDir, limits);
  l.tokensUsed += tokens;
  if (run) l.runsUsed += 1;
  await writeFile(join(workerDir, "ledger.json"), JSON.stringify(l, null, 2), "utf8");
  return l;
}

/** 检查是否超限 (预算闸). */
export function isOverBudget(l) {
  return l.tokensUsed >= l.dailyTokensLimit || l.runsUsed >= l.dailyRunsLimit;
}

/**
 * per-employee pre-execute 守卫 (方案 v5 §11): 工具白名单 + dangerTools ask + redLines.
 * 返回 { kind: "allow" } 或 { kind: "deny", reason }.
 * @param {object} exec - 工具调用 { name, arguments }
 * @param {object} prompt - 员工 prompt (limits 段, 已引擎强制)
 */
export function employeeToolGuard(exec, prompt) {
  const limits = prompt?.limits;
  if (!limits) return { kind: "allow" };
  const name = typeof exec?.name === "string" ? exec.name : "";
  // P1: 插件自管工具 (cw_*) 不拦 (与 root 的 supply 守卫一致) — 防 cw_think 等被默认白名单拒绝
  if (name.startsWith("cw_")) return { kind: "allow" };
  const allow = limits.permissions?.toolAllowlist ?? [];
  // 白名单: 允许列表非空且含 "*" 或工具在列表内
  if (Array.isArray(allow) && allow.length > 0 && !allow.includes("*") && !allow.includes(name)) {
    return { kind: "deny", reason: `employee tool not in allowlist: ${name}` };
  }
  // 危险工具 → ask (需审批; 无审批通道则 deny)
  const danger = limits.permissions?.dangerTools === "ask";
  if (danger && ["shell", "bash", "write", "network", "http"].includes(name)) {
    return { kind: "ask", reason: `employee danger tool requires approval: ${name}` };
  }
  // redLines 结构化检查 (工具名/路径模式)
  const redLines = limits.redLines ?? [];
  const joinedArgs = JSON.stringify(exec?.arguments ?? {});
  if (redLines.includes("never-write-outside-workspace")) {
    const w = exec.arguments?.path ?? exec.arguments?.file_path ?? "";
    if (typeof w === "string" && w.includes("..")) {
      return { kind: "deny", reason: "redLine: path traversal in write" };
    }
  }
  if (redLines.includes("no-secret-leak")) {
    const low = joinedArgs.toLowerCase();
    if (low.includes("api_key") || low.includes("password") || low.includes("secret") || low.includes("token")) {
      return { kind: "deny", reason: "redLine: possible secret in tool args" };
    }
  }
  return { kind: "allow" };
}

export const internals = { today, defaultLedger, readLedger, recordUsage, isOverBudget, employeeToolGuard };
