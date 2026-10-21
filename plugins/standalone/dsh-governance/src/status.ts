import { type Context, Service } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {
  PostToolDecision,
  PreToolDecision,
  ToolExecution,
  ToolExecutionResult,
  ToolRuntime,
} from '@deepseek-ai/dsh-tools'

import {
  ADVISORY_STATUS,
  AGENT_OS_GOVERNANCE_SERVICE,
  UNMANAGED_STATUS,
} from './contract.js'
import type {
  AdmissionStatus,
  AdmissionStatusSubscriber,
  AgentGovernanceConfig,
  BrokerHealth,
  GovernanceActivationSource,
  GovernanceAssurance,
  GovernanceStatus,
  GovernanceStatusSubscriber,
} from './types.js'
import { canonicalizeCatalog, routeCapability, type TrustedCapability } from './capability-router.js'
import { createAgentOsSubmitClaimTool } from './completion.js'
import { bindBundleObservationEvents } from './evidence.js'
import { AgentOsNativeAdmission, decodeNativeAdmission, samePointer, type NativeAdmissionClaim, type NativeAdmissionPointer } from './native-admission.js'
import { canonicalPolicyByteLength, NativePolicyGuard } from './policy-guard.js'

/**
 * Do NOT augment cordis's Context with an `agentOsGovernance` field.
 *
 * An earlier version declared it, on the assumption that a service named on a context is
 * reachable as a property. It is not: `installScoped` obtains the service by
 * `ctx.isolate(AGENT_OS_GOVERNANCE_SERVICE)`, and an isolated service is not published
 * under that name on the context you already hold. The review confirmed
 * `ctx.get('agentOsGovernance')` is undefined from every context, strict or not — the
 * declaration type-checked code that could never run.
 *
 * Use the module-local accessor `governanceFor(agent)` below instead.
 */

const governanceByAgent = new WeakMap<Agent, AgentOsGovernance>()

/** Resolve the exact service owned by one live Agent scope. */
/** Module-level bundle degradation record for agent-less (direct-service)
 * executions. rc.7 scoped dispatch still delivers them to the scoped
 * preExecute listener (measured), where the direct-service-bypass denial
 * fires; this record makes the downgrade observable. */
const agentlessExecutions: Array<{ tool: string; at: number }> = []

export function recordAgentlessExecution(tool: string): void {
  agentlessExecutions.push({ tool, at: Date.now() })
  if (agentlessExecutions.length > 256) agentlessExecutions.shift()
}

/** Read-only view of recorded agent-less executions (bounded). */
export function agentlessExecutionLog(): ReadonlyArray<{ tool: string; at: number }> {
  return agentlessExecutions.slice()
}

export function governanceFor(agent: Agent): AgentOsGovernance | undefined {
  return governanceByAgent.get(agent)
}

function admissionFor(agent: Agent): AdmissionStatus {
  return Object.freeze({
    phase: 'waiting-first-pre-step',
    agentId: String(agent.id),
    observedTurn: null,
    observedStep: null,
  })
}

/** Read-only, agent-scoped governance status. Task 5 never enforces policy. */
export class AgentOsGovernance extends Service {
  static readonly provide = AGENT_OS_GOVERNANCE_SERVICE

  readonly activationSource: GovernanceActivationSource
  readonly agent: Agent

  private statusValue: GovernanceStatus = ADVISORY_STATUS
  private admissionValue: AdmissionStatus
  private statusSubscribers = new Set<GovernanceStatusSubscriber>()
  private admissionSubscribers = new Set<AdmissionStatusSubscriber>()
  private lifecycle: 'active' | 'disposing' | 'disposed' = 'active'
  private nativeSelected = false
  private nativeSource: AgentOsNativeAdmission | undefined
  private tools: ToolRuntime | undefined
  private nativeClaim: NativeAdmissionClaim | undefined
  private nativeGuard: NativePolicyGuard | undefined
  private admittedPointer: NativeAdmissionPointer | undefined
  private preAuthorized = new WeakMap<object, { readonly name: string; readonly snapshotSha256: string }>()
  private readonly lifecycleAbort = new AbortController()
  private policyAbort = new AbortController()
  private activeExecutions = new Set<object>()
  private quiescenceWaiters = new Set<() => void>()

  constructor(ctx: Context, config: AgentGovernanceConfig) {
    super(ctx, AGENT_OS_GOVERNANCE_SERVICE)
    this.agent = config.agent
    this.activationSource = config.activationSource
    this.admissionValue = admissionFor(config.agent)
    governanceByAgent.set(config.agent, this)
  }

