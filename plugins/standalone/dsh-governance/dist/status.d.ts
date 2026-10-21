import { type Context, Service } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AdmissionStatus, AdmissionStatusSubscriber, AgentGovernanceConfig, BrokerHealth, GovernanceActivationSource, GovernanceAssurance, GovernanceStatus, GovernanceStatusSubscriber } from './types.js';
export declare function recordAgentlessExecution(tool: string): void;
/** Read-only view of recorded agent-less executions (bounded). */
export declare function agentlessExecutionLog(): ReadonlyArray<{
    tool: string;
    at: number;
}>;
export declare function governanceFor(agent: Agent): AgentOsGovernance | undefined;
/** Read-only, agent-scoped governance status. Task 5 never enforces policy. */
export declare class AgentOsGovernance extends Service {
    static readonly provide = "agentOsGovernance";
    readonly activationSource: GovernanceActivationSource;
    readonly agent: Agent;
    private statusValue;
    private admissionValue;
    private statusSubscribers;
    private admissionSubscribers;
    private lifecycle;
    private nativeSelected;
    private nativeSource;
    private tools;
    private nativeClaim;
    private nativeGuard;
    private admittedPointer;
    private preAuthorized;
    private readonly lifecycleAbort;
    private policyAbort;
    private activeExecutions;
    private quiescenceWaiters;
    constructor(ctx: Context, config: AgentGovernanceConfig);
    static mount(ctx: Context, config: AgentGovernanceConfig): () => Promise<void>;
    private configureNative;
    private admitNative;
    private denyAdmission;
    private guardExecution;
    private preExecute;
    private postExecute;
    private sameIdentity;
    private invalidateCatalog;
    get assurance(): GovernanceAssurance;
    get policyGeneration(): number | null;
    get brokerHealth(): BrokerHealth;
    get catalogDigest(): string | null;
    get degradationReasons(): readonly string[];
    get admission(): AdmissionStatus;
    snapshot(): GovernanceStatus;
    subscribe(subscriber: GovernanceStatusSubscriber): () => void;
    subscribeAdmission(subscriber: AdmissionStatusSubscriber): () => void;
    private notifyStatus;
    private notifyAdmission;
    private callStatusSubscriber;
    private callAdmissionSubscriber;
    private observeSubscriberResult;
    private recordSubscriberFailure;
    private recordDegradation;
    private runtimeIdentityAvailable;
    private currentCatalogMatches;
    private finishExecution;
    private deactivate;
}
/** Function-plugin wrapper keeps cleanup in the owning Cordis Fiber. */
export declare const mountAgentOsGovernance: {
    (ctx: Context, config: AgentGovernanceConfig): (() => Promise<void>);
    provide: string;
};
