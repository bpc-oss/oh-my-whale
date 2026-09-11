import { describe, it, expect } from 'vitest'
import { DEFAULTS, isEngine, isPunct, isLang, isSecondPass } from '../lib/core/config.js'
import { normalizeConfig } from '../lib/index.js'

describe('config 默认值与守卫', () => {
  it('DEFAULTS 完整且冻结', () => {
    expect(DEFAULTS.engine).toBe('auto')
    expect(DEFAULTS.hotkey).toBe('ctrl+space')
    expect(DEFAULTS.punct).toBe('smart')
    expect(DEFAULTS.senseDir).toBe('sense-voice')
    expect(DEFAULTS.secondPass).toBe('auto')
    expect(DEFAULTS.clean).toBe(true)
    expect(Object.isFrozen(DEFAULTS)).toBe(true)
  })

  it('isEngine / isPunct / isLang / isSecondPass 值集守卫', () => {
    expect(isEngine('native')).toBe(true)
    expect(isEngine('browser')).toBe(true)
    expect(isEngine('auto')).toBe(true)
    expect(isEngine('garbage')).toBe(false)
    expect(isPunct('smart')).toBe(true)
    expect(isPunct('nope')).toBe(false)
    expect(isLang('zh-CN')).toBe(true)
    expect(isLang('fr-FR')).toBe(false)
    expect(isSecondPass('auto')).toBe(true)
    expect(isSecondPass('sensevoice')).toBe(true)
    expect(isSecondPass('off')).toBe(true)
    expect(isSecondPass('yes')).toBe(false)
  })
})

describe('normalizeConfig', () => {
  it('空配置回退全部默认值', () => {
    const c = normalizeConfig({})
    expect(c).toEqual(DEFAULTS)
  })

  it('合法字段透传', () => {
    const c = normalizeConfig({
      engine: 'native',
      modelDir: 'D:/models/voice',
      senseDir: 'sense',
      secondPass: 'off',
      clean: false,
      vadThreshold: 0.5,
      hotkey: 'alt+space',
      lang: 'en-US',
      autoSend: true,
      punct: 'none',
    })
    expect(c.engine).toBe('native')
    expect(c.modelDir).toBe('D:/models/voice')
    expect(c.senseDir).toBe('sense')
    expect(c.secondPass).toBe('off')
    expect(c.clean).toBe(false)
    expect(c.vadThreshold).toBe(0.5)
    expect(c.hotkey).toBe('alt+space')
    expect(c.lang).toBe('en-US')
    expect(c.autoSend).toBe(true)
    expect(c.punct).toBe('none')
  })

  it('非法字段逐一回退默认值（不抛错）', () => {
    const c = normalizeConfig({
      engine: 'nope',
      modelDir: 123,
      senseDir: 5,
      secondPass: 'yes',
      clean: 'yes',
      vadThreshold: -1,
      tailPadSeconds: 'x',
      hotkey: null,
      lang: 'fr-FR',
      autoSend: 'yes',
      punct: 'wat',
    })
    expect(c.engine).toBe('auto')
    expect(c.modelDir).toBe('')
    expect(c.senseDir).toBe('sense-voice')
    expect(c.secondPass).toBe('auto')
    expect(c.clean).toBe(true)
    expect(c.vadThreshold).toBe(0.3)
    expect(c.tailPadSeconds).toBe(0.6)
    expect(c.hotkey).toBe('ctrl+space')
    expect(c.lang).toBe('auto')
    expect(c.autoSend).toBe(false)
    expect(c.punct).toBe('smart')
  })
})
