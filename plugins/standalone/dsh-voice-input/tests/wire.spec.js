import { describe, it, expect } from 'vitest'
import { rpcError, VoiceRpcError, VOICE_CHANNEL, VOICE_ENDPOINTS } from '../lib/core/wire.js'

describe('wire 协议常量', () => {
  it('通道与端点', () => {
    expect(VOICE_CHANNEL).toBe('/voice')
    expect(VOICE_ENDPOINTS.ping).toBe('ping')
    expect(VOICE_ENDPOINTS.config).toBe('config')
    expect(VOICE_ENDPOINTS.asr).toBe('asr')
  })

  it('rpcError 信封形状', () => {
    const e = rpcError('native_unavailable', '本地 ASR 不可用')
    expect(e).toEqual({ ok: false, error: { code: 'native_unavailable', message: '本地 ASR 不可用', details: {} } })
  })

  it('VoiceRpcError 携带 code', () => {
    const err = new VoiceRpcError('x', 'msg')
    expect(err.code).toBe('x')
    expect(err.message).toBe('msg')
    expect(err.name).toBe('VoiceRpcError')
  })
})
