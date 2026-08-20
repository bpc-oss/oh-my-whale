/**
 * host 侧线协议冒烟：用桩 ctx 启动插件 apply()，按真实 profile 配置
 * （modelDir 指向 dsh-voice-models），走 loopback RPC 的 ping/config/asr，
 * 喂入真实测试音频分块，验证 v1.1 host 全链路（引擎决策 + SenseVoice 二遍
 * + 口语清洗 + 智能标点 + 会话池）。
 *
 * 用法：node tools/host-smoke.mjs --model-dir <dir>
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const modelDir = process.argv[2] === '--model-dir' && process.argv[3] ? process.argv[3] : join(ROOT, 'dsh-voice-models')
if (!existsSync(modelDir)) {
  console.error('模型目录不存在:', modelDir)
  process.exit(2)
}

const { apply } = await import(pathToFileURL(join(ROOT, 'lib', 'index.js')).href)

// ---- 桩 ctx：捕获 rpc handler ----
let handler = null
const ctx = {
  logger: { warn: (...a) => console.warn('  [host warn]', ...a), info: () => {} },
  effect: (fn) => fn(),
  connection: { rpc: { handle: (channel, fn) => { handler = fn } } },
}

// 与 profile 配置一致：engine auto + modelDir
apply(ctx, { engine: 'auto', modelDir, punct: 'smart' })
if (!handler) { console.error('FAIL: rpc.handle 未注册'); process.exit(1) }

// ---- ping / config ----
const ping = await handler('ping', {})
console.log('ping →', JSON.stringify(ping.value))
if (ping.value.engine !== 'native' || ping.value.modelReady !== true) {
  console.error('FAIL: 期望 native + modelReady，实际', JSON.stringify(ping.value))
  process.exit(1)
}
if (ping.value.secondPass !== true) {
  console.error('FAIL: 期望 SenseVoice 二遍启用')
  process.exit(1)
}
const cfg = await handler('config', {})
console.log('config →', JSON.stringify(cfg.value))

// ---- asr：喂真实测试音频 ----
const wav = readFileSync(join(modelDir, 'test_wavs', '0.wav'))
let off = 12
let data = null
while (off + 8 <= wav.length) {
  const id = wav.toString('ascii', off, off + 4)
  const size = wav.readUInt32LE(off + 4)
  if (id === 'data') { data = wav.subarray(off + 8, off + 8 + size); break }
  off += 8 + size + (size % 2)
}
if (!data) { console.error('FAIL: wav 无 data 块'); process.exit(1) }
const int16 = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))

const sessionId = 'host-smoke-' + Date.now()
let finals = ''
let lastPartial = ''
const CHUNK = 4096
// 注意：必须按 subarray 视图的 byteOffset/byteLength 编码，否则会把整个
// ArrayBuffer（整段 wav）都发出去（与 client 的 encodeBase64 同语义）。
const b64 = (int16) => Buffer.from(new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength)).toString('base64')
for (let i = 0; i < int16.length; i += CHUNK) {
  const chunk = int16.subarray(i, Math.min(i + CHUNK, int16.length))
  const res = await handler('asr', { sessionId, audio: b64(chunk), final: false })
  if (!res.ok) { console.error('FAIL: asr 块错误', res.error); process.exit(1) }
  if (res.value.final) finals += res.value.delta
  else if (res.value.delta) lastPartial = res.value.delta
}
// 收尾冲刷
const fin = await handler('asr', { sessionId, audio: '', final: true })
if (!fin.ok) { console.error('FAIL: asr 冲刷错误', fin.error); process.exit(1) }
if (fin.value.final) finals += fin.value.delta

console.log('定稿（清洗+标点后）:', JSON.stringify(finals))
console.log('末尾 partial:', JSON.stringify(lastPartial))
if (!finals.trim()) { console.error('FAIL: 无定稿文本'); process.exit(1) }
if (!/[。！？]/.test(finals)) {
  console.warn('  注意: 定稿未含句末标点（SenseVoice 未输出标点？）')
}
console.log('\n✓ host 线协议冒烟通过：engine=native, secondPass=SenseVoice, asr 定稿正常')
