/**
 * OnnxModel / OnnxSession —— 原生流式 ASR（sherpa-onnx-node：zipformer2 + silero VAD）。
 *
 * 模型与识别状态分层：
 * - OnnxModel：权重（OnlineRecognizer）只加载一份，host 全局共享（内存大户）；
 * - OnnxSession：每个 sessionId 独立一份 VAD / live partial 流 / 尾音缓冲，
 *   并发会话互不串音；模型未加载时 openSession() 返回 null。
 *
 * 接口（host 半专用）：
 * - model.start() 懒加载模型（缺包/缺模型 → reject，错误信息带修复指引）；
 * - session.feed(int16, final) → { partial, finals }：喂一段 Int16 PCM
 *   （16kHz 单声道），partial 为当前语音的实时部分识别文本（累计），
 *   finals 为本次弹出的定稿句。结果只经返回值交付。
 * VAD 收尾需要静音冲刷：final=true 时补 0.8s 静音再取尾段。
 *
 * 模型文件命名探测：zipformer2 各发行版的 encoder/decoder/joiner 命名不同
 * （int8 发行版多为 encoder.int8.onnx；zh-en-2023 发行版为
 * encoder-epoch-99-avg-1.int8.onnx），这里按存在性探测，用户任意放置
 * sherpa-onnx 官方 streaming zipformer2 模型目录即可，无需改配置。
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** ESM 产物下的 CJS 动态加载入口（sherpa-onnx-node 是 CJS 包装）。 */
const require = createRequire(import.meta.url)

/** 模型文件命名候选（按优先顺序探测）。 */
const ENCODER_CANDIDATES = ['encoder.int8.onnx', 'encoder-epoch-99-avg-1.int8.onnx', 'encoder.onnx']
const DECODER_CANDIDATES = ['decoder.onnx', 'decoder-epoch-99-avg-1.onnx']
const JOINER_CANDIDATES = ['joiner.int8.onnx', 'joiner-epoch-99-avg-1.int8.onnx', 'joiner.onnx']

/** 解析模型目录下的实际文件名；缺失返回 null（带缺哪个文件的说明）。 */
export function resolveModelFiles(modelDir, asrDir) {
  const base = join(modelDir, asrDir)
  const pick = (candidates) => {
    for (const name of candidates) {
      const p = join(base, name)
      if (existsSync(p)) return name
    }
    return null
  }
  const encoder = pick(ENCODER_CANDIDATES)
  const decoder = pick(DECODER_CANDIDATES)
  const joiner = pick(JOINER_CANDIDATES)
  const tokens = join(base, 'tokens.txt')
  const missing = []
  if (!encoder) missing.push('encoder (.onnx)')
  if (!decoder) missing.push('decoder (.onnx)')
  if (!joiner) missing.push('joiner (.onnx)')
  if (!existsSync(tokens)) missing.push('tokens.txt')
  if (missing.length > 0) {
    return { error: `模型目录 ${base} 缺少: ${missing.join('、')}（请运行 tools/download-models.cjs 下载）` }
  }
  return { base, encoder, decoder, joiner, tokens }
}

/** 原生 ASR 模型选项（host 的 Config 与其同形）。 */
export function vadConfig(options) {
  return {
    sileroVad: {
      model: join(options.modelDir, 'vad', 'silero_vad.onnx'),
      threshold: options.vadThreshold ?? 0.3,
      minSpeechDuration: 0.25,
      minSilenceDuration: options.minSilenceSeconds ?? 0.5,
      windowSize: 512,
      maxSpeechDuration: 20,
    },
    sampleRate: 16000,
    numThreads: 1,
  }
}

/** 解析 SenseVoice 二遍识别模型文件；缺失返回 error 说明。 */
export function resolveSenseFiles(modelDir, senseDir) {
  const base = join(modelDir, senseDir || 'sense-voice')
  const model = join(base, 'model.int8.onnx')
  const tokens = join(base, 'tokens.txt')
  if (!existsSync(model) || !existsSync(tokens)) {
    return { error: `SenseVoice 模型目录 ${base} 缺少 model.int8.onnx / tokens.txt（运行 tools/download-models.cjs 下载，或设 secondPass: off 关闭二遍识别）` }
  }
  return { base, model, tokens }
}

