import { describe, it, expect } from 'vitest'
import { cleanSpeech } from '../lib/core/cleanup.js'

describe('cleanSpeech：句首引导语', () => {
  it('句首 嗯/呃 + 停顿标点 → 删除', () => {
    expect(cleanSpeech('嗯，今天天气很好')).toBe('今天天气很好')
    expect(cleanSpeech('呃，我想问一下')).toBe('我想问一下')
    expect(cleanSpeech('嗯，那个，今天天气很好。')).toBe('今天天气很好。')
  })
  it('句首 那个/这个/就是说/然后/就是 + 停顿标点 → 删除', () => {
    expect(cleanSpeech('那个，我跟你说个事')).toBe('我跟你说个事')
    expect(cleanSpeech('就是说，我们明天开会')).toBe('我们明天开会')
    expect(cleanSpeech('然后，我们去看电影')).toBe('我们去看电影')
    expect(cleanSpeech('就是，我觉得可以')).toBe('我觉得可以')
    expect(cleanSpeech('然后呢，继续讲')).toBe('继续讲')
  })
  it('有实义的句首用法保留（后无停顿标点）', () => {
    expect(cleanSpeech('那个方案不行')).toBe('那个方案不行')
    expect(cleanSpeech('然后我们去看电影')).toBe('然后我们去看电影')
    expect(cleanSpeech('就是他干的')).toBe('就是他干的')
  })
})

describe('cleanSpeech：句中填充词', () => {
  it('被标点夹住的填充词 → 删除（保留标点）', () => {
    expect(cleanSpeech('他说，那个，明天来')).toBe('他说，明天来')
    expect(cleanSpeech('我觉得，嗯，还行')).toBe('我觉得，还行')
  })
  it('句中有实义的 那个/就是/然后 保留', () => {
    expect(cleanSpeech('我想要那个红色的')).toBe('我想要那个红色的')
    expect(cleanSpeech('他就是我朋友')).toBe('他就是我朋友')
    expect(cleanSpeech('我们先吃饭然后看电影')).toBe('我们先吃饭然后看电影')
  })
})

describe('cleanSpeech：重叠填充词', () => {
  it('重叠填充词整段删除', () => {
    expect(cleanSpeech('那个那个红色的不行')).toBe('红色的不行')
    expect(cleanSpeech('嗯嗯，好的')).toBe('好的')
    expect(cleanSpeech('呃呃呃，你说')).toBe('你说')
  })
})

describe('cleanSpeech：边界', () => {
  it('空串与纯填充词', () => {
    expect(cleanSpeech('')).toBe('')
    expect(cleanSpeech('   ')).toBe('')
    expect(cleanSpeech('嗯')).toBe('嗯') // 无停顿标点且非重叠 → 保守保留
  })
  it('连续停顿标点合并', () => {
    expect(cleanSpeech('好，，，没问题')).toBe('好，没问题')
  })
  it('句尾语气词不删（可能是问句/祈使）', () => {
    expect(cleanSpeech('你觉得呢')).toBe('你觉得呢')
    expect(cleanSpeech('加油吧')).toBe('加油吧')
  })
})
