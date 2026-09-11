/**
 * Hermes-style token estimation for DeepSeek Harness.
 *
 * Ported from NousResearch/hermes-agent (agent/model_metadata.py +
 * agent/context_breakdown.py), adapted to DSH content-block vocabulary:
 *   - CJK / Hangul / Kana density-aware pricing (dense codepoints ≈ 1 token
 *     each, everything else at the classic ~4 chars/token), with an O(1)
 *     ASCII fast path.
 *   - Flat per-image cost (Anthropic pricing model) instead of pricing raw
 *     base64/byte length, so a single large screenshot cannot inflate the
 *     estimate into triggering premature compaction.
 *   - Tool schemas priced from their dominant fields (name + description +
 *     parameters), never a pathological full-list stringify on every call.
 *
 * All functions are pure and shared by the projection units, mirroring how
 * dsh-token-meter's estimate.ts is shared by its projections.
 *
 * @module dsh-token-meter-hermes/estimate
 */
/** Fixed text-density estimate used until exact tokenization is needed. */
export const CHARS_PER_TOKEN = 4;
/** Per-block structural overhead for JSON framing and type tags. */
export const BLOCK_OVERHEAD = 4;
/** Role-field framing overhead added to every priced message. */
export const ROLE_OVERHEAD = 4;
/**
 * Flat token cost per image block (Anthropic pricing model; Hermes uses the
 * same 1500). Overridable via plugin config (`imageTokenCost`).
 */
export const IMAGE_TOKEN_COST = 1500;

/**
 * CJK / Hangul / Kana dense-codepoint ranges (Hermes' exact set):
 * Hangul Jamo, CJK radicals/ideographs, Hangul Jamo Extended-A, Hangul
 * Syllables, CJK compatibility ideographs, fullwidth forms / halfwidth kana.
 */
