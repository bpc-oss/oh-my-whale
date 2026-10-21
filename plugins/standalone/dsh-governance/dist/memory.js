import { createHash } from 'node:crypto';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const MAX_EVENT_BYTES = 1024 * 1024;
const MAX_QUEUED_EVENT_BYTES = 4 * 1024 * 1024;
const MAX_QUEUED_EVENTS = 4096;
const MAX_CONTENT_CHARS = 30_000;
const MAX_DEPTH = 32;
const MAX_ITEMS = 10_000;
// The theoretical per-event product is capped again by the aggregate byte
// ceiling: every visited canonical item emits at least one byte. This avoids a
// 40M-item walk while still covering every prefix that can fit in 4 MiB.
const MAX_AGGREGATE_ITEMS = Math.min(MAX_QUEUED_EVENTS * MAX_ITEMS + 1, MAX_QUEUED_EVENT_BYTES + 1);
function identifier(value, label) {
    if (!ID.test(value))
        throw new Error(`${label} rejected`);
    return value;
}
function nonnegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${label} rejected`);
    return value;
}
function writeCanonical(value, write, itemLimit = MAX_ITEMS) {
    const active = new WeakSet();
    let items = 0;
    const visit = (item, depth) => {
        if (depth > MAX_DEPTH)
            throw new Error('memory event depth limit exceeded');
        items += 1;
        if (items > itemLimit)
            throw new Error('memory event item limit exceeded');
        if (item === null || typeof item === 'boolean') {
            write(item === null ? 'null' : String(item));
            return;
        }
        if (typeof item === 'string') {
            write(JSON.stringify(item));
            return;
        }
        if (typeof item === 'number') {
            if (!Number.isSafeInteger(item))
                throw new Error('memory event canonical number rejected');
            write(Object.is(item, -0) ? '0' : String(item));
            return;
        }
        if (typeof item !== 'object')
            throw new Error('memory event canonical value rejected');
        if (active.has(item))
            throw new Error('cyclic memory event rejected');
        active.add(item);
        try {
            if (Array.isArray(item)) {
                write('[');
                item.forEach((child, index) => { if (index > 0)
                    write(','); visit(child, depth + 1); });
                write(']');
                return;
            }
            const record = item;
            const keys = Object.keys(record).sort();
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
}
function digestEvents(events, byteLimit = MAX_EVENT_BYTES, itemLimit = MAX_ITEMS) {
    const hash = createHash('sha256');
    let bytes = 0;
    writeCanonical(events, (chunk) => {
        bytes += Buffer.byteLength(chunk, 'utf8');
        if (bytes > byteLimit)
            throw new Error('memory event byte limit exceeded');
        hash.update(chunk, 'utf8');
    }, itemLimit);
    return { digest: hash.digest('hex'), bytes };
}
function visibleMessage(eventType, value) {
    if (eventType !== 'user/message')
        return null;
    if (value === null || typeof value !== 'object')
        return null;
    const message = value;
    const role = message.role;
    if (role !== 'user')
        return null;
    const sourceKind = message.source?.kind;
    if (sourceKind !== 'user')
        return null;
    if (!Array.isArray(message.content))
        return null;
    const texts = [];
    for (const item of message.content) {
        if (item !== null && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string') {
            const text = item.text.trim();
            if (text)
                texts.push(text);
        }
    }
    return texts.length ? { role, text: texts.join('\n') } : null;
}
export function mandatoryRedact(text) {
    const credential = '[REDACTED_CREDENTIAL]';
    let result = text
        .replace(/(?<![A-Za-z0-9_])["']?(?:api[_ -]?key|access[_ -]?(?:key|token)|refresh[_ -]?token|id[_ -]?token|auth[_ -]?token|client[_ -]?secret|token|password|passwd|secret)["']?\s*[:=]\s*(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')/gi, credential)
        .replace(/\b(?:api[_ -]?key|access[_ -]?(?:key|token)|refresh[_ -]?token|id[_ -]?token|auth[_ -]?token|client[_ -]?secret|token|password|passwd|secret)\b\s*[:=]\s*[^\s,;]+/gi, credential)
        .replace(/\b(?:sk[-_]|rk_live_|hsk_|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|npm_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/g, credential)
        .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, credential)
        .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b/gi, credential)
        .replace(/\bBasic\s+[A-Za-z0-9+/]{12,}={0,2}(?![0-9A-Za-z+/=])/gi, credential)
        .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, credential)
        .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, credential)
        .replace(/\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:/?#@]+:[^\s@]+@[^\s"']+/g, credential)
        .replace(/(?:SharedAccessKey|AccountKey|AccessKeyId|SecretAccessKey|X-Amz-Signature|X-Goog-Signature|X-Goog-Credential)\s*=\s*[^;\s"']+/gi, credential)
        .replace(/[?&](?:access_token|id_token|auth_token|api_key|apikey|secret|token)=[^&\s"']+/gi, credential)
        .replace(/-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g, credential);
    result = result.replace(/\b[A-Za-z0-9+/_-]{60,}\b/g, (value) => {
        if (/^[0-9a-fA-F]+$/.test(value))
            return value;
        const counts = new Map();
        for (const character of value)
            counts.set(character, (counts.get(character) ?? 0) + 1);
        let entropy = 0;
        for (const count of counts.values()) {
            const probability = count / value.length;
            entropy -= probability * Math.log2(probability);
        }
        const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[+/_-]/]
            .filter((pattern) => pattern.test(value)).length;
        return entropy >= 4.3 && classes >= 3 ? credential : value;
    });
    return result
        .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');
}
export class DshMemoryExporter {
    options;
    events = [];
    eventSizes = [];
    content = [];
    flushTimeoutMs;
    queuedEventBytes = 0;
    contentChars = 0;
    lastSequence = null;
    terminalFault = null;
    flushing = false;
    constructor(options) {
        const binding = options.binding;
        identifier(binding.sourceClient, 'source client');
        if (!binding.project || binding.project.length > 4096 || binding.project.includes('\0'))
            throw new Error('project rejected');
        identifier(binding.sessionId, 'session id');
        identifier(binding.taskId, 'task id');
        identifier(binding.lineageId, 'lineage id');
        identifier(binding.derivedLineageId, 'derived lineage id');
        nonnegativeInteger(binding.policyGeneration, 'policy generation');
        identifier(binding.extractionVersion, 'extraction version');
        this.options = options;
        const requestedTimeout = options.flushTimeoutMs ?? 5000;
        if (!Number.isSafeInteger(requestedTimeout) || requestedTimeout <= 0) {
            throw new Error('memory export flush timeout rejected');
        }
        this.flushTimeoutMs = Math.min(requestedTimeout, 5000);
    }
    fail(error) {
        this.terminalFault = error instanceof Error ? error : new Error(String(error));
    }
    observe(event, projection) {
        if (this.terminalFault)
            throw this.terminalFault;
        const sequence = nonnegativeInteger(event.seq, 'event sequence');
        if (this.lastSequence !== null && sequence !== this.lastSequence + 1) {
            throw new Error(sequence <= this.lastSequence ? 'duplicate or out-of-order event sequence' : 'event sequence gap');
        }
        const snapshot = { data: event.data, seq: sequence, time: event.time, type: String(event.type) };
        // Validate and digest immediately; the raw event is retained only until the
        // corresponding native flush and is never sent to the external sink.
        const measured = digestEvents([snapshot]);
        if (this.events.length + 1 > MAX_QUEUED_EVENTS) {
            this.fail(new Error('memory queued event count limit exceeded'));
            throw this.terminalFault;
        }
        if (this.queuedEventBytes + measured.bytes > MAX_QUEUED_EVENT_BYTES) {
            this.fail(new Error('memory queued event byte limit exceeded'));
            throw this.terminalFault;
        }
        this.events.push(snapshot);
        this.eventSizes.push(measured.bytes);
        this.queuedEventBytes += measured.bytes;
        this.lastSequence = sequence;
        const visible = visibleMessage(snapshot.type, projection);
        if (!visible)
            return;
        const clean = mandatoryRedact(this.options.redact(mandatoryRedact(visible.text))).replaceAll('\0', '').trim();
        if (!clean)
            return;
        if (this.contentChars + clean.length > MAX_CONTENT_CHARS) {
            this.fail(new Error('memory candidate content limit exceeded'));
            throw this.terminalFault;
        }
        this.contentChars += clean.length;
        this.content.push(Object.freeze({
            role: 'user',
            source_kind: 'user',
            blocks: Object.freeze([Object.freeze({ type: 'text', text: clean })]),
        }));
    }
    removePrefix(eventCount, contentCount) {
        const removedBytes = this.eventSizes.slice(0, eventCount).reduce((sum, value) => sum + value, 0);
        const removedChars = this.content.slice(0, contentCount)
            .reduce((sum, frame) => sum + frame.blocks[0].text.length, 0);
        this.events.splice(0, eventCount);
        this.eventSizes.splice(0, eventCount);
        this.content.splice(0, contentCount);
        this.queuedEventBytes -= removedBytes;
        this.contentChars -= removedChars;
    }
    async withinDeadline(operation) {
        const controller = new AbortController();
        let timer;
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => {
                controller.abort(new Error('memory export flush deadline exceeded'));
                reject(new Error('memory export flush deadline exceeded'));
            }, this.flushTimeoutMs);
        });
        try {
            return await Promise.race([operation(controller.signal), timeout]);
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
            controller.abort();
        }
    }
    async flush() {
        if (this.terminalFault)
            throw this.terminalFault;
        if (this.flushing)
            throw new Error('concurrent memory export flush rejected');
        if (this.events.length === 0)
            return { accepted: false, reason: 'no-pending-events' };
        const eventPrefix = this.events.slice();
        const contentPrefix = this.content.slice();
        if (contentPrefix.length === 0) {
            this.removePrefix(eventPrefix.length, 0);
            return { accepted: false, reason: 'no-exportable-content' };
        }
        this.flushing = true;
        try {
            const first = eventPrefix[0];
            const last = eventPrefix[eventPrefix.length - 1];
            const binding = this.options.binding;
            const candidate = Object.freeze({
                schema_version: '1.0',
                source_client: binding.sourceClient,
                project: binding.project,
                session_id: binding.sessionId,
                task_id: binding.taskId,
                lineage_id: binding.lineageId,
                derived_lineage_id: binding.derivedLineageId,
                event_start_sequence: first.seq,
                event_end_sequence: last.seq,
                source_digest: digestEvents(eventPrefix, MAX_QUEUED_EVENT_BYTES, MAX_AGGREGATE_ITEMS).digest,
                policy_generation: binding.policyGeneration,
                privacy_class: binding.privacyClass,
                extraction_version: binding.extractionVersion,
                content: Object.freeze(contentPrefix),
            });
            const authority = await this.withinDeadline(async (signal) => {
                signal.throwIfAborted();
                const lineage = await this.options.lineageState(binding.lineageId, signal);
                signal.throwIfAborted();
                if (lineage !== 'active')
                    return { accepted: false, reason: 'lineage-abandoned' };
                signal.throwIfAborted();
                const suppressed = await this.options.isSuppressed(candidate, signal);
                signal.throwIfAborted();
                if (suppressed) {
                    return { accepted: false, reason: 'source-suppressed' };
                }
                // This sink is the bridge to the authority-owned atomic transaction.
                // The final synchronous abort guard prevents a late upstream result
                // from entering that transaction after the flush deadline.
                signal.throwIfAborted();
                const result = await this.options.sink(candidate, signal);
                signal.throwIfAborted();
                if (!result.accepted)
                    throw new Error(`memory candidate rejected: ${result.reason ?? 'unknown'}`);
                return { accepted: true };
            });
            if (!authority.accepted) {
                this.removePrefix(eventPrefix.length, contentPrefix.length);
                return { accepted: false, reason: authority.reason };
            }
            this.removePrefix(eventPrefix.length, contentPrefix.length);
            return { accepted: true, exportedThroughSequence: last.seq };
        }
        finally {
            this.flushing = false;
        }
    }
}
/** Bind only the native session feed, flush checkpoint, and message projection. */
export function bindDshMemoryExport(ctx, agent, exporter) {
    const owns = (session) => session === agent.session;
    const removeEvent = ctx.on('session/event', (session, event) => {
        if (!owns(session))
            return;
        try {
            exporter.observe(event, session.deriveEventMessage(event));
        }
        catch (error) {
            exporter.fail(error);
        }
    });
    const removeFlush = ctx.on('session/flush', async (session) => {
        if (owns(session))
            await exporter.flush();
    });
    return () => { removeFlush(); removeEvent(); };
}
