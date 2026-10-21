import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeAdmissionMaterial, NativeAdmissionPointer } from './native-admission.js'

export interface NativeAdmissionBinding {
  readonly dsh_home_identity_sha256: string
  readonly profile: string
  readonly cwd_project_identity_sha256: string
  readonly task_id: string
}

/** Exact NUL-joined binding key used by Set-AgentOsDshNativeAdmission.ps1 Get-Key. */
export function bindingKeyBytes(binding: NativeAdmissionBinding): Buffer {
  return Buffer.from(
    `${binding.dsh_home_identity_sha256}\0${binding.profile}\0${binding.cwd_project_identity_sha256}\0${binding.task_id}\0`,
    'utf8',
  )
}

export function pointerFileName(binding: NativeAdmissionBinding): string {
  return `${createHash('sha256').update(bindingKeyBytes(binding)).digest('hex')}.json`
}

export function pointerPathFor(root: string, binding: NativeAdmissionBinding): string {
  return join(root, 'pointers', pointerFileName(binding))
}

export function snapshotPathFor(root: string, snapshotSha256: string): string {
  return join(root, 'snapshots', `${snapshotSha256}.json`)
}

function toPointer(record: Record<string, unknown>): NativeAdmissionPointer {
  const binding = record.binding as Record<'dsh_home_identity_sha256' | 'profile' | 'cwd_project_identity_sha256' | 'task_id' | 'catalog_digest', string>
  const authority = record.authority as Record<string, string>
  return Object.freeze({
    recordType: record.record_type as 'agent-os-dsh-native-admission-pointer',
    schemaVersion: record.schema_version as '1.0',
    casGeneration: record.cas_generation as number,
    policyGeneration: record.policy_generation as number,
    state: record.state as 'active' | 'revoked',
    snapshotSha256: record.snapshot_sha256 as string,
    sessionId: (record.session_id as string | null) ?? null,
    expiresAtMs: Date.parse(record.expires_at as string),
    binding: Object.freeze({
      dsh_home_identity_sha256: binding.dsh_home_identity_sha256,
      profile: binding.profile,
      cwd_project_identity_sha256: binding.cwd_project_identity_sha256,
      task_id: binding.task_id,
      catalog_digest: binding.catalog_digest,
    }),
    authority: Object.freeze(authority as NativeAdmissionPointer['authority']),
    sameUserSecurityCeiling: 'cooperative-not-adversarial',
  })
}

/**
 * File-backed material provider reading the existing AgentOS native admission
 * layout: `root\pointers\<binding-key>.json` + `root\snapshots\<sha>.json`.
 * Re-reads on every invocation; never caches the pointer.
 */
export function fileMaterialProvider(
  root: string,
  binding: NativeAdmissionBinding,
): () => NativeAdmissionMaterial | undefined {
  return () => {
    try {
      const pointerFile = pointerPathFor(root, binding)
      const pointerRaw = readFileSync(pointerFile, 'utf8')
      const pointerRecord = JSON.parse(pointerRaw) as Record<string, unknown>
      if (pointerRecord.state !== 'active') return undefined
      const snapshotPath = snapshotPathFor(root, pointerRecord.snapshot_sha256 as string)
      const snapshotBytes = readFileSync(snapshotPath)
      return Object.freeze({ snapshotBytes: new Uint8Array(snapshotBytes), pointer: toPointer(pointerRecord) })
    } catch {
      return undefined
    }
  }
}