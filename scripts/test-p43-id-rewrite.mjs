// P43 correctness. The rewrite must (a) neutralise DSH's own id format,
// (b) keep every tool_call <-> tool_result pair matched, (c) leave everything
// else byte-identical, (d) be idempotent, (e) handle orphans and repeats.
import { readFileSync } from 'node:fs'

const src = readFileSync(process.argv[2], 'utf8')
const m = src.match(/const P43_ID_PATTERN[\s\S]*?\n\}\n/)
if (!m) { console.error('P43 block not found'); process.exit(2) }
const rewrite = new Function(`${m[0]}\nreturn rewriteRelayHostileToolCallIds;`)()

const clone = (x) => JSON.parse(JSON.stringify(x))
let failures = 0
const check = (name, cond, detail = '') => {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

// --- fixture: a slice of the real failing conversation -------------------
const ctx = {
  systemPrompt: 'sys',
  messages: [
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: [
      { type: 'toolCall', id: 'chatcmpl-tool-9bb4c4df66e0e46e', name: 'pwsh', arguments: { command: 'a' } },
      { type: 'toolCall', id: 'chatcmpl-tool-93f4fd0de06040f3', name: 'pwsh', arguments: { command: 'b' } },
    ] },
    { role: 'toolResult', toolCallId: 'chatcmpl-tool-9bb4c4df66e0e46e', content: [{ type: 'text', text: 'r1' }] },
    { role: 'toolResult', toolCallId: 'chatcmpl-tool-93f4fd0de06040f3', content: [{ type: 'text', text: 'r2' }] },
    { role: 'assistant', content: [
      { type: 'text', text: 'done' },
      { type: 'toolCall', id: 'chatcmpl-tool-aaaaaaaaaaaaaaaa', name: 'read', arguments: { path: 'p' } },
    ] },
    { role: 'toolResult', toolCallId: 'chatcmpl-tool-aaaaaaaaaaaaaaaa', content: [{ type: 'text', text: 'r3' }] },
  ],
  tools: [{ name: 'pwsh' }],
}
const before = clone(ctx)
rewrite(ctx)

const ids = ctx.messages.flatMap((m) => Array.isArray(m.content) ? m.content.filter((b) => b.type === 'toolCall').map((b) => b.id) : [])
const results = ctx.messages.filter((m) => m.role === 'toolResult').map((m) => m.toolCallId)

check('all DSH ids rewritten', ids.every((i) => !i.startsWith('chatcmpl-')), `-> ${ids.join(', ')}`)
check('no rewritten id contains a hyphen', ids.every((i) => !i.includes('-')) && results.every((i) => !i.includes('-')))
check('ids are unique', new Set(ids).size === ids.length, `${new Set(ids).size}/${ids.length}`)
check('results unique too', new Set(results).size === results.length)

// Pairing: every result id must exist among the call ids, and vice versa.
const callSet = new Set(ids)
const resultSet = new Set(results)
check('every result resolves to a call', results.every((r) => callSet.has(r)), `orphan: ${results.filter((r) => !callSet.has(r)).join(',') || 'none'}`)
check('every call has its result', ids.every((i) => resultSet.has(i)), `missing: ${ids.filter((i) => !resultSet.has(i)).join(',') || 'none'}`)

// Correspondence preserved: r1<->a, r2<->b, r3<->c, by ORIGINAL id.
const origMap = { 'chatcmpl-tool-9bb4c4df66e0e46e': 'r1', 'chatcmpl-tool-93f4fd0de06040f3': 'r2', 'chatcmpl-tool-aaaaaaaaaaaaaaaa': 'r3' }
const beforePairs = before.messages.filter((m) => m.role === 'toolResult').map((m) => `${m.toolCallId}->${m.content[0].text}`)
const afterPairs = ctx.messages.filter((m) => m.role === 'toolResult').map((m) => `${m.toolCallId}->${m.content[0].text}`)
const rewrittenMap = new Map(before.messages.filter((m) => m.role === 'toolResult').map((m, i) => [m.content[0].text, afterPairs[i].split('->')[0]]))
let pairingOk = true
for (const [oid, text] of Object.entries(origMap)) {
  if (rewrittenMap.get(text) !== ctx.messages.find((x) => x.role === 'toolResult' && x.content[0].text === text)?.toolCallId) pairingOk = false
}
check('result->call correspondence preserved', pairingOk, `${beforePairs.length} pairs`)

// Non-id content untouched.
const stripIds = (o) => JSON.stringify(o, (k, v) => (k === 'id' || k === 'toolCallId' ? '<ID>' : v))
check('nothing but ids changed', stripIds(ctx) === stripIds(before))
check('tool list untouched', JSON.stringify(ctx.tools) === JSON.stringify(before.tools))
check('systemPrompt untouched', ctx.systemPrompt === before.systemPrompt)

// Idempotence: a second pass must be a no-op.
const once = clone(ctx)
rewrite(ctx)
check('idempotent (second pass is a no-op)', JSON.stringify(ctx) === JSON.stringify(once))

// Foreign ids must pass through untouched.
const foreign = { messages: [{ role: 'assistant', content: [{ type: 'toolCall', id: 'call_abc123', name: 'x', arguments: {} }] },
  { role: 'toolResult', toolCallId: 'call_abc123', content: [{ type: 'text', text: 'r' }] }] }
rewrite(foreign)
check("model-returned ids left alone", foreign.messages[0].content[0].id === 'call_abc123')

// Degenerate inputs must not throw.
for (const bad of [{}, { messages: [] }, { messages: [{}] }, { messages: [{ role: 'assistant' }] }, { messages: null }]) {
  try { rewrite(bad); check(`no throw on ${JSON.stringify(bad).slice(0, 34)}`, true) }
  catch (e) { check(`no throw on ${JSON.stringify(bad).slice(0, 34)}`, false, e.message) }
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASS')
process.exit(failures ? 1 : 0)
