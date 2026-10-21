import { createHash } from 'node:crypto';
const SHA256 = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ZERO_SHA256 = '0'.repeat(64);
const HARD_MAX_OBSERVATIONS = 4_096;
const HARD_MAX_EVENT_BYTES = 65_536;
const HARD_MAX_DEPTH = 32;
const HARD_MAX_ARRAY_ITEMS = 4_096;
const HARD_MAX_OBJECT_KEYS = 1_024;
const HARD_MAX_SCALARS = 8_192;
function canonicalJson(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value))
            throw new Error('observation canonical number rejected');
        return Object.is(value, -0) ? '0' : String(value);
    }
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (typeof value !== 'object')
        throw new Error('observation canonical value rejected');
    const record = value;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}
function digest(value) {
    return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
function boundedCanonicalDigest(value, maximumBytes) {
    const hasher = createHash('sha256');
    const active = new WeakSet();
    let byteCount = 0;
    let scalars = 0;
    const write = (chunk) => {
        const size = Buffer.byteLength(chunk, 'utf8');
        if (size > maximumBytes - byteCount)
            throw new Error('event byte bound exceeded');
        byteCount += size;
        hasher.update(chunk, 'utf8');
    };
    const scalar = () => {
        scalars += 1;
        if (scalars > HARD_MAX_SCALARS)
            throw new Error('event scalar limit exceeded');
    };
    const visit = (item, depth) => {
        if (depth > HARD_MAX_DEPTH)
            throw new Error('event depth limit exceeded');
        if (item === null || typeof item === 'boolean') {
            scalar();
            write(item === null ? 'null' : String(item));
            return;
        }
        if (typeof item === 'string') {
            scalar();
            if (item.length > maximumBytes)
                throw new Error('event string limit exceeded');
            write(JSON.stringify(item));
            return;
        }
        if (typeof item === 'number') {
            scalar();
            if (!Number.isSafeInteger(item))
                throw new Error('event canonical number rejected');
            write(Object.is(item, -0) ? '0' : String(item));
            return;
        }
        if (typeof item !== 'object')
            throw new Error('event canonical value rejected');
        if (active.has(item))
            throw new Error('cyclic event rejected');
        active.add(item);
        try {
            if (Array.isArray(item)) {
                if (item.length > HARD_MAX_ARRAY_ITEMS)
                    throw new Error('event array limit exceeded');
                write('[');
                for (let index = 0; index < item.length; index += 1) {
                    if (index > 0)
                        write(',');
                    visit(item[index], depth + 1);
                }
                write(']');
                return;
            }
            const record = item;
            const keys = [];
            for (const key in record) {
                if (!Object.prototype.hasOwnProperty.call(record, key))
                    continue;
                if (keys.length >= HARD_MAX_OBJECT_KEYS)
                    throw new Error('event object key limit exceeded');
                if (key.length > maximumBytes)
                    throw new Error('event key string limit exceeded');
                scalar();
                keys.push(key);
            }
            keys.sort();
            write('{');
            keys.forEach((key, index) => {
                if (index > 0)
                    write(',');
                write(JSON.stringify(key));
                write(':');
                visit(record[key], depth + 1);
            });
            write('}');
        }
        finally {
            active.delete(item);
        }
    };
    visit(value, 0);
    return { sha256: hasher.digest('hex'), byteCount };
}
function freeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
function identifier(value, label) {
    if (!ID.test(value))
        throw new Error(`${label} rejected`);
    return value;
}
function sha256(value, label) {
    if (!SHA256.test(value))
        throw new Error(`${label} rejected`);
    return value;
}
function positiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 1)
        throw new Error(`${label} rejected`);
    return value;
}
/**
 * A bounded in-memory digest chain.  Its outputs are always same-process claims;
 * only an external broker may turn a flushed batch into accepted evidence.
 * The class deliberately has no Session reference or append API.
 */
