/**
 * 真实模型冒烟测试：下载模型仓库自带的测试音频（test_wavs/0.wav，中文），
 * 走完整 VAD + 流式 ASR 管线，验证：
 *   1) sherpa-onnx-node 二进制可用（平台匹配、无构建脚本问题）；
 *   2) zipformer2 模型文件加载成功（文件名探测正确）；
 *   3) silero VAD 分段 + 尾音补偿 + 流式解码端到端出字。
 *
 * 用法：
 *   node tools/asr-smoke.mjs --model-dir <模型根目录> [--wav <16k 单声道 wav>]
 * 不带 --wav 时自动下载模型仓库的 test_wavs/0.wav。
 */
import { existsSync, mkdirSync, createWriteStream, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const modelDir = arg('--model-dir')
if (!modelDir) {
  console.error('用法: node tools/asr-smoke.mjs --model-dir <模型根目录> [--wav <wav>]')
  process.exit(2)
}

// ---------------------------------------------------------------- WAV 解析
function readWav(file) {
  const buf = readFileSync(file)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是合法 WAV: ' + file)
  }
  let offset = 12
  let fmt = null
  let data = null
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(offset + 8),
        channels: buf.readUInt16LE(offset + 10),
        sampleRate: buf.readUInt32LE(offset + 12),
        bits: buf.readUInt16LE(offset + 22),
      }
    } else if (id === 'data') {
      data = buf.subarray(offset + 8, offset + 8 + size)
    }
    offset += 8 + size + (size % 2)
  }
  if (!fmt || !data) throw new Error('WAV 缺少 fmt/data 块: ' + file)
  if (fmt.channels !== 1 || fmt.sampleRate !== 16000 || fmt.bits !== 16) {
    throw new Error(`需要 16kHz 单声道 16bit WAV，实际 ${fmt.sampleRate}Hz/${fmt.channels}ch/${fmt.bits}bit`)
  }
  return new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))
}

// ---------------------------------------------------------------- 测试音频
async function ensureTestWav() {
  const wav = arg('--wav')
  if (wav) {
    if (!existsSync(wav)) throw new Error('指定的 WAV 不存在: ' + wav)
    return wav
  }
  const dest = join(modelDir, 'test_wavs', '0.wav')
  if (!existsSync(dest)) {
    mkdirSync(dirname(dest), { recursive: true })
    const url = 'https://hf-mirror.com/csukuangfj/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30/resolve/main/test_wavs/0.wav'
    console.log('下载测试音频:', url)
    const res = await fetch(url)
    if (!res.ok) throw new Error('下载测试音频失败: ' + res.status)
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  }
  return dest
}

// ---------------------------------------------------------------- 主流程
const { OnnxModel } = await import(pathToFileURL(join(ROOT, 'lib', 'core', 'native-asr.js')).href)

const wavFile = await ensureTestWav()
const int16 = readWav(wavFile)
console.log(`音频: ${wavFile} (${(int16.length / 16000).toFixed(2)}s, ${int16.length} samples)`)

console.log('加载模型…')
const model = new OnnxModel({ modelDir, asrDir: 'asr-zh', vadThreshold: 0.3, tailPadSeconds: 0.6 })
await model.start()
console.log('模型就绪 ✓')

const session = model.openSession()
if (session === null) throw new Error('openSession 返回 null')

let finals = []
let lastPartial = ''
const CHUNK = 4096
for (let i = 0; i < int16.length; i += CHUNK) {
  const chunk = int16.subarray(i, Math.min(i + CHUNK, int16.length))
  const out = session.feed(chunk, false)
  if (out.partial) lastPartial = out.partial
  if (out.finals.length) {
    finals = finals.concat(out.finals)
    lastPartial = ''
  }
}
// 收尾冲刷
const out = session.feed(new Int16Array(0), true)
if (out.finals.length) {
  finals = finals.concat(out.finals)
  lastPartial = '' // 定稿已替换式交付，清掉残留 partial 避免拼接重复
}

console.log('\n--- 识别结果 ---')
console.log('二遍识别（SenseVoice 定稿）:', model.secondPassEnabled ? '启用 ✓' : '未启用（zipformer 定稿）')
console.log('定稿:', JSON.stringify(finals.join('')))
console.log('末尾 partial:', JSON.stringify(lastPartial))
const text = (finals.join('') + lastPartial).trim()
if (!text) {
  console.error('\n✗ 冒烟失败：没有识别出任何文本')
  process.exit(1)
}
// 展示与 host 管线一致的最终输出（口语清洗 + 智能标点）
const { cleanSpeech } = await import(pathToFileURL(join(ROOT, 'lib', 'core', 'cleanup.js')).href)
const { applyPunct } = await import(pathToFileURL(join(ROOT, 'lib', 'core', 'punctuation.js')).href)
const polished = applyPunct(cleanSpeech(text))
console.log('最终输出（清洗+标点）:', JSON.stringify(polished))
console.log('\n✓ 冒烟通过：识别文本非空（', text.length, '字）')
console.log('期望（模型卡测试集 0.wav）：与「我做了介绍啊那么我想说的是呢…」同源音频即可')
