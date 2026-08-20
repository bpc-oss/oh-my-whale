import { describe, it, expect, vi } from 'vitest'
import { HostAsr } from '../lib/core/host-asr.js'

/** 假模型：openSession 返回可控会话；feed 结果由测试驱动。 */
function makeModel(session = null) {
  return { openSession: vi.fn(() => session) }
}

/** 假会话：记录喂入，返回测试预设的结果。 */
function makeSession(result = { partial: '', finals: [] }) {
  return {
    feed: vi.fn(() => result),
  }
}

function payload(sessionId, audioB64, final = false) {
  return { sessionId, audio: audioB64, final }
}

const SIXTEEN = new Int16Array([1, 2, 3, 4, 5, 6, 7, 8])
function b64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

describe('HostAsr', () => {
  it('final=false 回传 partial', () => {
    const sess = makeSession({ partial: '你好', finals: [] })
    const asr = new HostAsr({ punct: 'smart' })
    const res = asr.handle(makeModel(sess), payload('s1', b64(SIXTEEN)))
    expect(res.ok).toBe(true)
    expect(res.value).toEqual({ delta: '你好', final: false })
  })

  it('final=true 的定稿段应用智能标点', () => {
    const sess = makeSession({ partial: '', finals: ['你好世界'] })
    const asr = new HostAsr({ punct: 'smart' })
    const res = asr.handle(makeModel(sess), payload('s1', b64(SIXTEEN), true))
    expect(res.ok).toBe(true)
    expect(res.value).toEqual({ delta: '你好世界。', final: true })
  })

  it('定稿段先口语清洗再标点（默认 clean）', () => {
    const sess = makeSession({ partial: '', finals: ['嗯，那个，今天天气很好'] })
    const asr = new HostAsr({ punct: 'smart' })
    const res = asr.handle(makeModel(sess), payload('s1', b64(SIXTEEN), true))
    expect(res.ok).toBe(true)
    expect(res.value).toEqual({ delta: '今天天气很好。', final: true })
  })

  it('clean=false 时保留口语填充词，仅标点', () => {
    const sess = makeSession({ partial: '', finals: ['嗯，那个，今天天气很好'] })
    const asr = new HostAsr({ punct: 'smart', clean: false })
    const res = asr.handle(makeModel(sess), payload('s1', b64(SIXTEEN), true))
    expect(res.ok).toBe(true)
    expect(res.value).toEqual({ delta: '嗯，那个，今天天气很好。', final: true })
  })

  it('punct=none 时定稿去标点（仍清洗）', () => {
    const sess = makeSession({ partial: '', finals: ['嗯，你好，世界！'] })
    const asr = new HostAsr({ punct: 'none' })
    const res = asr.handle(makeModel(sess), payload('s1', b64(SIXTEEN), true))
    expect(res.ok).toBe(true)
    expect(res.value).toEqual({ delta: '你好世界', final: true })
  })

  it('模型不可用返回 native_unavailable', () => {
    const asr = new HostAsr({ punct: 'smart' })
    const res = asr.handle(makeModel(null), payload('s1', b64(SIXTEEN)))
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('native_unavailable')
  })

  it('按 sessionId 隔离会话（同一模型开多个会话）', () => {
    const s1 = makeSession()
    const s2 = makeSession()
    const model = { openSession: vi.fn().mockReturnValueOnce(s1).mockReturnValueOnce(s2) }
    const asr = new HostAsr({ punct: 'smart' })
    asr.handle(model, payload('a', b64(SIXTEEN)))
    asr.handle(model, payload('b', b64(SIXTEEN)))
    asr.handle(model, payload('a', b64(SIXTEEN))) // 命中缓存，不再 openSession
    expect(model.openSession).toHaveBeenCalledTimes(2)
  })

  it('LRU 驱逐：满容量时逐出最久未用', () => {
    const logs = []
    const sessions = Array.from({ length: 5 }, () => makeSession())
    let n = 0
    const model = { openSession: vi.fn(() => sessions[n++]) }
    const asr = new HostAsr({ maxSessions: 2, log: (m) => logs.push(m) })
    asr.handle(model, payload('a', b64(SIXTEEN)))
    asr.handle(model, payload('b', b64(SIXTEEN)))
    asr.handle(model, payload('c', b64(SIXTEEN))) // 驱逐 a
    asr.handle(model, payload('a', b64(SIXTEEN))) // 驱逐 b
    expect(logs.join(';')).toContain('被 LRU 驱逐')
    expect(logs.join(';')).toContain('会话 a')
    expect(logs.join(';')).toContain('会话 b')
    expect(model.openSession).toHaveBeenCalledTimes(4)
  })

  it('feed 抛错 → internal 错误信封，不报废服务', () => {
    const bad = { feed: () => { throw new Error('boom') } }
    const asr = new HostAsr({ punct: 'smart' })
    const res = asr.handle(makeModel(bad), payload('s1', b64(SIXTEEN)))
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('internal')
    // 服务仍可用：新会话正常
    const good = makeSession({ partial: 'ok', finals: [] })
    const res2 = asr.handle(makeModel(good), payload('s2', b64(SIXTEEN)))
    expect(res2.ok).toBe(true)
  })
})
