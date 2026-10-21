import { Service } from '@deepseek-ai/cordis';
import { ADVISORY_STATUS, AGENT_OS_GOVERNANCE_SERVICE, UNMANAGED_STATUS, } from './contract.js';
import { canonicalizeCatalog, routeCapability } from './capability-router.js';
import { createAgentOsSubmitClaimTool } from './completion.js';
import { bindBundleObservationEvents } from './evidence.js';
import { decodeNativeAdmission, samePointer } from './native-admission.js';
import { canonicalPolicyByteLength, NativePolicyGuard } from './policy-guard.js';
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
const governanceByAgent = new WeakMap();
/** Resolve the exact service owned by one live Agent scope. */
/** Module-level bundle degradation record for agent-less (direct-service)
 * executions. rc.7 scoped dispatch still delivers them to the scoped
 * preExecute listener (measured), where the direct-service-bypass denial
 * fires; this record makes the downgrade observable. */
const agentlessExecutions = [];
export function recordAgentlessExecution(tool) {
    agentlessExecutions.push({ tool, at: Date.now() });
    if (agentlessExecutions.length > 256)
        agentlessExecutions.shift();
}
/** Read-only view of recorded agent-less executions (bounded). */
export function agentlessExecutionLog() {
    return agentlessExecutions.slice();
}
export function governanceFor(agent) {
    return governanceByAgent.get(agent);
}
function admissionFor(agent) {
    return Object.freeze({
        phase: 'waiting-first-pre-step',
        agentId: String(agent.id),
        observedTurn: null,
        observedStep: null,
    });
}
/** Read-only, agent-scoped governance status. Task 5 never enforces policy. */
export class AgentOsGovernance extends Service {
    static provide = AGENT_OS_GOVERNANCE_SERVICE;
    activationSource;
    agent;
    statusValue = ADVISORY_STATUS;
    admissionValue;
    statusSubscribers = new Set();
    admissionSubscribers = new Set();
    lifecycle = 'active';
    nativeSelected = false;
    nativeSource;
    tools;
    nativeClaim;
    nativeGuard;
    admittedPointer;
    preAuthorized = new WeakMap();
    lifecycleAbort = new AbortController();
    policyAbort = new AbortController();
    activeExecutions = new Set();
    quiescenceWaiters = new Set();
    constructor(ctx, config) {
        super(ctx, AGENT_OS_GOVERNANCE_SERVICE);
        this.agent = config.agent;
        this.activationSource = config.activationSource;
        this.admissionValue = admissionFor(config.agent);
        governanceByAgent.set(config.agent, this);
    }
    static mount(ctx, config) {
        if (config.observation !== undefined
            && config.observation.chain.sessionId !== String(config.agent.session.id))
            throw new Error('observation chain session binding mismatch');
        const service = new AgentOsGovernance(ctx, config);
        const source = config.admissionSource ?? ctx.get('agentOsNativeAdmission');
        const tools = ctx.get('tools');
        service.configureNative(source, tools);
        const removeCompletionTool = tools === undefined || config.completionSubmitter === undefined
            ? undefined
            : tools.register(createAgentOsSubmitClaimTool(config.completionSubmitter, {
                sessionId: String(config.agent.session.id),
            }));
        // Annotated explicitly: the ternary's inferred type collapsed to `{}` under the 0.2
        // declarations (undefined | (() => void) with no contextual type), so the optional call
        // at teardown failed with "Type '{}' has no call signatures".
        const removeObservation = config.observation === undefined
            ? undefined
            : bindBundleObservationEvents(ctx, config.agent, config.observation.chain, config.observation.sink);
        const removePreStep = ctx.on('agent/pre-step', async (payload, next) => {
            if (payload.agent !== service.agent)
                return next();
            if (service.nativeSelected) {
                if (!await service.admitNative(payload.signal))
                    return { kind: 'reject' };
                return next();
            }
            if (service.admissionValue.phase === 'waiting-first-pre-step') {
                service.admissionValue = Object.freeze({
                    phase: 'observed-first-pre-step',
                    agentId: String(service.agent.id),
                    observedTurn: payload.turn,
                    observedStep: payload.step,
                });
                service.notifyAdmission();
            }
            return next();
        });
        const removeGuard = tools?.guard((exec) => service.guardExecution(exec));
        const removePreTool = tools === undefined ? undefined : ctx.on('tools/pre-execute', async (exec, next) => service.preExecute(exec, next));
        const removePostTool = tools === undefined ? undefined : ctx.on('tools/post-execute', async (exec, result, next) => service.postExecute(exec, result, next));
        const removeToolChange = tools === undefined ? undefined : ctx.on('tools/change', () => service.invalidateCatalog());
        return async () => {
            await service.deactivate();
            removeObservation?.();
            removeCompletionTool?.();
            removeToolChange?.();
            removePostTool?.();
            removePreTool?.();
            removeGuard?.();
            removePreStep();
        };
    }
    configureNative(source, tools) {
        if (!source)
            return;
        this.nativeSource = source;
        this.tools = tools;
        try {
            this.nativeSelected = source.selected(this.agent);
        }
        catch {
            this.nativeSelected = true;
            this.recordDegradation('native-selection-error');
        }
        if (this.nativeSelected && !tools)
            this.recordDegradation('native-tool-runtime-unavailable');
    }
    async admitNative(signal) {
        if (signal.aborted || !this.nativeSource || !this.tools)
            return this.denyAdmission('native-admission-unavailable');
        try {
            const combinedSignal = AbortSignal.any([signal, this.lifecycleAbort.signal]);
            const material = await this.nativeSource.load(this.agent, combinedSignal);
            const claim = decodeNativeAdmission(material, String(this.agent.id));
            const catalog = canonicalizeCatalog(claim.catalog);
            if (catalog.digest !== claim.catalogDigest)
                throw new Error('catalog digest mismatch');
            const observedNames = this.tools.schemas(this.agent).map((item) => item.name).sort();
            const claimedNames = claim.catalog.map((item) => item.exposedName).sort();
            if (JSON.stringify(observedNames) !== JSON.stringify(claimedNames))
                throw new Error('catalog binding drift');
            if (!this.nativeClaim || claim.policyGeneration > this.nativeClaim.policyGeneration) {
                this.nativeGuard = new NativePolicyGuard({ assurance: 'native-enforced', toolCallBudget: claim.toolCallBudget });
                this.nativeGuard.admit({ generation: claim.policyGeneration, expiresAtMs: claim.expiresAtMs, catalogDigest: claim.catalogDigest });
            }
            else if (claim.policyGeneration < this.nativeClaim.policyGeneration) {
                throw new Error('policy generation rollback');
            }
            else if (claim.snapshotSha256 !== this.nativeClaim.snapshotSha256 || claim.casGeneration !== this.nativeClaim.casGeneration) {
                throw new Error('same-generation snapshot drift');
            }
            this.nativeClaim = Object.freeze(claim);
            this.admittedPointer = structuredClone(material.pointer);
            this.statusValue = Object.freeze({
                assurance: 'native-enforced',
                policyGeneration: claim.policyGeneration,
                brokerHealth: 'not-configured',
                catalogDigest: claim.catalogDigest,
                degradationReasons: Object.freeze(['unsigned-non-certifying', 'same-user-cooperative-enforcement', 'broker-not-configured']),
            });
            this.admissionValue = Object.freeze({
                phase: 'native-admitted',
                agentId: String(this.agent.id),
                observedTurn: this.admissionValue.observedTurn,
                observedStep: this.admissionValue.observedStep,
            });
            this.notifyStatus();
            this.notifyAdmission();
            return true;
        }
        catch {
            return this.denyAdmission('native-admission-invalid');
        }
    }
    denyAdmission(reason) {
        this.nativeClaim = undefined;
        this.nativeGuard = undefined;
        this.admittedPointer = undefined;
        this.recordDegradation(reason);
        this.admissionValue = Object.freeze({
            phase: 'native-denied',
            agentId: String(this.agent.id),
            observedTurn: this.admissionValue.observedTurn,
            observedStep: this.admissionValue.observedStep,
        });
        this.notifyAdmission();
        return false;
    }
    guardExecution(exec) {
        if (!this.nativeSelected)
            return undefined;
        if (exec.agent !== this.agent)
            return 'agent-os: direct-service-bypass';
        const authorization = this.preAuthorized.get(exec);
        const deny = (reason) => { this.finishExecution(exec); return `agent-os: ${reason}`; };
        if (this.lifecycle !== 'active' || this.lifecycleAbort.signal.aborted)
            return deny('lifecycle-tombstone');
        if (!authorization || authorization.name !== exec.name || authorization.snapshotSha256 !== this.nativeClaim?.snapshotSha256)
            return deny('exact pre-execute authorization missing');
        let current;
        try {
            current = this.nativeSource?.current(this.agent);
        }
        catch {
            return deny('admission-pointer-unavailable');
        }
        if (!current || !this.admittedPointer || !samePointer(current, this.admittedPointer))
            return deny('admission-pointer-drift');
        if (Date.now() >= current.expiresAtMs || Date.now() >= (this.nativeClaim?.expiresAtMs ?? 0))
            return deny('native-policy-expired');
        if (!this.currentCatalogMatches())
            return deny('catalog-drift');
        if (!this.runtimeIdentityAvailable(exec))
            return deny('runtime-provenance-unavailable');
        const decision = this.nativeGuard?.guard({
            callId: String(exec.callId),
            tool: exec.name,
            catalogDigest: this.nativeClaim?.catalogDigest ?? '',
            directService: exec.agent === undefined,
        });
        return decision?.allowed === true ? undefined : deny(decision?.reason ?? 'policy-not-admitted');
    }
    async preExecute(exec, next) {
        if (!this.nativeSelected)
            return next();
        if (exec.agent !== this.agent) {
            recordAgentlessExecution(exec.name);
            return { kind: 'deny', reason: 'agent-os: direct-service-bypass' };
        }
        const claim = this.nativeClaim;
        if (!claim || Date.now() >= claim.expiresAtMs || !this.nativeSource || this.lifecycle !== 'active')
            return { kind: 'deny', reason: 'agent-os: native policy is missing or stale' };
        this.activeExecutions.add(exec);
        const deny = (reason) => { this.finishExecution(exec); return { kind: 'deny', reason: `agent-os: ${reason}` }; };
        const observed = claim.catalog.find((item) => item.exposedName === exec.name);
        const capability = observed === undefined ? undefined : claim.capabilities.find((item) => this.sameIdentity(item, observed));
        if (!observed || !capability)
            return deny('tool is outside the trusted task intersection');
        let classifier;
        try {
            classifier = await this.nativeSource.classify({ capability, arguments: exec.arguments }, AbortSignal.any([exec.signal, this.lifecycleAbort.signal, this.policyAbort.signal]));
        }
        catch {
            return deny('classifier-error');
        }
        const route = routeCapability({ callId: String(exec.callId), exposedName: exec.name, arguments: exec.arguments }, canonicalizeCatalog(claim.catalog), claim.catalogDigest, capability, classifier);
        if (!route.allowed)
            return deny(route.reason);
        if (!this.runtimeIdentityAvailable(exec))
            return deny('runtime-provenance-unavailable');
        this.preAuthorized.set(exec, { name: exec.name, snapshotSha256: claim.snapshotSha256 });
        let downstream;
        try {
            downstream = await next();
        }
        catch (error) {
            this.finishExecution(exec);
            throw error;
        }
        if (downstream.kind !== 'allow') {
            this.finishExecution(exec);
            return downstream;
        }
        // A4: a valid rc.7 execution identity + admission + catalog match enables
        // selective enforcement for both read-only and mutating effects (the
        // cooperative-narrowing ceiling; broker-verified side effects stay
        // unsupported and are denied in the broker client).
        return downstream;
    }
    async postExecute(exec, _result, next) {
        try {
            const downstream = await next();
            if (!this.nativeSelected || exec.agent !== this.agent || !this.nativeClaim)
                return downstream;
            const limit = this.nativeClaim.outputBytes;
            if ('value' in downstream && downstream.value !== undefined) {
                return canonicalPolicyByteLength(downstream.value) <= limit ? downstream : { kind: 'block', feedback: [] };
            }
            const content = downstream.kind === 'block' ? downstream.feedback : (downstream.content ?? _result.content);
            const bounded = this.nativeGuard?.applyContentPolicy(content, limit);
            if (!bounded?.allowed)
                return { kind: 'block', feedback: [] };
            return downstream.kind === 'block' ? { ...downstream, feedback: bounded.content } : { ...downstream, content: bounded.content };
        }
        finally {
            this.finishExecution(exec);
        }
    }
    sameIdentity(capability, observed) {
        const identity = capability.identity;
        return identity.kind === observed.kind && identity.provider === observed.provider && identity.tool === observed.tool && identity.version === observed.version;
    }
    invalidateCatalog() {
        if (!this.nativeSelected)
            return;
        this.policyAbort.abort('agent-os catalog changed');
        this.policyAbort = new AbortController();
        this.nativeClaim = undefined;
        this.nativeGuard = undefined;
        this.preAuthorized = new WeakMap();
        this.recordDegradation('catalog-changed-readmission-required');
    }
    get assurance() {
        return this.statusValue.assurance;
    }
    get policyGeneration() {
        return this.statusValue.policyGeneration;
    }
    get brokerHealth() {
        return this.statusValue.brokerHealth;
    }
    get catalogDigest() {
        return this.statusValue.catalogDigest;
    }
    get degradationReasons() {
        return this.statusValue.degradationReasons;
    }
    get admission() {
        return this.admissionValue;
    }
    snapshot() {
        return this.statusValue;
    }
    subscribe(subscriber) {
        if (this.lifecycle === 'disposed') {
            this.callStatusSubscriber(subscriber, this.statusValue);
            return () => undefined;
        }
        this.statusSubscribers.add(subscriber);
        this.callStatusSubscriber(subscriber, this.statusValue);
        return () => {
            this.statusSubscribers.delete(subscriber);
        };
    }
    subscribeAdmission(subscriber) {
        if (this.lifecycle === 'disposed') {
            this.callAdmissionSubscriber(subscriber, this.admissionValue);
            return () => undefined;
        }
        this.admissionSubscribers.add(subscriber);
        this.callAdmissionSubscriber(subscriber, this.admissionValue);
        return () => {
            this.admissionSubscribers.delete(subscriber);
        };
    }
    notifyStatus() {
        const status = this.statusValue;
        for (const subscriber of [...this.statusSubscribers]) {
            this.callStatusSubscriber(subscriber, status);
        }
    }
    notifyAdmission() {
        const admission = this.admissionValue;
        for (const subscriber of [...this.admissionSubscribers]) {
            this.callAdmissionSubscriber(subscriber, admission);
        }
    }
    callStatusSubscriber(subscriber, status) {
        try {
            this.observeSubscriberResult(subscriber(status), 'status');
        }
        catch {
            this.recordSubscriberFailure('status');
        }
    }
    callAdmissionSubscriber(subscriber, admission) {
        try {
            this.observeSubscriberResult(subscriber(admission), 'admission');
        }
        catch {
            this.recordSubscriberFailure('admission');
        }
    }
    observeSubscriberResult(result, kind) {
        if (result === null ||
            (typeof result !== 'object' && typeof result !== 'function')) {
            return;
        }
        let then;
        try {
            then = result.then;
        }
        catch {
            this.recordSubscriberFailure(kind);
            return;
        }
        if (typeof then !== 'function')
            return;
        try {
            Reflect.apply(then, result, [
                () => undefined,
                () => this.recordSubscriberFailure(kind),
            ]);
        }
        catch {
            this.recordSubscriberFailure(kind);
        }
    }
    recordSubscriberFailure(kind) {
        this.recordDegradation(`subscriber-error:${kind}`);
    }
    recordDegradation(reason) {
        if (this.statusValue.degradationReasons.includes(reason))
            return;
        this.statusValue = Object.freeze({
            ...this.statusValue,
            degradationReasons: Object.freeze([...this.statusValue.degradationReasons, reason]),
        });
    }
    runtimeIdentityAvailable(exec) {
        // rc.7 execution identity: the registry mints ToolExecution.token before
        // the pre-execute waterfall (callers cannot choose it); callId/rootCallId
        // are caller-supplied descriptions usable only for recording. Identity is
        // available only when the registry token is present and the root binding
        // is well-formed.
        if (exec.token === undefined)
            return false;
        if (typeof exec.callId !== 'string' || exec.callId.length === 0)
            return false;
        if (exec.rootCallId !== undefined && (typeof exec.rootCallId !== 'string' || exec.rootCallId.length === 0))
            return false;
        return true;
    }
    currentCatalogMatches() {
        if (!this.tools || !this.nativeClaim)
            return false;
        try {
            const observed = this.tools.schemas(this.agent).map((item) => item.name).sort();
            return JSON.stringify(observed) === JSON.stringify(this.nativeClaim.catalog.map((item) => item.exposedName).sort());
        }
        catch {
            return false;
        }
    }
    finishExecution(exec) {
        this.activeExecutions.delete(exec);
        if (this.activeExecutions.size === 0) {
            for (const resolve of this.quiescenceWaiters)
                resolve();
            this.quiescenceWaiters.clear();
        }
    }
    async deactivate() {
        if (this.statusValue.assurance === 'unmanaged')
            return;
        this.lifecycle = 'disposing';
        this.lifecycleAbort.abort('agent-os governance disposed');
        governanceByAgent.delete(this.agent);
        this.nativeClaim = undefined;
        this.nativeGuard = undefined;
        this.admittedPointer = undefined;
        const subscriberFailures = this.statusValue.degradationReasons.filter((reason) => reason.startsWith('subscriber-error:'));
        this.statusValue = Object.freeze({
            ...UNMANAGED_STATUS,
            degradationReasons: Object.freeze([
                ...UNMANAGED_STATUS.degradationReasons,
                ...subscriberFailures,
            ]),
        });
        this.admissionValue = Object.freeze({
            phase: 'unmanaged',
            agentId: String(this.agent.id),
            observedTurn: this.admissionValue.observedTurn,
            observedStep: this.admissionValue.observedStep,
        });
        try {
            this.notifyStatus();
        }
        finally {
            try {
                this.notifyAdmission();
            }
            finally {
                this.statusSubscribers.clear();
                this.admissionSubscribers.clear();
                if (this.activeExecutions.size > 0)
                    await new Promise((resolve) => this.quiescenceWaiters.add(resolve));
                this.lifecycle = 'disposed';
            }
        }
    }
}
/** Function-plugin wrapper keeps cleanup in the owning Cordis Fiber. */
export const mountAgentOsGovernance = (ctx, config) => AgentOsGovernance.mount(ctx, config);
mountAgentOsGovernance.provide = AGENT_OS_GOVERNANCE_SERVICE;
