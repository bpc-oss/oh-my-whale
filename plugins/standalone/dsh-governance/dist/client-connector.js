import { readFileSync } from 'node:fs';
import { BrokerClient } from './broker-client.js';
/** Load a flat activation receipt produced by `framework-governance client-activation`. */
export function loadActivation(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}
/**
 * Lazily-connecting completion submitter. Connection is established on first
 * submission; a failed connection surfaces as a rejected submission and never
 * fakes a receipt.
 */
export function createClientSubmitter(activationPath) {
    let client;
    let connecting;
    const submitter = (async (claim, signal) => {
        if (!client && !connecting)
            connecting = BrokerClient.connect(loadActivation(activationPath));
        if (!client)
            client = await connecting;
        connecting = undefined;
        const current = client;
        if (!current)
            throw new Error('framework governance client unavailable');
        const response = await current.submitCompletion(claim, signal);
        return Object.freeze({
            ok: response.ok === true,
            code: String(response.code ?? 'UNKNOWN'),
            receiptSha256: typeof response.receipt_sha256 === 'string' ? response.receipt_sha256 : null,
        });
    });
    submitter.close = () => client?.close();
    return submitter;
}
