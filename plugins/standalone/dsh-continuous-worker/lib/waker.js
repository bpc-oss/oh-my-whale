// dsh-continuous-worker — waker: delivery of work to an agent session.
//
// M1 scope (docs/02 §6.3): a thin wrapper over the platform's agent wake
// primitives (dsh-agent-loop), matching the dsh-schedule / dsh-tool-jobs
// pattern: idle owner -> followup (new turn), busy -> inject (queue without
// waking), deterministic host steps -> runMaintenance, wait -> whenIdle.
//
// We intentionally do NOT reimplement the inbox — we call the platform agent.

import { createUserMessage } from "@deepseek-ai/dsh-llm";

/** Stable plugin source marker for messages we inject. */
export const PLUGIN_SOURCE = Object.freeze({ kind: "plugin", plugin: "continuous-worker" });

/**
 * Build a user-role message carrying a worker task, source-tagged.
 * @param {string} text - task/instruction content.
 * @returns {import("@deepseek-ai/dsh-llm").UserMessage}
 */
export function buildTaskMessage(text) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: PLUGIN_SOURCE,
  });
}

/**
 * Deliver one task to an agent.
 * - idle -> followup (starts a new turn);
 * - busy  -> inject (queues to next-step without waking);
 * - fatal/paused handled by the caller before calling here.
 * @param {object} agent - live platform agent (from ctx.agents).
 * @param {string} text - task text.
 * @returns {Promise<"delivered"|"queued">} delivery mode used.
 */
export function deliver(agent, text) {
  const message = buildTaskMessage(text);
  const status = agent.status;
  if (status === "idle") {
    agent.followup(message);
    return "delivered";
  }
  agent.inject(message);
  return "queued";
}

/**
 * Run one deterministic host-side maintenance step when the agent is idle.
 * (budget gates, ledger writes, pre-dispatch checks) — no model turn involved.
 * @param {object} agent - live platform agent.
 * @param {(signal: AbortSignal) => Promise<boolean>} job - maintenance body.
 * @returns {Promise<boolean>} true when the maintenance job ran.
 */
export async function runMaintenance(agent, job) {
  if (agent.status !== "idle") return false;
  await agent.runMaintenance(job);
  return true;
}

/** Wait until the agent becomes fully idle (bounded by `timeoutMs`). */
export async function whenIdle(agent, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (agent.status !== "idle") {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await agent.whenIdle();
  return true;
}

export const internals = { buildTaskMessage };
