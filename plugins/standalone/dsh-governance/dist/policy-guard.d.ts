export interface PolicyContentBlock {
    readonly type: string;
    readonly text?: string;
}
export declare function canonicalPolicyByteLength(value: unknown): number;
export type GuardAssurance = 'advisory' | 'native-enforced';
export interface NativeAdmission {
    readonly generation: number;
    readonly expiresAtMs: number;
    readonly catalogDigest: string;
}
export interface GuardCall {
    readonly callId: string;
    readonly tool: string;
    readonly catalogDigest?: string;
    readonly directService?: boolean;
}
export interface GuardDecision {
    readonly allowed: boolean;
    readonly reason: string;
}
export declare class NativePolicyGuard {
    private readonly config;
    private admission?;
    private readonly seen;
    private readonly budget;
    constructor(config: {
        readonly assurance: GuardAssurance;
        readonly toolCallBudget?: number;
    });
    admit(admission: NativeAdmission, nowMs?: number): void;
    guard(call: GuardCall): GuardDecision;
    applyOutputPolicy(value: string | Uint8Array, maxBytes: number): string | Uint8Array;
    applyContentPolicy(content: readonly PolicyContentBlock[], maxBytes: number): {
        readonly allowed: true;
        readonly content: PolicyContentBlock[];
    } | {
        readonly allowed: false;
        readonly reason: string;
    };
    promoteUnsignedSnapshot(): never;
}
