import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type CompletionClaim, type CompletionToolBinding } from './completion-claim.js';
export { parseCompletionClaim, type CompletionClaim, type CompletionToolBinding } from './completion-claim.js';
export interface CompletionSubmissionResponse {
    readonly ok: boolean;
    readonly code: string;
    readonly receiptSha256: string | null;
}
export type CompletionSubmitter = (claim: CompletionClaim, signal: AbortSignal) => Promise<CompletionSubmissionResponse>;
/** Create the native candidate-submission tool. It never vetoes ordinary DSH text. */
export declare function createAgentOsSubmitClaimTool(submit: CompletionSubmitter, binding?: CompletionToolBinding): ToolDefinition;
