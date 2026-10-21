/**
 * Pure fold for the Hermes-style context-composition projection:
 * an 8-category breakdown of how the next provider request is composed,
 * ported from hermes-agent's context_breakdown.py to DSH's session
 * vocabulary.
 *
 * Categories (Hermes' taxonomy, DSH mapping):
 *   systemTokens          閳?system prompt core (stable/volatile minus the
 *                           recognizable skills / rules / memory blocks)
 *   rulesTokens           閳?<system-reminder> blocks (AGENTS.md instructions,
 *                           DSH's closest analogue to Hermes' "rules" part)
 *   skillsTokens          閳?the <available_skills> catalog block
 *   memoryTokens          閳?a <memory> / <memories> block if present
 *   toolsTokens           閳?builtin tool schemas (not mcp_, not subagent)
 *   mcpTokens             閳?tools whose name starts with "mcp_"
 *   subagentTokens        閳?subagent/toolset tools (send_message, subagent,
 *                           workflow, ralph, interrupt_agent, list_agents)
 *   messageTokens         閳?live conversation surface (shadow-price fold)
 *
 * Envelope figures are last-wins per `request/header`; the message figure
 * rides foldSurfaceProjection 閳?the same O(1) fold the occupancy projection
 * uses 閳?so compaction shrinks the figure by its logged shadow price. The
 * state is a fixed handful of numbers, so the persisted checkpoint stays
 * O(1) over the session's life.
 *
 * @module dsh-token-meter-hermes/breakdown-projection
 */
import { z } from 'zod';
import { canonicalHeader } from '@deepseek-ai/dsh-session';
import { estimateText, estimateToolTokens, toolNameOf, BLOCK_OVERHEAD, ROLE_OVERHEAD } from './estimate.js';
import { foldSurfaceProjection } from './surface-fold.js';

/** DSH system prompts wrap instruction/skill blocks in these markers. */
const SKILLS_BLOCK_RE = /<available_skills>[\s\S]*?<\/available_skills>/g;
const RULES_BLOCK_RE = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const MEMORY_BLOCK_RE = /<(?:memory|memories)>[\s\S]*?<\/(?:memory|memories)>/g;

/** Subagent-family tool names (DSH toolset, Hermes' _SUBAGENT_TOOL_NAMES analogue). */
const SUBAGENT_TOOL_NAMES = new Set([
    'send_message', 'interrupt_agent', 'list_agents',
    'subagent', 'subagent_fork', 'workflow', 'ralph',
]);

const breakdownSchema = z.object({
    systemTokens: z.number().int().nonnegative(),
    rulesTokens: z.number().int().nonnegative(),
    skillsTokens: z.number().int().nonnegative(),
    memoryTokens: z.number().int().nonnegative(),
    toolsTokens: z.number().int().nonnegative(),
    mcpTokens: z.number().int().nonnegative(),
    subagentTokens: z.number().int().nonnegative(),
    messageTokens: z.number().int().nonnegative(),
}).strict();

/** Split one block out of the system text and return [core, extracted]. */
function extractBlock(text, re) {
    let core = text;
    let extracted = '';
    for (const match of text.matchAll(re)) {
        extracted += match[0];
        core = core.replace(match[0], '');
    }
    return [core, extracted];
}

/**
 * Price the header's system prompt into core / rules / skills / memory
 * buckets. Rules extracted first so skills inside a <system-reminder> are
 * not double-priced (skills bucket owns that text).
 */
function priceSystem(header) {
    const system = header?.system ?? '';
    if (!system) {
        return { systemTokens: 0, rulesTokens: 0, skillsTokens: 0, memoryTokens: 0 };
    }
    let rest = system;
    let skills = '';
    let memory = '';
    let rules = '';
    [rest, skills] = extractBlock(rest, SKILLS_BLOCK_RE);
    [rest, memory] = extractBlock(rest, MEMORY_BLOCK_RE);
    [rest, rules] = extractBlock(rest, RULES_BLOCK_RE);
    return {
        systemTokens: estimateText(rest) + ROLE_OVERHEAD,
        rulesTokens: estimateText(rules) + ROLE_OVERHEAD,
        skillsTokens: estimateText(skills) + ROLE_OVERHEAD,
        memoryTokens: estimateText(memory) + ROLE_OVERHEAD,
    };
}

/** Split tools into builtin / mcp / subagent and price each schema. */
function priceTools(header) {
    const tools = header?.tools ?? [];
    let toolsTokens = 0;
    let mcpTokens = 0;
    let subagentTokens = 0;
    for (const tool of tools) {
        const name = toolNameOf(tool);
        const tokens = estimateToolTokens(tool);
        if (name.startsWith('mcp_')) {
            mcpTokens += tokens;
        } else if (SUBAGENT_TOOL_NAMES.has(name)) {
            subagentTokens += tokens;
        } else {
            toolsTokens += tokens;
        }
    }
    return { toolsTokens, mcpTokens, subagentTokens };
}

/**
 * Token-meter's context-composition projection unit, Hermes taxonomy.
 */
export const hermesBreakdownProjectionDefinition = {
    key: 'contextBreakdownHermes',
    stateSchema: breakdownSchema,
    init: () => ({
        systemTokens: 0, rulesTokens: 0, skillsTokens: 0, memoryTokens: 0,
        toolsTokens: 0, mcpTokens: 0, subagentTokens: 0, messageTokens: 0,
    }),
    apply: (state, event) => {
        const fold = foldSurfaceProjection(state.claim, event);
        let next = state;
        if (event.type === 'request/header') {
            const header = canonicalHeader(event.data.header);
            const system = priceSystem(header);
            const tools = priceTools(header);
            next = { ...next, ...system, ...tools };
        }
        if (fold.deltaTokens !== 0) {
            // V2.1 (2026-09-11): clamp negative surface deltas at zero. Shadow
            // prices are stamped at write time by the kernel's compaction
            // producers under THEIR estimator, while appends fold here under
            // this CJK/strip estimator — the two drift apart across kernel
            // versions. Pre-P24 logs shadow inline video by base64 length
            // (session-68cdbcc8: compaction/summary at seq 64789 claims
            // 855,419 tokens over a range that now folds to 215,662), and P25
            // video offloads claim a fixed 4096/block where this fold priced
            // the stripped block structurally (~70). Such a claim can exceed
            // the accumulated total; propagating the negative makes the whole
            // history read fail on the wire schema's nonnegative guard. The
            // clamp keeps the fold O(1) and the wire schema unchanged —
            // unbacked negatives clamp to zero (drift), never corrupt state.
            next = { ...next, messageTokens: Math.max(0, next.messageTokens + fold.deltaTokens) };
        }
        if (state.claim === undefined && fold.claim === undefined) {
            return next;
        }
        const { claim: _expired, ...withoutClaim } = next;
        return fold.claim === undefined ? withoutClaim : { ...withoutClaim, claim: fold.claim };
    },
    wire: {
        viewSchema: breakdownSchema,
        view: ({ systemTokens, rulesTokens, skillsTokens, memoryTokens, toolsTokens, mcpTokens, subagentTokens, messageTokens }) => ({
            systemTokens, rulesTokens, skillsTokens, memoryTokens,
            toolsTokens, mcpTokens, subagentTokens, messageTokens,
        }),
    },
    stateVersion: 1,
};
