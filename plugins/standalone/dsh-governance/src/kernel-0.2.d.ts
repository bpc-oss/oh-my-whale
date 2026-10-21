/**
 * Ambient declarations for the DSH kernel packages this bundle builds against.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Kernel 0.2.0-rc.1 ships `@deepseek-ai/dsh-agent` and `@deepseek-ai/dsh-tools` as plain
 * JavaScript with no `.d.ts` and no `types` entry. The 0.1.x line published declarations, so
 * this source used to type-check against the host. It cannot any more: with `strict` on,
 * `import type { Agent } from '@deepseek-ai/dsh-agent'` has nothing to resolve and the build
 * fails before it emits a line. The previously shipped `dist/` was compiled while the
 * declarations still existed, which is why the mismatch stayed invisible.
 *
 * These are declarations only. Every runtime import still resolves to the real package —
 * `defineTool` is a value import and is genuinely the kernel's own function.
 *
 * HOW EACH SHAPE WAS ESTABLISHED
 * ------------------------------
 * Not by guessing and not by copying the old declarations. Each field below was counted
 * against the live 0.2.0-rc.1 tree (see scripts/probe-kernel-fields.mjs in the whale repo,
 * which reported):
 *
 *   ToolExecution.name        22189 occurrences   .agent 4530   .callId 486
 *   ToolExecution.rootCallId     70 (28 in dsh-tools itself)     .signal 6253
 *   ToolExecution.arguments   1634               .token 1046
 *   Agent.id                   3924               .session 782  .ctx 1740
 *
 * and the two contracts this bundle hooks were read out of the kernel source rather than
 * assumed:
 *
 *   agent/pre-step   dsh-agent/lib/index.js:
 *     on("agent/pre-step", async ({ agent, messages, signal, step }, next) => { const decision
 *       = await next(); if (decision.kind === "reject" || signal.aborted) return decision; ...
 *       — note there is NO `turn` on the payload any more; see status.ts.
 *
 *   tools.guard(fn)  dsh-tools/lib/index.js:
 *     guard(guard) { return this.layers.effect(this.ctx, (layer) => layer.guards.append(guard),
 *       { label: "tools.guard()", notify: false }); }
 *     — the registration shape this bundle already used is unchanged.
 */

// ── @deepseek-ai/cordis ───────────────────────────────────────────────────
// cordis 4.0.4 also ships no .d.ts: package.json points `types` at
// lib/types/index.d.ts, but that directory contains only .d.ts.map files. So the
// whole build dependency set is untyped on this kernel, not just the two DSH packages.
//
// `Service` is declared as a CLASS because it is a value import — the runtime resolves
// it to cordis's real class (verified: `var Service = class Service { ctx; ... }` in
// cordis/lib/index.js). The declared constructor is the one the kernel itself shows:
// `new Service(ctx, name)` followed by an `init` lifecycle. Only the surface this
// bundle touches is declared; anything wider would be invention.
declare module '@deepseek-ai/cordis' {
  export class Service<C = unknown> {
    constructor(ctx: C, name?: string)
    readonly ctx: C
  }

  /** The slice of a cordis Context an agent-scoped plugin touches. */
  export interface Context {
    get<T = unknown>(name: string): T | undefined
    // The listener shape is (payload, next) for intercept events and (payload) for plain
    // ones. Typing the params as `never[]` would collapse every callback parameter to
    // `never` at the call site, which is what produced the 30-error first pass; `any[]`
    // keeps the plugin's own annotations meaningful without inventing a union the kernel
    // does not have.
    on(event: string, listener: (...args: any[]) => any, options?: unknown): () => void
    isolate(name: string): { plugin(fn: (ctx: Context, cfg: unknown) => unknown): unknown }
    /** The bundle mounts governance for each existing agent: ctx.agents.list(). */
    agents: { list(): readonly Agent[] }
    // No index signature on purpose: with one, `ctx.agnet` and `ctx.gaurd` compile and
    // fail at runtime instead of at build time.
  }

  /** cordis's disposal handle; every ctx.on / effect returns one of these. */
  export interface Fiber {
    dispose(): Promise<void> | void
  }
}

// ── @deepseek-ai/dsh-agent ────────────────────────────────────────────────
declare module '@deepseek-ai/dsh-agent' {
  /** The minimal slice of a cordis Context an agent-scoped plugin touches. */
  export interface Agent {
    readonly id: string | number
    /** Session handle: this bundle compares it by identity and calls deriveEventMessage(). */
    readonly session: { deriveEventMessage?: (...args: any[]) => any; readonly [k: string]: any }
    /** Agent-scoped cordis context; installScoped() calls ctx.isolate(serviceName). */
    readonly ctx: { isolate(name: string): any; readonly [k: string]: any }
  }

