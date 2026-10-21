import { type Context, Service } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type CatalogTool, type ClassifierDecision, type TrustedCapability } from './capability-router.js';
export declare const AGENT_OS_NATIVE_ADMISSION_SERVICE = "agentOsNativeAdmission";
declare const LIMITATIONS: readonly ["unsigned-non-certifying", "same-user-cooperative-enforcement", "no-broker-receipts"];
declare const AUTHORITY_KEYS: readonly ["host_identity_sha256", "project_identity_sha256", "project_root_identity_sha256", "task_policy_sha256", "trusted_registry_sha256", "role_map_sha256", "budget_policy_sha256", "observed_dsh_sha256"];
declare const BINDING_KEYS: readonly ["dsh_home_identity_sha256", "profile", "cwd_project_identity_sha256", "task_id", "catalog_digest"];
export type SnapshotAuthority = Readonly<Record<(typeof AUTHORITY_KEYS)[number], string>>;
export type SnapshotBinding = Readonly<Record<(typeof BINDING_KEYS)[number], string>>;
export interface NativeAdmissionPointer {
    readonly recordType: 'agent-os-dsh-native-admission-pointer';
    readonly schemaVersion: '1.0';
    readonly casGeneration: number;
    readonly policyGeneration: number;
    readonly state: 'active' | 'revoked';
    readonly snapshotSha256: string;
    readonly sessionId: string | null;
    readonly expiresAtMs: number;
    readonly binding: SnapshotBinding;
    readonly authority: SnapshotAuthority;
    readonly sameUserSecurityCeiling: 'cooperative-not-adversarial';
}
export interface NativeAdmissionMaterial {
    snapshotBytes: Uint8Array;
    readonly pointer: NativeAdmissionPointer;
}
export interface NativeAdmissionClaim {
    readonly recordType: 'agent-os-dsh-native-policy-snapshot';
    readonly assurance: 'native-enforced';
    readonly policyGeneration: number;
    readonly casGeneration: number;
    readonly snapshotSha256: string;
    readonly expiresAtMs: number;
    readonly catalogDigest: string;
    readonly catalog: readonly CatalogTool[];
    readonly capabilities: readonly TrustedCapability[];
    readonly toolCallBudget: number;
    readonly outputBytes: number;
    readonly reviewState: 'accepted' | 'not-required';
    readonly limitations: typeof LIMITATIONS;
}
export interface ClassifyRequest {
    readonly capability: TrustedCapability;
    readonly arguments: unknown;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        agentOsNativeAdmission: AgentOsNativeAdmission;
    }
}
/** Host-owned, read-only bridge. It returns only raw canonical bytes and pointer metadata. */
export declare abstract class AgentOsNativeAdmission extends Service {
    static readonly provide = "agentOsNativeAdmission";
    protected constructor(ctx: Context);
    abstract selected(agent: Agent): boolean;
    abstract load(agent: Agent, signal: AbortSignal): Promise<NativeAdmissionMaterial>;
    abstract current(agent: Agent): NativeAdmissionPointer | undefined;
    abstract classify(request: ClassifyRequest, signal: AbortSignal): Promise<ClassifierDecision>;
}
/**
 * Fusion T5: production classifier + admission bridge (replaces the test mock
 * in production). The material is supplied by the host (decoded snapshot /
 * pointer); classify derives the effect from the trusted capability's declared
 * allowed_effects and enforces the arguments object-root contract — fail-closed:
 * empty allowed_effects -> unknown, malformed arguments -> error, abort -> error.
 */
export declare class ProductionNativeAdmission extends AgentOsNativeAdmission {
    private readonly materialProvider;
    constructor(ctx: Context, materialProvider: () => NativeAdmissionMaterial | undefined);
    selected(_agent: Agent): boolean;
    load(_agent: Agent, signal: AbortSignal): Promise<NativeAdmissionMaterial>;
    current(_agent: Agent): NativeAdmissionPointer | undefined;
    classify(request: ClassifyRequest, signal: AbortSignal): Promise<ClassifierDecision>;
}
export declare function decodeNativeAdmission(material: NativeAdmissionMaterial, expectedSessionId: string, nowMs?: number): NativeAdmissionClaim;
export declare function samePointer(left: NativeAdmissionPointer, right: NativeAdmissionPointer): boolean;
export {};
