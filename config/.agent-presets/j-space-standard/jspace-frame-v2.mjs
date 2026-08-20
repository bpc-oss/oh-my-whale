/**
 * jspace-frame — the J-Space Standard preset's own contribution.
 *
 * Injected once per session AFTER the anchored bootstrap promotes. The
 * anchored machinery (context-gate / tool-bootstrap) owns the clean first
 * round and the minimal resident catalog; this plugin makes J-Space
 * COMPLETE and DETERMINISTIC on top of it:
 *
 *   - the recommended DeepSeek settings baseline (report §4.1: reasoning
 *     effort max for complex work; temperature 1.0 / top_p 0.95 kept for
 *     consistency even though thinking mode may ignore them);
 *   - the FULL `j-space` SKILL.md body, loaded automatically via
 *     `ctx.skills.get('j-space')` (the same registry skill_load uses) and
 *     injected with the frame — the complete protocol (fast/full/loop gate,
 *     ledger Goal/Core/Verified/Open/Next, checkpoint, verification) is
 *     therefore ALWAYS active from promotion on, without relying on the
 *     model deciding to call skill_load itself;
 *   - red lines: do not stack with anchored-standard / router-standard;
 *     functional first-person is control grammar; the frame creates no
 *     knowledge (verifier + coverage before "done").
 *
 * Design notes:
 *   - This matches the upstream "generic model integration" guidance for
 *     skill-less hosts: provide j-space/SKILL.md as a system/developer-level
 *     instruction. A preset that names J-Space is exactly such a host; the
 *     skill is the preset's own core, not an "unrelated" injection, so
 *     auto-loading it does not violate the "no unrelated skill catalog"
 *     rule.
 *   - If the `j-space` skill cannot be resolved (not installed, registry
 *     unavailable), the frame degrades to the baseline + red lines only —
 *     never throws, never hurts the session.
 *
 * Mechanics mirror instruction-hint.mjs exactly:
 *   - emitted only after the session's first durable promotion signal
 *     (`promoteOn`, default `either`), so it never touches the gated first
 *     request;
 *   - ONCE PER SESSION, DERIVED FROM DURABLE EVENTS: the guard scans the
 *     session log for an existing `jspace-frame` message (O(1) after the
 *     first scan), so a process restart cannot inject a second copy — a
 *     duplicate would collide with the deterministic id
 *     (`jspace-frame-<sessionId>`) and break history replay;
 *   - subagents follow the same phase when `includeSubagents: true`;
 *   - every failure degrades to "no hint" — a frame bug must never hurt a
 *     session.
 */

import { createEpochPromotion } from './compaction-epoch.mjs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'jspace-frame'

/**
 * The skills registry is required to auto-load the full SKILL.md body —
 * without this inject, `ctx.skills` is unavailable and the frame silently
 * degrades to the baseline-only text.
 */
export const inject = ['skills']

/** Durable session event types that count as a promotion signal per mode. */
const PROMOTE_EVENTS = {
  'tool-call': ['tool/call'],
  'assistant-message': ['assistant/message'],
  either: ['tool/call', 'assistant/message'],
}

/** Every config key this plugin accepts — anything else is a typo. */
const ALLOWED_KEYS = new Set(['promoteOn', 'includeSubagents'])

/** The preset-owned part of the injected message (baseline + red lines). */
const PRESET_FRAME = [
  'J-SPACE STANDARD preset — operating frame.',
  '',
  'Recommended baseline (from the J-Space capability-realization report, §4.1):',
  '- Reasoning effort: use max (Think Max) for complex or long-horizon tasks; one-step trivial work may run at a lower effort.',
  '- temperature 1.0 / top_p 0.95 are the benchmark baseline. In thinking mode the API may ignore them — that is expected; keep submitting them for consistency and record what the server actually honored when reproducing results.',
  '',
  'The J-Space protocol is ALREADY LOADED below (full SKILL.md). Operate by it from this point:',
  '- Gate selection: fast / full / loop per task; ledger (Goal / Core / Verified / Open / Next); checkpoint and verification protocol. Do not invent a parallel protocol.',
  '- J-Space modules load selectively per gate; never concatenate all modules into one request. For loop tasks you may use the python controller (scripts/jspace.py) to externalize state into .jspace/.',
  '',
  'Red lines:',
  '- Do not stack with the anchored-standard or router-standard presets: first-round double injection and persona conflicts degrade results. If asked for those behaviors, name the conflict and propose one clean preset.',
  '- `we / we need / let\'s` is control grammar, not decoration: every first-person commitment must recur as an action, a check, or a settle.',
  '- This frame creates no knowledge: bind every "done" to a named verifier and its coverage; on failure, retry carrying the diagnosis.',
].join('\n')

