// dsh-continuous-worker — cw_* tool definitions (M1 + M2).
//
// M1: cw_status / cw_registry_list / cw_credential_status (read-only).
// M2: management surface — cw_schedule_* / cw_heartbeat_* / cw_pause /
//     cw_resume / cw_run_once / cw_stop / cw_supply_verify / cw_supervision_matrix.
//
// All mutation tools append durable `continuous-worker/change` events to the
// worker session (registry fold) — same persistence contract as dsh-schedule.

import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  foldWorkerEvents,
  buildScheduleRecord,
  buildHeartbeatRecord,
  changeCreate,
  changeUpdate,
  changeDelete,
  changeDispatch,
  pauseRecord,
  resumeRecord,
  advanceHeartbeat,
  recordView,
  isExpired,
} from "./registry.js";
import { classifySupplyCall, supervisionPreset, guardrailsSnapshot } from "./guardrails.js";
import { buildMilestone, buildReview, buildHandover, REPORT_KIND } from "./report.js";
import { createLoop, startLoop, stopLoop, advanceLoop, evaluateVerifier, loopSnapshot, LOOP_STATE } from "./loop.js";
import { buildHandoverWorkOrder, renderHandover } from "./handover.js";
import { replayIntents } from "./replay.js";
import { createProbe, advanceProbe, probeDue, evaluateProbe, PROBE_KIND, ProbeStore } from "./probe.js";
import { runDiagnose, buildQualitySignature, detectDrift } from "./diagnose.js";
import { internals as personaInternals } from "./persona.js";
import { buildWorkOrder } from "./workorder.js";

function renderValue(_args, value) {
  return [{ type: "text", text: JSON.stringify(value) }];
}

/** Shared fold accessor (fail-closed on corrupt ledger). */
function foldFor(agent) {
  try {
    return foldWorkerEvents(agent.session.events, agent.session.header.seedLength ?? 0);
  } catch (error) {
    return { error: `worker ledger corrupt: ${error.message}` };
  }
}

function isError(value) {
  return typeof value === "object" && value !== null && "error" in value;
}

/** Require the exact owning agent. */
function requireOwner(exec, agent) {
  return exec.agent === agent;
}

/** Append one change event to the session, wrapped. */
function appendChange(agent, change) {
  agent.session.append("continuous-worker/change", change);
}

/**
 * Register every cw_* tool on one agent's scoped context.
 * @param {object} ctx - global context (for credentials / approval).
 * @param {object} agentCtx - agent-scoped context.
 * @param {object} runtime - WorkerRuntime (watcher/pacemaker/checkpoint).
 * @returns {() => void} disposer.
 */
