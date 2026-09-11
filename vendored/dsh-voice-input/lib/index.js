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
 *
 * v209 fix4（路由 handler 加固，理由见注册点注释）：POST-only 守卫（405）、
 * 4 MiB 请求体上限（413，Buffer.concat 保证多字节跨 chunk 无损解码）、
 * dispatch 异常 → 标准 rpc 错误信封，任何 handler 抛错不拖垮 webServer fiber。
 */
import { OnnxModel } from './core/native-asr.js'
import { HostAsr } from './core/host-asr.js'
import { createCapability, resolveEngine } from './core/engine.js'
import { DEFAULTS, isEngine, isSecondPass, isPunct, isLang } from './core/config.js'
import { rpcError, VOICE_CHANNEL, VOICE_ENDPOINTS } from './core/wire.js'

export const name = 'dsh-voice-input'
// 0.1.5: connection.rpc channels register effect on the *owner* ctx, which now must
// inject webServer itself (dsh-client-connection/lib/index.js:618 owner.webServer).
export const inject = ['connection', 'webServer']

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

  // 0.1.5: connection.rpc 的通道 effect 绑定在“读取服务的 fiber”上，且 owner 需要
  // webServer；必须像 dsh-api-gateway 那样用 ctx.inject(['connection','webServer'])
  // 的子 fiber 注册，顶层 ctx 上直接读 ctx.connection.rpc 会 "without inject" 崩。
  //
  // FIX (2026-09-11): `connection.rpc.handle(...)` 自身就返回一个
  // `owner.effect(() => owner.webServer.register(route))`（见
  // dsh-client-connection register:601-619），是一个自注册、随 owner fiber 激活的
  // effect。旧代码又把它套进一层 `rpcCtx.effect(() => rpcCtx.connection.rpc.handle(...))`，
  // 于是真正 webServer.register 的那个内层 effect 是在外层 effect 运行期才创建的——
  // 嵌套 effect 不会自动激活，webServer 的 `/voice` 前缀路由因此从不挂载，浏览器
  // POST /voice/config 落到静态回退返回 405。改为与 api-gateway:510 一致：在 inject
  // 回调里直接调用自注册的 handle，不再外套 effect。
  // v209 fix3 (2026-09-11): 0.1.5's connection.rpc.handle binds the route effect to
  // the Connection service fiber, whose ctx has no webServer inject -> /voice never
  // mounts (405). Register the prefix route directly on our own fiber (same pattern
  // as dsh-web-billing) and bridge the client-request envelope here.
  // v209 fix4 (2026-09-11, review-hardening): the bridge handler must not crash or
  // hang the shared webServer fiber — (a) non-POST gets 405 before any body read;
  // (b) the body is read as raw chunk Buffers capped at 4 MiB (413 beyond) and only
  // then UTF-8 decoded via Buffer.concat, so multi-byte CJK split across chunk
  // boundaries never shatters into U+FFFD; (c) dispatch() runs under try/catch and
  // any handler throw is reported as a standard rpc error envelope
  // ({ok:false,error:{code:'handler-error',message,details}}) with HTTP 200, so a
  // bug degrades to one failed RPC instead of an unhandled rejection killing res.
  const dispatch = async (endpoint, payload) => {
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
  }
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: VOICE_CHANNEL,
      handler: async (req, res) => {
        const send = (obj) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(obj))
        }
        // fix4a: method guard — only POST carries the envelope; nothing else reads a body.
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' })
          res.end()
          return
        }
        // fix4b: bounded raw-chunk read (4 MiB cap). Concat the Buffers first and
        // decode once, so UTF-8 sequences split across chunks stay intact.
        let size = 0
        const chunks = []
        for await (const chunk of req) {
          size += chunk.length
          if (size > 4_194_304) {
            res.writeHead(413, { 'content-type': 'application/json' })
            res.end()
            return
          }
          chunks.push(chunk)
        }
        let msg
        try {
          msg = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        } catch {
          return send({ type: 'server-response', rpcId: '', result: rpcError('bad-json', 'invalid json') })
        }
        const endpoint = typeof msg.method === 'string' ? msg.method.split('/').pop() : ''
        // fix4c: dispatch throws must degrade to the standard rpc error envelope.
        let out
        try {
          out = await dispatch(endpoint, msg.payload)
        } catch (err) {
          out = { ok: false, error: { code: 'handler-error', message: String(err).slice(0, 300), details: {} } }
        }
        return send({ type: 'server-response', rpcId: msg?.rpcId ?? '', result: out })
      },
    })
    return typeof dispose === 'function' ? dispose : void 0
  }, 'dsh-voice-input: /voice rpc channel')
}
