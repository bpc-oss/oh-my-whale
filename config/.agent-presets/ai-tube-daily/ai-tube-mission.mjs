/**
 * ai-tube-mission — AI TUBE project operating contract injected once per
 * session after promotion.
 *
 * Behavior:
 *  - After the first durable promotion signal, ONE mission message is
 *    injected into the session, listing the mandatory read-first files,
 *    first checks, confirmed user decisions, production rules, and closeout
 *    requirements.
 *  - ONCE PER SESSION, DERIVED FROM DURABLE EVENTS: the guard scans the
 *    session log for an existing `ai-tube-mission` message so a process
 *    restart cannot inject a second copy.
 *  - Pre-promotion requests get NO mission (matches the anchored bootstrap).
 *  - Subagents are included via `includeSubagents: true`, so delegated work
 *    receives the same project contract after its own promotion signal.
 */

import { createEpochPromotion } from './compaction-epoch.mjs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'ai-tube-mission'

/** Durable session event types that count as a promotion signal per mode. */
const PROMOTE_EVENTS = {
  'tool-call': ['tool/call'],
  'assistant-message': ['assistant/message'],
  either: ['tool/call', 'assistant/message'],
}

/** Candidate file names, in probe order, for the project chain and user-global. */
const PROJECT_CANDIDATES = ['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md']
const USER_GLOBAL_CANDIDATE = 'AGENTS.md'

function parsePromoteOn(value) {
  if (value === undefined || value === 'either') return PROMOTE_EVENTS.either
  if (value === 'tool-call' || value === 'assistant-message') return PROMOTE_EVENTS[value]
  throw new TypeError(`${name}: promoteOn must be one of "tool-call", "assistant-message", "either"; got ${JSON.stringify(value)}`)
}

/** Every config key this plugin accepts — anything else is a typo. */
const ALLOWED_KEYS = new Set(['promoteOn', 'includeSubagents'])

/** Validate an optional boolean flag with a default. */
function booleanOption(value, field, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name}: ${field} must be a boolean`)
  }
  return value
}

/** Find the project root: first ancestor containing any root marker (e.g. .git). */
async function findProjectRoot(fs, cwd, signal) {
  let current = cwd
  for (;;) {
    for (const marker of ['.git', '.hg', '.svn']) {
      try {
        const target = await fs.resolve(joinPath(current, marker), { cwd, signal })
        const info = await fs.stat(target, signal)
        if (info !== undefined) return current
      } catch {
        // Probe failure = marker absent; continue.
      }
    }
    const parent = parentPath(current)
    if (parent === current || parent.length === 0) return cwd
    current = parent
  }
}

/** List instruction files present in one directory (project candidates). */
async function presentInDir(fs, dir, candidates, signal) {
  const found = []
  for (const candidate of candidates) {
    try {
      const target = await fs.resolve(joinPath(dir, candidate), { cwd: dir, signal })
      const info = await fs.stat(target, signal)
      if (info !== undefined && info.type === 'file') found.push(candidate)
    } catch {
      // Absent or unreadable — skip.
    }
  }
  return found
}

/** Join one path segment onto a directory (platform-agnostic string join). */
function joinPath(dir, segment) {
  if (dir.endsWith('/') || dir.endsWith('\\')) return dir + segment
  const sep = dir.includes('\\') ? '\\' : '/'
  return dir + sep + segment
}

/** Parent of an absolute Windows or POSIX path. */
function parentPath(path) {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (idx <= 0) return path
  const parent = path.slice(0, idx)
  return parent.length === 0 ? path : parent
}

/** Register the post-promotion instruction-hint injector. */
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
   * Sessions whose hint is already durable in the event log — the
   * restart-safe replacement for an in-memory "already hinted" set. Seeded by
   * a one-time scan, then maintained incrementally through `session/event`.
   */
  const hinted = new Map()
  const hintIsDurable = (session) => {
    const known = hinted.get(session.id)
    if (known !== undefined) return known
    const found = (Array.isArray(session.events) ? session.events : []).some((event) =>
      event.type === 'user/message' && event.data?.source?.kind === 'ai-tube-mission',
    )
    hinted.set(session.id, found)
    return found
  }
  ctx.on('session/event', (session, event) => {
    if (event.type === 'user/message' && event.data?.source?.kind === 'ai-tube-mission') {
      hinted.set(session.id, true)
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
      if (session === undefined || hintIsDurable(session)) return decision
      hinted.set(session.id, true)

      const fs = ctx.get('fs')
      if (fs === undefined) return decision
      const cwd = session.header.cwd ?? process.cwd()

      const projectFiles = []
      const root = await findProjectRoot(fs, cwd, signal)
      projectFiles.push(...await presentInDir(fs, root, PROJECT_CANDIDATES, signal))

      const userGlobalFiles = []
      try {
        const dshHome = process.env.DSH_HOME ?? (process.env.USERPROFILE ? `${process.env.USERPROFILE}\\.dsh` : undefined)
        if (dshHome !== undefined) {
          userGlobalFiles.push(...await presentInDir(fs, dshHome, [USER_GLOBAL_CANDIDATE], signal))
        }
      } catch {
        // Unreadable home probe — ignore.
      }

      const missionLines = [
        'You are operating the AI TUBE project.',
        'Before any production action, read these files first: AGENTS.md, docs/agent_daily_operation_guide.md, docs/requirement_conflicts_and_ambiguity_audit.md, docs/agent_takeover_runbook.md, docs/pipeline_operations.md, docs/daily_pipeline_runbook.md, PROJECT_STATUS.md, HANDOFF.md, and the latest strict_recovery_todolist under outputs/workbuddy_tasks/.',
        'Mandatory first checks: run `python scripts/pipeline_ctl.py doctor --json` and `python scripts/pipeline_ctl.py status --json`; recover any submitted_unknown/uploading/platform_verified/submit_intent_recorded/blocked before creating new work.',
        'Confirmed decisions (2026-08-18): scheduled times are not moved unless gaps/title errors require it, and record evidence for any such change; excluded needs a clear reason and record; independent review is done by another agent against a checklist; favorite order is Douyin favorites old-to-new; sweet-spot checkpoint checks published content first 50; Douyin image posts keep images and sound together; TikTok pre-publish dedupe checks from the previous round starting point; videos go to TikTok+YouTube, images go to TikTok only; task-looking leftover tabs may be closed; Chrome itself is not casually restarted but extension can be reconnected, and if restart is unavoidable record the scene first.',
        'Production rules: WorkBuddy hy3 only, fresh one-shot, no fallback; exact Chrome profiles 报平/Baoping; CDP page File injection only; SQLite database/pipeline_control.db is the only mutable truth; every terminal row needs platform evidence and independent PASS.',
        'Implementation note: incremental TikTok dedupe is the confirmed target; if the current code gate still forces full history, retrofit and regression-test it first; do not bypass.',
        'Always finish with tab ledger (baseline/created/closed/remaining/ownedOpen/handoff/closeFailures) and update PROJECT_STATUS.md + HANDOFF.md.',
      ]
      const text = missionLines.join(' ')

      return {
        ...decision,
        messages: [...decision.messages, {
          id: `ai-tube-mission-${session.id}`,
          role: 'user',
          content: [{ type: 'text', text }],
          source: { kind: 'ai-tube-mission', form: 'mission' },
        }],
      }
    } catch (error) {
      // A hint bug must never hurt the session: skip the hint.
      warnOnce(`${name}: hint injection failed, skipping: ${String((error && error.message) || error)}`)
      return decision
    }
  }, { prepend: true })
}