export class BundleObservationChain {
    taskId;
    sessionId;
    lineageId;
    brokerEpoch;
    maxObservations;
    maxEventBytes;
    parentChainHeadSha256;
    clock;
    sequenceValue = 0;
    sourceSequenceValue = 0;
    chainHeadValue = ZERO_SHA256;
    flushReceiptValue = null;
    pending = [];
    gapValue = false;
    flushInFlight = null;
    constructor(options) {
        this.taskId = identifier(options.taskId, 'task id');
        this.sessionId = identifier(options.sessionId, 'session id');
        this.lineageId = sha256(options.lineageId, 'lineage id');
        this.brokerEpoch = sha256(options.brokerEpoch, 'broker epoch');
        this.maxObservations = positiveInteger(options.maxObservations, 'observation limit');
        this.maxEventBytes = positiveInteger(options.maxEventBytes, 'event byte limit');
        if (this.maxObservations > HARD_MAX_OBSERVATIONS)
            throw new Error('observation hard ceiling exceeded');
        if (this.maxEventBytes > HARD_MAX_EVENT_BYTES)
            throw new Error('event byte hard ceiling exceeded');
        this.clock = options.clock ?? (() => new Date().toISOString());
        const checkpoint = options.checkpoint;
        if (checkpoint) {
            if (checkpoint.recordType !== 'agent-os-dsh-bundle-observation-checkpoint'
                || checkpoint.taskId !== this.taskId
                || checkpoint.sessionId !== this.sessionId
                || checkpoint.lineageId !== this.lineageId
                || checkpoint.brokerEpoch !== this.brokerEpoch)
                throw new Error('observation checkpoint task/session/lineage/epoch binding rejected');
            if (!Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 0
                || !Number.isSafeInteger(checkpoint.sourceSequence) || checkpoint.sourceSequence < 0
                || checkpoint.sequence > this.maxObservations)
                throw new Error('observation checkpoint sequence rejected');
            this.sequenceValue = checkpoint.sequence;
            this.sourceSequenceValue = checkpoint.sourceSequence;
            this.chainHeadValue = sha256(checkpoint.chainHeadSha256, 'checkpoint chain head');
            this.flushReceiptValue = sha256(checkpoint.flushReceiptSha256, 'checkpoint flush receipt');
        }
        this.parentChainHeadSha256 = null;
    }
    get pendingCount() { return this.pending.length; }
    get gapDetected() { return this.gapValue; }
    get nextSourceSequence() { return this.sourceSequenceValue + 1; }
    record(input) {
        if (this.gapValue)
            throw new Error('observation gap requires a fresh externally admitted chain');
        identifier(input.eventId, 'event id');
        positiveInteger(input.sourceSequence, 'source sequence');
        if (input.sourceSequence !== this.sourceSequenceValue + 1)
            throw new Error('duplicate, gap, or out-of-order source sequence');
        if (this.sequenceValue >= this.maxObservations)
            throw new Error('observation limit reached');
        if (!Number.isSafeInteger(input.byteCount) || input.byteCount < 0 || input.byteCount > this.maxEventBytes)
            throw new Error('event byte limit reached');
        if (!Number.isSafeInteger(input.itemCount) || input.itemCount < 0 || input.itemCount > 100_000)
            throw new Error('event item count rejected');
        sha256(input.subjectSha256, 'event subject digest');
        const observedAt = this.clock();
        if (!Number.isFinite(Date.parse(observedAt)))
            throw new Error('observation timestamp rejected');
        const unsigned = {
            recordType: 'agent-os-dsh-bundle-observation-claim',
            schemaVersion: '1.0',
            trust: 'untrusted-same-process',
            taskId: this.taskId,
            sessionId: this.sessionId,
            lineageId: this.lineageId,
            brokerEpoch: this.brokerEpoch,
            sequence: this.sequenceValue + 1,
            sourceSequence: input.sourceSequence,
            previousEnvelopeSha256: this.chainHeadValue,
            parentChainHeadSha256: this.parentChainHeadSha256,
            observedAt,
            event: {
                eventId: input.eventId,
                kind: input.kind,
                subjectSha256: input.subjectSha256,
                byteCount: input.byteCount,
                itemCount: input.itemCount,
                truncated: input.truncated,
                redaction: 'digests-only',
            },
        };
        const envelope = freeze({ ...unsigned, envelopeSha256: digest(unsigned) });
        this.sequenceValue = envelope.sequence;
        this.sourceSequenceValue = envelope.sourceSequence;
        this.chainHeadValue = envelope.envelopeSha256;
        this.flushReceiptValue = null;
        this.pending.push(envelope);
        return envelope;
    }
    async flush(sink) {
        if (this.gapValue)
            throw new Error('observation gap cannot be flushed as complete');
        if (this.flushInFlight !== null)
            throw new Error('observation flush already in progress');
        if (this.pending.length === 0)
            throw new Error('no pending observations to flush');
        const envelopes = freeze(this.pending.map((item) => item));
        const prefixLength = envelopes.length;
        const prefixHead = envelopes[envelopes.length - 1].envelopeSha256;
        const batch = freeze({
            trust: 'untrusted-same-process',
            taskId: this.taskId,
            sessionId: this.sessionId,
            lineageId: this.lineageId,
            brokerEpoch: this.brokerEpoch,
            fromSequence: envelopes[0].sequence,
            toSequence: envelopes[envelopes.length - 1].sequence,
            chainHeadSha256: prefixHead,
            gapDetected: false,
            envelopes,
        });
        const operation = Promise.resolve()
            .then(() => sink(batch))
            .then((receipt) => {
            if (receipt?.accepted !== true || !SHA256.test(receipt.flushReceiptSha256))
                throw new Error('external flush receipt rejected');
            if (this.pending.length < prefixLength
                || envelopes.some((item, index) => this.pending[index]?.envelopeSha256 !== item.envelopeSha256)) {
                this.gapValue = true;
                throw new Error('observation flush prefix drift rejected');
            }
            this.pending.splice(0, prefixLength);
            this.flushReceiptValue = this.pending.length === 0 ? receipt.flushReceiptSha256 : null;
            return freeze({ ...receipt, flushedThroughSequence: batch.toSequence });
        });
        this.flushInFlight = operation;
        try {
            return await operation;
        }
        finally {
            if (this.flushInFlight === operation)
                this.flushInFlight = null;
        }
    }
    checkpoint() {
        if (this.gapValue || this.flushInFlight !== null || this.pending.length !== 0 || this.flushReceiptValue === null)
            throw new Error('externally accepted flush checkpoint required; pending or gap is non-certifying');
        return freeze({
            recordType: 'agent-os-dsh-bundle-observation-checkpoint',
            taskId: this.taskId,
            sessionId: this.sessionId,
            lineageId: this.lineageId,
            brokerEpoch: this.brokerEpoch,
            sequence: this.sequenceValue,
            sourceSequence: this.sourceSequenceValue,
            chainHeadSha256: this.chainHeadValue,
            flushReceiptSha256: this.flushReceiptValue,
        });
    }
    fork(binding) {
        const parent = this.checkpoint();
        const child = new BundleObservationChain({
            taskId: this.taskId,
            sessionId: binding.sessionId,
            lineageId: binding.lineageId,
            brokerEpoch: this.brokerEpoch,
            maxObservations: this.maxObservations,
            maxEventBytes: this.maxEventBytes,
            clock: this.clock,
        });
        Object.defineProperty(child, 'parentChainHeadSha256', { value: parent.chainHeadSha256, enumerable: true });
        return child;
    }
    crashMarker() {
        if (this.pending.length === 0)
            throw new Error('crash marker requires unflushed observations');
        return freeze({
            taskId: this.taskId,
            sessionId: this.sessionId,
            lineageId: this.lineageId,
            brokerEpoch: this.brokerEpoch,
            lastSourceSequence: this.sourceSequenceValue,
            lostFromSequence: this.pending[0].sequence,
            lostThroughSequence: this.pending[this.pending.length - 1].sequence,
        });
    }
    static afterCrash(options) {
        const chain = new BundleObservationChain(options);
        const marker = options.crashMarker;
        if (marker.taskId !== chain.taskId || marker.sessionId !== chain.sessionId
            || marker.lineageId !== chain.lineageId || marker.brokerEpoch !== chain.brokerEpoch)
            throw new Error('crash marker binding rejected');
        chain.gapValue = true;
        chain.sourceSequenceValue = marker.lastSourceSequence;
        return chain;
    }
    static resumeWithoutCheckpoint(_binding) {
        throw new Error('authenticated flush checkpoint required for resume');
    }
}
function sessionKind(type, data) {
    // Fusion T1: dev_tool_search tool/call events are session unlocks — recorded
    // as catalog-unlock (digests-only) so the unlock source is auditable.
    if (type.includes('tool/') && isUnlockToolCall(type, data))
        return 'catalog-unlock';
    if (type.includes('tool/'))
        return 'tool-outcome';
    if (type.includes('approval'))
        return 'approval';
    if (type.includes('subagent'))
        return 'subagent';
    if (type.includes('assistant') || type.includes('request/'))
        return 'model';
    if (type.includes('step/'))
        return 'step';
    return 'session';
}
/** dev_tool_search tool/call events carry the unlock contract (toolNames). */
function isUnlockToolCall(type, data) {
    if (type !== 'tool/call')
        return false;
    if (typeof data !== 'object' || data === null)
        return false;
    const name = data.name;
    return name === 'dev_tool_search';
}
/**
 * Subscribe to native DSH events without ever calling `Session.append`.
 * The awaited `session/flush` hook drains claims only to the supplied external
 * sink; sink failure propagates so a durability gap cannot be represented as a
 * pass.
 */
