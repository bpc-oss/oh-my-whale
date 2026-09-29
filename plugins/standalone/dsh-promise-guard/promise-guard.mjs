/**
 * promise-guard — a turn must never end silently on a promise.
 *
 * WHY: a model that writes "调用视觉工具看第一张共享图：" and then returns with no tool
 * call makes the harness end the turn. The user sees a sudden stop with no error.
 * In the 2026-09-28 field case the tool the model named was not in the request's
 * catalog at all (the preset's tool-bootstrap keep-set had filtered it out), so the
 * model could not call it and the failure was completely invisible.
 *
 * WHAT: after every finished step that (a) issued no tool call and (b) ended in a
 * short promise-like text, inject ONE corrective `next-turn` message telling the
 * model to either make the call (unlocking the tool via dev_tool_search first when
 * it is missing) or state the concrete reason it cannot — plus a `logger.warn` so
 * the failure is visible in the host log. The corrective turn is what makes the
 * session continue instead of stopping.
 *
 * SAFETY: rate-limited per session (default 3 nudges / 15 min) so a stubborn model
 * cannot ping-pong forever, subagents are skipped by default, and every path is
 * wrapped so a guard bug can never break a session.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'promise-guard'

/** Wording that means "I am about to act" (the failure signature seen in the field). */
const PROMISE_RE = /(立刻|马上|现在(就)?(去)?|我这就|这就去|接下来(我)?|下面(我)?|即将|先调用|先执行|去调用|让我|Let me |I'?ll |will now|Next,? I )/i

/** A trailing colon is the strongest tell: "...：". */
const ENDS_ACTION_RE = /[:：]\s*$/

/** The corrective turn. Deliberately short and imperative. */
export const NUDGE_TEXT = [
  '【护栏 · 说了没做】',
  '上一轮你的最后一句在宣称要执行某个动作，但那一轮没有发出任何工具调用，因此被判为空转并中断。',
  '现在立刻二选一，不要再复述计划：',
  '1) 真的去做：调用所需工具。若它不在你的工具列表里（如 vision_* / chrome_* / 其它 MCP 工具），先调用 dev_tool_search 搜索并解锁该工具名，然后在下一步调用它；',
  '2) 明确报错：说明做不到的具体原因（缺哪个工具、权限或文件），并给出你能做到的替代方案。',
].join('\n')

/** All text blocks of an assistant message, joined and trimmed. */
function blockText(message) {
  const blocks = Array.isArray(message?.content) ? message.content : []
  return blocks
    .filter((block) => block && block.type === 'text')
    .map((block) => block.text || '')
    .join('\n')
    .trim()
}

/** Register the promise guard. */
export function apply(ctx, config) {
  const maxPerWindow = Number.isInteger(config?.maxNudgesPerWindow) ? config.maxNudgesPerWindow : 3
  const windowMs = Number.isInteger(config?.windowMs) ? config.windowMs : 15 * 60 * 1000
  const maxChars = Number.isInteger(config?.maxTextChars) ? config.maxTextChars : 800
  const includeSubagents = config?.includeSubagents === true
  /** session id -> recent nudge timestamps */
  const history = new Map()

  ctx.on('session/event', (session, event) => {
    try {
      if (!event || event.type !== 'step/end') return
      const data = event.data || {}
      if (!includeSubagents && (session.header?.delegationDepth ?? 0) > 0) return

      const inStep = (candidate) => candidate?.data?.turn === data.turn
        && candidate?.data?.step === data.step
      const stepEvents = session.events.filter(inStep)
      // A step that called a tool is doing work — never nudge it.
      if (stepEvents.some((candidate) => candidate.type === 'tool/call')) return

      const lastMessage = [...stepEvents].reverse().find((candidate) => candidate.type === 'assistant/message')
      const text = blockText(lastMessage?.data?.message)
      if (!text || text.length > maxChars) return
      // A question to the user is a legitimate end of turn.
      if (text.endsWith('?') || text.endsWith('？')) return
      if (!(ENDS_ACTION_RE.test(text) || PROMISE_RE.test(text))) return

      const current = ctx.get('agent')
      const target = current !== undefined && current.session === session ? current : undefined
      if (target === undefined || target.inbox === undefined) return

      const recent = (history.get(session.id) || []).filter((stamp) => Date.now() - stamp < windowMs)
      if (recent.length >= maxPerWindow) return
      if ((target.inbox.nextTurn || []).some((message) => message?.source?.plugin === name)) return

      history.set(session.id, [...recent, Date.now()])
      ctx.logger?.warn?.(
        `${name}: turn ${data.turn} step ${data.step} ended with a promise and no tool call — `
        + `corrective turn injected (${recent.length + 1}/${maxPerWindow} in this window)`,
      )
      target.inbox.prepend('next-turn', {
        id: crypto.randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: NUDGE_TEXT }],
        source: {
          kind: 'plugin',
          plugin: name,
          form: 'notice',
          summary: 'promise without tool call',
        },
      })
    } catch (error) {
      // A guard bug must never brick a session.
      ctx.logger?.warn?.(`${name}: skipped (${String((error && error.message) || error)})`)
    }
  })
}
