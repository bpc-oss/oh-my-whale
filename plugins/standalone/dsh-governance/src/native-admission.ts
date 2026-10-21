import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'

import { type Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'

import { compareOrdinal, type CatalogTool, type ClassifierDecision, type Effect, type TrustedCapability } from './capability-router.js'

export const AGENT_OS_NATIVE_ADMISSION_SERVICE = 'agentOsNativeAdmission'

const SHA256 = /^[0-9a-f]{64}$/
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/
const PROVIDER = /^[A-Za-z0-9@][A-Za-z0-9@/._-]{0,159}$/
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const LIMITATIONS = ['unsigned-non-certifying', 'same-user-cooperative-enforcement', 'no-broker-receipts'] as const
const AUTHORITY_KEYS = ['host_identity_sha256', 'project_identity_sha256', 'project_root_identity_sha256', 'task_policy_sha256', 'trusted_registry_sha256', 'role_map_sha256', 'budget_policy_sha256', 'observed_dsh_sha256'] as const
const BINDING_KEYS = ['dsh_home_identity_sha256', 'profile', 'cwd_project_identity_sha256', 'task_id', 'catalog_digest'] as const

export type SnapshotAuthority = Readonly<Record<(typeof AUTHORITY_KEYS)[number], string>>
export type SnapshotBinding = Readonly<Record<(typeof BINDING_KEYS)[number], string>>

export interface NativeAdmissionPointer {
  readonly recordType: 'agent-os-dsh-native-admission-pointer'
  readonly schemaVersion: '1.0'
  readonly casGeneration: number
  readonly policyGeneration: number
  readonly state: 'active' | 'revoked'
  readonly snapshotSha256: string
  readonly sessionId: string | null
  readonly expiresAtMs: number
  readonly binding: SnapshotBinding
  readonly authority: SnapshotAuthority
  readonly sameUserSecurityCeiling: 'cooperative-not-adversarial'
}

export interface NativeAdmissionMaterial {
  snapshotBytes: Uint8Array
  readonly pointer: NativeAdmissionPointer
}

export interface NativeAdmissionClaim {
  readonly recordType: 'agent-os-dsh-native-policy-snapshot'
  readonly assurance: 'native-enforced'
  readonly policyGeneration: number
  readonly casGeneration: number
  readonly snapshotSha256: string
  readonly expiresAtMs: number
  readonly catalogDigest: string
  readonly catalog: readonly CatalogTool[]
  readonly capabilities: readonly TrustedCapability[]
  readonly toolCallBudget: number
  readonly outputBytes: number
  readonly reviewState: 'accepted' | 'not-required'
  readonly limitations: typeof LIMITATIONS
}

export interface ClassifyRequest {
  readonly capability: TrustedCapability
  readonly arguments: unknown
}

declare module '@deepseek-ai/cordis' { interface Context { agentOsNativeAdmission: AgentOsNativeAdmission } }

/** Host-owned, read-only bridge. It returns only raw canonical bytes and pointer metadata. */
export abstract class AgentOsNativeAdmission extends Service {
  static readonly provide = AGENT_OS_NATIVE_ADMISSION_SERVICE
  protected constructor(ctx: Context) { super(ctx, AGENT_OS_NATIVE_ADMISSION_SERVICE) }
  abstract selected(agent: Agent): boolean
  abstract load(agent: Agent, signal: AbortSignal): Promise<NativeAdmissionMaterial>
  abstract current(agent: Agent): NativeAdmissionPointer | undefined
  abstract classify(request: ClassifyRequest, signal: AbortSignal): Promise<ClassifierDecision>
}

/**
 * Fusion T5: production classifier + admission bridge (replaces the test mock
 * in production). The material is supplied by the host (decoded snapshot /
 * pointer); classify derives the effect from the trusted capability's declared
 * allowed_effects and enforces the arguments object-root contract — fail-closed:
 * empty allowed_effects -> unknown, malformed arguments -> error, abort -> error.
 */
export class ProductionNativeAdmission extends AgentOsNativeAdmission {
  private readonly materialProvider: () => NativeAdmissionMaterial | undefined
  constructor(ctx: Context, materialProvider: () => NativeAdmissionMaterial | undefined) {
    super(ctx)
    this.materialProvider = materialProvider
  }
  selected(_agent: Agent): boolean {
    const material = this.materialProvider()
    return material !== undefined && material.pointer.state === 'active'
  }
  async load(_agent: Agent, signal: AbortSignal): Promise<NativeAdmissionMaterial> {
    if (signal.aborted) throw new Error('aborted')
    const material = this.materialProvider()
    if (material === undefined) throw new Error('admission material unavailable')
    return material
  }
  current(_agent: Agent): NativeAdmissionPointer | undefined {
    return this.materialProvider()?.pointer
  }
  async classify(request: ClassifyRequest, signal: AbortSignal): Promise<ClassifierDecision> {
    if (signal.aborted) return { status: 'error' }
    const capability = request.capability
    if (capability === null || typeof capability !== 'object') return { status: 'unknown' }
    const effects = capability.allowedEffects
    if (!Array.isArray(effects) || effects.length === 0) return { status: 'unknown' }
    // defineTool contract: arguments must be an object root (not array/primitive)
    if (typeof request.arguments !== 'object' || request.arguments === null || Array.isArray(request.arguments)) {
      return { status: 'error' }
    }
    // Declared-effect classification: the capability's allowed_effects bound the
    // possible effects; MVP classifies to the declared effect (read-only default
    // for mcp-style identities, otherwise the declared first effect).
    const effect = capability.identity.kind === 'mcp' && effects.includes('read-only') ? 'read-only' : effects[0]
    return { status: 'classified', effect }
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function closed(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const item = record(value, label)
  const actual = Object.keys(item).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} closed-field mismatch`)
  return item
}

function integer(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`invalid ${label}`)
  return value as number
}

function stringMatch(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`invalid ${label}`)
  return value
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const item = value as Record<string, unknown>
    return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function exactRecord(value: unknown, keys: readonly string[], label: string, pattern: RegExp): Record<string, string> {
  const item = closed(value, keys, label)
  return Object.fromEntries(keys.map((key) => [key, stringMatch(item[key], pattern, `${label}.${key}`)]))
}

function pointerRecord(value: unknown): NativeAdmissionPointer {
  const pointer = closed(value, ['recordType', 'schemaVersion', 'casGeneration', 'policyGeneration', 'state', 'snapshotSha256', 'sessionId', 'expiresAtMs', 'binding', 'authority', 'sameUserSecurityCeiling'], 'pointer')
  if (pointer.recordType !== 'agent-os-dsh-native-admission-pointer' || pointer.schemaVersion !== '1.0') throw new Error('pointer type confusion')
  if (pointer.state !== 'active' && pointer.state !== 'revoked') throw new Error('invalid pointer state')
  const sessionId = pointer.sessionId === null ? null : stringMatch(pointer.sessionId, ID, 'pointer session')
  const bindingRaw = closed(pointer.binding, BINDING_KEYS, 'pointer binding')
  const binding: SnapshotBinding = {
    dsh_home_identity_sha256: stringMatch(bindingRaw.dsh_home_identity_sha256, SHA256, 'pointer DSH home identity'),
    profile: stringMatch(bindingRaw.profile, ID, 'pointer profile'),
    cwd_project_identity_sha256: stringMatch(bindingRaw.cwd_project_identity_sha256, SHA256, 'pointer cwd project identity'),
    task_id: stringMatch(bindingRaw.task_id, ID, 'pointer task id'),
    catalog_digest: stringMatch(bindingRaw.catalog_digest, SHA256, 'pointer catalog digest'),
  }
  return {
    recordType: pointer.recordType,
    schemaVersion: pointer.schemaVersion,
    casGeneration: integer(pointer.casGeneration, 1, Number.MAX_SAFE_INTEGER, 'CAS generation'),
    policyGeneration: integer(pointer.policyGeneration, 1, Number.MAX_SAFE_INTEGER, 'pointer policy generation'),
    state: pointer.state,
    snapshotSha256: stringMatch(pointer.snapshotSha256, SHA256, 'pointer snapshot hash'),
    sessionId,
    expiresAtMs: integer(pointer.expiresAtMs, 0, Number.MAX_SAFE_INTEGER, 'pointer expiry'),
    binding,
    authority: exactRecord(pointer.authority, AUTHORITY_KEYS, 'pointer authority', SHA256) as SnapshotAuthority,
    sameUserSecurityCeiling: pointer.sameUserSecurityCeiling === 'cooperative-not-adversarial' ? pointer.sameUserSecurityCeiling : (() => { throw new Error('invalid security ceiling') })(),
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function sameRecord(left: Record<string, string>, right: Record<string, string>, keys: readonly string[]): boolean {
  return keys.every((key) => left[key] === right[key])
}

export function decodeNativeAdmission(material: NativeAdmissionMaterial, expectedSessionId: string, nowMs = Date.now()): NativeAdmissionClaim {
  if (!(material.snapshotBytes instanceof Uint8Array) || material.snapshotBytes.byteLength === 0 || material.snapshotBytes.byteLength > 1_048_576) throw new Error('invalid snapshot bytes')
  const snapshotBytes = Uint8Array.from(material.snapshotBytes)
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(snapshotBytes) } catch { throw new Error('snapshot is not canonical UTF-8') }
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('snapshot JSON is invalid') }
  if (canonicalJson(parsed) + '\n' !== text) throw new Error('snapshot canonical bytes mismatch')
  const snapshot = closed(parsed, ['record_type', 'schema_version', 'assurance', 'generator', 'generation', 'generated_at', 'expires_at', 'authority', 'binding', 'catalog', 'capabilities', 'roles', 'budget', 'review', 'delegation', 'output_policy', 'limitations'], 'snapshot')
  if (snapshot.record_type !== 'agent-os-dsh-native-policy-snapshot' || snapshot.schema_version !== '1.0' || snapshot.assurance !== 'native-enforced' || snapshot.generator !== 'governance/dsh/native_policy.py') throw new Error('snapshot type confusion')
  const policyGeneration = integer(snapshot.generation, 1, Number.MAX_SAFE_INTEGER, 'policy generation')
  if (typeof snapshot.generated_at !== 'string' || !UTC_TIMESTAMP.test(snapshot.generated_at) || typeof snapshot.expires_at !== 'string' || !UTC_TIMESTAMP.test(snapshot.expires_at)) throw new Error('invalid canonical timestamp')
  const generatedAtMs = Date.parse(snapshot.generated_at)
  const expiresAtMs = Date.parse(snapshot.expires_at)
  if (!Number.isSafeInteger(generatedAtMs) || !Number.isSafeInteger(expiresAtMs) || generatedAtMs > nowMs || expiresAtMs <= nowMs || expiresAtMs <= generatedAtMs) throw new Error('snapshot is stale or not current')
  const authority = exactRecord(snapshot.authority, AUTHORITY_KEYS, 'authority', SHA256)
  const bindingRaw = closed(snapshot.binding, BINDING_KEYS, 'binding')
  const binding = {
    dsh_home_identity_sha256: stringMatch(bindingRaw.dsh_home_identity_sha256, SHA256, 'DSH home identity'),
    profile: stringMatch(bindingRaw.profile, ID, 'profile'),
    cwd_project_identity_sha256: stringMatch(bindingRaw.cwd_project_identity_sha256, SHA256, 'cwd project identity'),
    task_id: stringMatch(bindingRaw.task_id, ID, 'task id'),
    catalog_digest: stringMatch(bindingRaw.catalog_digest, SHA256, 'catalog digest'),
  }
  const catalog = (Array.isArray(snapshot.catalog) ? snapshot.catalog : (() => { throw new Error('catalog must be an array') })()).map((raw, index) => {
    const item = closed(raw, ['exposedName', 'kind', 'provider', 'tool', 'version'], `catalog[${index}]`)
    if (item.kind !== 'native' && item.kind !== 'mcp') throw new Error('invalid catalog kind')
    return { exposedName: stringMatch(item.exposedName, ID, 'catalog name'), kind: item.kind, provider: stringMatch(item.provider, PROVIDER, 'catalog provider'), tool: stringMatch(item.tool, ID, 'catalog tool'), version: stringMatch(item.version, ID, 'catalog version') } as CatalogTool
  })
  if (new Set(catalog.map((item) => canonicalJson(item))).size !== catalog.length) throw new Error('duplicate catalog tool')
  const capabilities = (Array.isArray(snapshot.capabilities) ? snapshot.capabilities : (() => { throw new Error('capabilities must be an array') })()).map((raw, index) => {
    const item = closed(raw, ['capability_id', 'identity', 'allowed_effects'], `capabilities[${index}]`)
    const identity = closed(item.identity, ['kind', 'provider', 'tool', 'version'], 'capability identity')
    if (identity.kind !== 'native' && identity.kind !== 'mcp') throw new Error('invalid capability kind')
    if (!Array.isArray(item.allowed_effects) || item.allowed_effects.length === 0 || item.allowed_effects.some((effect) => !['read-only', 'local-write', 'external-write', 'privileged'].includes(String(effect)))) throw new Error('invalid allowed effects')
    if (new Set(item.allowed_effects).size !== item.allowed_effects.length) throw new Error('duplicate allowed effect')
    return { capabilityId: stringMatch(item.capability_id, ID, 'capability id'), identity: { kind: identity.kind as 'native' | 'mcp', provider: stringMatch(identity.provider, PROVIDER, 'capability provider'), tool: stringMatch(identity.tool, ID, 'capability tool'), version: stringMatch(identity.version, ID, 'capability version') }, allowedEffects: [...item.allowed_effects as Effect[]] }
  })
  if (new Set(capabilities.map((item) => canonicalJson(item))).size !== capabilities.length) throw new Error('duplicate capability')
  if (!Array.isArray(snapshot.roles)) throw new Error('roles must be an array')
  const roleKeys = new Set<string>()
  for (const raw of snapshot.roles) {
    const role = record(raw, 'role')
    const keys = Object.keys(role).sort()
    if (JSON.stringify(keys) !== JSON.stringify(['role_id', 'state']) && JSON.stringify(keys) !== JSON.stringify(['native_preset', 'role_id', 'state'])) throw new Error('role closed-field mismatch')
    const roleId = stringMatch(role.role_id, ID, 'role id')
    if (role.state !== 'supported') throw new Error('invalid supported role')
    if ('native_preset' in role) stringMatch(role.native_preset, ID, 'native preset')
    const key = canonicalJson(role)
    if (roleKeys.has(key)) throw new Error('duplicate role')
    roleKeys.add(key)
    if (!roleId) throw new Error('invalid role id')
  }
  const budget = closed(snapshot.budget, ['tool_calls', 'delegations', 'output_bytes'], 'budget')
  const toolCallBudget = integer(budget.tool_calls, 0, 10_000, 'tool budget')
  integer(budget.delegations, 0, 100, 'delegation budget')
  const outputBytes = integer(budget.output_bytes, 0, 16_777_216, 'output budget')
  const review = closed(snapshot.review, ['state', 'review_sha256'], 'review')
  if (review.state !== 'accepted' && review.state !== 'not-required') throw new Error('review is not accepted')
  stringMatch(review.review_sha256, SHA256, 'review hash')
  const delegation = closed(snapshot.delegation, ['leaf_only', 'scope_subset_required', 'tool_subset_required', 'self_review_forbidden'], 'delegation')
  if (Object.values(delegation).some((value) => value !== true)) throw new Error('delegation must only narrow')
  const outputPolicy = closed(snapshot.output_policy, ['mode', 'max_bytes'], 'output policy')
  if (outputPolicy.mode !== 'bounded' || outputPolicy.max_bytes !== outputBytes) throw new Error('output policy mismatch')
  if (!Array.isArray(snapshot.limitations) || snapshot.limitations.join(',') !== LIMITATIONS.join(',')) throw new Error('snapshot limitation mismatch')
  const pointer = pointerRecord(material.pointer)
  if (pointer.state !== 'active') throw new Error('pointer is not active native admission')
  if (pointer.policyGeneration !== policyGeneration) throw new Error('pointer policy generation mismatch')
  const digest = createHash('sha256').update(snapshotBytes).digest('hex')
  if (digest !== pointer.snapshotSha256) throw new Error('snapshot hash mismatch')
  if (pointer.sessionId !== expectedSessionId) throw new Error('pointer session mismatch')
  if (pointer.expiresAtMs !== expiresAtMs) throw new Error('pointer expiry mismatch')
  if (!sameRecord(binding, pointer.binding, BINDING_KEYS)) throw new Error('pointer binding mismatch')
  if (!sameRecord(authority, pointer.authority, AUTHORITY_KEYS)) throw new Error('pointer authority mismatch')
  if (canonicalizeDigest(catalog) !== binding.catalog_digest) throw new Error('catalog binding mismatch')
  return deepFreeze({ recordType: 'agent-os-dsh-native-policy-snapshot', assurance: 'native-enforced', policyGeneration, casGeneration: pointer.casGeneration, snapshotSha256: digest, expiresAtMs, catalogDigest: binding.catalog_digest, catalog, capabilities, toolCallBudget, outputBytes, reviewState: review.state, limitations: LIMITATIONS })
}

function canonicalizeDigest(catalog: readonly CatalogTool[]): string {
  const normalized = [...catalog].sort((a, b) => compareOrdinal(a.exposedName, b.exposedName) || compareOrdinal(a.kind, b.kind) || compareOrdinal(a.provider, b.provider) || compareOrdinal(a.tool, b.tool) || compareOrdinal(a.version, b.version))
  if (new Set(normalized.map((item) => item.exposedName)).size !== normalized.length) throw new Error('shadowed catalog tool')
  return createHash('sha256').update(canonicalJson(normalized), 'utf8').digest('hex')
}

export function samePointer(left: NativeAdmissionPointer, right: NativeAdmissionPointer): boolean {
  try {
    const normalizedLeft = pointerRecord(left)
    const normalizedRight = pointerRecord(right)
    return normalizedLeft.recordType === normalizedRight.recordType && normalizedLeft.schemaVersion === normalizedRight.schemaVersion && normalizedLeft.casGeneration === normalizedRight.casGeneration && normalizedLeft.policyGeneration === normalizedRight.policyGeneration && normalizedLeft.state === normalizedRight.state && normalizedLeft.snapshotSha256 === normalizedRight.snapshotSha256 && normalizedLeft.sessionId === normalizedRight.sessionId && normalizedLeft.expiresAtMs === normalizedRight.expiresAtMs && normalizedLeft.sameUserSecurityCeiling === normalizedRight.sameUserSecurityCeiling && sameRecord(normalizedLeft.binding, normalizedRight.binding, BINDING_KEYS) && sameRecord(normalizedLeft.authority, normalizedRight.authority, AUTHORITY_KEYS)
  } catch { return false }
}
