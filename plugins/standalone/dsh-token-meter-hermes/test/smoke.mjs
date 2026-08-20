/**
 * Smoke test for dsh-token-meter-hermes: pure estimator + projection fold.
 * Run: node test/smoke.mjs
 */
import assert from 'node:assert/strict';
import {
    estimateText,
    estimateContent,
    estimateMessage,
    estimateToolTokens,
    estimateSystemTokens,
    estimateToolsTokens,
    IMAGE_TOKEN_COST,
} from '../lib/estimate.js';
import { foldSurfaceProjection } from '../lib/surface-fold.js';
import { hermesBreakdownProjectionDefinition } from '../lib/breakdown-projection.js';

// ── estimateText: CJK density ──────────────────────────────────────────────
// ASCII: 100 chars → 25 tokens
assert.equal(estimateText('a'.repeat(100)), 25, 'ascii 4 chars/token');
// Short ASCII never zero (ceiling).
assert.equal(estimateText('ab'), 1, 'short ascii ceil to 1');
assert.equal(estimateText('ab'), 1, 'short ascii ceil to 1 (re-run)');
// 100 CJK chars → 100 tokens (dense ≈ 1 each)
const cjk = '中文测试'.repeat(25);
assert.equal(estimateText(cjk), 100, 'cjk 1 token per char');
// Mixed: 50 CJK + 100 ascii → 50 dense + ceil(100/4)=25 = 75
assert.equal(estimateText('中'.repeat(50) + 'a'.repeat(100)), 50 + 25, 'mixed dense + sparse');
assert.equal(estimateText(''), 0, 'empty is 0');

// ── estimateContent: blocks incl. image flat cost ──────────────────────────
const textTokens = estimateContent([{ type: 'text', text: 'a'.repeat(400) }]);
assert.equal(textTokens, 100 + 4, 'text block = chars/4 + overhead');
const imageTokens = estimateContent([{ type: 'image', attachment: { bytes: 1_000_000 } }]);
assert.equal(imageTokens, IMAGE_TOKEN_COST + 4, 'image block priced flat, not by bytes');
const toolResultTokens = estimateContent([
    { type: 'tool-result', content: [{ type: 'text', text: 'b'.repeat(400) }] },
]);
assert.equal(toolResultTokens, 100 + 4 + 4, 'tool-result recurses + overhead');

// ── estimateToolTokens ─────────────────────────────────────────────────────
const tool = { function: { name: 'read_file', description: 'd'.repeat(40), parameters: { type: 'object' } } };
assert.ok(estimateToolTokens(tool) > 10, 'tool schema priced from fields');
assert.ok(estimateToolTokens(undefined) === 0, 'undefined tool is 0');

// ── estimateSystemTokens / estimateToolsTokens ─────────────────────────────
const header = {
    system: '你'.repeat(200),
    tools: [tool],
};
assert.equal(estimateSystemTokens(header), 200 + 4, 'system CJK 1:1 + role overhead');
assert.ok(estimateToolsTokens(header) > 0, 'tools priced');
assert.equal(estimateToolsTokens({ system: '' }), 0, 'no tools → 0');

// ── foldSurfaceProjection: append / shadow-price replace ───────────────────
// append a user message (surface event shape: minimal)
function appendEvent(seq, text) {
    return {
        seq,
        type: 'user/message',
        surfaceOp: 'append',
        data: { turn: 1, step: 0, content: [{ type: 'text', text }] },
    };
}
const e1 = appendEvent(0, '你'.repeat(100));
const f1 = foldSurfaceProjection(undefined, e1);
// 100 CJK + BLOCK_OVERHEAD 4 + ROLE_OVERHEAD 4 = 108
assert.equal(f1.deltaTokens, 108, 'append delta = message price');

// shadow-price protocol: compaction summary arms a claim, replace consumes it.
const summary = { seq: 1, type: 'compaction/summary', data: { shadowedRange: { start: 0, end: 0 }, shadowedTokenCount: 108 } };
const f2 = foldSurfaceProjection(undefined, summary);
assert.equal(f2.deltaTokens, 0, 'summary arms claim, no delta');
assert.deepEqual(f2.claim, { start: 0, end: 0, tokens: 108 }, 'claim carries shadow price');

const replace = {
    seq: 2,
    type: 'assistant/message',
    surfaceOp: { op: 'replace', start: 0, end: 0 },
    data: { turn: 1, step: 0, message: { role: 'assistant', content: [{ type: 'text', text: '中'.repeat(50) }] } },
};
// 50 CJK + 4 + 4 = 58; delta = 58 - 108 = -50
const f3 = foldSurfaceProjection(f2.claim, replace);
assert.equal(f3.deltaTokens, -50, 'replace delta = new price - shadow price');
assert.equal(f3.claim, undefined, 'claim consumed');

// replace without claim → neutral (historical drift tolerance)
const f4 = foldSurfaceProjection(undefined, replace);
assert.equal(f4.deltaTokens, 0, 'unclaimed replace folds neutral');

// ── projection definition shape ────────────────────────────────────────────
assert.equal(hermesBreakdownProjectionDefinition.key, 'contextBreakdownHermes');
assert.equal(hermesBreakdownProjectionDefinition.stateVersion, 1);
const init = hermesBreakdownProjectionDefinition.init();
assert.deepEqual(Object.keys(init), [
    'systemTokens', 'rulesTokens', 'skillsTokens', 'memoryTokens',
    'toolsTokens', 'mcpTokens', 'subagentTokens', 'messageTokens',
], '8 category buckets');

// request/header drives envelope buckets
const s = hermesBreakdownProjectionDefinition.apply(init, {
    seq: 10,
    type: 'request/header',
    data: { header },
});
assert.ok(s.systemTokens > 0, 'system priced from header');
assert.equal(s.messageTokens, 0, 'no surface yet');
// schema validates the view
const view = hermesBreakdownProjectionDefinition.view(s);
const parsed = hermesBreakdownProjectionDefinition.schema.parse(view);
assert.equal(parsed.systemTokens, s.systemTokens, 'schema roundtrip');

// skills block extraction via a header whose system contains <available_skills>
const s2 = hermesBreakdownProjectionDefinition.apply(init, {
    seq: 11,
    type: 'request/header',
    data: {
        header: {
            system: '<available_skills>abc</available_skills>' + '核'.repeat(40),
            tools: [],
        },
    },
});
assert.ok(s2.skillsTokens > 0, 'skills block extracted and priced');
assert.ok(s2.systemTokens > 0, 'core system priced after block extraction');

console.log('✅ all smoke assertions passed');
