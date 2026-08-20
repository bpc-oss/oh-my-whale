/**
 * dsh-voice-input host 半（web profile 的 Node 侧）。
 *
 * 纯语音输入：/voice RPC 通道（connection.rpc，loopback authority）接收浏览器
 * 采麦 PCM → 流式 ASR（sherpa-onnx-node zipformer2 + silero VAD）→
 * 增量文本回传（VAD 定稿段经智能标点后处理）。
 *
 * 与 agent preset 解耦：任何 preset 下都只是「另一种输入法」，识别文本
 * 由 client 半写入输入框草稿（与打字同路），不碰人设/系统提示词。
 *
 * 引擎决策：host 是唯一知道能力真相的一方（配置 + 模型加载结果），
 * 经 /voice.ping、/voice.config 把生效引擎下发给 client；无模型时
 * 自动降级浏览器 Web Speech，保证零配置开箱可用。
 *
 * 模型权重全局一份；识别状态按 sessionId 隔离（会话池 + LRU，见
 * core/host-asr.ts），并发会话不串音。
 */
import { OnnxModel } from './core/native-asr.js'
import { HostAsr } from './core/host-asr.js'
import { createCapability, resolveEngine } from './core/engine.js'
import { DEFAULTS, isEngine, isSecondPass, isPunct, isLang } from './core/config.js'
import { rpcError, VOICE_CHANNEL, VOICE_ENDPOINTS } from './core/wire.js'

export const name = 'dsh-voice-input'
export const inject = ['connection']

/**
 * 行内配置归一化（手写守卫，替代 schemastery 以缩小依赖面）：
 * 非法/缺失字段一律回退 DEFAULTS，任何来源的配置都不会让 host 崩。
 */
export function normalizeConfig(input = {}) {
  return {
    engine: isEngine(input.engine) ? input.engine : DEFAULTS.engine,
    modelDir: typeof input.modelDir === 'string' ? input.modelDir : DEFAULTS.modelDir,
    asrDir: typeof input.asrDir === 'string' && input.asrDir !== '' ? input.asrDir : DEFAULTS.asrDir,
    senseDir: typeof input.senseDir === 'string' && input.senseDir !== '' ? input.senseDir : DEFAULTS.senseDir,
    secondPass: isSecondPass(input.secondPass) ? input.secondPass : DEFAULTS.secondPass,
    clean: typeof input.clean === 'boolean' ? input.clean : DEFAULTS.clean,
    vadThreshold:
      typeof input.vadThreshold === 'number' && input.vadThreshold >= 0
        ? input.vadThreshold
        : DEFAULTS.vadThreshold,
    tailPadSeconds:
      typeof input.tailPadSeconds === 'number' && input.tailPadSeconds >= 0
        ? input.tailPadSeconds
        : DEFAULTS.tailPadSeconds,
    hotkey: typeof input.hotkey === 'string' ? input.hotkey : DEFAULTS.hotkey,
    lang: isLang(input.lang) ? input.lang : DEFAULTS.lang,
    autoSend: typeof input.autoSend === 'boolean' ? input.autoSend : DEFAULTS.autoSend,
    punct: isPunct(input.punct) ? input.punct : DEFAULTS.punct,
  }
}

export function apply(ctx, config = {}) {
  const conf = normalizeConfig(config)
  const logger = ctx.logger
  let model = null
  let hostAsr = null
  let modelError = null

  /** 加载 zipformer2 + VAD；目录未配/加载失败 → null（失败锁存，诊断留痕）。 */
  const loadModel = async () => {
    if (conf.engine === 'browser') return null
    if (conf.modelDir.trim() === '') {
      // 未配置模型目录是合法状态（浏览器兜底），不算错误
      return null
    }
    if (model === null) model = new OnnxModel(conf)
    try {
      await model.start()
      modelError = null
      return model
    } catch (err) {
      modelError = String(err instanceof Error ? err.message : err)
      logger.warn('dsh-voice-input: 本地 ASR 初始化失败: %s', modelError)
      return null
    }
  }
  const capability = createCapability(loadModel)
  if (conf.engine !== 'browser') capability.kick() // 预载：首击零延迟；失败静默锁存

  ctx.effect(
    () =>
      ctx.connection.rpc.handle(
        VOICE_CHANNEL,
        async (endpoint, payload) => {
          switch (endpoint) {
            case VOICE_ENDPOINTS.ping: {
              const m = await capability.ready()
              return {
                ok: true,
                value: {
                  engine: resolveEngine(conf.engine, m !== null),
                  modelReady: m !== null,
                  secondPass: m !== null && Boolean(m.secondPassEnabled),
                  modelError,
                },
              }
            }
            case VOICE_ENDPOINTS.config: {
              // 行内 config 只到 host 半；client 半从这里取回需要同步的字段
              const m = await capability.ready()
              return {
                ok: true,
                value: {
                  engine: resolveEngine(conf.engine, m !== null),
                  hotkey: conf.hotkey,
                  lang: conf.lang,
                  autoSend: conf.autoSend,
                },
              }
            }
            case VOICE_ENDPOINTS.asr: {
              const m = await capability.ready()
              if (resolveEngine(conf.engine, m !== null) !== 'native' || m === null) {
                return rpcError('native_unavailable', '本地 ASR 不可用')
              }
              if (hostAsr === null) {
                hostAsr = new HostAsr({
                  log: (msg) => logger.warn('dsh-voice-input: native ASR %s', msg),
                  punct: conf.punct,
                  clean: conf.clean,
                })
              }
              return hostAsr.handle(m, payload)
            }
            default:
              return rpcError('unknown_endpoint', 'unknown endpoint: ' + endpoint)
          }
        },
        { authority: 'loopback' },
      ),
    'dsh-voice-input: /voice rpc channel',
  )
}
