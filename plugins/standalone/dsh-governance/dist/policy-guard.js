import { MonotonicBudget } from './budget.js';
import { TextDecoder } from 'node:util';
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const item = value;
        return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
export function canonicalPolicyByteLength(value) {
    return Buffer.byteLength(canonicalJson(value), 'utf8');
}
export class NativePolicyGuard {
    config;
    admission;
    seen = new Set();
    budget;
    constructor(config) {
        this.config = config;
        this.budget = new MonotonicBudget(config.toolCallBudget ?? 0);
    }
    admit(admission, nowMs = Date.now()) {
        if (this.config.assurance !== 'native-enforced')
            throw new Error('advisory sessions cannot admit native policy');
        if (!Number.isSafeInteger(admission.generation) || admission.generation < 1)
            throw new Error('invalid policy generation');
        if (admission.expiresAtMs <= nowMs)
            throw new Error('native policy expired');
        if (!/^[0-9a-f]{64}$/.test(admission.catalogDigest))
            throw new Error('invalid catalog digest');
        if (this.admission && admission.generation <= this.admission.generation)
            throw new Error('policy generation rollback');
        this.admission = Object.freeze({ ...admission });
    }
    guard(call) {
        if (this.config.assurance === 'advisory')
            return { allowed: true, reason: 'advisory' };
        if (!this.admission)
            return { allowed: false, reason: 'policy-not-admitted' };
        if (!call.callId)
            return { allowed: false, reason: 'missing-call-id' };
        if (this.seen.has(call.callId))
            return { allowed: false, reason: 'duplicate-call-id' };
        if (call.catalogDigest !== this.admission.catalogDigest)
            return { allowed: false, reason: 'catalog-drift' };
        if (call.directService === true)
            return { allowed: false, reason: 'direct-service-bypass' };
        if (!this.budget.consume())
            return { allowed: false, reason: 'budget-exhausted' };
        this.seen.add(call.callId);
        return { allowed: true, reason: 'guard-admitted' };
    }
    applyOutputPolicy(value, maxBytes) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
            throw new Error('invalid output policy');
        if (typeof value === 'string') {
            const bytes = Buffer.from(value, 'utf8');
            if (bytes.length <= maxBytes)
                return value;
            const decoder = new TextDecoder('utf-8', { fatal: true });
            let end = maxBytes;
            while (end > 0) {
                try {
                    return decoder.decode(bytes.subarray(0, end));
                }
                catch {
                    end -= 1;
                }
            }
            return '';
        }
        return value.length <= maxBytes ? value : value.slice(0, maxBytes);
    }
    applyContentPolicy(content, maxBytes) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
            throw new Error('invalid output policy');
        let remaining = maxBytes;
        const bounded = [];
        for (const block of content) {
            const encoded = canonicalPolicyByteLength(block);
            if (encoded <= remaining) {
                bounded.push(block);
                remaining -= encoded;
                continue;
            }
            if (block.type !== 'text' || typeof block.text !== 'string')
                return { allowed: false, reason: 'nontext-output-budget-exceeded' };
            let low = 0;
            let high = block.text.length;
            let accepted;
            while (low <= high) {
                const middle = Math.floor((low + high) / 2);
                let end = middle;
                if (end > 0 && end < block.text.length && /[\uD800-\uDBFF]/.test(block.text[end - 1]))
                    end -= 1;
                const candidate = { ...block, text: block.text.slice(0, end) };
                if (canonicalPolicyByteLength(candidate) <= remaining) {
                    accepted = candidate;
                    low = middle + 1;
                }
                else {
                    high = middle - 1;
                }
            }
            if (accepted)
                bounded.push(accepted);
            remaining = 0;
        }
        return { allowed: true, content: bounded };
    }
    promoteUnsignedSnapshot() {
        throw new Error('unsigned native snapshot is non-promotable');
    }
}
