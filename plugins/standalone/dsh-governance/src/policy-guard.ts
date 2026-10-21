import { MonotonicBudget } from './budget.js'
import { TextDecoder } from 'node:util'
export interface PolicyContentBlock { readonly type: string; readonly text?: string }

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const item = value as Record<string, unknown>
    return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function canonicalPolicyByteLength(value: unknown): number {
  return Buffer.byteLength(canonicalJson(value), 'utf8')
}

export type GuardAssurance = 'advisory' | 'native-enforced'

export interface NativeAdmission {
  readonly generation: number
  readonly expiresAtMs: number
  readonly catalogDigest: string
}

export interface GuardCall {
  readonly callId: string
  readonly tool: string
  readonly catalogDigest?: string
  readonly directService?: boolean
}

export interface GuardDecision {
  readonly allowed: boolean
  readonly reason: string
}

export class NativePolicyGuard {
  private admission?: NativeAdmission
  private readonly seen = new Set<string>()
  private readonly budget: MonotonicBudget

  constructor(private readonly config: { readonly assurance: GuardAssurance; readonly toolCallBudget?: number }) {
    this.budget = new MonotonicBudget(config.toolCallBudget ?? 0)
  }

  admit(admission: NativeAdmission, nowMs = Date.now()): void {
    if (this.config.assurance !== 'native-enforced') throw new Error('advisory sessions cannot admit native policy')
    if (!Number.isSafeInteger(admission.generation) || admission.generation < 1) throw new Error('invalid policy generation')
    if (admission.expiresAtMs <= nowMs) throw new Error('native policy expired')
    if (!/^[0-9a-f]{64}$/.test(admission.catalogDigest)) throw new Error('invalid catalog digest')
    if (this.admission && admission.generation <= this.admission.generation) throw new Error('policy generation rollback')
    this.admission = Object.freeze({ ...admission })
  }

  guard(call: GuardCall): GuardDecision {
    if (this.config.assurance === 'advisory') return { allowed: true, reason: 'advisory' }
    if (!this.admission) return { allowed: false, reason: 'policy-not-admitted' }
    if (!call.callId) return { allowed: false, reason: 'missing-call-id' }
    if (this.seen.has(call.callId)) return { allowed: false, reason: 'duplicate-call-id' }
    if (call.catalogDigest !== this.admission.catalogDigest) return { allowed: false, reason: 'catalog-drift' }
    if (call.directService === true) return { allowed: false, reason: 'direct-service-bypass' }
    if (!this.budget.consume()) return { allowed: false, reason: 'budget-exhausted' }
    this.seen.add(call.callId)
    return { allowed: true, reason: 'guard-admitted' }
  }

  applyOutputPolicy(value: string | Uint8Array, maxBytes: number): string | Uint8Array {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('invalid output policy')
    if (typeof value === 'string') {
      const bytes = Buffer.from(value, 'utf8')
      if (bytes.length <= maxBytes) return value
      const decoder = new TextDecoder('utf-8', { fatal: true })
      let end = maxBytes
      while (end > 0) {
        try { return decoder.decode(bytes.subarray(0, end)) } catch { end -= 1 }
      }
      return ''
    }
    return value.length <= maxBytes ? value : value.slice(0, maxBytes)
  }

  applyContentPolicy(content: readonly PolicyContentBlock[], maxBytes: number): { readonly allowed: true; readonly content: PolicyContentBlock[] } | { readonly allowed: false; readonly reason: string } {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('invalid output policy')
    let remaining = maxBytes
    const bounded: PolicyContentBlock[] = []
    for (const block of content) {
      const encoded = canonicalPolicyByteLength(block)
      if (encoded <= remaining) {
        bounded.push(block)
        remaining -= encoded
        continue
      }
      if (block.type !== 'text' || typeof block.text !== 'string') return { allowed: false, reason: 'nontext-output-budget-exceeded' }
      let low = 0
      let high = block.text.length
      let accepted: PolicyContentBlock | undefined
      while (low <= high) {
        const middle = Math.floor((low + high) / 2)
        let end = middle
        if (end > 0 && end < block.text.length && /[\uD800-\uDBFF]/.test(block.text[end - 1]!)) end -= 1
        const candidate = { ...block, text: block.text.slice(0, end) }
        if (canonicalPolicyByteLength(candidate) <= remaining) { accepted = candidate; low = middle + 1 } else { high = middle - 1 }
      }
      if (accepted) bounded.push(accepted)
      remaining = 0
    }
    return { allowed: true, content: bounded }
  }

  promoteUnsignedSnapshot(): never {
    throw new Error('unsigned native snapshot is non-promotable')
  }
}
