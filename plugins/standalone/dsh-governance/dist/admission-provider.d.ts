import type { NativeAdmissionMaterial } from './native-admission.js';
export interface NativeAdmissionBinding {
    readonly dsh_home_identity_sha256: string;
    readonly profile: string;
    readonly cwd_project_identity_sha256: string;
    readonly task_id: string;
}
/** Exact NUL-joined binding key used by Set-AgentOsDshNativeAdmission.ps1 Get-Key. */
export declare function bindingKeyBytes(binding: NativeAdmissionBinding): Buffer;
export declare function pointerFileName(binding: NativeAdmissionBinding): string;
export declare function pointerPathFor(root: string, binding: NativeAdmissionBinding): string;
export declare function snapshotPathFor(root: string, snapshotSha256: string): string;
/**
 * File-backed material provider reading the existing AgentOS native admission
 * layout: `root\pointers\<binding-key>.json` + `root\snapshots\<sha>.json`.
 * Re-reads on every invocation; never caches the pointer.
 */
export declare function fileMaterialProvider(root: string, binding: NativeAdmissionBinding): () => NativeAdmissionMaterial | undefined;