export function registerTools(ctx, agentCtx, runtime) {
  const disposers = [];
  const agent = runtime.agent;

  const push = (tool) => {
    disposers.push(agentCtx.tools.register(tool));
  };

  // ---- M1: cw_status ----
  push(
    defineTool({
      name: "cw_status",
      description:
        "Return the resident worker's health snapshot: heartbeat liveness, dispatch-failure streak, idle/loop counters, FATAL flag, downgrade tier, plugin-ledger budget, checkpoint store, and guardrails policy. Read-only; no secrets.",
      parameters: {},
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(_args, exec) {
        if (!requireOwner(exec, agent)) return { error: "cw_status is scoped to the owning worker session" };
        return {
          ...runtime.watcher.snapshot(),
          checkpoint: runtime.checkpoint.snapshot(),
          guardrails: guardrailsSnapshot(),
          resume: runtime.resumeInfo ?? null, // resume 装配状态 (fresh/store-recovery/session-resume)
        };
      },
    })
  );

  // ---- M1: cw_registry_list ----
  push(
    defineTool({
      name: "cw_registry_list",
      description:
        "List active worker records (schedule/heartbeat) from the durable ledger: id, kind, rule/interval, prompt, maxRuns, expiresIn, runCount, state, due. Read-only.",
      parameters: {},
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(_args, exec) {
        if (!requireOwner(exec, agent)) return { error: "cw_registry_list is scoped to the owning worker session" };
        const folded = foldFor(agent);
        if (isError(folded)) return folded;
        const now = Date.now();
        return {
          records: folded.active.map((record) => {
            // Medium fix: use recordView so expired records show state=expired
            // and due=false — consistent with the pacemaker's view.
            const view = recordView(record, now);
            const out = {
              id: view.id,
              kind: view.kind,
              rule: view.rule ?? { intervalSeconds: view.intervalSeconds },
              prompt: view.prompt,
              maxRuns: view.maxRuns,
              expiresIn: view.expiresIn,
              runCount: view.runCount,
              state: view.state,
              due: view.due,
              scheduledAt: view.scheduledAt,
            };
            if (view.stepTokenBudget !== undefined) out.stepTokenBudget = view.stepTokenBudget;
            return out;
          }),
        };
      },
    })
  );

  // ---- M1: cw_credential_status (describe-only, no values) ----
  push(
    defineTool({
      name: "cw_credential_status",
      description:
        "Report the credential policy and (if configured) the describe() state of declared references. NEVER returns secret values. Read-only.",
      parameters: {},
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(_args, exec) {
        if (!requireOwner(exec, agent)) return { error: "cw_credential_status is scoped to the owning worker session" };
        return {
          denyDirectAccess: runtime.config.credentials.denyDirectAccess,
          requireDeclaredRefs: runtime.config.credentials.requireDeclaredRefs,
          // M2: per-task declared refs land with the skill loop (M3); M1/M2
          // returns the policy surface only — never resolve values here.
        };
      },
    })
  );

  // ---- M2: cw_schedule_create ----
  push(
    defineTool({
      name: "cw_schedule_create",
      description:
        "Create one bounded schedule record (Kimi Claw four-element: when/task/output/constraints). when = intervalSeconds (>=30) or ISO at; task = prompt; output/constraints optional and merged into the task prompt. Persisted to the durable ledger.",
      parameters: {
        prompt: { type: "string", required: true, description: "Task prompt delivered on each run (the 'task' element)." },
        intervalSeconds: { type: "number", description: "Fixed interval in seconds (>= 30). Mutually exclusive with at." },
        at: { type: "string", description: "ISO-8601 first run time. Mutually exclusive with intervalSeconds." },
        output: { type: "string", description: "Four-element 'output': desired output format (markdown/json/path)." },
        constraints: { type: "string", description: "Four-element 'constraints': limits/red lines (merged into prompt)." },
        maxRuns: { type: "number", required: true, description: "Positive total run ceiling (boundedness)." },
        expiresIn: { type: "string", required: true, description: "TTL, e.g. '24h' (boundedness)." },
        stepTokenBudget: { type: "number", description: "Per-step token ceiling (defaults to config)." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        const folded = foldFor(agent);
        if (isError(folded)) return folded;
        const hasInterval = args.intervalSeconds !== undefined;
        const hasAt = args.at !== undefined;
        if (hasInterval === hasAt) return { error: "provide exactly one of intervalSeconds or at" };
        // Four-element merge: task prompt + output + constraints.
        let prompt = args.prompt;
        if (args.output !== undefined) prompt += `\n[output format] ${args.output}`;
        if (args.constraints !== undefined) prompt += `\n[constraints] ${args.constraints}`;
        if (hasInterval && (!Number.isSafeInteger(args.intervalSeconds) || args.intervalSeconds < 30)) {
          return { error: "intervalSeconds must be a safe integer >= 30" };
        }
        if (hasAt && typeof args.at !== "string") return { error: "at must be a string" };
        if (!Number.isSafeInteger(args.maxRuns) || args.maxRuns <= 0) return { error: "maxRuns must be a positive safe integer" };
        if (typeof args.expiresIn !== "string" || args.expiresIn.length === 0) return { error: "expiresIn must be a non-empty string" };
        const now = Date.now();
        const scheduledAt = hasAt ? new Date(Math.max(Date.parse(args.at), now)).toISOString() : new Date(now + (args.intervalSeconds ?? 0) * 1000).toISOString();
        const id = allocateId(folded.seenIds);
        const record = buildScheduleRecord({
          id,
          rule: hasInterval ? { everySeconds: args.intervalSeconds } : { at: args.at },
          prompt,
          maxRuns: args.maxRuns,
          expiresIn: args.expiresIn,
          scheduledAt,
        });
        appendChange(agent, changeCreate(record));
        return recordView(record, Date.now());
      },
    })
  );

  // ---- M2: cw_heartbeat_create ----
  push(
    defineTool({
      name: "cw_heartbeat_create",
      description:
        "Create one bounded heartbeat record: interval seconds (>= 30), task prompt, maxRuns, expiresIn, stepTokenBudget (all required — boundedness). The heartbeat re-injects the prompt into the same session on each interval.",
      parameters: {
        prompt: { type: "string", required: true, description: "Recurring task prompt." },
        intervalSeconds: { type: "number", required: true, description: "Interval in seconds (>= 30)." },
        maxRuns: { type: "number", required: true, description: "Positive total run ceiling." },
        expiresIn: { type: "string", required: true, description: "TTL, e.g. '24h'." },
        stepTokenBudget: { type: "number", required: true, description: "Per-step token ceiling." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        const folded = foldFor(agent);
        if (isError(folded)) return folded;
        if (!Number.isSafeInteger(args.intervalSeconds) || args.intervalSeconds < 30) return { error: "intervalSeconds must be a safe integer >= 30" };
        if (!Number.isSafeInteger(args.maxRuns) || args.maxRuns <= 0) return { error: "maxRuns must be a positive safe integer" };
        if (typeof args.expiresIn !== "string" || args.expiresIn.length === 0) return { error: "expiresIn must be a non-empty string" };
        if (!Number.isSafeInteger(args.stepTokenBudget) || args.stepTokenBudget <= 0) return { error: "stepTokenBudget must be a positive safe integer" };
        const now = Date.now();
        const id = allocateId(folded.seenIds);
        const record = buildHeartbeatRecord({
          id,
          intervalSeconds: args.intervalSeconds,
          prompt: args.prompt,
          maxRuns: args.maxRuns,
          expiresIn: args.expiresIn,
          stepTokenBudget: args.stepTokenBudget,
          scheduledAt: new Date(now + args.intervalSeconds * 1000).toISOString(),
        });
        appendChange(agent, changeCreate(record));
        return recordView(record, Date.now());
      },
    })
  );

  // ---- M2: cw_pause / cw_resume (human takeover) ----
  push(
    defineTool({
      name: "cw_pause",
      description: "Pause one active worker record by id (state -> paused). No further dispatches until resumed.",
      parameters: { id: { type: "string", required: true, description: "Record id from cw_registry_list." } },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        const folded = foldFor(agent);
        if (isError(folded)) return folded;
        const record = folded.active.find((r) => r.id === args.id);
        if (record === undefined) return { id: args.id, paused: false, code: "not_found" };
        try {
          const paused = pauseRecord(record);
          appendChange(agent, changeUpdate(paused));
          return { id: args.id, paused: true, state: paused.state };
        } catch (error) {
          return { id: args.id, paused: false, error: error.message };
        }
      },
    })
  );

  push(
    defineTool({
      name: "cw_resume",
      description: "Resume one paused worker record by id (state -> active).",
      parameters: { id: { type: "string", required: true, description: "Record id." } },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        const folded = foldFor(agent);
        if (isError(folded)) return folded;
        const record = folded.active.find((r) => r.id === args.id);
        if (record === undefined) return { id: args.id, resumed: false, code: "not_found" };
        try {
          const resumed = resumeRecord(record);
          appendChange(agent, changeUpdate(resumed));
          return { id: args.id, resumed: true, state: resumed.state };
        } catch (error) {
          return { id: args.id, resumed: false, error: error.message };
        }
      },
    })
  );

  // ---- M2: cw_run_once (manual feed) ----
  push(
    defineTool({
      name: "cw_run_once",
      description:
        "Manually deliver one record's task to the worker session now (bypasses the tick), respecting the budget gate. Records a dispatch (counts toward maxRuns).",
      parameters: { id: { type: "string", required: true, description: "Record id." } },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        const folded = foldFor(agent);
        if (isError(folded)) return folded;
        const record = folded.active.find((r) => r.id === args.id);
        if (record === undefined) return { id: args.id, delivered: false, code: "not_found" };
        if (record.state === "paused") return { id: args.id, delivered: false, reason: "paused" };
        if (record.state === "done") return { id: args.id, delivered: false, reason: "done (maxRuns reached)" };
        // Resident-verification fix: expired records must not dispatch — the
        // fold keeps them active but recordView surfaces state=expired after TTL.
        if (isExpired(record, Date.now())) return { id: args.id, delivered: false, reason: "expired" };
        // M2 C2/C3 fix: charge a real token estimate (not 0).
        const tokens = Math.max(1, Math.ceil((record.prompt?.length ?? 0) / 4) + 8);
        runtime.watcher.resetRun(); // HIGH-2 fix: new run boundary
        const gate = runtime.watcher.chargeRunTokens(tokens, Date.now());
        if (!gate.ok) return { id: args.id, delivered: false, reason: gate.reason };
        try {
          const { deliver } = await import("./waker.js");
          const at = new Date(Date.now()).toISOString();
          // M2 C5 fix: checkpoint.begin BEFORE the side effect (verify-before-retry).
          await runtime.checkpoint.begin({ recordId: args.id, at, action: "run_once" });
          const key = `${args.id}@${at}`;
          // M2 C2 fix: exactly ONE accounting path per run_once so runCount
          // increments by exactly 1 — heartbeat uses advanceHeartbeat (which
          // carries runCount+1 and the next scheduledAt); schedule uses the
          // dispatch fold's runCount+1. Never both.
          if (record.kind === "heartbeat") {
            const next = advanceHeartbeat(record, Date.now());
            appendChange(agent, changeUpdate(next));
          } else {
            appendChange(agent, changeDispatch(args.id, at));
          }
          const mode = deliver(agent, record.prompt);
          await runtime.checkpoint.complete(key);
          runtime.watcher.onDispatchSuccess(); // HIGH-2 fix: no token double-count
          // R2-4 fix: apply the supervision preset for this task type
          // (permissionPresets.set) — the real trigger path for applySupervision.
          const taskType = record.kind === "heartbeat" ? "internal" : "workspace";
          const supervision = await runtime.applySupervision(taskType);
          return { id: args.id, delivered: true, mode, supervision };
        } catch (error) {
          return { id: args.id, delivered: false, error: error.message };
        }
      },
    })
  );

  // ---- M2: cw_stop (delete) ----
  push(
    defineTool({
      name: "cw_stop",
      description: "Stop one worker record by id (removes it from the durable ledger).",
      parameters: { id: { type: "string", required: true, description: "Record id." } },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        const folded = foldFor(agent);
        if (isError(folded)) return folded;
        const record = folded.active.find((r) => r.id === args.id);
        if (record === undefined) return { id: args.id, stopped: false, code: "not_found" };
        appendChange(agent, changeDelete(args.id));
        return { id: args.id, stopped: true };
      },
    })
  );

  // ---- M2: cw_supply_verify ----
  push(
    defineTool({
      name: "cw_supply_verify",
      description:
        "Classify a tool invocation by supply-chain trust tier (T1-T4) and report the enforcement decision (allow/ask/block). Read-only policy query.",
      parameters: {
        toolName: { type: "string", required: true, description: "Tool name to classify (e.g. 'shell', 'npm')." },
        command: { type: "string", description: "Command text (for install-pattern detection)." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        const decision = classifySupplyCall({ toolName: args.toolName, args: { command: args.command } }, runtime.config.supplyChain ?? {});
        return decision;
      },
    })
  );

  // ---- M2: cw_supervision_matrix ----
  push(
    defineTool({
      name: "cw_supervision_matrix",
      description:
        "Return the supervision matrix (task type -> sandbox/approval preset) and the forbidSelfDowngrade policy. Read-only.",
      parameters: {},
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(_args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        return {
          matrix: {
            probe: supervisionPreset("probe"),
            internal: supervisionPreset("internal"),
            workspace: supervisionPreset("workspace"),
            external: supervisionPreset("external"),
            admin: supervisionPreset("admin"),
          },
          forbidSelfDowngrade: runtime.config.supervision?.forbidSelfDowngrade ?? true,
        };
      },
    })
  );

  // ---- M3: cw_skill_list ----
  push(
    defineTool({
      name: "cw_skill_list",
      description:
        "List the worker's skill library: name, state (accepted/pending/rejected), trust tier, use count, success count, confidence, created/updated. Read-only.",
      parameters: {},
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(_args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.skills.load();
        return { skills: runtime.skills.list() };
      },
    })
  );

  // ---- M3: cw_skill_use (invoke an accepted skill) ----
  push(
    defineTool({
      name: "cw_skill_use",
      description:
        "Mark one accepted skill as used (counts usage/success) and return its proven steps for execution. Only accepted skills (tier >= T2) can be used — pending/rejected are blocked (supply-chain rule).",
      parameters: {
        name: { type: "string", required: true, description: "Skill name." },
        success: { type: "boolean", description: "Whether the invocation succeeded (default true)." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.skills.load();
        const skill = runtime.skills.get(args.name);
        if (skill === undefined) return { name: args.name, ok: false, code: "not_found" };
        if (skill.state !== "accepted") {
          return { name: args.name, ok: false, code: "not_accepted", state: skill.state, reason: "only accepted skills (>= T2) may be used" };
        }
        const updated = await runtime.skills.markUsed(args.name, args.success !== false);
        return { name: args.name, ok: true, steps: updated.steps, useCount: updated.useCount, successCount: updated.successCount };
      },
    })
  );

  // ---- M3: cw_skill_learn (procedural memory deposit) ----
  push(
    defineTool({
      name: "cw_skill_learn",
      description:
        "Deposit proven steps as a skill (procedural memory). Requires an evidenceRef into the intent ledger proving the steps actually ran. Confidence is computed by the plugin FROM THE INTENT LEDGER (M3 H1 fix: worker-supplied stats are IGNORED — no self-declared confidence). When requireSkillReview (default), lands as pending and needs human review before use.",
      parameters: {
        name: { type: "string", required: true, description: "Skill name (identifier)." },
        steps: { type: "array", required: true, items: { type: "string" }, description: "Proven steps (non-empty)." },
        evidenceRef: { type: "string", required: true, description: "Intent-ledger reference (recordId@at) proving the steps ran." },
        // The three stats below are accepted for API stability but IGNORED —
        // confidence comes from the ledger (M3 H1 fix).
        evidenceStrength: { type: "number", description: "IGNORED — plugin computes from ledger." },
        reproductions: { type: "number", description: "IGNORED — plugin computes from ledger." },
        successRate: { type: "number", description: "IGNORED — plugin computes from ledger." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        try {
          // M3 H1 fix: compute confidence from the intent ledger — reproductions
          // = completed intents for this evidenceRef, successRate = completed
          // / (completed + in-flight). Missing ref -> low confidence (review).
          await runtime.checkpoint.load();
          const ref = args.evidenceRef;
          const refEntries = [...runtime.checkpoint.records.values()].filter(
            (e) => `${e.recordId}@${e.at}` === ref || e.key === ref
          );
          const completed = refEntries.filter((e) => e.status === "completed").length;
          const inFlight = refEntries.filter((e) => e.status === "in-flight").length;
          const reproductions = refEntries.length;
          const successRate = completed + inFlight > 0 ? completed / (completed + inFlight) : 0;
          const evidenceStrength = reproductions > 0 ? 1 : 0;

          const skill = await runtime.skills.learn({
            name: args.name,
            steps: args.steps,
            evidenceRef: args.evidenceRef,
            evidenceStrength,
            reproductions: Math.min(reproductions, 10),
            successRate,
          });
          return skill;
        } catch (error) {
          return { ok: false, error: error.message };
        }
      },
    })
  );

  // ---- M3: cw_skill_review (human-channel review of pending skills) ----
  push(
    defineTool({
      name: "cw_skill_review",
      description:
        "Review one pending skill: accept (promotes to T2) or reject. When requireSkillReviewConfirm (default) the ACCEPT decision requires human confirmation — this tool only records the decision for the host/panel channel; the model cannot self-approve.",
      parameters: {
        name: { type: "string", required: true, description: "Skill name." },
        decision: { type: "string", required: true, enum: ["accept", "reject"], description: "Decision." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        if (runtime.config.skill.requireSkillReviewConfirm && args.decision === "accept") {
          return { name: args.name, ok: false, code: "requires_human_confirm", reason: "accept requires the human confirmation channel (panel/command), not the model tool" };
        }
        return runtime.skills.review({ name: args.name, decision: args.decision, reviewer: "tool" });
      },
    })
  );

  // ---- M3: cw_memory_retain ----
  push(
    defineTool({
      name: "cw_memory_retain",
      description:
        "Retain one verified fact into long-term memory. Requires a source (provenance). NEVER store secrets. When requireRetainReview (default) lands as pending until human review (防一次性观察变规则).",
      parameters: {
        fact: { type: "string", required: true, description: "Verified fact." },
        source: { type: "string", required: true, description: "Provenance (e.g. evidence ref, run id)." },
        scope: { type: "string", description: "profile|project (default profile)." },
        expiresAt: { type: "string", description: "ISO expiry (optional)." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        try {
          const entry = await runtime.memory.retain({
            fact: args.fact,
            source: args.source,
            scope: args.scope,
            expiresAt: args.expiresAt,
          });
          return entry;
        } catch (error) {
          return { ok: false, error: error.message };
        }
      },
    })
  );

  // ---- M3: cw_memory_recall ----
  push(
    defineTool({
      name: "cw_memory_recall",
      description:
        "Recall active long-term memory entries (optionally including pending), newest first. Read-only.",
      parameters: {
        includePending: { type: "boolean", description: "Include pending entries (default false)." },
        scope: { type: "string", description: "Filter by scope (profile|project)." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.memory.load();
        return { entries: await runtime.memory.recall({ includePending: args.includePending === true, scope: args.scope }) };
      },
    })
  );

  // ---- M3: cw_memory_forget ----
  push(
    defineTool({
      name: "cw_memory_forget",
      description: "Forget one memory entry by id (removes it).",
      parameters: { id: { type: "string", required: true, description: "Entry id." } },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        return runtime.memory.forget(args.id);
      },
    })
  );

  // ---- M3: cw_memory_review (human-channel review of pending memory) ----
  push(
    defineTool({
      name: "cw_memory_review",
      description:
        "Review one pending memory entry (accept -> active, reject -> expired). ACCEPT requires the human confirmation channel when requireRetainReview is set; the model tool records only the decision for the host/panel.",
      parameters: {
        id: { type: "string", required: true, description: "Entry id." },
        decision: { type: "string", required: true, enum: ["accept", "reject"], description: "Decision." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        if (runtime.config.memory.requireRetainReview && args.decision === "accept") {
          return { id: args.id, ok: false, code: "requires_human_confirm", reason: "accept requires the human confirmation channel" };
        }
        return runtime.memory.review(args.id, args.decision, "tool");
      },
    })
  );

  // ---- M3: cw_report (milestone / review / handover) ----
  push(
    defineTool({
      name: "cw_report",
      description:
        "Emit a worker report (human notification): milestone (key-node done), review (daily/weekly recap), or handover (on downgrade/pause/restart). ALL worker-initiated reports count toward the daily cap (M3 H3 fix: urgency is host-decided, not worker-selectable). Payload cites evidence refs.",
      parameters: {
        kind: { type: "string", required: true, enum: ["milestone", "review", "handover"], description: "Report kind." },
        title: { type: "string", description: "Title." },
        body: { type: "string", description: "Body content." },
        evidenceRefs: { type: "array", items: { type: "string" }, description: "Evidence/ledger refs." },
        period: { type: "string", description: "Review period (e.g. daily)." },
        summary: { type: "string", description: "Review summary." },
        quality: { type: "string", description: "Review quality note." },
        cost: { type: "string", description: "Review cost note." },
        nextSteps: { type: "string", description: "Review next steps." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        const admit = runtime.reportBudget.admit({ urgent: false }); // worker-initiated: never urgent
        if (!admit.ok) {
          return { kind: args.kind, emitted: false, reason: admit.reason };
        }
        let report;
        if (args.kind === REPORT_KIND.MILESTONE) {
          report = buildMilestone({ title: args.title, body: args.body, evidenceRefs: args.evidenceRefs });
        } else if (args.kind === REPORT_KIND.REVIEW) {
          report = buildReview({ period: args.period ?? "period", summary: args.summary ?? "", quality: args.quality, cost: args.cost, nextSteps: args.nextSteps });
        } else {
          report = buildHandover({
            status: runtime.watcher.alive() ? "alive" : "down",
            downgrade: runtime.watcher.state.downgrade,
            fatal: runtime.watcher.state.fatal,
            registrySummary: { active: (foldFor(agent) && !isError(foldFor(agent)) ? foldFor(agent).active.length : 0) },
            evidenceRefs: args.evidenceRefs,
          });
        }
        return { ...report, emitted: true, urgent: admit.urgent };
      },
    })
  );

  // ---- M4: cw_loop_start ----
  push(
    defineTool({
      name: "cw_loop_start",
      description:
        "Start one bounded worker-verifier loop. REQUIRED: workerPrompt, maxIterations (positive), maxTimeMs (positive), optional verifier (shell command string or structured pass rule), optional intervalMs. The loop advances on each iteration; it stops at PASS, maxIterations, or maxTimeMs — never unbounded.",
      parameters: {
        id: { type: "string", description: "Optional loop id (defaults to auto)." },
        workerPrompt: { type: "string", required: true, description: "Prompt delivered to the worker each iteration." },
        verifier: { type: "string", description: "Shell check command (exit 0 = pass)." },
        maxIterations: { type: "number", required: true, description: "Positive iteration ceiling." },
        maxTimeMs: { type: "number", required: true, description: "Positive time ceiling." },
        intervalMs: { type: "number", description: "Iteration interval (default 60000)." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.loops.load();
        const id = args.id ?? `loop-${Date.now().toString(36)}`;
        try {
          const loop = startLoop(
            createLoop({
              id,
              workerPrompt: args.workerPrompt,
              verifier: args.verifier,
              maxIterations: args.maxIterations,
              maxTimeMs: args.maxTimeMs,
              intervalMs: args.intervalMs,
            })
          );
          await runtime.loops.save(loop);
          return loopSnapshot(loop);
        } catch (error) {
          return { ok: false, error: error.message };
        }
      },
    })
  );

  // ---- M4: cw_loop_stop ----
  push(
    defineTool({
      name: "cw_loop_stop",
      description: "Stop one loop by id (state -> stopped). Human/host takeover.",
      parameters: { id: { type: "string", required: true, description: "Loop id." } },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.loops.load();
        const loop = runtime.loops.get(args.id);
        if (loop === undefined) return { id: args.id, stopped: false, code: "not_found" };
        const stopped = stopLoop(loop);
        await runtime.loops.save(stopped);
        return loopSnapshot(stopped);
      },
    })
  );

  // ---- M4: cw_loop_status ----
  push(
    defineTool({
      name: "cw_loop_status",
      description: "Report one loop's snapshot (state/iteration/ceilings/elapsed/passed) or all loops. Read-only.",
      parameters: { id: { type: "string", description: "Loop id (omit for all)." } },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.loops.load();
        if (args.id !== undefined) {
          const loop = runtime.loops.get(args.id);
          return loop === undefined ? { id: args.id, code: "not_found" } : loopSnapshot(loop);
        }
        return { loops: runtime.loops.list().map((l) => loopSnapshot(l)) };
      },
    })
  );

  // ---- M4: cw_loop_iterate (host-side advance hook used by the pacemaker) ----
  // Not exposed as a model tool — the pacemaker drives iterations; this helper
  // is exported for the driver. (We keep the model surface read-only on loops.)

  // ---- M4: cw_handover ----
  push(
    defineTool({
      name: "cw_handover",
      description:
        "Produce a handover work order (Paseo-style: Task/Context/Relevant files/Current state/What was tried/Decisions/Acceptance/Constraints/Next steps/Evidence). Use on downgrade/pause/restart so the next worker resumes with full context. Returns both the structured order and its markdown rendering.",
      parameters: {
        task: { type: "string", required: true, description: "Imperative task description." },
        context: { type: "string", description: "Why this task exists." },
        relevantFiles: { type: "array", items: { type: "string" }, description: "File paths." },
        currentState: { type: "string", description: "What is done / works / does not." },
        whatWasTried: { type: "array", items: { type: "string" }, description: "Approaches tried." },
        decisions: { type: "array", items: { type: "string" }, description: "Decisions and rationale." },
        acceptanceCriteria: { type: "array", items: { type: "string" }, description: "Acceptance checklist." },
        constraints: { type: "array", items: { type: "string" }, description: "Must-not / must-preserve." },
        nextSteps: { type: "array", items: { type: "string" }, description: "Suggested next actions." },
        evidenceRefs: { type: "array", items: { type: "string" }, description: "Ledger/evidence references." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        try {
          const wo = buildHandoverWorkOrder({ ...args, workerId: agent.id });
          return { workOrder: wo, markdown: renderHandover(wo) };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      },
    })
  );

  // ---- M4: cw_replay ----
  push(
    defineTool({
      name: "cw_replay",
      description:
        "Replay the checkpoint intent log for audit (time travel over the intent ledger only — NEVER re-executes; per design L4 the replayable unit is the intent log, not LLM output). Optionally filter by recordId or time window.",
      parameters: {
        recordId: { type: "string", description: "Filter to one record." },
        from: { type: "string", description: "ISO start of window." },
        to: { type: "string", description: "ISO end of window." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        const result = await replayIntents(runtime.checkpoint, { recordId: args.recordId, from: args.from, to: args.to });
        return { replay: "intent-ledger", ...result };
      },
    })
  );

  // ---- P0: cw_probe_create (自驱巡检) ----
  push(
    defineTool({
      name: "cw_probe_create",
      description:
        "Create one self-initiated supervision probe (worker finds its own work — not employer-assigned). kind: disk|cost|dependency|external; check: deterministic expression; onAnomaly: record|handle|escalate; bounded by intervalSeconds/maxRunsPerDay.",
      parameters: {
        id: { type: "string", required: true, description: "Probe id (unique)." },
        kind: { type: "string", required: true, enum: ["disk", "cost", "dependency", "external"], description: "Probe kind." },
        check: { type: "string", required: true, description: "Deterministic check expression (host-side)." },
        intervalSeconds: { type: "number", required: true, description: "Interval in seconds (>= 60)." },
        onAnomaly: { type: "array", items: { type: "string", enum: ["record", "handle", "escalate"] }, description: "Dispositions (default record+escalate)." },
        scope: { type: "string", description: "profile|project." },
        maxRunsPerDay: { type: "number", description: "Daily cap (default 96)." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.probes.load();
        try {
          const probe = createProbe({
            id: args.id, kind: args.kind, check: args.check,
            intervalSeconds: args.intervalSeconds, onAnomaly: args.onAnomaly,
            scope: args.scope, maxRunsPerDay: args.maxRunsPerDay,
          });
          await runtime.probes.save(probe);
          return probe;
        } catch (error) {
          return { ok: false, error: error.message };
        }
      },
    })
  );

  // ---- P0: cw_probe_list ----
  push(
    defineTool({
      name: "cw_probe_list",
      description: "List all supervision probes with their state (enabled, lastRunAt, runCountToday, anomalyCount, lastResult). Read-only.",
      parameters: {},
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(_args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.probes.load();
        return { probes: runtime.probes.list() };
      },
    })
  );

  // ---- P0: cw_probe_delete ----
  push(
    defineTool({
      name: "cw_probe_delete",
      description: "Delete one supervision probe by id.",
      parameters: { id: { type: "string", required: true, description: "Probe id." } },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.probes.load();
        return runtime.probes.remove(args.id);
      },
    })
  );

  // ---- P0: cw_probe_run (宿主侧触发一次巡检) ----
  push(
    defineTool({
      name: "cw_probe_run",
      description:
        "Run one probe's deterministic check now (host-side evaluation). Observed signals are host-provided; the result records ok/anomaly and advances the probe (storm suppression + daily cap).",
      parameters: {
        id: { type: "string", required: true, description: "Probe id." },
        value: { type: "number", description: "Observed numeric value (disk free / cost spent)." },
        threshold: { type: "number", description: "Threshold for numeric probes." },
        status: { type: "string", description: "Status for dependency/external probes ('ok' or HTTP status)." },
        output: { type: "string", description: "Optional detail output." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.probes.load();
        const probe = runtime.probes.get(args.id);
        if (probe === undefined) return { id: args.id, code: "not_found" };
        const result = evaluateProbe(probe, {
          value: args.value, threshold: args.threshold,
          status: args.status, output: args.output,
        });
        const advanced = advanceProbe(probe, result);
        await runtime.probes.save(advanced);
        // Probe results go to the intent ledger (可审计).
        // P1 (DEV): begin 必须 complete — 否则每次巡检留一条永久 in-flight, 账本无限增长.
        const at = new Date().toISOString();
        await runtime.checkpoint.begin({ recordId: `probe:${args.id}`, at, action: "probe" }).catch(() => {});
        await runtime.checkpoint.complete(`probe:${args.id}@${at}`).catch(() => {});
        return { id: args.id, ...result, suppressed: advanced.lastResult.suppressed, runCountToday: advanced.runCountToday };
      },
    })
  );

  // ---- P0: cw_diagnose (质量漂移自检, 只读查询) ----
  push(
    defineTool({
      name: "cw_diagnose",
      description:
        "Run the quality-drift self-check (host-side) and return the health snapshot: output-quality drift, repeated-failure rate, context pressure, cost anomaly. Read-only — downgrade is executed by the plugin, not this query.",
      parameters: {},
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(_args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        // Feed watcher + budget observations into the diagnose engine.
        const w = runtime.watcher.snapshot();
        const result = runDiagnose({
          signatures: [], // host would fold quality signatures; MVP: no samples -> healthy
          dispatchFailures: w.consecutiveDispatchFailures,
          contextPressure: 0,
          contextWindow: 0,
          runTokenSpent: w.budget.runTokenSpent,
          stepTokenBudget: w.budget.ceilings.stepTokenBudget,
          options: {
            fatalAfterConsecutiveFailures: runtime.config.fatalAfterConsecutiveFailures,
            driftThreshold: runtime.config.diagnose.driftThreshold,
          },
        });
        return { ...result, watcher: w };
      },
    })
  );

  // ---- P1: cw_persona_get ----
  push(
    defineTool({
      name: "cw_persona_get",
      description: "Return the worker persona (name/tone/outputFormat/constraintCount/version). Read-only.",
      parameters: {},
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(_args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.persona.load();
        return runtime.persona.snapshot();
      },
    })
  );

  // ---- P1: cw_persona_set ----
  push(
    defineTool({
      name: "cw_persona_set",
      description:
        "Update the worker persona (name/tone/outputFormat/constraints). When guardrails.enforcePersona is enabled, protected fields require the human confirmation channel (model tool returns requires_human_confirm).",
      parameters: {
        name: { type: "string", description: "Persona name." },
        tone: { type: "string", description: "Tone (professional|casual|...)." },
        outputFormat: { type: "string", description: "Default output format." },
        constraints: { type: "array", items: { type: "string" }, description: "Red lines (versioned, auditable)." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.persona.load();
        if (runtime.config.guardrails.enforcePersona && runtime.config.guardrails.requirePersonaConfirm) {
          return { ok: false, code: "requires_human_confirm", reason: "persona changes under enforcePersona require the human channel" };
        }
        try {
          const updated = await runtime.persona.update(
            { name: args.name, tone: args.tone, outputFormat: args.outputFormat, constraints: args.constraints },
            "worker"
          );
          return updated;
        } catch (error) {
          return { ok: false, error: error.message };
        }
      },
    })
  );

  // ---- P2: cw_work_order (责任链登记) ----
  push(
    defineTool({
      name: "cw_work_order",
      description:
        "Register one accountability work order for a public action (external side effect). gatesPassed is recorded by the plugin (budget/supply-chain), NOT worker-declared; reviewStatus comes from independent review/human. Returns the workOrderId.",
      parameters: {
        action: { type: "string", required: true, description: "What was done (tool call / output / side effect)." },
        evidenceRef: { type: "string", description: "Ledger/evidence reference." },
        revertPath: { type: "string", description: "How to undo (or human intervention channel)." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.workOrders.load();
        const order = buildWorkOrder({
          action: args.action,
          actor: agent.id,
          evidenceRef: args.evidenceRef,
          gatesPassed: ["budget"], // plugin-recorded gate
          revertPath: args.revertPath,
        });
        const saved = await runtime.workOrders.add(order);
        return saved;
      },
    })
  );

  // ---- P2: cw_work_order_list ----
  push(
    defineTool({
      name: "cw_work_order_list",
      description: "List work orders (optionally filter by review status). Read-only.",
      parameters: { status: { type: "string", enum: ["pending", "approved", "rejected"], description: "Filter." } },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        await runtime.workOrders.load();
        return { orders: runtime.workOrders.list({ status: args.status }) };
      },
    })
  );

  // ---- P2: cw_schedule_update (更新 schedule) ----
  push(
    defineTool({
      name: "cw_schedule_update",
      description: "Update one schedule record's prompt/maxRuns/expiresIn (persisted as a versioned update event).",
      parameters: {
        id: { type: "string", required: true, description: "Record id." },
        prompt: { type: "string", description: "New prompt." },
        maxRuns: { type: "number", description: "New run ceiling." },
        expiresIn: { type: "string", description: "New TTL." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        // P0-2 (DEV REVIEWER): update 必须镜像 create 的校验, 防毒化账本
        if (args.maxRuns !== undefined && (!Number.isSafeInteger(args.maxRuns) || args.maxRuns <= 0)) {
          return { id: args.id, updated: false, code: "invalid_maxRuns" };
        }
        if (args.expiresIn !== undefined && !/^\d+[smhd]$/.test(String(args.expiresIn))) {
          return { id: args.id, updated: false, code: "invalid_expiresIn" };
        }
        if (args.prompt !== undefined && String(args.prompt).trim().length === 0) {
          return { id: args.id, updated: false, code: "invalid_prompt" };
        }
        const folded = foldFor(agent);
        if (isError(folded)) return folded;
        const record = folded.active.find((r) => r.id === args.id);
        if (record === undefined) return { id: args.id, updated: false, code: "not_found" };
        // P0-2 (DEV REVIEWER): kind 匹配 — schedule 工具只收 schedule 记录 (防跨 kind 注入未知键毒化)
        if (record.kind !== "schedule") return { id: args.id, updated: false, code: "kind_mismatch" };
        const next = {
          ...record,
          ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
          ...(args.maxRuns !== undefined ? { maxRuns: args.maxRuns } : {}),
          ...(args.expiresIn !== undefined ? { expiresIn: args.expiresIn } : {}),
        };
        appendChange(agent, changeUpdate(next));
        return { id: args.id, updated: true, record: next };
      },
    })
  );

  // ---- P2: cw_heartbeat_update ----
  push(
    defineTool({
      name: "cw_heartbeat_update",
      description: "Update one heartbeat record's prompt/interval/maxRuns/expiresIn.",
      parameters: {
        id: { type: "string", required: true, description: "Record id." },
        prompt: { type: "string", description: "New prompt." },
        intervalSeconds: { type: "number", description: "New interval (>= 30)." },
        maxRuns: { type: "number", description: "New run ceiling." },
        expiresIn: { type: "string", description: "New TTL." },
        stepTokenBudget: { type: "number", description: "New per-step budget." },
      },
      output: { schema: { type: "object", additionalProperties: true }, render: renderValue },
      async execute(args, exec) {
        if (!requireOwner(exec, agent)) return { error: "scoped to the owning worker session" };
        // P0-2: update 校验 (防毒化账本)
        if (args.intervalSeconds !== undefined && (!Number.isSafeInteger(args.intervalSeconds) || args.intervalSeconds < 30)) {
          return { id: args.id, updated: false, code: "invalid_interval" };
        }
        if (args.maxRuns !== undefined && (!Number.isSafeInteger(args.maxRuns) || args.maxRuns <= 0)) {
          return { id: args.id, updated: false, code: "invalid_maxRuns" };
        }
        if (args.expiresIn !== undefined && !/^\d+[smhd]$/.test(String(args.expiresIn))) {
          return { id: args.id, updated: false, code: "invalid_expiresIn" };
        }
        if (args.prompt !== undefined && String(args.prompt).trim().length === 0) {
          return { id: args.id, updated: false, code: "invalid_prompt" };
        }
        if (args.stepTokenBudget !== undefined && (!Number.isSafeInteger(args.stepTokenBudget) || args.stepTokenBudget <= 0)) {
          return { id: args.id, updated: false, code: "invalid_budget" };
        }
        const folded = foldFor(agent);
        if (isError(folded)) return folded;
        const record = folded.active.find((r) => r.id === args.id);
        if (record === undefined) return { id: args.id, updated: false, code: "not_found" };
        // P0-2 (DEV REVIEWER): kind 匹配 — heartbeat 工具只收 heartbeat 记录
        if (record.kind !== "heartbeat") return { id: args.id, updated: false, code: "kind_mismatch" };
        const next = {
          ...record,
          ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
          ...(args.intervalSeconds !== undefined ? { intervalSeconds: args.intervalSeconds } : {}),
          ...(args.maxRuns !== undefined ? { maxRuns: args.maxRuns } : {}),
          ...(args.expiresIn !== undefined ? { expiresIn: args.expiresIn } : {}),
          ...(args.stepTokenBudget !== undefined ? { stepTokenBudget: args.stepTokenBudget } : {}),
        };
        appendChange(agent, changeUpdate(next));
        return { id: args.id, updated: true, record: next };
      },
    })
  );

  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}

/** Allocate the next id not present in `seen` (minimal unused sequence). */
function allocateId(seen) {
  const used = new Set(seen);
  let sequence = 1;
  let candidate = `cw-${sequence}`;
  while (used.has(candidate)) {
    sequence += 1;
    candidate = `cw-${sequence}`;
  }
  return candidate;
}

export const internals = { allocateId };
