/**
 * 口语清洗（disfluency cleanup）—— 纯函数、零依赖、可单测。
 *
 * 借鉴豆包/TRAE 的「语义顺滑」思路，用保守规则去掉口语音转文本里常见的
 * 语气词/口癖/重复（嗯、呃、那个、就是说…），让识别结果更接近书面表达。
 *
 * 保守原则（宁可不删，不可误删）：
 * - 只删「句首引导语 + 停顿标点」、句中「标点夹住的填充词」、重叠填充词；
 * - 「那个方案」「就是他干的」「然后我们去看电影」这类有实义的用法不删
 *   （填充词后必须跟停顿标点或被标点夹住才算口癖）；
 * - 句尾语气词（你说呢、加油吧）一律不碰 —— 它们可能是问句/祈使语气。
 */

/** 句首可删的引导填充词（后跟停顿标点才删）。 */
const LEADING_FILLERS = ['嗯', '呃', '额', '那个', '这个', '就是说', '那什么', '那啥', '然后', '就是']
/** 句中可删的填充词（必须被标点夹住或位于句尾才删；然后/就是句中保留）。 */
const MID_FILLERS = ['嗯', '呃', '额', '那个', '这个', '就是说', '那什么', '那啥']

const PAUSE = '，,。．;；:：、'
const PAUSE_CLASS = `[${PAUSE}]`

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 句首引导语 + 停顿标点（可带 呢），支持连续多组（嗯，那个，…）。 */
function leadingRule() {
  const alternation = [...LEADING_FILLERS, ...LEADING_FILLERS.map((f) => f + '呢')].map(escapeRegExp).join('|')
  // 一组 = (填充词串) + 停顿标点；可重复（嗯，那个，→ 一起删）
  return new RegExp(`^\\s*(?:(?:${alternation})+\\s*${PAUSE_CLASS}\\s*)+`)
}

/** 句中/句尾被标点夹住的填充词：删掉填充词，保留夹它的标点。 */
function midRule() {
  const alternation = MID_FILLERS.map(escapeRegExp).join('|')
  return new RegExp(`(${PAUSE_CLASS})(?:${alternation})(?=${PAUSE_CLASS}|$)`, 'g')
}

/** 重叠填充词（那个那个 / 嗯嗯 / 呃呃呃…）整段删除。 */
function doubledRule() {
  const alternation = ['那个', '这个', '嗯', '呃'].map(escapeRegExp).join('|')
  return new RegExp(`(?:${alternation}){2,}`, 'g')
}

/** 清理后把连续停顿标点合并为一个。 */
function collapsePause(text) {
  return text
    .replace(new RegExp(`(${PAUSE_CLASS})\\s*(?=${PAUSE_CLASS})`, 'g'), '$1')
    .replace(new RegExp(`(${PAUSE_CLASS})\\1+`, 'g'), '$1')
}

/**
 * 口语清洗。
 * @param {string} text 识别文本（可带标点）
 * @returns {string}
 */
export function cleanSpeech(text) {
  let t = (text || '').trim()
  if (!t) return ''
  t = t.replace(doubledRule(), '')
  t = t.replace(midRule(), '$1')
  t = t.replace(leadingRule(), '')
  t = collapsePause(t)
  // 删除句首引导语/重叠词后可能残留句首标点
  t = t.replace(new RegExp(`^[${PAUSE}\\s]+`), '')
  return t.trim()
}
