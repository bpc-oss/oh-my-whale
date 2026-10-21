import { mandatoryRedact } from './memory.js';
const SHA256 = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PATH = /^(?![A-Za-z]:)(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$))[^\0\r\n]{1,4096}$/;
const CLAIM_KEYS = [
    'acceptance', 'changed_files', 'claim_id', 'created_at', 'delta_sha256', 'handoff',
    'lineage_id', 'observation', 'residual_risks', 'review_receipt_ids',
    'runtime_evidence_refs', 'session_id', 'task_id', 'test_receipt_ids',
    'worker_identity_sha256',
];
function exactKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted))
        throw new Error(`${label} fields are not closed`);
}
function record(value, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function string(value, label, pattern = ID) {
    if (typeof value !== 'string' || !pattern.test(value))
        throw new Error(`${label} rejected`);
    return value;
}
function stringList(value, label, limit, pattern = ID) {
    if (!Array.isArray(value) || value.length > limit)
        throw new Error(`${label} limit rejected`);
    const result = value.map((item, index) => string(item, `${label}[${index}]`, pattern));
    if (new Set(result).size !== result.length)
        throw new Error(`${label} contains duplicates`);
    return result;
}
function freeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
export function parseCompletionClaim(value, binding = {}) {
    const input = record(structuredClone(value), 'completion claim');
    exactKeys(input, CLAIM_KEYS, 'completion claim');
    const claimId = string(input.claim_id, 'claim id');
    const taskId = string(input.task_id, 'task id');
    const sessionId = string(input.session_id, 'session id');
    if (binding.taskId !== undefined && taskId !== binding.taskId)
        throw new Error('completion task binding mismatch');
    if (binding.sessionId !== undefined && sessionId !== binding.sessionId)
        throw new Error('completion session binding mismatch');
    // The claim's own session_id is attacker-controlled text. When the host can tell us who
    // is actually running, that wins over what the arguments say.
    if (binding.runningSessionId !== undefined) {
        const actual = binding.runningSessionId();
        if (actual === undefined)
            throw new Error('completion claim requires a governed session');
        if (actual !== sessionId)
            throw new Error('completion session does not match the running session');
    }
    const createdAt = string(input.created_at, 'created_at', /^\d{4}-\d{2}-\d{2}T/);
    if (!Number.isFinite(Date.parse(createdAt)))
        throw new Error('completion created_at rejected');
    if (!Array.isArray(input.acceptance) || input.acceptance.length < 1 || input.acceptance.length > 128)
        throw new Error('acceptance mapping limit rejected');
    const acceptance = input.acceptance.map((raw, index) => {
        const item = record(raw, `acceptance[${index}]`);
        exactKeys(item, ['criterion_id', 'evidence_refs'], `acceptance[${index}]`);
        const refs = stringList(item.evidence_refs, `acceptance[${index}].evidence_refs`, 64);
        if (refs.length < 1)
            throw new Error('acceptance criterion lacks evidence');
        return { criterion_id: string(item.criterion_id, `acceptance[${index}].criterion_id`), evidence_refs: refs };
    });
    if (new Set(acceptance.map((item) => item.criterion_id)).size !== acceptance.length)
        throw new Error('duplicate acceptance criterion');
    const observationRaw = record(input.observation, 'observation');
    exactKeys(observationRaw, ['chain_head_sha256', 'final_sequence', 'flush_receipt_sha256'], 'observation');
    if (!Number.isSafeInteger(observationRaw.final_sequence) || observationRaw.final_sequence < 0 || observationRaw.final_sequence > 100_000)
        throw new Error('observation final sequence rejected');
    const handoffRaw = record(input.handoff, 'handoff');
    exactKeys(handoffRaw, ['artifact', 'required', 'sha256', 'status'], 'handoff');
    if (typeof handoffRaw.required !== 'boolean' || !['updated', 'not-required'].includes(String(handoffRaw.status)))
        throw new Error('handoff state rejected');
    const artifact = handoffRaw.artifact === null ? null : string(handoffRaw.artifact, 'handoff artifact', PATH);
    const handoffSha = handoffRaw.sha256 === null ? null : string(handoffRaw.sha256, 'handoff sha256', SHA256);
    if (handoffRaw.required ? (handoffRaw.status !== 'updated' || artifact === null || handoffSha === null) : (handoffRaw.status !== 'not-required' || artifact !== null || handoffSha !== null))
        throw new Error('handoff binding rejected');
    const changedFiles = stringList(input.changed_files, 'changed_files', 256, PATH);
    if (changedFiles.length < 1)
        throw new Error('changed_files cannot be empty');
    const risks = stringList(input.residual_risks, 'residual_risks', 64, /^[^\0\r\n]{1,1000}$/).map((r) => mandatoryRedact(r));
    return freeze({
        claim_id: claimId,
        task_id: taskId,
        session_id: sessionId,
        lineage_id: string(input.lineage_id, 'lineage id', SHA256),
        worker_identity_sha256: string(input.worker_identity_sha256, 'worker identity', SHA256),
        created_at: createdAt,
        acceptance,
        changed_files: changedFiles,
        delta_sha256: string(input.delta_sha256, 'delta sha256', SHA256),
        test_receipt_ids: stringList(input.test_receipt_ids, 'test receipt ids', 128, SHA256),
        runtime_evidence_refs: stringList(input.runtime_evidence_refs, 'runtime evidence refs', 128),
        review_receipt_ids: stringList(input.review_receipt_ids, 'review receipt ids', 16, SHA256),
        observation: {
            final_sequence: observationRaw.final_sequence,
            chain_head_sha256: string(observationRaw.chain_head_sha256, 'observation chain head', SHA256),
            flush_receipt_sha256: string(observationRaw.flush_receipt_sha256, 'observation flush receipt', SHA256),
        },
        residual_risks: risks,
        handoff: {
            required: handoffRaw.required,
            status: handoffRaw.status,
            artifact,
            sha256: handoffSha,
        },
    });
}