/** Extract the model-facing body of a loaded skill definition (same as skill-search). */
function extractSkillBody(skill) {
  const content = skill?.content ?? skill?.instructions ?? skill?.body
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n')
  }
  return ''
}

function parsePromoteOn(value) {
  if (value === undefined || value === 'either') return PROMOTE_EVENTS.either
  if (value === 'tool-call' || value === 'assistant-message') return PROMOTE_EVENTS[value]
  throw new TypeError(`${name}: promoteOn must be one of "tool-call", "assistant-message", "either"; got ${JSON.stringify(value)}`)
}

/** Validate an optional boolean flag with a default. */
function booleanOption(value, field, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name}: ${field} must be a boolean`)
  }
  return value
}

/** Register the post-promotion J-Space frame + full-protocol injector. */
export function apply(ctx, config) {
  const source = config === undefined ? {} : config
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new TypeError(`${name}: config must be an object`)
  }
  const unknown = Object.keys(source).filter((key) => !ALLOWED_KEYS.has(key))
  if (unknown.length > 0) {
    throw new TypeError(
      `${name}: unknown config key(s) ${unknown.join(', ')} — allowed keys: ${[...ALLOWED_KEYS].sort().join(', ')}`,
    )
  }
  const promoteEvents = parsePromoteOn(source.promoteOn)
  const includeSubagents = booleanOption(source.includeSubagents, 'includeSubagents', false)
  const promotion = createEpochPromotion(promoteEvents, { includeSubagents })
  ctx.on('session/event', (session, event) => promotion.observe(session, event))

  /**
   * Sessions whose frame is already durable in the event log — the
   * restart-safe replacement for an in-memory "already framed" set. Seeded by
   * a one-time scan, then maintained incrementally through `session/event`.
   */
  const framed = new Map()
  const frameIsDurable = (session) => {
    const known = framed.get(session.id)
    if (known !== undefined) return known
    const found = (Array.isArray(session.events) ? session.events : []).some((event) =>
      event.type === 'user/message' && event.data?.source?.kind === 'jspace-frame',
    )
    framed.set(session.id, found)
    return found
  }
  ctx.on('session/event', (session, event) => {
    if (event.type === 'user/message' && event.data?.source?.kind === 'jspace-frame') {
      framed.set(session.id, true)
    }
  })

  let warned = false
  const warnOnce = (message) => {
    if (warned) return
    warned = true
    try {
      ctx.logger.warn(message)
    } catch {
      // Logger unavailable — the guard exists only to avoid spamming.
    }
  }

  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    try {
      if (promotion.status(agent).promoted !== true) return decision
      const session = agent.session
      if (session === undefined || frameIsDurable(session)) return decision
      framed.set(session.id, true)

      // Load the full protocol from the skill registry (same source as
      // skill_load). On any failure, degrade to the frame text only.
      let text = PRESET_FRAME
      try {
        const skill = await ctx.skills?.get?.('j-space', {
          scope: agent,
          cwd: session.header?.cwd,
          signal,
        })
        const body = skill === undefined ? '' : extractSkillBody(skill)
        if (body.length > 0) {
          text = `${PRESET_FRAME}\n\n# J-Space protocol (auto-loaded, full SKILL.md)\n${body}`
        }
      } catch {
        // Registry unavailable or skill missing: frame-only injection.
      }

      return {
        ...decision,
        messages: [...decision.messages, {
          id: `jspace-frame-${session.id}`,
          role: 'user',
          content: [{ type: 'text', text }],
          source: { kind: 'jspace-frame', form: 'hint' },
        }],
      }
    } catch (error) {
      // A frame bug must never hurt the session: skip the hint.
      warnOnce(`${name}: frame injection failed, skipping: ${String((error && error.message) || error)}`)
      return decision
    }
  }, { prepend: true })
}
