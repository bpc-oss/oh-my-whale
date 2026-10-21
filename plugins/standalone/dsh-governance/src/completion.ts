import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { parseCompletionClaim, type CompletionClaim, type CompletionToolBinding } from './completion-claim.js'

export { parseCompletionClaim, type CompletionClaim, type CompletionToolBinding } from './completion-claim.js'

const SHA256 = /^[0-9a-f]{64}$/

export interface CompletionSubmissionResponse {
  readonly ok: boolean
  readonly code: string
  readonly receiptSha256: string | null
}

export type CompletionSubmitter = (
  claim: CompletionClaim,
  signal: AbortSignal,
) => Promise<CompletionSubmissionResponse>

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child)
    Object.freeze(value)
  }
  return value
}

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    status: { type: 'string' as const, enum: ['unverified', 'completion-accepted'] as const },
    code: { type: 'string' as const },
    receipt_sha256: { oneOf: [{ type: 'string' as const }, { type: 'null' as const }] as const },
    agent_os_certified: { type: 'boolean' as const },
    ordinary_text_allowed: { type: 'boolean' as const },
  },
} as const

/** Create the native candidate-submission tool. It never vetoes ordinary DSH text. */
export function createAgentOsSubmitClaimTool(
  submit: CompletionSubmitter,
  binding: CompletionToolBinding = {},
): ToolDefinition {
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
          const agent = exec.agent as { session?: { id?: unknown } } | undefined
          const id = agent?.session?.id
          return id === undefined || id === null ? undefined : String(id)
        },
      })
      let response: CompletionSubmissionResponse
      try {
        response = await submit(claim, exec.signal)
      } catch {
        return freeze({
          status: 'unverified' as const, code: 'BROKER_UNAVAILABLE', receipt_sha256: null,
          agent_os_certified: false, ordinary_text_allowed: true,
        })
      }
      const accepted = response.ok === true && response.code === 'COMPLETION_ACCEPTED' && typeof response.receiptSha256 === 'string' && SHA256.test(response.receiptSha256)
      return freeze({
        status: accepted ? 'completion-accepted' as const : 'unverified' as const,
        code: typeof response.code === 'string' && response.code.length <= 160 ? response.code : 'BROKER_RESPONSE_REJECTED',
        receipt_sha256: accepted ? response.receiptSha256 : null,
        agent_os_certified: accepted,
        ordinary_text_allowed: true,
      })
    },
  })
}
