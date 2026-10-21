import { readFileSync } from 'node:fs'
import { BrokerClient, type BrokerActivationReceipt } from './broker-client.js'
import type { CompletionClaim, CompletionSubmitter, CompletionSubmissionResponse } from './completion.js'

/** Load a flat activation receipt produced by `framework-governance client-activation`. */
export function loadActivation(path: string): BrokerActivationReceipt {
  return JSON.parse(readFileSync(path, 'utf8')) as BrokerActivationReceipt
}

/**
 * Lazily-connecting completion submitter. Connection is established on first
 * submission; a failed connection surfaces as a rejected submission and never
 * fakes a receipt.
 */
export function createClientSubmitter(activationPath: string): CompletionSubmitter {
  let client: BrokerClient | undefined
  let connecting: Promise<BrokerClient> | undefined
  const submitter = (async (claim: CompletionClaim, signal: AbortSignal): Promise<CompletionSubmissionResponse> => {
    if (!client && !connecting) connecting = BrokerClient.connect(loadActivation(activationPath))
    if (!client) client = await connecting
    connecting = undefined
    const current = client
    if (!current) throw new Error('framework governance client unavailable')
    const response = await current.submitCompletion(claim as unknown as Record<string, unknown>, signal)
    return Object.freeze({
      ok: response.ok === true,
      code: String(response.code ?? 'UNKNOWN'),
      receiptSha256: typeof response.receipt_sha256 === 'string' ? response.receipt_sha256 : null,
    })
  }) as CompletionSubmitter & { close?: () => void }
  submitter.close = () => client?.close()
  return submitter
}