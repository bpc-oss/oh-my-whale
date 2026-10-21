import type { Duplex } from 'node:stream';
export interface BrokerActivationReceipt {
    readonly protocol: 'AgentOS.DSH.Broker.v2';
    readonly receiptSha256: string;
    readonly taskId: string;
    readonly sessionId: string;
    readonly epoch: string;
    readonly brokerGeneration: number;
    readonly address: string;
    readonly endpointIdentitySha256: string;
    readonly keyId: string;
    readonly publicKeyHex: string;
    readonly connectionNonce: string;
    readonly expiresAt: string;
    readonly sameUserSecurityCeiling: 'cooperative-not-adversarial';
}
export interface BrokerClientOptions {
    readonly connector?: (address: string) => Duplex;
    readonly timeoutMs?: number;
}
export interface BrokerResponse {
    readonly ok: boolean;
    readonly code: string;
    readonly request_id?: string;
    readonly [key: string]: unknown;
}
type JsonRecord = Record<string, unknown>;
export declare class BrokerClient {
    readonly receipt: BrokerActivationReceipt;
    private readonly stream;
    private readonly reader;
    private readonly channelId;
    private readonly timeoutMs;
    private readonly allowed;
    private busy;
    private closed;
    private constructor();
    static connect(receipt: BrokerActivationReceipt, options?: BrokerClientOptions): Promise<BrokerClient>;
    authorizeEffect(): {
        readonly ok: false;
        readonly code: 'PINNED_DISPATCH_UNSUPPORTED';
    };
    private assertAllowed;
    submitCompletion(claim: JsonRecord, signal?: AbortSignal): Promise<BrokerResponse>;
    flushObservations(payload: JsonRecord, signal?: AbortSignal): Promise<BrokerResponse>;
    flushMemory(payload: JsonRecord, signal?: AbortSignal): Promise<BrokerResponse>;
    idempotencyStatus(targetRequestId: string, signal?: AbortSignal): Promise<BrokerResponse>;
    status(signal?: AbortSignal): Promise<BrokerResponse>;
    verifyHostReview(payload: {
        readonly phase: string;
        readonly review_sha256: string;
        readonly attestation_sha256: string;
        readonly reviewed_diff_sha256: string;
    }, signal?: AbortSignal): Promise<BrokerResponse>;
    private request;
    close(): void;
}
export {};
