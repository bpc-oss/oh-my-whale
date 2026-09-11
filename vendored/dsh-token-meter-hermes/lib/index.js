/**
 * dsh-token-meter-hermes — Hermes-style context breakdown for DeepSeek Harness.
 *
 * Registers a new session projection `contextBreakdownHermes` on the generic
 * `ctx.sessionProjections` registry (same mechanism dsh-token-meter uses),
 * with an 8-category taxonomy ported from NousResearch/hermes-agent:
 *
 *   system / rules / skills / memory / tools / mcp / subagent / messages
 *
 * Unlike dsh-token-meter's 3-bucket contextBreakdown, the Hermes projection
 * prices the system prompt's recognizable blocks separately, buckets tool
 * schemas by family (builtin / mcp_ / subagent), and uses CJK-density-aware
 * text pricing plus a flat per-image cost — so a Chinese-heavy session or a
 * session with many large screenshots no longer under/over-counts.
 *
 * The new key does not touch dsh-token-meter's own projections: `contextPressure`,
 * `contextBreakdown`, and `tokenUsage` keep their exact behavior.
 *
 * @module dsh-token-meter-hermes
 */
import { hermesBreakdownProjectionDefinition } from './breakdown-projection.js';
import { estimateText, estimateContent, estimateMessage, estimateHeader, IMAGE_TOKEN_COST } from './estimate.js';

export const name = 'token-meter-hermes';

/**
 * Cordis plugin apply: register the Hermes breakdown projection when the
 * generic projection registry is present (optional child dependency, so
 * headless assemblies without the registry stay unaffected).
 * @param ctx - Cordis context that owns the plugin.
 * @param config - plugin config; `imageTokenCost` (number) overrides the
 *   flat per-image price (default 1500, Anthropic pricing model).
 */
export function apply(ctx, config = {}) {
    const imageTokenCost = Number.isFinite(config?.imageTokenCost)
        ? config.imageTokenCost
        : IMAGE_TOKEN_COST;

    // Pure estimator surface for other plugins / the CLI.
    ctx.provide('tokenMeterHermes', {
        estimateText: (text) => estimateText(text),
        estimateContent: (blocks) => estimateContent(blocks, imageTokenCost),
        estimateMessage: (message) => estimateMessage(message, imageTokenCost),
        estimateHeader: (header) => estimateHeader(header),
        imageTokenCost,
    });

    ctx.inject(['sessionProjections'], (projectionCtx) => {
        projectionCtx.sessionProjections.register(hermesBreakdownProjectionDefinition);
    });
}

export default { name, apply };
