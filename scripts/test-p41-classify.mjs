import { readFileSync } from 'node:fs'

const src = readFileSync(process.argv[2], 'utf8')
const m = src.match(/function classifyPiAiError\(message\) \{[\s\S]*?\n\}/)
if (!m) throw new Error('classifyPiAiError not found')

// Strip the outer wrapper, keep the body, rebuild it as a standalone closure
// with the two free identifiers it closes over supplied explicitly.
const body = m[0]
  .replace('function classifyPiAiError(message) {', '')
  .replace(/}\s*$/, '')
const factory = new Function(
  'isQuotaExceededError',
  'QUOTA_EXCEEDED_CODE',
  `return function classifyPiAiError(message) {${body}\n}`,
)
const classify = factory(() => false, 'QUOTA_EXCEEDED')

const cases = [
  // P41 — the bug this patch fixes
  ['JSON error injected into SSE stream', 'SERVER'],
  // negative control: genuine non-retryable pi-ai terminal states must NOT move
  ['pi-ai stream for model "x" ended pending', 'PI_AI_ERROR'],
  ['pi-ai deferred response for model "x" is not supported', 'PI_AI_ERROR'],
  ['some unrelated failure', 'PI_AI_ERROR'],
  // pre-existing rules must be untouched
  ['401 Unauthorized', 'AUTH'],
  ['403 Forbidden', 'AUTH'],
  ['429 Too Many Requests', 'RATE_LIMIT'],
  ['rate_limit exceeded', 'RATE_LIMIT'],
  ['400 Invalid request body', 'INVALID_REQUEST'],
  ['413 payload too large', 'INVALID_REQUEST'],
  ['524 status code (no body)', 'SERVER'],
  ['503 upstream error', 'SERVER'],
  ['request timed out', 'TIMEOUT'],
  ['Connection error.', 'TRANSPORT'],
  ['fetch failed', 'TRANSPORT'],
  ['ECONNRESET', 'TRANSPORT'],
  ['stream ended without a terminal event', 'TRANSPORT'],
  ['premature close', 'TRANSPORT'],
]

let bad = 0
for (const [msg, want] of cases) {
  const got = classify(msg)
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(msg)} -> ${got}${ok ? '' : `   (want ${want})`}`)
}
console.log(bad ? `\nNEGATIVE CONTROL FAILED: ${bad}/${cases.length}` : `\nALL ${cases.length} CASES PASS`)
process.exit(bad ? 1 : 0)