  static mount(ctx: Context, config: AgentGovernanceConfig): () => Promise<void> {
    if (
      config.observation !== undefined
      && config.observation.chain.sessionId !== String(config.agent.session.id)
    ) throw new Error('observation chain session binding mismatch')
    const service = new AgentOsGovernance(ctx, config)
    const source = config.admissionSource ?? (ctx.get('agentOsNativeAdmission') as AgentOsNativeAdmission | undefined)
    const tools = ctx.get('tools') as ToolRuntime | undefined
    service.configureNative(source, tools)
    const removeCompletionTool = tools === undefined || config.completionSubmitter === undefined
      ? undefined
      : tools.register(createAgentOsSubmitClaimTool(config.completionSubmitter, {
          sessionId: String(config.agent.session.id),
        }))
    // Annotated explicitly: the ternary's inferred type collapsed to `{}` under the 0.2
    // declarations (undefined | (() => void) with no contextual type), so the optional call
    // at teardown failed with "Type '{}' has no call signatures".
    const removeObservation: (() => void) | undefined = config.observation === undefined
      ? undefined
      : bindBundleObservationEvents(
          ctx, config.agent, config.observation.chain, config.observation.sink,
        )
    const removePreStep = ctx.on('agent/pre-step', async (payload, next): Promise<PreStepDecision> => {
      if (payload.agent !== service.agent) return next()
      if (service.nativeSelected) {
        if (!await service.admitNative(payload.signal)) return { kind: 'reject' }
        return next()
      }
      if (service.admissionValue.phase === 'waiting-first-pre-step') {
        service.admissionValue = Object.freeze({
          phase: 'observed-first-pre-step',
          agentId: String(service.agent.id),
          observedTurn: payload.turn,
          observedStep: payload.step,
        })
        service.notifyAdmission()
      }
      return next()
    })
    const removeGuard = tools?.guard((exec) => service.guardExecution(exec))
    const removePreTool = tools === undefined ? undefined : ctx.on(
      'tools/pre-execute',
      async (exec, next): Promise<PreToolDecision> => service.preExecute(exec, next),
    )
    const removePostTool = tools === undefined ? undefined : ctx.on(
      'tools/post-execute',
      async (exec, result, next): Promise<PostToolDecision> => service.postExecute(exec, result, next),
    )
    const removeToolChange = tools === undefined ? undefined : ctx.on('tools/change', () => service.invalidateCatalog())
    return async () => {
      await service.deactivate()
      removeObservation?.(); removeCompletionTool?.(); removeToolChange?.(); removePostTool?.(); removePreTool?.(); removeGuard?.(); removePreStep()
    }
  }

  private configureNative(source: AgentOsNativeAdmission | undefined, tools: ToolRuntime | undefined): void {
    if (!source) return
    this.nativeSource = source
    this.tools = tools
    try {
      this.nativeSelected = source.selected(this.agent)
    } catch {
      this.nativeSelected = true
      this.recordDegradation('native-selection-error')
    }
    if (this.nativeSelected && !tools) this.recordDegradation('native-tool-runtime-unavailable')
  }

