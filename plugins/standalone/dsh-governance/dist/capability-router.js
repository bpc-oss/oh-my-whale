import { createHash } from 'node:crypto';
function closedString(value, field) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value)) {
        throw new Error(`invalid catalog ${field}`);
    }
    return value;
}
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const record = value;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
export function compareOrdinal(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
export function canonicalizeCatalog(input) {
    const tools = input.map((item) => Object.freeze({
        exposedName: closedString(item.exposedName, 'exposedName'),
        kind: item.kind === 'native' || item.kind === 'mcp' ? item.kind : (() => { throw new Error('invalid catalog kind'); })(),
        provider: closedString(item.provider, 'provider'),
        tool: closedString(item.tool, 'tool'),
        version: closedString(item.version, 'version'),
    })).sort((a, b) => compareOrdinal(a.exposedName, b.exposedName) || compareOrdinal(a.kind, b.kind) || compareOrdinal(a.provider, b.provider) || compareOrdinal(a.tool, b.tool) || compareOrdinal(a.version, b.version));
    for (let index = 1; index < tools.length; index += 1) {
        if (tools[index - 1].exposedName === tools[index].exposedName) {
            throw new Error(`shadowed tool: ${tools[index].exposedName}`);
        }
    }
    const frozen = Object.freeze(tools);
    return Object.freeze({
        tools: frozen,
        digest: createHash('sha256').update(canonicalJson(frozen), 'utf8').digest('hex'),
    });
}
function sameIdentity(left, right) {
    return left.kind === right.kind && left.provider === right.provider && left.tool === right.tool && left.version === right.version;
}
export function routeCapability(call, catalog, expectedCatalogDigest, trusted, classifier) {
    if (catalog.digest !== expectedCatalogDigest)
        return { allowed: false, reason: 'catalog-drift' };
    if (typeof call.arguments !== 'object' || call.arguments === null || Array.isArray(call.arguments)) {
        return { allowed: false, reason: 'invalid-arguments' };
    }
    const observed = catalog.tools.find((item) => item.exposedName === call.exposedName);
    if (!observed || !sameIdentity(observed, trusted.identity))
        return { allowed: false, reason: 'untrusted-tool-identity' };
    if (classifier.status === 'error')
        return { allowed: false, reason: 'classifier-error' };
    if (classifier.status === 'unknown')
        return { allowed: false, reason: 'unknown-effect' };
    if (!trusted.allowedEffects.includes(classifier.effect))
        return { allowed: false, reason: 'effect-not-authorized' };
    return { allowed: true, reason: 'trusted-intersection', capabilityId: trusted.capabilityId, effect: classifier.effect };
}
