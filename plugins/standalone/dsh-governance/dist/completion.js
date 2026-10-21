import { defineTool } from '@deepseek-ai/dsh-tools';
import { parseCompletionClaim } from './completion-claim.js';
export { parseCompletionClaim } from './completion-claim.js';
const SHA256 = /^[0-9a-f]{64}$/;
function freeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
const OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        status: { type: 'string', enum: ['unverified', 'completion-accepted'] },
        code: { type: 'string' },
        receipt_sha256: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        agent_os_certified: { type: 'boolean' },
        ordinary_text_allowed: { type: 'boolean' },
    },
};
/** Create the native candidate-submission tool. It never vetoes ordinary DSH text. */
export function createAgentOsSubmitClaimTool(submit, binding = {}) {
    return defineTool({
        name: 'agentos_submit_claim',
        description: 'Submit a bounded completion candidate to the external Agent OS verifier. Ordinary DSH text remains allowed; only a receipt certifies Agent OS completion.',
        parameters: {
            claim_id: { type: 'string', required: true },
            task_id: { type: 'string', required: true },
            session_id: { type: 'string', required: true },
            lineage_id: { type: 'string', required: true },
            worker_identity_sha256: { type: 'string', required: true },
            created_at: { type: 'string', required: true },
            acceptance: { type: 'array', items: { type: 'json' }, required: true },
            changed_files: { type: 'array', items: { type: 'string' }, required: true },
            delta_sha256: { type: 'string', required: true },
            test_receipt_ids: { type: 'array', items: { type: 'string' }, required: true },
            runtime_evidence_refs: { type: 'array', items: { type: 'string' }, required: true },
            review_receipt_ids: { type: 'array', items: { type: 'string' }, required: true },
            observation: { type: 'json', required: true },
            residual_risks: { type: 'array', items: { type: 'string' }, required: true },
            handoff: { type: 'json', required: true },
        },
        output: {
            schema: OUTPUT_SCHEMA,
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
            const claim = parseCompletionClaim(args, {
                ...binding,
                // exec.agent is the agent the host is really running this for. It must win over
                // the session_id in the arguments, because ToolRuntime.register() mounts this
                // tool globally (the service is a singleton and register() uses the runtime's own
                // ctx). Without this check an ungoverned agent could submit a claim carrying
                // another session's id, and the verifier would see a well-formed claim.
                runningSessionId: () => {
                    const agent = exec.agent;
                    const id = agent?.session?.id;
                    return id === undefined || id === null ? undefined : String(id);
                },
            });
            let response;
            try {
                response = await submit(claim, exec.signal);
            }
            catch {
                return freeze({
                    status: 'unverified', code: 'BROKER_UNAVAILABLE', receipt_sha256: null,
                    agent_os_certified: false, ordinary_text_allowed: true,
                });
            }
            const accepted = response.ok === true && response.code === 'COMPLETION_ACCEPTED' && typeof response.receiptSha256 === 'string' && SHA256.test(response.receiptSha256);
            return freeze({
                status: accepted ? 'completion-accepted' : 'unverified',
                code: typeof response.code === 'string' && response.code.length <= 160 ? response.code : 'BROKER_RESPONSE_REJECTED',
                receipt_sha256: accepted ? response.receiptSha256 : null,
                agent_os_certified: accepted,
                ordinary_text_allowed: true,
            });
        },
    });
}
