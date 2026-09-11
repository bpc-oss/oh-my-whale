/**
 * HostAsr —— host 侧识别会话池 + asr 端点逻辑（deep module，可脱离真模型单测）。
 *
 * 接口：handle(model, req) → 线协议结果。内部独占：
 * base64 → Int16 解码、按 sessionId 的识别会话池（LRU 驱逐）、
 * feed、定稿标点（applyPunct）与错误映射 —— 全部可经假模型直接单测。
 *
 * seam：AsrModelFace / AsrSessionFace 两个结构形状 —— OnnxModel 零改动
 * 即满足（真实 adapter），测试假模型是第二个 adapter，接缝成真。
 */
import { rpcError } from './wire.js'
import { applyPunct } from './punctuation.js'
import { cleanSpeech } from './cleanup.js'

const DEFAULT_MAX_SESSIONS = 4

export class HostAsr {
  constructor(options = {}) {
    this.sessions = new Map()
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS
    this.log = options.log
    this.punct = options.punct ?? 'smart'
    this.clean = options.clean !== false
    /** 单调时钟：lastUsed 用计数而非墙钟，LRU 顺序确定可测 */
    this.tick = 0
  }

  /** 定稿文本后处理：口语清洗 → 标点（clean 可关；标点模式 smart/keep/none）。 */
  polishFinal(text) {
    const cleaned = this.clean ? cleanSpeech(text) : text
    return applyPunct(cleaned, this.punct)
  }

  /** 处理一块 asr payload：解码 → 会话池取会话 → feed → 定稿后处理 → 线协议结果。 */
  handle(model, req) {
    const session = this.sessionFor(model, req.sessionId)
    if (session === null) {
      return rpcError('native_unavailable', '本地 ASR 不可用')
    }
    const chunk = Buffer.from(req.audio, 'base64')
    const int16 = new Int16Array(chunk.buffer, chunk.byteOffset, Math.floor(chunk.byteLength / 2))
    try {
      const out = session.feed(int16, Boolean(req.final))
      // 定稿优先（逐句 口语清洗+标点）；否则回传当前部分识别文本（边说边出字）
      if (out.finals.length > 0) {
        const joined = out.finals.map((t) => this.polishFinal(t)).join('')
        return { ok: true, value: { delta: joined, final: true } }
      }
      return { ok: true, value: { delta: out.partial, final: false } }
    } catch (err) {
      // 单次 feed 失败不报废整个识别服务（按块错误）
      this.log?.(`feed 失败: ${String(err)}`)
      return rpcError('internal', String(err))
    }
  }

  /** 按 sessionId 取独立识别会话（LRU 淘汰最久未用的）。 */
  sessionFor(model, sessionId) {
    const hit = this.sessions.get(sessionId)
    if (hit !== undefined) {
      hit.lastUsed = ++this.tick
      return hit.session
    }
    const session = model.openSession()
    if (session === null) return null
    while (this.sessions.size >= this.maxSessions) {
      let oldestKey = null
      let oldestTime = Infinity
      for (const [key, value] of this.sessions) {
        if (value.lastUsed < oldestTime) {
          oldestTime = value.lastUsed
          oldestKey = key
        }
      }
      if (oldestKey === null) break
      this.sessions.delete(oldestKey)
      this.log?.(`会话 ${oldestKey} 被 LRU 驱逐（满 ${this.maxSessions}）`)
    }
    this.sessions.set(sessionId, { session, lastUsed: ++this.tick })
    return session
  }
}
