import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AgentOsNativeAdmission } from './native-admission.js';
import type { NativeAdmissionBinding } from './admission-provider.js';
import type { CompletionSubmitter } from './completion.js';
import type { BundleObservationChain, BundleObservationSink } from './evidence.js';
export type GovernanceAssurance = 'unmanaged' | 'advisory' | 'native-enforced';
export type BrokerHealth = 'not-configured' | 'unavailable';
export type GovernanceActivationSource = 'bundle-existing-agent' | 'bundle-created-event' | 'host-setup';
export type AdmissionPhase = 'waiting-first-pre-step' | 'observed-first-pre-step' | 'native-admitted' | 'native-denied' | 'unmanaged';
export interface AdmissionStatus {
    readonly phase: AdmissionPhase;
    readonly agentId: string;
    readonly observedTurn: number | null;
    readonly observedStep: number | null;
}
export interface GovernanceStatus {
    readonly assurance: GovernanceAssurance;
    readonly policyGeneration: number | null;
    readonly brokerHealth: BrokerHealth;
    readonly catalogDigest: string | null;
    readonly degradationReasons: readonly string[];
}
export type GovernanceStatusSubscriber = (status: GovernanceStatus) => void | PromiseLike<void>;
export type AdmissionStatusSubscriber = (status: AdmissionStatus) => void | PromiseLike<void>;
export interface AgentGovernanceConfig {
    readonly agent: Agent;
    readonly activationSource: GovernanceActivationSource;
    readonly completionSubmitter?: CompletionSubmitter;
    readonly admissionSource?: AgentOsNativeAdmission;
    readonly observation?: Readonly<{
        chain: BundleObservationChain;
        sink: BundleObservationSink;
    }>;
}
export interface BundleConfig {
    readonly enabled?: boolean;
    readonly completionSubmitter?: CompletionSubmitter;
    readonly nativeAdmission?: Readonly<{
        root: string;
        binding: NativeAdmissionBinding;
    }>;
    readonly clientActivation?: string;
    readonly observationFactory?: (agent: Agent) => Readonly<{
        chain: BundleObservationChain;
        sink: BundleObservationSink;
    }>;
}
