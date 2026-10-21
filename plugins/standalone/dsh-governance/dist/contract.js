export const AGENT_OS_GOVERNANCE_SERVICE = 'agentOsGovernance';
export const ADVISORY_STATUS = Object.freeze({
    assurance: 'advisory',
    policyGeneration: null,
    brokerHealth: 'not-configured',
    catalogDigest: null,
    degradationReasons: Object.freeze([
        'policy-not-configured',
        'broker-not-configured',
        'publication-before-admission-unsupported',
    ]),
});
export const UNMANAGED_STATUS = Object.freeze({
    assurance: 'unmanaged',
    policyGeneration: null,
    brokerHealth: 'unavailable',
    catalogDigest: null,
    degradationReasons: Object.freeze(['bundle-disabled-or-disposed']),
});
