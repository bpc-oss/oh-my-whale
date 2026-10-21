import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
export type DshMemoryPrivacyClass = 'conversation-redacted';
export type DshMemoryLineageState = 'active' | 'abandoned';
export interface DshMemoryBinding {
    readonly sourceClient: string;
    readonly project: string;
    readonly sessionId: string;
    readonly taskId: string;
    readonly lineageId: string;
    readonly derivedLineageId: string;
    readonly policyGeneration: number;
    readonly privacyClass: DshMemoryPrivacyClass;
    readonly extractionVersion: string;
}
export interface DshMemoryCandidate {
    readonly schema_version: '1.0';
    readonly source_client: string;
    readonly project: string;
    readonly session_id: string;
    readonly task_id: string;
    readonly lineage_id: string;
    readonly derived_lineage_id: string;
    readonly event_start_sequence: number;
    readonly event_end_sequence: number;
    readonly source_digest: string;
    readonly policy_generation: number;
    readonly privacy_class: DshMemoryPrivacyClass;
    readonly extraction_version: string;
    readonly content: readonly DshMemoryFrame[];
}
export interface DshMemoryFrame {
    readonly role: 'user';
    readonly source_kind: 'user';
    readonly blocks: readonly [{
        readonly type: 'text';
        readonly text: string;
    }];
}
export interface DshMemorySinkResult {
    readonly accepted: boolean;
    readonly reason?: string;
}
export interface DshMemoryExporterOptions {
    readonly binding: DshMemoryBinding;
    readonly redact: (text: string) => string;
    readonly flushTimeoutMs?: number;
    readonly isSuppressed: (candidate: DshMemoryCandidate, signal: AbortSignal) => Promise<boolean>;
    readonly lineageState: (lineageId: string, signal: AbortSignal) => Promise<DshMemoryLineageState>;
    readonly sink: (candidate: DshMemoryCandidate, signal: AbortSignal) => Promise<DshMemorySinkResult>;
}
type ObservedEvent = Readonly<{
    seq: number;
    type: string;
    time: number;
    data: unknown;
}>;
export declare function mandatoryRedact(text: string): string;
export declare class DshMemoryExporter {
    private readonly options;
    private readonly events;
    private readonly eventSizes;
    private readonly content;
    private readonly flushTimeoutMs;
    private queuedEventBytes;
    private contentChars;
    private lastSequence;
    private terminalFault;
    private flushing;
    constructor(options: DshMemoryExporterOptions);
    fail(error: unknown): void;
    observe(event: ObservedEvent, projection: unknown): void;
    private removePrefix;
    private withinDeadline;
    flush(): Promise<{
        readonly accepted: true;
        readonly exportedThroughSequence: number;
    } | {
        readonly accepted: false;
        readonly reason: string;
    }>;
}
/** Bind only the native session feed, flush checkpoint, and message projection. */
export declare function bindDshMemoryExport(ctx: Context, agent: Agent, exporter: DshMemoryExporter): () => void;
export {};