/** 共享的模型权重：加载一次，供任意会话 openSession。 */
export class OnnxModel {
  constructor(options) {
    this.options = options
    this.onnx = null
    this.recognizer = null
    this.loadFailed = null
    this.offline = null
    this.offlineLoaded = false
    this.secondPassEnabled = false
  }

  /** 解析后的模型文件（resolveModelFiles 的结果；失败时存 error）。 */
  files() {
    if (!this.resolved) this.resolved = resolveModelFiles(this.options.modelDir, this.options.asrDir)
    return this.resolved
  }

  load() {
    if (this.recognizer !== null || this.loadFailed !== null) return
    const files = this.files()
    if (files.error) {
      this.loadFailed = new Error(files.error)
      throw this.loadFailed
    }
    if (!existsSync(join(this.options.modelDir, 'vad', 'silero_vad.onnx'))) {
      this.loadFailed = new Error(`缺少 VAD 模型 ${join(this.options.modelDir, 'vad', 'silero_vad.onnx')}（请运行 tools/download-models.cjs）`)
      throw this.loadFailed
    }
    let onnx
    try {
      onnx = require('sherpa-onnx-node')
    } catch (err) {
      this.loadFailed = new Error(`无法加载 sherpa-onnx-node：${String(err instanceof Error ? err.message : err)}（请确认插件依赖安装完整）`)
      throw this.loadFailed
    }
    this.onnx = onnx
    this.recognizer = new onnx.OnlineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: join(files.base, files.encoder),
          decoder: join(files.base, files.decoder),
          joiner: join(files.base, files.joiner),
        },
        tokens: files.tokens,
        numThreads: 2,
        provider: 'cpu',
        modelType: 'zipformer2',
      },
      decodingMethod: 'greedy_search',
      enableEndpoint: false,
    })
  }

  async start() {
    try {
      this.load()
    } catch (err) {
      // loadFailed 已在 load() 内记录；这里只是把异常抛给调用方
      throw err instanceof Error ? err : new Error(String(err))
    }
    if (this.recognizer === null) {
      const err = new Error('ASR 模型不可用')
      this.loadFailed = err
      throw err
    }
    // 二遍识别：SenseVoice（离线非流式，自带标点+ITN）。用 createAsync 非阻塞
    // 加载大模型；文件缺失/加载失败只降级（zipformer 定稿兜底），不报废引擎。
    await this.loadSecondPass()
  }

  /**
   * 加载 SenseVoice 二遍识别模型（可复用句法：同一次 start 内幂等）。
   * secondPass: off → 不加载；auto → 有模型就加载；sensevoice → 强制（缺模型记 warning）。
   */
  async loadSecondPass() {
    if (this.offline !== null || this.offlineLoaded) return
    this.offlineLoaded = true
    const mode = this.options.secondPass ?? 'auto'
    if (mode === 'off') return
    if (this.onnx === null) return
    const sense = resolveSenseFiles(this.options.modelDir, this.options.senseDir)
    if (sense.error) {
      if (mode === 'sensevoice') {
        console.warn('dsh-voice-input: 二遍识别配置为 sensevoice 但模型缺失: %s', sense.error)
      }
      return
    }
    try {
      this.offline = await this.onnx.OfflineRecognizer.createAsync({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          senseVoice: { model: sense.model, useInverseTextNormalization: 1 },
          tokens: sense.tokens,
          numThreads: 2,
          provider: 'cpu',
          debug: false,
        },
      })
      this.secondPassEnabled = true
    } catch (err) {
      console.warn('dsh-voice-input: SenseVoice 二遍识别加载失败（已降级为 zipformer 定稿）: %s',
        String(err instanceof Error ? err.message : err))
    }
  }

  /** 打开一个识别会话（权重共享，VAD/流状态独立）；模型未加载返回 null。 */
  openSession() {
    if (this.recognizer === null || this.onnx === null) return null
    return new OnnxSession(this.recognizer, this.onnx, this.options, this.offline ?? null)
  }
}

/** 一次识别会话的独立状态：VAD + live partial 流 + 尾音缓冲。 */
export class OnnxSession {
  constructor(recognizer, onnx, options, offline = null) {
    this.recognizer = recognizer
    this.onnx = onnx
    this.options = options
    this.offline = offline
    this.vad = new onnx.Vad(vadConfig(options), 30)
    /** 滚动尾音缓冲：保存最近 tailPadSeconds 的音频，段弹出时追加进识别输入 */
    this.tailBuf = []
    this.tailLen = 0
    /** 当前语音的 live 识别流（边说边出字；VAD 弹出定稿段时 inputFinished） */
    this.liveStream = null
  }

