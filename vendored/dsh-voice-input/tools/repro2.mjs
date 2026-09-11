/**
 * 复现 v2：更贴近 live 条件
 *  - 同一 OnnxSession 跨两轮使用（第一轮：语音+静音+flush；第二轮：再来）
 *  - 真实时间节奏喂入（每块等 256ms）
 *  - base64 往返
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const modelDir = join(ROOT, 'dsh-voice-models')
const { OnnxModel } = await import(pathToFileURL(join(ROOT, 'lib', 'core', 'native-asr.js')).href)

const buf = readFileSync(join(modelDir, 'test_wavs', '0.wav'))
let off = 12, data = null
while (off + 8 <= buf.length) {
  const id = buf.toString('ascii', off, off + 4)
  const size = buf.readUInt32LE(off + 4)
  if (id === 'data') { data = buf.subarray(off + 8, off + 8 + size); break }
  off += 8 + size + (size % 2)
}
const int16 = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))
const speech = int16.subarray(0, Math.min(40000, int16.length))

const model = new OnnxModel({ modelDir, asrDir: 'asr-zh', vadThreshold: 0.3, tailPadSeconds: 0.6 })
await model.start()
const session = model.openSession()
console.log('模型就绪, secondPass =', model.secondPassEnabled)

const b64 = (i) => Buffer.from(new Uint8Array(i.buffer, i.byteOffset, i.byteLength)).toString('base64')
const decode = (a) => { const c = Buffer.from(a, 'base64'); return new Int16Array(c.buffer, c.byteOffset, Math.floor(c.byteLength / 2)) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const CHUNK = 4096

async function round(name, withSilence = true) {
  let errors = []
  let finals = []
  let partials = 0
  // 语音
  for (let i = 0; i < speech.length; i += CHUNK) {
    try {
      const o = session.feed(decode(b64(speech.subarray(i, i + CHUNK))), false)
      if (o.partial) partials++
      if (o.finals.length) finals = finals.concat(o.finals)
    } catch (e) { errors.push('语音块: ' + e.message) }
    await sleep(256)
  }
  // 静音
  if (withSilence) {
    for (let i = 0; i < 12; i++) {
      try {
        const o = session.feed(decode(b64(new Int16Array(CHUNK))), false)
        if (o.finals.length) { finals = finals.concat(o.finals); console.log(`  [${name}] 静音块${i} 弹出:`, JSON.stringify(o.finals)) }
      } catch (e) { errors.push(`静音块${i}: ${e.message}`) }
      await sleep(200)
    }
  }
  // flush
  try {
    const o = session.feed(new Int16Array(0), true)
    if (o.finals.length) finals = finals.concat(o.finals)
  } catch (e) { errors.push('flush: ' + e.message) }
  console.log(`[${name}] partials=${partials} 定稿=${JSON.stringify(finals)} 错误=${errors.length ? JSON.stringify(errors) : '无'}`)
}

console.log('=== 第一轮（语音+静音+flush，真实时间节奏）===')
await round('R1')
console.log('=== 第二轮（同一会话，再来一次）===')
await round('R2')
console.log('=== 第三轮（无静音，直接 flush）===')
await round('R3', false)
