import { describe, it, expect } from 'vitest'
import { applyPunct } from '../lib/core/punctuation.js'

describe('applyPunct smart（中文）', () => {
  it('裸中文句尾补句号', () => {
    expect(applyPunct('你好世界')).toBe('你好世界。')
  })
  it('疑问语气词补问号', () => {
    expect(applyPunct('今天天气怎么样呢')).toBe('今天天气怎么样呢？')
    expect(applyPunct('你吃饭了吗')).toBe('你吃饭了吗？')
  })
  it('感叹语气词补叹号', () => {
    expect(applyPunct('太好了吧')).toBe('太好了吧！')
    expect(applyPunct('加油啊')).toBe('加油啊！')
  })
  it('已有全角句末标点保留', () => {
    expect(applyPunct('你好。')).toBe('你好。')
    expect(applyPunct('真的吗？')).toBe('真的吗？')
    expect(applyPunct('太好了！')).toBe('太好了！')
  })
  it('半角句末标点在中文语境下规范为全角', () => {
    expect(applyPunct('你好.')).toBe('你好。')
    expect(applyPunct('真的吗?')).toBe('真的吗？')
  })
  it('去掉句尾悬空逗号/分隔符后补句号', () => {
    expect(applyPunct('请帮我查一下,')).toBe('请帮我查一下。')
    expect(applyPunct('请帮我查一下，')).toBe('请帮我查一下。')
  })
  it('空串与纯空白', () => {
    expect(applyPunct('')).toBe('')
    expect(applyPunct('   ')).toBe('')
  })
  it('句内内容不被改写（日期/小数保留）', () => {
    expect(applyPunct('今天3.14号')).toBe('今天3.14号。')
  })
})

describe('applyPunct smart（英文）', () => {
  it('裸英文补句号', () => {
    expect(applyPunct('hello world')).toBe('hello world.')
  })
  it('已有标点保留', () => {
    expect(applyPunct('Hello world!')).toBe('Hello world!')
    expect(applyPunct('Is it true?')).toBe('Is it true?')
  })
  it('悬空逗号清理', () => {
    expect(applyPunct('please check this,')).toBe('please check this.')
  })
})

describe('applyPunct keep / none', () => {
  it('keep 原样返回（仅去空白）', () => {
    expect(applyPunct('  你好  ', 'keep')).toBe('你好')
    expect(applyPunct('你好，', 'keep')).toBe('你好，')
  })
  it('none 去除所有标点', () => {
    expect(applyPunct('你好，世界！', 'none')).toBe('你好世界')
    expect(applyPunct('Hello, world!', 'none')).toBe('Hello world')
  })
})