  /**
   * 喂入一段 Int16 PCM。
   * partial = 当前语音的实时部分识别文本（边说边出字，累计）；
   * finals = 本段弹出的定稿句（VAD 判定一句话结束）。
   * final=true 时补静音冲刷尾段；空块（final 收尾）绝不喂给 VAD。
   */
  feed(int16, final) {
    let partial = ''
    if (int16.length > 0) {
      const samples = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i += 1) samples[i] = (int16[i] ?? 0) / 32768
      this.vad.acceptWaveform(samples)
      this.pushTail(samples)
      if (this.liveStream === null && this.vad.isDetected()) {
        this.liveStream = this.recognizer.createStream()
      }
      if (this.liveStream !== null) {
        this.liveStream.acceptWaveform({ sampleRate: 16000, samples })
        while (this.recognizer.isReady(this.liveStream)) this.recognizer.decode(this.liveStream)
        partial = this.recognizer.getResult(this.liveStream).text
      }
    }
    if (final) {
      // 补 0.8s 静音冲刷尾段（VAD 需要静音才弹出最后一句），再 flush 兜底
      const silence = new Float32Array(Math.round(16000 * 0.8))
      this.vad.acceptWaveform(silence)
      this.pushTail(silence)
      this.vad.flush()
    }
    return { partial, finals: this.drain() }
  }

  /** 维护滚动尾音缓冲（容量 = tailPadSeconds）。 */
  pushTail(samples) {
    this.tailBuf.push(samples)
    this.tailLen += samples.length
    const cap = Math.round(16000 * (this.options.tailPadSeconds ?? 0.6))
    while (this.tailLen > cap && this.tailBuf.length > 0) {
      const first = this.tailBuf[0]
      if (first === undefined) break
      const excess = this.tailLen - cap
      if (first.length <= excess) {
        this.tailLen -= first.length
        this.tailBuf.shift()
      } else {
        this.tailBuf[0] = first.subarray(first.length - excess)
        this.tailLen = cap
        break
      }
    }
  }

  /** 当前尾音缓冲拼接（追加进每个弹出段的识别输入）。 */
  tailAudio() {
    if (this.tailBuf.length === 0) return new Float32Array(0)
    const out = new Float32Array(this.tailLen)
    let offset = 0
    for (const part of this.tailBuf) {
      out.set(part, offset)
      offset += part.length
    }
    return out
  }

  /** 弹出全部已定稿的 VAD 段：段样本（精确 onset）+ 尾音补偿解码 = 定稿文本。
   *  二遍识别：SenseVoice 可用时用它重识别每个定稿段（自带标点+ITN）；
   *  否则退回 zipformer2 流式解码（v1.0 行为）。 */
  drain() {
    const out = []
    while (!this.vad.isEmpty()) {
      // enableExternalBuffer=false：Electron（DSH 桌面应用）环境下 front() 默认
      // 的零拷贝外部缓冲会抛 "External buffers are not allowed"（sherpa-onnx 官方
      // FAQ 指定修法）；拷贝模式 Electron 与普通 Node 均兼容。
      const seg = this.vad.front(false)
      this.vad.pop()
      this.liveStream = null // partial 流随段定稿作废（下一句话重建）
      const input = new Float32Array(seg.samples.length + this.tailLen)
      input.set(seg.samples, 0)
      input.set(this.tailAudio(), seg.samples.length)
      let text = ''
      if (this.offline !== null) {
        const stream = this.offline.createStream()
        stream.acceptWaveform({ sampleRate: 16000, samples: input })
        this.offline.decode(stream)
        const result = this.offline.getResult(stream)
        text = result && result.text ? result.text : ''
      } else {
        const stream = this.recognizer.createStream()
        for (let i = 0; i < input.length; i += 1600) {
          stream.acceptWaveform({ sampleRate: 16000, samples: input.subarray(i, i + 1600) })
          while (this.recognizer.isReady(stream)) this.recognizer.decode(stream)
        }
        stream.inputFinished()
        while (this.recognizer.isReady(stream)) this.recognizer.decode(stream)
        text = this.recognizer.getResult(stream).text
      }
      if (text !== '') out.push(text)
    }
    return out
  }
}
