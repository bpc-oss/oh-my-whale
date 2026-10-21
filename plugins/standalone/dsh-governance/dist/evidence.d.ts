import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
export type BundleObservationKind = 'lifecycle' | 'session' | 'step' | 'tool-outcome' | 'approval' | 'subagent' | 'model' | 'catalog' | 'catalog-unlock' | 'session-flush' | 'agentless';
export interface BundleObservationEvent {
    readonly eventId: string;
    readonly sourceSequence: number;
    readonly kind: BundleObservationKind;
    readonly subjectSha256: string;
    readonly byteCount: number;
    readonly itemCount: number;
    readonly truncated: boolean;
}
export interface BundleObservationEnvelope {
    readonly recordType: 'agent-os-dsh-bundle-observation-claim';
    readonly schemaVersion: '1.0';
    readonly trust: 'untrusted-same-process';
    readonly taskId: string;
    readonly sessionId: string;
    readonly lineageId: string;
    readonly brokerEpoch: string;
    readonly sequence: number;
    readonly sourceSequence: number;
    readonly previousEnvelopeSha256: string;
    readonly parentChainHeadSha256: string | null;
    readonly observedAt: string;
    readonly event: Readonly<{
        eventId: string;
        kind: BundleObservationKind;
        subjectSha256: string;
        byteCount: number;
        itemCount: number;
        truncated: boolean;
        redaction: 'digests-only';
    }>;
    readonly envelopeSha256: string;
}
export interface BundleObservationCheckpoint {
    readonly recordType: 'agent-os-dsh-bundle-observation-checkpoint';
    readonly taskId: string;
    readonly sessionId: string;
    readonly lineageId: string;
    readonly brokerEpoch: string;
    readonly sequence: number;
    readonly sourceSequence: number;
    readonly chainHeadSha256: string;
    readonly flushReceiptSha256: string;
}
export interface BundleObservationBatch {
    readonly trust: 'untrusted-same-process';
    readonly taskId: string;
    readonly sessionId: string;
    readonly lineageId: string;
    readonly brokerEpoch: string;
    readonly fromSequence: number;
    readonly toSequence: number;
    readonly chainHeadSha256: string;
    readonly gapDetected: boolean;
    readonly envelopes: readonly BundleObservationEnvelope[];
}
export interface BundleObservationFlushReceipt {
    readonly accepted: true;
    readonly flushReceiptSha256: string;
}
export type BundleObservationSink = (batch: BundleObservationBatch) => Promise<BundleObservationFlushReceipt>;
export interface BundleObservationOptions {
    readonly taskId: string;
    readonly sessionId: string;
    readonly lineageId: string;
    readonly brokerEpoch: string;
    readonly maxObservations: number;
    readonly maxEventBytes: number;
    readonly clock?: () => string;
    readonly checkpoint?: BundleObservationCheckpoint;
}
export interface BundleObservationCrashMarker {
    readonly taskId: string;
    readonly sessionId: string;
    readonly lineageId: string;
    readonly brokerEpoch: string;
    readonly lastSourceSequence: number;
    readonly lostFromSequence: number;
    readonly lostThroughSequence: number;
}
/**
 * A bounded in-memory digest chain.  Its outputs are always same-process claims;
 * only an external broker may turn a flushed batch into accepted evidence.
 * The class deliberately has no Session reference or append API.
 */
export declare class BundleObservationChain {
    readonly taskId: string;
    readonly sessionId: string;
    readonly lineageId: string;
    readonly brokerEpoch: string;
    readonly maxObservations: number;
    readonly maxEventBytes: number;
    readonly parentChainHeadSha256: string | null;
    private readonly clock;
    private sequenceValue;
    private sourceSequenceValue;
    private chainHeadValue;
    private flushReceiptValue;
    private pending;
    private gapValue;
    private flushInFlight;
    constructor(options: BundleObservationOptions);
    get pendingCount(): number;
    get gapDetected(): boolean;
    get nextSourceSequence(): number;
    record(input: BundleObservationEvent): BundleObservationEnvelope;
    flush(sink: BundleObservationSink): Promise<BundleObservationFlushReceipt & {
        readonly flushedThroughSequence: number;
    }>;
    checkpoint(): BundleObservationCheckpoint;
    fork(binding: {
        readonly sessionId: string;
        readonly lineageId: string;
    }): BundleObservationChain;
    crashMarker(): BundleObservationCrashMarker;
    static afterCrash(options: Omit<BundleObservationOptions, 'checkpoint'> & {
        readonly crashMarker: BundleObservationCrashMarker;
    }): BundleObservationChain;
    static resumeWithoutCheckpoint(_binding: {
        readonly taskId: string;
        readonly sessionId: string;
        readonly lineageId: string;
        readonly brokerEpoch: string;
    }): never;
}
/**
 * Subscribe to native DSH events without ever calling `Session.append`.
 * The awaited `session/flush` hook drains claims only to the supplied external
 * sink; sink failure propagates so a durability gap cannot be represented as a
 * pass.
 */
export declare function bindBundleObservationEvents(ctx: Context, agent: Agent, chain: BundleObservationChain, sink: BundleObservationSink): () => void;
