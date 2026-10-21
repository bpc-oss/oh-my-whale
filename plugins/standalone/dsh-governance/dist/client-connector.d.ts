import { type BrokerActivationReceipt } from './broker-client.js';
import type { CompletionSubmitter } from './completion.js';
/** Load a flat activation receipt produced by `framework-governance client-activation`. */
export declare function loadActivation(path: string): BrokerActivationReceipt;
/**
 * Lazily-connecting completion submitter. Connection is established on first
 * submission; a failed connection surfaces as a rejected submission and never
 * fakes a receipt.
 */
export declare function createClientSubmitter(activationPath: string): CompletionSubmitter;
