/**
 * /voice 线协议的运行时约定（host/client 两侧共享）：通道/端点常量、
 * 错误类型、错误信封构造。加端点只改这一个文件。
 */

/** 浏览器 → host 的 loopback RPC 通道名。 */
export const VOICE_CHANNEL = '/voice'

export const VOICE_ENDPOINTS = Object.freeze({
  /** 能力探测：生效引擎 + 模型就绪状态 + 诊断信息 */
  ping: 'ping',
  /** 取回 host 侧行内配置中需要同步给 client 的字段 */
  config: 'config',
  /** 喂入一块 PCM（base64 Int16 16k 单声道）；final=true 冲刷定稿 */
  asr: 'asr',
})

/** 带错误码的 RPC 错误：host 的错误分类经 code 穿越 wire，client 可区分处理。 */
export class VoiceRpcError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'VoiceRpcError'
    this.code = code
  }
}

/** host 侧错误信封构造（消灭手写 { ok:false, error:{...} }）。 */
export function rpcError(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}
