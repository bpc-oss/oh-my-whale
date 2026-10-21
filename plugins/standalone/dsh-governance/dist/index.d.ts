import { type Context } from '@deepseek-ai/cordis';
import type { BundleConfig } from './types.js';
export * from './contract.js';
export { agentlessExecutionLog } from './status.js';
export * from './budget.js';
export * from './capability-router.js';
export * from './completion.js';
export * from './native-admission.js';
export * from './policy-guard.js';
export * from './status.js';
export * from './types.js';
export * from './admission-provider.js';
export declare const name = "agent-os-governance";
export declare const inject: string[];
/**
 * Optional host-owned setup adapter for public create/resume `setup` callbacks.
 * Bundle/profile loading does not wire this callback globally. Host wiring only.
 */
export declare function installAgentOsGovernanceDuringSetup(agentCtx: Context): Promise<void>;
/** Mount advisory observation for existing and subsequently published Agents. */
export declare const apply: (ctx: Context, config?: BundleConfig) => (() => Promise<void> | void);
/** Object-plugin shape equivalent to the module namespace consumed by Loader. */
export declare const bundle: {
    name: string;
    inject: string[];
    apply: (ctx: Context, config?: BundleConfig) => (() => Promise<void> | void);
};
