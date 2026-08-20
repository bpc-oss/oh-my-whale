/**
 * 配置的单一事实来源：引擎取值集合、全插件默认值、运行时值守卫。
 * host schema 默认、native-asr 回退、client 竞态兜底都从这里取 ——
 * 默认值与取值集只写一次。
 */

/** 识别引擎取值集合（host schema 与 isEngine 守卫同源）。 */
export const ENGINE_VALUES = ['auto', 'browser', 'native'] // prettier-ignore

/** 二遍识别取值集合：auto（有 SenseVoice 模型就用）｜sensevoice（强制）｜off（关闭，省内存）。 */
export const SECOND_PASS_VALUES = ['auto', 'sensevoice', 'off']

/** 定稿标点模式取值集合。 */
export const PUNCT_VALUES = ['smart', 'keep', 'none']

/** Web Speech 兜底语言取值集合。 */
export const LANG_VALUES = ['auto', 'zh-CN', 'en-US']

/** 全插件默认值（单一来源；host/client/native-asr 共用）。 */
export const DEFAULTS = Object.freeze({
  engine: 'auto',
  modelDir: '',
  asrDir: 'asr-zh',
  senseDir: 'sense-voice',
  secondPass: 'auto',
  clean: true,
  vadThreshold: 0.3,
  tailPadSeconds: 0.6,
  hotkey: 'ctrl+space',
  lang: 'auto',
  autoSend: false,
  punct: 'smart',
})

/** 运行时值守卫（RPC 下发的值未经验证；host schema 覆盖不到的路径的兜底）。 */
export function isEngine(value) {
  return ENGINE_VALUES.includes(value)
}

export function isSecondPass(value) {
  return SECOND_PASS_VALUES.includes(value)
}

export function isPunct(value) {
  return PUNCT_VALUES.includes(value)
}

export function isLang(value) {
  return LANG_VALUES.includes(value)
}
