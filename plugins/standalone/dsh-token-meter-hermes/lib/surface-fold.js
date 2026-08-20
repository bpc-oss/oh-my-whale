/**
 * O(1) surface-token fold for the Hermes-style projection.
 *
 * Re-implements the shadow-price protocol from dsh-token-meter's
 * surface-projection.ts so the projection stays bounded (the persisted
 * projection cache checkpoints every unit's whole state) while compaction
 * still shrinks the total by its logged shadow price.
 *
 * The one difference from token-meter's fold: pricing goes through this
 * package's CJK-aware estimator, so append prices and shadow prices are
 * both computed under the Hermes vocabulary (producers of
 * `compaction/summary` / `compaction/prune` stamp `shadowedTokenCount`
 * from the same fixed estimator this fold uses).
 *
 * @module dsh-token-meter-hermes/surface-fold
 */
import { deriveEventMessage, isSurfaceEvent } from '@deepseek-ai/dsh-session';
import { estimateMessage } from './estimate.js';

/**
 * Fold one committed event onto a running surface-token total.
 *
 * A shadow-price event arms a claim; any other event expires it, and a
 * surface `replace` consumes the claim naming its exact range — the
 * producers append the metering event and the replacement synchronously
 * adjacent, so a surviving claim always prices the very next event.
 * A replace with no claim folds with zero delta because the bounded state
 * cannot reconstruct the replaced range. An armed claim for another range
 * still fails because the adjacent events contradict each other.
 *
 * @param claim - the claim armed by the immediately preceding event, if any.
 * @param event - the next committed session event.
 * @returns the signed token delta and the claim state after this event.
 */
export function foldSurfaceProjection(claim, event) {
    if (event.type === 'compaction/summary' || event.type === 'compaction/prune') {
        const { shadowedRange, shadowedTokenCount } = event.data;
        return {
            deltaTokens: 0,
            claim: { start: shadowedRange.start, end: shadowedRange.end, tokens: shadowedTokenCount },
        };
    }
    if (!isSurfaceEvent(event)) {
        return { deltaTokens: 0, claim: undefined };
    }
    const message = deriveEventMessage(event);
    const tokens = message === null ? 0 : estimateMessage(message);
    const op = event.surfaceOp;
    if (op === 'append') {
        return { deltaTokens: tokens, claim: undefined };
    }
    // Sessions recorded before the shadow-price protocol log replacements
    // with no adjacent metering event; the bounded state cannot reconstruct
    // the replaced range's price, so fold those neutrally — historical
    // replay degrades to drift instead of failing.
    if (claim === undefined) {
        return { deltaTokens: 0, claim: undefined };
    }
    if (claim.start !== op.start || claim.end !== op.end) {
        throw new Error(`token surface (hermes): replace at seq ${event.seq} over range ${op.start}-${op.end} has no adjacent shadow price`
            + ` (armed claim covers ${claim.start}-${claim.end})`);
    }
    return { deltaTokens: tokens - claim.tokens, claim: undefined };
}
