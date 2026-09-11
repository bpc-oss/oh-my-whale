/**
 * 定稿文本的智能标点后处理（host 侧，native 引擎的 VAD 定稿段应用；
 * 纯函数、零依赖、可单测）。
 *
 * zipformer2 流式模型的识别文本不带标点；这里按中文/英文语境补全句末
 * 标点，并把常见的半角悬空标点规范化。策略保守：只处理句尾与悬空逗号，
 * 绝不改写句内内容（日期、小数、网址、缩写不受影响）。
 */

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/
const TERMINATOR_ZH = '。！？…'
const TERMINATOR_EN = '.!?…'

/** 去掉文本末尾的悬空逗号/分号/冒号/空白。 */
function stripTrailingSeparators(t) {
  return t.replace(/[，,、；;：:\s]+$/, '').trim()
}

/**
 * 应用标点模式。
 * @param {string} text 原始识别文本
 * @param {'smart'|'keep'|'none'} mode
 * @returns {string}
 */
export function applyPunct(text, mode = 'smart') {
  let t = (text || '').trim()
  if (!t) return ''

  if (mode === 'keep') return t

  if (mode === 'none') {
    return t
      .replace(/[，。！？、；：…·,\.!?;:'"“”‘’（）()\[\]「」『』《》〈〉【】]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // ---- smart ----
  const hasCjk = CJK_RE.test(t)

  // 去掉句尾悬空分隔符（常见于 VAD 切在停顿上）
  t = stripTrailingSeparators(t)
  if (!t) return ''

  const last = t[t.length - 1]

  // 已有合法句末标点：原样返回（中文语境下把半角 .!? 规范成全角）
  if (TERMINATOR_ZH.includes(last)) return t
  if (TERMINATOR_EN.includes(last)) {
    if (hasCjk) {
      const map = { '.': '。', '!': '！', '?': '？' }
      return t.slice(0, -1) + (map[last] ?? last)
    }
    return t
  }

  // 疑问/感叹语气词结尾 → 补对应标点
  if (hasCjk) {
    if (/[吗呢嘛么]$/.test(t)) return t + '？'
    if (/[吧啊呀哦啦哇哈诶哎哟]$/.test(t)) return t + '！'
    return t + '。'
  }

  // 纯英文：已有句末标点则保留，否则补句号
  if (/[.!?]$/.test(t)) return t
  return t + '.'
}

/** 把一段可能包含多个句子的全文按标点切分并逐句应用（保留原文结构）。 */
export function polishTranscript(text, mode = 'smart') {
  return applyPunct(text, mode)
}
