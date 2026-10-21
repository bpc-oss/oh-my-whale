import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { createConnection } from 'node:net';
const PROTOCOL = 'AgentOS.DSH.Broker.v2';
const MAX_FRAME_BYTES = 65_536;
const RECEIPT_KEYS = [
    'address', 'brokerGeneration', 'connectionNonce', 'endpointIdentitySha256',
    'epoch', 'expiresAt', 'keyId', 'protocol', 'publicKeyHex', 'receiptSha256',
    'sameUserSecurityCeiling', 'sessionId', 'taskId',
];
function closed(value, expected, label) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted))
        throw new Error(`${label} fields are not closed`);
}
function isSha256(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
function canonicalJson(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || !Number.isSafeInteger(value))
            throw new Error('broker canonical number rejected');
        return Object.is(value, -0) ? '0' : String(value);
    }
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (typeof value !== 'object')
        throw new Error('broker canonical value rejected');
    const record = value;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}
function parseString(text, start) {
    let index = start + 1;
    while (index < text.length) {
        const char = text[index];
        if (char === '"')
            return index + 1;
        if (char === '\\') {
            index += 1;
            if (text[index] === 'u')
                index += 4;
        }
        index += 1;
    }
    throw new Error('unterminated JSON string');
}
function rejectDuplicateKeys(text) {
    let index = 0;
    const whitespace = () => { while (/\s/u.test(text[index] ?? ''))
        index += 1; };
    const value = (depth) => {
        if (depth > 32)
            throw new Error('JSON nesting limit');
        whitespace();
        const char = text[index];
        if (char === '{') {
            index += 1;
            whitespace();
            const keys = new Set();
            if (text[index] === '}') {
                index += 1;
                return;
            }
            while (true) {
                whitespace();
                if (text[index] !== '"')
                    throw new Error('JSON object key required');
                const end = parseString(text, index);
                const key = JSON.parse(text.slice(index, end));
                if (keys.has(key))
                    throw new Error(`duplicate JSON key: ${key}`);
                keys.add(key);
                index = end;
                whitespace();
                if (text[index] !== ':')
                    throw new Error('JSON colon required');
                index += 1;
                value(depth + 1);
                whitespace();
                if (text[index] === '}') {
                    index += 1;
                    return;
                }
                if (text[index] !== ',')
                    throw new Error('JSON object separator required');
                index += 1;
            }
        }
        if (char === '[') {
            index += 1;
            whitespace();
            if (text[index] === ']') {
                index += 1;
                return;
            }
            while (true) {
                value(depth + 1);
                whitespace();
                if (text[index] === ']') {
                    index += 1;
                    return;
                }
                if (text[index] !== ',')
                    throw new Error('JSON array separator required');
                index += 1;
            }
        }
        if (char === '"') {
            index = parseString(text, index);
            return;
        }
        const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(index));
        if (!match)
            throw new Error('invalid JSON scalar');
        index += match[0].length;
    };
    value(0);
    whitespace();
    if (index !== text.length)
        throw new Error('trailing JSON data');
}
function parseObject(payload) {
    const text = payload.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(payload))
        throw new Error('broker frame UTF-8 rejected');
    rejectDuplicateKeys(text);
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('broker frame root must be object');
    return value;
}
function encodeFrame(value) {
    const payload = Buffer.from(JSON.stringify(value));
    if (payload.length < 2 || payload.length > MAX_FRAME_BYTES)
        throw new Error('broker frame size rejected');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length);
    return Buffer.concat([header, payload]);
}
class FrameReader {
    stream;
    buffer = Buffer.alloc(0);
    frames = [];
    waiters = [];
    failed;
    constructor(stream) {
        this.stream = stream;
        stream.on('data', (chunk) => this.ingest(chunk));
        stream.on('error', (error) => this.fail(error));
        stream.on('close', () => this.fail(new Error('broker channel closed')));
    }
    ingest(chunk) {
        try {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            if (this.buffer.length > MAX_FRAME_BYTES + 4)
                throw new Error('broker frame buffer limit');
            while (this.buffer.length >= 4) {
                const length = this.buffer.readUInt32BE(0);
                if (length < 2 || length > MAX_FRAME_BYTES)
                    throw new Error('broker frame size rejected');
                if (this.buffer.length < length + 4)
                    return;
                const frame = parseObject(this.buffer.subarray(4, length + 4));
                this.buffer = this.buffer.subarray(length + 4);
                const waiter = this.waiters.shift();
                if (waiter)
                    waiter.resolve(frame);
                else
                    this.frames.push(frame);
            }
        }
        catch (error) {
            this.fail(error instanceof Error ? error : new Error('broker frame rejected'));
        }
    }
    fail(error) {
        if (this.failed)
            return;
        this.failed = error;
        for (const waiter of this.waiters.splice(0))
            waiter.reject(error);
    }
    async read(timeoutMs) {
        if (this.failed)
            throw this.failed;
        const frame = this.frames.shift();
        if (frame)
            return frame;
        return new Promise((resolve, reject) => {
            const waiter = { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } };
            const timer = setTimeout(() => {
                const index = this.waiters.indexOf(waiter);
                if (index >= 0)
                    this.waiters.splice(index, 1);
                reject(new Error('broker frame timeout'));
            }, timeoutMs);
            this.waiters.push(waiter);
        });
    }
}
function validateReceipt(receipt) {
    closed(receipt, RECEIPT_KEYS, 'activation receipt');
    if (receipt.protocol !== PROTOCOL || receipt.sameUserSecurityCeiling !== 'cooperative-not-adversarial')
        throw new Error('activation receipt type confusion');
    for (const value of [receipt.receiptSha256, receipt.epoch, receipt.endpointIdentitySha256, receipt.keyId])
        if (!isSha256(value))
            throw new Error('activation receipt hash rejected');
    if (!/^[0-9a-f]{16,128}$/.test(receipt.connectionNonce))
        throw new Error('activation connection nonce rejected');
    for (const value of [receipt.taskId, receipt.sessionId])
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value))
            throw new Error('activation identity rejected');
    if (!/^04[0-9a-f]{128}$/.test(receipt.publicKeyHex))
        throw new Error('activation public key rejected');
    const actualKeyId = createHash('sha256').update(Buffer.from(receipt.publicKeyHex, 'hex')).digest('hex');
    if (actualKeyId !== receipt.keyId)
        throw new Error('activation key id mismatch');
    if (!receipt.address.startsWith(String.raw `\\.\pipe\AgentOS-DSH-`) || !/^[0-9a-f]{64}$/.test(receipt.address.slice(-64)))
        throw new Error('activation pipe address rejected');
    const endpoint = createHash('sha256').update([PROTOCOL, receipt.taskId, receipt.epoch, String(receipt.brokerGeneration), receipt.address].join('\0')).digest('hex');
    if (endpoint !== receipt.endpointIdentitySha256)
        throw new Error('activation endpoint mismatch');
    const expiresAt = Date.parse(receipt.expiresAt);
    if (!Number.isSafeInteger(receipt.brokerGeneration) || receipt.brokerGeneration < 1 || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
        throw new Error('activation receipt expired');
    return expiresAt;
}
function verifyChallenge(challenge, receipt) {
    closed(challenge, [
        'broker_generation', 'challenge_nonce', 'endpoint_identity_sha256', 'epoch', 'key_id',
        'kind', 'protocol', 'public_key_hex', 'same_user_security_ceiling', 'signature',
    ], 'broker challenge');
    if (challenge.kind !== 'challenge' || challenge.protocol !== PROTOCOL
        || challenge.epoch !== receipt.epoch || challenge.broker_generation !== receipt.brokerGeneration
        || challenge.endpoint_identity_sha256 !== receipt.endpointIdentitySha256
        || challenge.key_id !== receipt.keyId || challenge.public_key_hex !== receipt.publicKeyHex
        || challenge.same_user_security_ceiling !== receipt.sameUserSecurityCeiling
        || typeof challenge.challenge_nonce !== 'string' || !/^[0-9a-f]{64}$/.test(challenge.challenge_nonce)
        || typeof challenge.signature !== 'string' || !/^[0-9a-f]{128}$/.test(challenge.signature))
        throw new Error('broker challenge binding rejected');
    const record = {
        protocol: PROTOCOL, record_type: 'agent-os-dsh-broker-challenge', schema_version: '1.0',
        issuer: 'agent-os-host', audience: 'agent-os-dsh-bundle', key_id: receipt.keyId,
        epoch: receipt.epoch,
        body: { challenge_nonce: challenge.challenge_nonce, endpoint_identity_sha256: receipt.endpointIdentitySha256, broker_generation: receipt.brokerGeneration },
    };
    const spkiPrefix = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
    const key = createPublicKey({ key: Buffer.concat([spkiPrefix, Buffer.from(receipt.publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    const valid = verify('sha256', Buffer.from(canonicalJson(record)), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(challenge.signature, 'hex'));
    if (!valid)
        throw new Error('broker challenge signature rejected');
}
async function waitConnected(stream, timeoutMs) {
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('broker connect timeout')), timeoutMs);
        stream.once('connect', () => { clearTimeout(timer); resolve(); });
        stream.once('error', (error) => { clearTimeout(timer); reject(error); });
    });
}
export class BrokerClient {
    receipt;
    stream;
    reader;
    channelId;
    timeoutMs;
    allowed;
    busy = false;
    closed = false;
    constructor(receipt, stream, reader, channelId, timeoutMs, allowed) {
        this.receipt = receipt;
        this.stream = stream;
        this.reader = reader;
        this.channelId = channelId;
        this.timeoutMs = timeoutMs;
        this.allowed = allowed;
    }
    static async connect(receipt, options = {}) {
        const receiptExpiresAt = validateReceipt(receipt);
        const timeoutMs = options.timeoutMs ?? 5_000;
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
            throw new Error('broker timeout rejected');
        const stream = options.connector?.(receipt.address) ?? createConnection(receipt.address);
        const reader = new FrameReader(stream);
        try {
            await waitConnected(stream, timeoutMs);
            const challenge = await reader.read(timeoutMs);
            verifyChallenge(challenge, receipt);
            stream.write(encodeFrame({
                kind: 'authenticate', protocol: PROTOCOL, receipt_sha256: receipt.receiptSha256,
                task_id: receipt.taskId, session_id: receipt.sessionId, epoch: receipt.epoch,
                broker_generation: receipt.brokerGeneration, endpoint_identity_sha256: receipt.endpointIdentitySha256,
                challenge_nonce: challenge.challenge_nonce, connection_nonce: receipt.connectionNonce,
            }));
            const authenticated = await reader.read(timeoutMs);
            closed(authenticated, [
                'allowed_operations', 'authenticated', 'broker_generation', 'channel_id',
                'effect_authorization', 'epoch', 'expires_at', 'kind', 'protocol',
            ], 'broker authentication');
            const serverExpiresAt = Date.parse(String(authenticated.expires_at));
            if (authenticated.kind !== 'authenticated' || authenticated.protocol !== PROTOCOL
                || authenticated.authenticated !== true || authenticated.epoch !== receipt.epoch
                || authenticated.broker_generation !== receipt.brokerGeneration
                || !isSha256(authenticated.channel_id)
                || !Array.isArray(authenticated.allowed_operations) || !authenticated.allowed_operations.includes('status')
                || authenticated.effect_authorization !== 'unsupported-pinned-dispatch'
                || !Number.isFinite(serverExpiresAt) || serverExpiresAt <= Date.now()
                || serverExpiresAt > receiptExpiresAt)
                throw new Error('broker authentication binding rejected');
            return new BrokerClient(receipt, stream, reader, authenticated.channel_id, timeoutMs, authenticated.allowed_operations);
        }
        catch (error) {
            stream.destroy();
            throw error;
        }
    }
    authorizeEffect() {
        return Object.freeze({ ok: false, code: 'PINNED_DISPATCH_UNSUPPORTED' });
    }
    assertAllowed(operation) {
        if (!this.allowed.includes(operation))
            throw new Error(`operation not allowed: ${operation}`);
    }
    submitCompletion(claim, signal) {
        this.assertAllowed('submit-completion');
        return this.request('submit-completion', claim, signal);
    }
    flushObservations(payload, signal) {
        this.assertAllowed('flush-observations');
        return this.request('flush-observations', payload, signal);
    }
    flushMemory(payload, signal) {
        this.assertAllowed('flush-memory');
        return this.request('flush-memory', payload, signal);
    }
    idempotencyStatus(targetRequestId, signal) {
        this.assertAllowed('idempotency-status');
        return this.request('idempotency-status', { target_request_id: targetRequestId }, signal);
    }
    status(signal) {
        return this.request('status', {}, signal);
    }
    verifyHostReview(payload, signal) {
        closed(payload, ['attestation_sha256', 'phase', 'review_sha256', 'reviewed_diff_sha256'], 'host review');
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(payload.phase) || ![payload.review_sha256, payload.attestation_sha256, payload.reviewed_diff_sha256].every(isSha256))
            throw new Error('host review binding rejected');
        return this.request('verify-host-review', { ...payload }, signal);
    }
    async request(operation, payload, signal) {
        if (this.closed)
            throw new Error('broker client closed');
        if (this.busy)
            throw new Error('concurrent broker request rejected');
        if (signal?.aborted)
            throw new Error('broker request cancelled');
        this.busy = true;
        const requestId = randomBytes(32).toString('hex');
        let removeAbort;
        try {
            this.stream.write(encodeFrame({
                kind: 'request', protocol: PROTOCOL, channel_id: this.channelId,
                epoch: this.receipt.epoch, broker_generation: this.receipt.brokerGeneration,
                request_id: requestId, operation, payload,
            }));
            const aborted = new Promise((_resolve, reject) => {
                if (!signal)
                    return;
                const listener = () => { this.stream.destroy(); reject(new Error('broker request cancelled')); };
                signal.addEventListener('abort', listener, { once: true });
                removeAbort = () => signal.removeEventListener('abort', listener);
                if (signal.aborted)
                    listener();
            });
            const response = await Promise.race([this.reader.read(this.timeoutMs), aborted]);
            if (response.request_id !== requestId || typeof response.ok !== 'boolean' || typeof response.code !== 'string')
                throw new Error('broker response binding rejected');
            if (operation === 'status')
                closed(response, ['code', 'degradation_reasons', 'ok', 'request_id', 'status'], 'broker status response');
            else if (operation === 'verify-host-review')
                closed(response, ['code', 'ok', 'request_id'], 'broker host review response');
            return Object.freeze(response);
        }
        catch (error) {
            this.closed = true;
            this.stream.destroy();
            throw error;
        }
        finally {
            removeAbort?.();
            this.busy = false;
        }
    }
    close() {
        if (!this.closed) {
            this.closed = true;
            this.stream.destroy();
        }
    }
}
