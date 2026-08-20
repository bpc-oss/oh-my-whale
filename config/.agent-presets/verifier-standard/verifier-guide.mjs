/**
 * verifier-guide — post-promotion, once-per-session near-user-message
 * injection of the verifier preset's DEFAULT-USAGE rules.
 *
 * Cloned from instruction-hint.mjs (anchored-standard) with the probe logic
 * replaced by a fixed guidance text: after the anchored bootstrap promotes
 * (first tool call OR first assistant message), ONE short user-kind message
 * is appended telling the agent the verifier tools are its DEFAULT workflow —
 * best-of-N after multi-rollout, live stop-loss during long tasks, wrap-up
 * review, and the one-time dev_tool_search unlock for the rest of the
 * verifier_* surface.
 *
 * Why near-user-message: the injector's measured "close-distance signal"
 * principle — behavior guidance injected after the user's message beats the
 * same text far away in the system prompt. Fixed text, one-shot, durable:
 * the once-per-session guard derives from the event log, so a restart cannot
 * duplicate it (the deterministic id must stay unique for history replay).
 *
 * Pre-promotion requests get NO hint (matches the anchored bootstrap); the
 * source kind `verifier-guide` is not in the context gate's allowlist, so
 * the gate strips it only while the session is unpromoted (never the
 * intended path).
 */

import { createEpochPromotion } from './compaction-epoch.mjs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'verifier-guide'

/** Durable session event types that count as a promotion signal per mode. */
const PROMOTE_EVENTS = {
  'tool-call': ['tool/call'],
  'assistant-message': ['assistant/message'],
  either: ['tool/call', 'assistant/message'],
}

function parsePromoteOn(value) {
  if (value === undefined || value === 'either') return PROMOTE_EVENTS.either
  if (value === 'tool-call' || value === 'assistant-message') return PROMOTE_EVENTS[value]
  throw new TypeError(`${name}: promoteOn must be one of "tool-call", "assistant-message", "either"; got ${JSON.stringify(value)}`)
}

/** Every config key this plugin accepts — anything else is a typo. */
const ALLOWED_KEYS = new Set(['promoteOn', 'includeSubagents'])

function booleanOption(value, field, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new TypeError(`${name}: ${field} must be a boolean`)
  return value
}

/** The default-usage rules, injected verbatim once per session after promotion. */
const GUIDE_TEXT = [
  '【验证器默认规则】你携带 llm-as-a-verifier 验证器工具（verifier_*），工作默认按此执行：',
  '1. 启动自检：动手前先调 verifier_doctor（probe=true）确认后端可用（当前对话模型 deepseek-v4-flash）。',
  '2. 解锁工具：其余 verifier_* 工具用 dev_tool_search 解锁一次，会话内常驻（verifier_doctor 已自带）。',
  '3. 多路 rollout / 多候选方案：并行产出后默认 verifier_select 做 best-of-N 选优（默认 n_evaluations=4、pivots=3——实验证明 pivots 是选对率决定因素、K 无增益；固定 seed + cache 复用比较）。',
  '4. 长任务（预计 >5 步）：每 8-10 步 verifier_progress 实时止损（默认 4 次重复取均值）；步骤 >=8 且 score<0.05，或连续 3 次不升反降 -> 放弃当前 rollout 换路。',
  '5. 收尾复盘：verifier_track 输出进度曲线，verifier_usage 汇报 token 账本。',
  '质量纪律：API 免费，以质量为先——保持默认高质量参数，不主动降档；仍避免无意义空转（同一输入重复评分用 cache 复用）。验证器是相对偏好打分器，Best-of-N 场景最可靠，单条绝对分数先标定阈值再用于止损。',
].join('\n')

/** Register the post-promotion verifier-guide injector. */
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

  /** Sessions whose guide is already durable in the event log (restart-safe). */
  const guided = new Map()
  const guideIsDurable = (session) => {
    const known = guided.get(session.id)
    if (known !== undefined) return known
    const found = (Array.isArray(session.events) ? session.events : []).some((event) =>
      event.type === 'user/message' && event.data?.source?.kind === 'verifier-guide',
    )
    guided.set(session.id, found)
    return found
  }
  ctx.on('session/event', (session, event) => {
    if (event.type === 'user/message' && event.data?.source?.kind === 'verifier-guide') {
      guided.set(session.id, true)
    }
  })

  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    try {
      if (promotion.status(agent).promoted !== true) return decision
      const session = agent.session
      if (session === undefined || guideIsDurable(session)) return decision
      guided.set(session.id, true)
      return {
        ...decision,
        messages: [...decision.messages, {
          id: `verifier-guide-${session.id}`,
          role: 'user',
          content: [{ type: 'text', text: GUIDE_TEXT }],
          source: { kind: 'verifier-guide', form: 'hint' },
        }],
      }
    } catch (error) {
      // A guide bug must never hurt the session: skip it.
      try {
        ctx.logger.warn(`${name}: guide injection failed, skipping: ${String((error && error.message) || error)}`)
      } catch {
        // Logger unavailable.
      }
      return decision
    }
  }, { prepend: true })
}
