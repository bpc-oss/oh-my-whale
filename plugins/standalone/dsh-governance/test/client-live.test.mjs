import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClientSubmitter } from '../dist/client-connector.js'

const sha = (v) => createHash('sha256').update(v).digest('hex')
const activationPath = 'C:/Users/Administrator/AppData/Local/AgentOS/framework-governance/state/client-activation.json'
const activation = JSON.parse(readFileSync(activationPath, 'utf8'))

const claim = {
  claim_id: sha('live-claim'), task_id: activation.taskId, session_id: activation.sessionId, lineage_id: sha('live-lineage'),
  worker_identity_sha256: sha('live-worker'), created_at: '2026-08-22T00:00:00Z',
  acceptance: [{ criterion_id: 'c1', status: 'met', evidence_ref: sha('live-ev') }],
  changed_files: ['a.txt'], delta_sha256: sha('live-delta'), test_receipt_ids: [], runtime_evidence_refs: [],
  observation: { from_sequence: 1, to_sequence: 1, chain_head_sha256: sha('live-chain'), flush_receipt_sha256: sha('live-fr') },
  residual_risks: [], handoff: { required: true, status: 'updated' },
}

test('A connector submits completion over real C pipe', async () => {
  const submitter = createClientSubmitter(activationPath)
  const result = await submitter(claim, new AbortController().signal)
  assert.equal(result.ok, true)
  assert.equal(result.code, 'COMPLETION_ACCEPTED')
  assert.match(result.receiptSha256 ?? '', /^[0-9a-f]{64}$/)
  submitter.close?.()
})