export function bindBundleObservationEvents(ctx, agent, chain, sink) {
    const owns = (session) => session === agent.session;
    const record = (eventId, kind, subject, itemCount = 1) => {
        const bounded = boundedCanonicalDigest(subject, chain.maxEventBytes);
        chain.record({
            eventId,
            sourceSequence: chain.nextSourceSequence,
            kind,
            subjectSha256: bounded.sha256,
            byteCount: bounded.byteCount,
            itemCount,
            truncated: false,
        });
    };
    const removeSessionStart = ctx.on('agent/session-start', ({ agent: observed, source }) => {
        if (observed === agent)
            record(`lifecycle-${chain.nextSourceSequence}`, 'lifecycle', { source });
    });
    const removeEvent = ctx.on('session/event', (session, event) => {
        if (!owns(session))
            return;
        record(`session-${event.seq}`, sessionKind(String(event.type), event.data), { type: event.type, seq: event.seq, data: event.data });
    });
    const removeCatalog = ctx.on('tools/change', () => {
        record(`catalog-${chain.nextSourceSequence}`, 'catalog', { changed: true });
    });
    const removeFlush = ctx.on('session/flush', async (session) => {
        if (!owns(session) || chain.pendingCount === 0)
            return;
        record(`flush-${chain.nextSourceSequence}`, 'session-flush', { sessionId: String(session.id) });
        await chain.flush(sink);
    });
    return () => { removeFlush(); removeCatalog(); removeEvent(); removeSessionStart(); };
}
