import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileMaterialProvider, bindingKeyBytes, pointerFileName, snapshotPathFor } from '../dist/admission-provider.js'

const binding = {
  dsh_home_identity_sha256: 'a'.repeat(64),
  profile: 'web',
  cwd_project_identity_sha256: 'b'.repeat(64),
  task_id: 'task-1',
}

test('reads active pointer + snapshot', () => {
  const root = mkdtempSync(join(tmpdir(), 'aos-provider-'))
  try {
    mkdirSync(join(root, 'pointers'), { recursive: true })
    mkdirSync(join(root, 'snapshots'), { recursive: true })
    const snapshotBytes = Buffer.from('{"record_type":"agent-os-dsh-native-policy-snapshot"}')
    const sha = createHash('sha256').update(snapshotBytes).digest('hex')
    writeFileSync(snapshotPathFor(root, sha), snapshotBytes)
    const pointer = {
      record_type: 'agent-os-dsh-native-admission-pointer', schema_version: '1.0',
      cas_generation: 1, policy_generation: 1, state: 'active',
      key_sha256: pointerFileName(binding).replace(/\.json$/, ''),
      snapshot_sha256: sha, snapshot_name: `${sha}.json`, binding,
      authority: { host_identity_sha256: 'c'.repeat(64) },
      session_id: null, created_at: '2026-08-22T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
      same_user_security_ceiling: 'cooperative-not-adversarial',
    }
    writeFileSync(join(root, 'pointers', pointerFileName(binding)), JSON.stringify(pointer))
    const material = fileMaterialProvider(root, binding)()
    assert.ok(material)
    assert.equal(material.pointer.state, 'active')
    assert.equal(material.pointer.binding.profile, 'web')
    assert.equal(material.pointer.snapshotSha256, sha)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('returns undefined when pointer missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'aos-provider-'))
  try {
    assert.equal(fileMaterialProvider(root, binding)(), undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('bindingKeyBytes matches NUL-joined layout', () => {
  const bytes = bindingKeyBytes(binding).toString('utf8')
  assert.equal(bytes, `${binding.dsh_home_identity_sha256}\0${binding.profile}\0${binding.cwd_project_identity_sha256}\0${binding.task_id}\0`)
})