export const CJK_DENSE_RE = /[\u1100-\u11ff\u2e80-\u9fff\ua960-\ua97f\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/g;

/**
 * Rough token estimate for one string, CJK-aware.
 *
 * Uses ceiling division so short texts (1-3 chars) never estimate as 0
 * tokens — otherwise many short tool results would be systematically
 * undercounted. CJK/Hangul/Kana text is much denser than English under
 * common LLM tokenizers, so dense codepoints count as ~1 token each.
 *
 * Perf: runs on every message in every fold, so the common all-ASCII case
 * stays O(1).
 */
export function estimateText(text) {
    if (!text) return 0;
    const str = String(text);
    // Fast path: ASCII cannot contain token-dense CJK chars.
    if (/^[\x00-\x7f]*$/.test(str)) {
        return Math.ceil(str.length / CHARS_PER_TOKEN);
    }
    const dense = str.match(CJK_DENSE_RE)?.length ?? 0;
    if (dense === 0) {
        // Non-ASCII but no CJK (accents, Cyrillic, emoji, ...): classic rule.
        return Math.ceil(str.length / CHARS_PER_TOKEN);
    }
    const sparse = str.length - dense;
    return dense + Math.ceil(sparse / CHARS_PER_TOKEN);
}

/**
 * Price an image attachment ref under the flat per-image model.
 * When the plugin config supplies `imageTokenCost` it wins; otherwise the
 * Anthropic-style flat 1500 is used (Hermes' default).
 */
export function estimateImageTokens(attachment, imageTokenCost = IMAGE_TOKEN_COST) {
    if (!attachment || typeof attachment !== 'object') return imageTokenCost;
    return imageTokenCost;
}

/**
 * Price content blocks recursively under the density-aware heuristic.
 * @param blocks - content blocks to price without mutation.
 * @returns heuristic tokens including per-block structural overhead.
 */
export function estimateContent(blocks, imageTokenCost = IMAGE_TOKEN_COST) {
    if (!Array.isArray(blocks)) return 0;
    let tokens = 0;
    for (const block of blocks) {
        if (!block || typeof block !== 'object') {
            tokens += BLOCK_OVERHEAD;
            continue;
        }
        switch (block.type) {
            case 'text':
            case 'reasoning':
                tokens += estimateText(block.text) + BLOCK_OVERHEAD;
                break;
            case 'tool-call':
                tokens += estimateText(block.name)
                    + estimateText(block.arguments)
                    + BLOCK_OVERHEAD;
                break;
            case 'tool-result':
                tokens += estimateContent(block.content, imageTokenCost) + BLOCK_OVERHEAD;
                break;
            case 'image':
                // DSH image blocks carry a durable ImageAttachmentRef with
                // exact encoded bytes; price flat, never by byte length.
                tokens += estimateImageTokens(block.attachment, imageTokenCost) + BLOCK_OVERHEAD;
                break;
            default:
                // ContentBlockMap is merge-extensible; unknown blocks retain a
                // conservative structural JSON price (excluding any base64
                // payloads, which would massively overestimate).
                tokens += BLOCK_OVERHEAD
                    + estimateText(stripPayloads(JSON.stringify(block)));
        }
    }
    return tokens;
}

/**
 * Remove long base64-ish payload values from an unknown block's JSON string
 * so an unrecognized multimodal block still prices structurally, not by its
 * raw payload bytes.
 */
function stripPayloads(json) {
    if (!json) return '';
    return json.replace(/"(?:data|base64|url)":\s*"[^"]{256,}"/g, '"$1":"…"');
}

/**
 * Heuristically price one model-visible message.
 * @param message - message to price without mutation.
 * @returns content and role-framing tokens under the fixed heuristic.
 */
export function estimateMessage(message, imageTokenCost = IMAGE_TOKEN_COST) {
    if (!message) return ROLE_OVERHEAD;
    return estimateContent(message.content, imageTokenCost) + ROLE_OVERHEAD;
}

/**
 * Price the system-prompt part of a canonical request envelope.
 * @param header - canonical envelope, or undefined before any request.
 * @returns heuristic system-prompt tokens; 0 when absent.
 */
export function estimateSystemTokens(header) {
    if (header?.system === undefined) return 0;
    return estimateText(header.system) + ROLE_OVERHEAD;
}

/**
 * Price one tool schema's dominant fields (Hermes: sum name + description +
 * parameters lengths; avoids pathological full-list stringify).
 */
export function estimateToolTokens(tool) {
    if (!tool || typeof tool !== 'object') return 0;
    const fn = typeof tool.function === 'object' && tool.function !== null ? tool.function : null;
    const name = fn ? (fn.name ?? '') : (tool.name ?? '');
    const desc = fn ? (fn.description ?? '') : (tool.description ?? '');
    const params = fn ? (fn.parameters ?? {}) : (tool.parameters ?? {});
    const paramsText = params && typeof params === 'object'
        ? JSON.stringify(params)
        : String(params ?? '');
    let chars = 0;
    if (name) chars += name.length;
    if (desc) chars += desc.length;
    if (paramsText && paramsText.length > 2) chars += paramsText.length;
    return Math.ceil(chars / CHARS_PER_TOKEN) + BLOCK_OVERHEAD;
}

/**
 * Extract a tool's name from either the function-calling or native shape.
 */
export function toolNameOf(tool) {
    if (!tool || typeof tool !== 'object') return '';
    const fn = tool.function;
    if (typeof fn === 'object' && fn !== null && typeof fn.name === 'string') {
        return fn.name;
    }
    return typeof tool.name === 'string' ? tool.name : '';
}

/**
 * Price the tool-schema part of a canonical request envelope.
 * @param header - canonical envelope, or undefined before any request.
 * @returns heuristic tool-schema tokens; 0 when absent or empty.
 */
export function estimateToolsTokens(header) {
    if (header?.tools === undefined || header.tools.length === 0) return 0;
    let tokens = 0;
    for (const tool of header.tools) {
        tokens += estimateToolTokens(tool);
    }
    return tokens;
}

/**
 * Price the complete non-surface request envelope.
 * @param header - canonical envelope, or undefined before any request.
 * @returns heuristic system plus tool tokens.
 */
export function estimateHeader(header) {
    return estimateSystemTokens(header) + estimateToolsTokens(header);
}
