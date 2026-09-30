// Behavioural proof for P42. Reproduces the real cordis-4 shapes:
//   - Fiber.dispose() returns void            (the case that actually fired)
//   - Fiber.dispose() returns a Promise       (a rejected-disposal diagnostic)
// and shows the old call site throwing on the first while the patched one does not.
const ctx = { logger: { warn: (m) => console.log('    warn:', m) } }

const cases = [
  ['dispose() -> undefined  (real cordis 4)', () => undefined],
  ['dispose() -> rejected Promise', () => Promise.reject(new Error('registration cleanup failed'))],
  ['dispose() -> resolved Promise', () => Promise.resolve()],
]

const oldCall = (dispose) => dispose().catch((e) => ctx.logger.warn(`caught: ${e}`))
const newCall = (dispose) => Promise.resolve(dispose()).catch((e) => ctx.logger.warn(`caught: ${e}`))

let failures = 0
for (const [label, dispose] of cases) {
  for (const [name, call] of [['BEFORE', oldCall], ['AFTER ', newCall]]) {
    let outcome
    try {
      call(dispose)
      outcome = 'no synchronous throw'
    } catch (e) {
      outcome = `THREW: ${e.message}`
      if (name.trim() === 'AFTER') failures++
    }
    console.log(`  ${name}  ${label.padEnd(38)} -> ${outcome}`)
  }
  console.log('')
}

// The decisive assertion: BEFORE must fail on the shape cordis 4 actually returns.
let beforeThrew = false
try { oldCall(() => undefined) } catch { beforeThrew = true }
let afterThrew = false
try { newCall(() => undefined) } catch { afterThrew = true }

console.log(`BEFORE threw on cordis-4 dispose(): ${beforeThrew}  (must be true — this was the live bug)`)
console.log(`AFTER  threw on cordis-4 dispose(): ${afterThrew}  (must be false)`)
const ok = beforeThrew === true && afterThrew === false && failures === 0
console.log(ok ? '\nP42 BEHAVIOUR PROOF: PASS' : '\nP42 BEHAVIOUR PROOF: FAIL')
process.exit(ok ? 0 : 1)
