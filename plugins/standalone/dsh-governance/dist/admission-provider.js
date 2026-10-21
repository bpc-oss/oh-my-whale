import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/** Exact NUL-joined binding key used by Set-AgentOsDshNativeAdmission.ps1 Get-Key. */
export function bindingKeyBytes(binding) {
    return Buffer.from(`${binding.dsh_home_identity_sha256}\0${binding.profile}\0${binding.cwd_project_identity_sha256}\0${binding.task_id}\0`, 'utf8');
}
export function pointerFileName(binding) {
    return `${createHash('sha256').update(bindingKeyBytes(binding)).digest('hex')}.json`;
}
export function pointerPathFor(root, binding) {
    return join(root, 'pointers', pointerFileName(binding));
}
export function snapshotPathFor(root, snapshotSha256) {
    return join(root, 'snapshots', `${snapshotSha256}.json`);
}
function toPointer(record) {
    const binding = record.binding;
    const authority = record.authority;
    return Object.freeze({
        recordType: record.record_type,
        schemaVersion: record.schema_version,
        casGeneration: record.cas_generation,
        policyGeneration: record.policy_generation,
        state: record.state,
        snapshotSha256: record.snapshot_sha256,
        sessionId: record.session_id ?? null,
        expiresAtMs: Date.parse(record.expires_at),
        binding: Object.freeze({
            dsh_home_identity_sha256: binding.dsh_home_identity_sha256,
            profile: binding.profile,
            cwd_project_identity_sha256: binding.cwd_project_identity_sha256,
            task_id: binding.task_id,
            catalog_digest: binding.catalog_digest,
        }),
        authority: Object.freeze(authority),
        sameUserSecurityCeiling: 'cooperative-not-adversarial',
    });
}
/**
 * File-backed material provider reading the existing AgentOS native admission
 * layout: `root\pointers\<binding-key>.json` + `root\snapshots\<sha>.json`.
 * Re-reads on every invocation; never caches the pointer.
 */
export function fileMaterialProvider(root, binding) {
    return () => {
        try {
            const pointerFile = pointerPathFor(root, binding);
            const pointerRaw = readFileSync(pointerFile, 'utf8');
            const pointerRecord = JSON.parse(pointerRaw);
            if (pointerRecord.state !== 'active')
                return undefined;
            const snapshotPath = snapshotPathFor(root, pointerRecord.snapshot_sha256);
            const snapshotBytes = readFileSync(snapshotPath);
            return Object.freeze({ snapshotBytes: new Uint8Array(snapshotBytes), pointer: toPointer(pointerRecord) });
        }
        catch {
            return undefined;
        }
    };
}