  /**
   * What an `agent/pre-step` handler must return.
   *
   * The kernel reads `decision.kind` (the literal 'reject' short-circuits) and
   * `decision.messages` (a model-switch notice is appended when the route changed). This
   * bundle only ever forwards `next()` or returns `{ kind: 'reject' }`.
   */
  export interface PreStepDecision {
    readonly kind?: string
    // Optional because the kernel short-circuits on kind === "reject" BEFORE reading
    // messages (dsh-agent/lib/index.js), so a rejection legitimately carries none.
    readonly messages?: readonly unknown[]
    readonly [k: string]: any
  }

  /** Payload handed to an `agent/pre-step` handler. `turn` is gone in 0.2.0-rc.1. */
  /**
   * Payload handed to an `agent/pre-step` handler. `turn` IS present.
   *
   * The producer is dsh-agent-loop, not dsh-agent:
   *   dsh-agent-loop/lib/index.js — waterfall("agent/pre-step", { messages: claimed,
   *     ...position, signal }, ...) where `position` is `{ turn, step }`.
   *
   * A previous version of this file claimed `turn` had been removed, based on reading the
   * DESTRUCTURING in dsh-agent's own handler — `on("agent/pre-step", async ({ agent, messages,
   * signal, step }, next)`. That handler simply does not destructure `turn`; the field is
   * still on the payload. Reading a destructuring pattern as the payload shape is not
   * evidence, and acting on it silently dropped the observation this plugin exists to make.
   */
  export interface PreStepPayload {
    readonly agent: Agent
    readonly messages: readonly unknown[]
    readonly signal: AbortSignal
    readonly step: number
    readonly turn: number
  }
}

// ── @deepseek-ai/dsh-tools ────────────────────────────────────────────────
declare module '@deepseek-ai/dsh-tools' {
  /** One tool invocation as the guards see it. */
  export interface ToolExecution {
    readonly name: string
    /** Present only when the execution is agent-scoped: `...agent !== undefined ? { agent } : {}` (dsh-tools createExecution). */
    readonly agent?: unknown
    readonly callId: string
    readonly rootCallId: string
    readonly signal: AbortSignal
    /** Absent on the kernel's error path (`arguments: void 0`). */
    readonly arguments?: Readonly<Record<string, unknown>>
    readonly token: unknown
  }

  /** Whatever a tool returned; this bundle only forwards it. */
  export interface ToolExecutionResult {
    readonly [k: string]: any
  }

  export interface PreToolDecision {
    readonly kind?: string
    readonly [k: string]: any
  }

  export interface PostToolDecision {
    readonly kind?: string
    readonly [k: string]: any
  }

  /**
   * The `tools` service, as reached via `ctx.get('tools')`.
   *
   * `guard` is a REGISTRATION method in 0.2.0-rc.1 — verified against the implementation,
   * which appends the callback to the live guard layer and returns a disposer. It is not the
   * `guardReason(exec)` query that also exists on ToolLayer; that one is internal.
   */
  export interface ToolRuntime {
    guard(guard: (exec: Readonly<ToolExecution>) => string | undefined): () => void
    // Verified: dsh-tools returns `this.layers.effect(this.ctx, layer => layer.tools.insert(...))`,
    // i.e. a disposer — the same shape guard() returns.
    register(tool: unknown): () => void
    /** Tool schemas currently exposed for an agent — the catalog-binding check reads these. */
    schemas(agent: unknown): ReadonlyArray<{ readonly name: string }>
    // No index signature: guard/register/schemas is the whole surface this bundle uses.
  }

  /** Shape accepted by the kernel's own `defineTool` (a real value export). */
  export interface ToolDefinition {
    name: string
    description: string
    parameters: Readonly<Record<string, unknown>>
    // dsh-tools/lib/index.js reads options.output.render and options.execute and wraps the
    // latter as: async execute(args, exec) { ...; return userExecute(args, exec) }
    // REQUIRED, not optional: dsh-tools throws  when it is missing, and register() re-checks it. Declaring it
    // optional here would let a tool compile that dies at registration.
    output: { schema?: unknown; render: (args: unknown, value: unknown) => ReadonlyArray<{ type: string; text: string }>; presentationMeta?: unknown }
    execute(args: Readonly<Record<string, unknown>>, exec: { readonly signal: AbortSignal; readonly [k: string]: any }): Promise<unknown>
    readonly [k: string]: unknown
  }

  export function defineTool(definition: ToolDefinition): ToolDefinition

  export const TOOL_ABORTED: string
  export const TOOL_ABORTED_BEFORE_DISPATCH: string
}