  private async admitNative(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted || !this.nativeSource || !this.tools) return this.denyAdmission('native-admission-unavailable')
    try {
      const combinedSignal = AbortSignal.any([signal, this.lifecycleAbort.signal])
      const material = await this.nativeSource.load(this.agent, combinedSignal)
      const claim = decodeNativeAdmission(material, String(this.agent.id))
      const catalog = canonicalizeCatalog(claim.catalog)
      if (catalog.digest !== claim.catalogDigest) throw new Error('catalog digest mismatch')
      const observedNames = this.tools.schemas(this.agent).map((item) => item.name).sort()
      const claimedNames = claim.catalog.map((item) => item.exposedName).sort()
      if (JSON.stringify(observedNames) !== JSON.stringify(claimedNames)) throw new Error('catalog binding drift')
      if (!this.nativeClaim || claim.policyGeneration > this.nativeClaim.policyGeneration) {
        this.nativeGuard = new NativePolicyGuard({ assurance: 'native-enforced', toolCallBudget: claim.toolCallBudget })
        this.nativeGuard.admit({ generation: claim.policyGeneration, expiresAtMs: claim.expiresAtMs, catalogDigest: claim.catalogDigest })
      } else if (claim.policyGeneration < this.nativeClaim.policyGeneration) {
        throw new Error('policy generation rollback')
      } else if (claim.snapshotSha256 !== this.nativeClaim.snapshotSha256 || claim.casGeneration !== this.nativeClaim.casGeneration) {
        throw new Error('same-generation snapshot drift')
      }
      this.nativeClaim = Object.freeze(claim)
      this.admittedPointer = structuredClone(material.pointer)
      this.statusValue = Object.freeze({
        assurance: 'native-enforced',
        policyGeneration: claim.policyGeneration,
        brokerHealth: 'not-configured',
        catalogDigest: claim.catalogDigest,
        degradationReasons: Object.freeze(['unsigned-non-certifying', 'same-user-cooperative-enforcement', 'broker-not-configured']),
      })
      this.admissionValue = Object.freeze({
        phase: 'native-admitted',
        agentId: String(this.agent.id),
        observedTurn: this.admissionValue.observedTurn,
        observedStep: this.admissionValue.observedStep,
      })
      this.notifyStatus()
      this.notifyAdmission()
      return true
    } catch {
      return this.denyAdmission('native-admission-invalid')
    }
  }

  private denyAdmission(reason: string): false {
    this.nativeClaim = undefined
    this.nativeGuard = undefined
    this.admittedPointer = undefined
    this.recordDegradation(reason)
    this.admissionValue = Object.freeze({
      phase: 'native-denied',
      agentId: String(this.agent.id),
      observedTurn: this.admissionValue.observedTurn,
      observedStep: this.admissionValue.observedStep,
    })
    this.notifyAdmission()
    return false
  }

  private guardExecution(exec: Readonly<ToolExecution>): string | undefined {
    if (!this.nativeSelected) return undefined
    if (exec.agent !== this.agent) return 'agent-os: direct-service-bypass'
    const authorization = this.preAuthorized.get(exec)
    const deny = (reason: string) => { this.finishExecution(exec); return `agent-os: ${reason}` }
    if (this.lifecycle !== 'active' || this.lifecycleAbort.signal.aborted) return deny('lifecycle-tombstone')
    if (!authorization || authorization.name !== exec.name || authorization.snapshotSha256 !== this.nativeClaim?.snapshotSha256) return deny('exact pre-execute authorization missing')
    let current: NativeAdmissionPointer | undefined
    try { current = this.nativeSource?.current(this.agent) } catch { return deny('admission-pointer-unavailable') }
    if (!current || !this.admittedPointer || !samePointer(current, this.admittedPointer)) return deny('admission-pointer-drift')
    if (Date.now() >= current.expiresAtMs || Date.now() >= (this.nativeClaim?.expiresAtMs ?? 0)) return deny('native-policy-expired')
    if (!this.currentCatalogMatches()) return deny('catalog-drift')
    if (!this.runtimeIdentityAvailable(exec)) return deny('runtime-provenance-unavailable')
    const decision = this.nativeGuard?.guard({
      callId: String(exec.callId),
      tool: exec.name,
      catalogDigest: this.nativeClaim?.catalogDigest ?? '',
      directService: exec.agent === undefined,
    })
    return decision?.allowed === true ? undefined : deny(decision?.reason ?? 'policy-not-admitted')
  }

  private async preExecute(exec: Readonly<ToolExecution>, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> {
    if (!this.nativeSelected) return next()
    if (exec.agent !== this.agent) {
      recordAgentlessExecution(exec.name)
      return { kind: 'deny', reason: 'agent-os: direct-service-bypass' }
    }
    const claim = this.nativeClaim
    if (!claim || Date.now() >= claim.expiresAtMs || !this.nativeSource || this.lifecycle !== 'active') return { kind: 'deny', reason: 'agent-os: native policy is missing or stale' }
    this.activeExecutions.add(exec)
    const deny = (reason: string): PreToolDecision => { this.finishExecution(exec); return { kind: 'deny', reason: `agent-os: ${reason}` } }
    const observed = claim.catalog.find((item) => item.exposedName === exec.name)
    const capability = observed === undefined ? undefined : claim.capabilities.find((item) => this.sameIdentity(item, observed))
    if (!observed || !capability) return deny('tool is outside the trusted task intersection')
    let classifier
    try {
      classifier = await this.nativeSource.classify({ capability, arguments: exec.arguments }, AbortSignal.any([exec.signal, this.lifecycleAbort.signal, this.policyAbort.signal]))
    } catch {
      return deny('classifier-error')
    }
    const route = routeCapability(
      { callId: String(exec.callId), exposedName: exec.name, arguments: exec.arguments },
      canonicalizeCatalog(claim.catalog),
      claim.catalogDigest,
      capability,
      classifier,
    )
    if (!route.allowed) return deny(route.reason)
    if (!this.runtimeIdentityAvailable(exec)) return deny('runtime-provenance-unavailable')
    this.preAuthorized.set(exec, { name: exec.name, snapshotSha256: claim.snapshotSha256 })
    let downstream: PreToolDecision
    try { downstream = await next() } catch (error) { this.finishExecution(exec); throw error }
    if (downstream.kind !== 'allow') { this.finishExecution(exec); return downstream }
    // A4: a valid rc.7 execution identity + admission + catalog match enables
    // selective enforcement for both read-only and mutating effects (the
    // cooperative-narrowing ceiling; broker-verified side effects stay
    // unsupported and are denied in the broker client).
    return downstream
  }

  private async postExecute(
    exec: Readonly<ToolExecution>,
    _result: Readonly<ToolExecutionResult>,
    next: () => Promise<PostToolDecision>,
  ): Promise<PostToolDecision> {
    try {
      const downstream = await next()
      if (!this.nativeSelected || exec.agent !== this.agent || !this.nativeClaim) return downstream
      const limit = this.nativeClaim.outputBytes
      if ('value' in downstream && downstream.value !== undefined) {
        return canonicalPolicyByteLength(downstream.value) <= limit ? downstream : { kind: 'block', feedback: [] }
      }
      const content = downstream.kind === 'block' ? downstream.feedback : (downstream.content ?? _result.content)
      const bounded = this.nativeGuard?.applyContentPolicy(content, limit)
      if (!bounded?.allowed) return { kind: 'block', feedback: [] }
      return downstream.kind === 'block' ? { ...downstream, feedback: bounded.content as typeof downstream.feedback } : { ...downstream, content: bounded.content as typeof content }
    } finally { this.finishExecution(exec) }
  }

  private sameIdentity(capability: TrustedCapability, observed: { kind: string; provider: string; tool: string; version: string }): boolean {
    const identity = capability.identity
    return identity.kind === observed.kind && identity.provider === observed.provider && identity.tool === observed.tool && identity.version === observed.version
  }

  private invalidateCatalog(): void {
    if (!this.nativeSelected) return
    this.policyAbort.abort('agent-os catalog changed')
    this.policyAbort = new AbortController()
    this.nativeClaim = undefined
    this.nativeGuard = undefined
    this.preAuthorized = new WeakMap<object, { readonly name: string; readonly snapshotSha256: string }>()
    this.recordDegradation('catalog-changed-readmission-required')
  }

  get assurance(): GovernanceAssurance {
    return this.statusValue.assurance
  }

  get policyGeneration(): number | null {
    return this.statusValue.policyGeneration
  }

  get brokerHealth(): BrokerHealth {
    return this.statusValue.brokerHealth
  }

  get catalogDigest(): string | null {
    return this.statusValue.catalogDigest
  }

  get degradationReasons(): readonly string[] {
    return this.statusValue.degradationReasons
  }

  get admission(): AdmissionStatus {
    return this.admissionValue
  }

  snapshot(): GovernanceStatus {
    return this.statusValue
  }

  subscribe(subscriber: GovernanceStatusSubscriber): () => void {
    if (this.lifecycle === 'disposed') {
      this.callStatusSubscriber(subscriber, this.statusValue)
      return () => undefined
    }
    this.statusSubscribers.add(subscriber)
    this.callStatusSubscriber(subscriber, this.statusValue)
    return () => {
      this.statusSubscribers.delete(subscriber)
    }
  }

  subscribeAdmission(subscriber: AdmissionStatusSubscriber): () => void {
    if (this.lifecycle === 'disposed') {
      this.callAdmissionSubscriber(subscriber, this.admissionValue)
      return () => undefined
    }
    this.admissionSubscribers.add(subscriber)
    this.callAdmissionSubscriber(subscriber, this.admissionValue)
    return () => {
      this.admissionSubscribers.delete(subscriber)
    }
  }

  private notifyStatus(): void {
    const status = this.statusValue
    for (const subscriber of [...this.statusSubscribers]) {
      this.callStatusSubscriber(subscriber, status)
    }
  }

  private notifyAdmission(): void {
    const admission = this.admissionValue
    for (const subscriber of [...this.admissionSubscribers]) {
      this.callAdmissionSubscriber(subscriber, admission)
    }
  }

  private callStatusSubscriber(
    subscriber: GovernanceStatusSubscriber,
    status: GovernanceStatus,
  ): void {
    try {
      this.observeSubscriberResult(subscriber(status), 'status')
    } catch {
      this.recordSubscriberFailure('status')
    }
  }

  private callAdmissionSubscriber(
    subscriber: AdmissionStatusSubscriber,
    admission: AdmissionStatus,
  ): void {
    try {
      this.observeSubscriberResult(subscriber(admission), 'admission')
    } catch {
      this.recordSubscriberFailure('admission')
    }
  }

  private observeSubscriberResult(result: unknown, kind: 'status' | 'admission'): void {
    if (
      result === null ||
      (typeof result !== 'object' && typeof result !== 'function')
    ) {
      return
    }

    let then: unknown
    try {
      then = (result as { then?: unknown }).then
    } catch {
      this.recordSubscriberFailure(kind)
      return
    }
    if (typeof then !== 'function') return

    try {
      Reflect.apply(then, result, [
        () => undefined,
        () => this.recordSubscriberFailure(kind),
      ])
    } catch {
      this.recordSubscriberFailure(kind)
    }
  }

  private recordSubscriberFailure(kind: 'status' | 'admission'): void {
    this.recordDegradation(`subscriber-error:${kind}`)
  }

  private recordDegradation(reason: string): void {
    if (this.statusValue.degradationReasons.includes(reason)) return
    this.statusValue = Object.freeze({
      ...this.statusValue,
      degradationReasons: Object.freeze([...this.statusValue.degradationReasons, reason]),
    })
  }

  private runtimeIdentityAvailable(exec: Readonly<ToolExecution>): boolean {
    // rc.7 execution identity: the registry mints ToolExecution.token before
    // the pre-execute waterfall (callers cannot choose it); callId/rootCallId
    // are caller-supplied descriptions usable only for recording. Identity is
    // available only when the registry token is present and the root binding
    // is well-formed.
    if (exec.token === undefined) return false
    if (typeof exec.callId !== 'string' || exec.callId.length === 0) return false
    if (exec.rootCallId !== undefined && (typeof exec.rootCallId !== 'string' || exec.rootCallId.length === 0)) return false
    return true
  }

  private currentCatalogMatches(): boolean {
    if (!this.tools || !this.nativeClaim) return false
    try {
      const observed = this.tools.schemas(this.agent).map((item) => item.name).sort()
      return JSON.stringify(observed) === JSON.stringify(this.nativeClaim.catalog.map((item) => item.exposedName).sort())
    } catch { return false }
  }

  private finishExecution(exec: object): void {
    this.activeExecutions.delete(exec)
    if (this.activeExecutions.size === 0) {
      for (const resolve of this.quiescenceWaiters) resolve()
      this.quiescenceWaiters.clear()
    }
  }

  private async deactivate(): Promise<void> {
    if (this.statusValue.assurance === 'unmanaged') return
    this.lifecycle = 'disposing'
    this.lifecycleAbort.abort('agent-os governance disposed')
    governanceByAgent.delete(this.agent)
    this.nativeClaim = undefined
    this.nativeGuard = undefined
    this.admittedPointer = undefined
    const subscriberFailures = this.statusValue.degradationReasons.filter((reason) =>
      reason.startsWith('subscriber-error:'),
    )
    this.statusValue = Object.freeze({
      ...UNMANAGED_STATUS,
      degradationReasons: Object.freeze([
        ...UNMANAGED_STATUS.degradationReasons,
        ...subscriberFailures,
      ]),
    })
    this.admissionValue = Object.freeze({
      phase: 'unmanaged',
      agentId: String(this.agent.id),
      observedTurn: this.admissionValue.observedTurn,
      observedStep: this.admissionValue.observedStep,
    })
    try {
      this.notifyStatus()
    } finally {
      try {
        this.notifyAdmission()
      } finally {
        this.statusSubscribers.clear()
        this.admissionSubscribers.clear()
        if (this.activeExecutions.size > 0) await new Promise<void>((resolve) => this.quiescenceWaiters.add(resolve))
        this.lifecycle = 'disposed'
      }
    }
  }
}

/** Function-plugin wrapper keeps cleanup in the owning Cordis Fiber. */
export const mountAgentOsGovernance = (ctx: Context, config: AgentGovernanceConfig): (() => Promise<void>) =>
  AgentOsGovernance.mount(ctx, config)

mountAgentOsGovernance.provide = AGENT_OS_GOVERNANCE_SERVICE
