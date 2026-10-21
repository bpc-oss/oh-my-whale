export interface CompletionClaim {
    readonly claim_id: string;
    readonly task_id: string;
    readonly session_id: string;
    readonly lineage_id: string;
    readonly worker_identity_sha256: string;
    readonly created_at: string;
    readonly acceptance: readonly Readonly<{
        criterion_id: string;
        evidence_refs: readonly string[];
    }>[];
    readonly changed_files: readonly string[];
    readonly delta_sha256: string;
    readonly test_receipt_ids: readonly string[];
    readonly runtime_evidence_refs: readonly string[];
    readonly review_receipt_ids: readonly string[];
    readonly observation: Readonly<{
        final_sequence: number;
        chain_head_sha256: string;
        flush_receipt_sha256: string;
    }>;
    readonly residual_risks: readonly string[];
    readonly handoff: Readonly<{
        required: boolean;
        status: 'updated' | 'not-required';
        artifact: string | null;
        sha256: string | null;
    }>;
}
export interface CompletionToolBinding {
    readonly taskId?: string;
    readonly sessionId?: string;
    /**
     * Resolves the agent that is actually running the tool, so a claim can be checked
     * against its real owner instead of only against the strings it carries.
     *
     * This exists because ToolRuntime.register() registers through the runtime's OWN
     * context (`this.layers.effect(this.ctx, ...)`, dsh-tools/lib/index.js) and the service
     * is a singleton — so `agentos_submit_claim` is mounted globally, not on the governed
     * agent. The review confirmed an agent with no governance at all could see and invoke
     * it, bound to a DIFFERENT agent's sessionId. Without this, a session could submit a
     * claim on another session's authority. The submitted `session_id` is an untrusted
     * argument; this is the trusted one.
     */
    /**
     * The session id of the agent the host is ACTUALLY running, as a zero-argument
     * accessor (the caller closes over exec). Returns undefined when the execution has no
     * agent, which is a rejection, not a fallback.
     */
    readonly runningSessionId?: () => string | undefined;
}
export declare function parseCompletionClaim(value: unknown, binding?: CompletionToolBinding): CompletionClaim;
