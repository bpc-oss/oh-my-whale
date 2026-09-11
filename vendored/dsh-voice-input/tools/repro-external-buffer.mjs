/**
 * 复现 live 场景的 "External buffers are not allowed"：
 * 语音 2.5s + 后续静音块（VAD 在流中途弹出段）→ drain → SenseVoice 解码。
 * 对比冒烟（语音+final 冲刷）。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const modelDir = join(ROOT, 'dsh-voice-models')

const { OnnxModel } = await import(pathToFileURL(join(ROOT, 'lib', 'core', 'native-asr.js')).href)

// 读 wav → int16
const buf = readFileSync(join(modelDir, 'test_wavs', '0.wav'))
let off = 12, data = null
while (off + 8 <= buf.length) {
  const id = buf.toString('ascii', off, off + 4)
  const size = buf.readUInt32LE(off + 4)
  if (id === 'data') { data = buf.subarray(off + 8, off + 8 + size); break }
  off += 8 + size + (size % 2)
}
const int16 = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))
const speech = int16.subarray(0, Math.min(40000, int16.length)) // 2.5s

const model = new OnnxModel({ modelDir, asrDir: 'asr-zh', vadThreshold: 0.3, tailPadSeconds: 0.6 })
await model.start()
console.log('模型就绪, secondPass =', model.secondPassEnabled)
const session = model.openSession()

// 与 live 完全一致：base64 往返（客户端编码 → host Buffer.from 解码 → Int16Array 视图）
const b64 = (int16) => Buffer.from(new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength)).toString('base64')
const decode = (audio) => {
  const chunk = Buffer.from(audio, 'base64')
  return new Int16Array(chunk.buffer, chunk.byteOffset, Math.floor(chunk.byteLength / 2))
}

let finals = []
let partials = 0
const CHUNK = 4096
let errors = []

// 1) 喂语音（base64 往返）
for (let i = 0; i < speech.length; i += CHUNK) {
  const c = speech.subarray(i, Math.min(i + CHUNK, speech.length))
  try {
    const o = session.feed(decode(b64(c)), false)
    if (o.partial) partials++
    if (o.finals.length) finals = finals.concat(o.finals)
  } catch (e) {
    errors.push('语音块: ' + e.message)
  }
}
console.log('语音喂入完成: partials=', partials, 'finals=', finals.length)

// 2) 后续静音块（base64 往返）
const silenceB64 = b64(new Int16Array(CHUNK))
let popFinals = []
for (let i = 0; i < 12; i++) {
  try {
    const o = session.feed(decode(silenceB64), false)
    if (o.finals.length) { popFinals = popFinals.concat(o.finals); console.log('静音块', i, '弹出定稿:', JSON.stringify(o.finals)) }
  } catch (e) {
    errors.push(`静音块${i}: ${e.message}`)
    console.log('静音块', i, '抛错:', e.message)
  }
}

// 3) final 冲刷（空块）
try {
  const o = session.feed(new Int16Array(0), true)
  if (o.finals.length) popFinals = popFinals.concat(o.finals)
} catch (e) {
  errors.push('冲刷: ' + e.message)
}
console.log('静音段定稿:', JSON.stringify(popFinals))
console.log('累计定稿:', JSON.stringify(finals.concat(popFinals)))
console.log('错误:', errors.length ? errors : '无')
