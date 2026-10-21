export type ToolKind = 'native' | 'mcp';
export type Effect = 'read-only' | 'local-write' | 'external-write' | 'privileged';
export interface ToolIdentity {
    readonly kind: ToolKind;
    readonly provider: string;
    readonly tool: string;
    readonly version: string;
}
export interface CatalogTool extends ToolIdentity {
    readonly exposedName: string;
}
export interface CanonicalCatalog {
    readonly digest: string;
    readonly tools: readonly CatalogTool[];
}
export interface TrustedCapability {
    readonly capabilityId: string;
    readonly identity: ToolIdentity;
    readonly allowedEffects: readonly Effect[];
}
export type ClassifierDecision = {
    readonly status: 'classified';
    readonly effect: Effect;
} | {
    readonly status: 'unknown';
} | {
    readonly status: 'error';
};
export interface ToolCall {
    readonly callId: string;
    readonly exposedName: string;
    readonly arguments: unknown;
}
export interface RouteDecision {
    readonly allowed: boolean;
    readonly reason: string;
    readonly capabilityId?: string;
    readonly effect?: Effect;
}
export declare function compareOrdinal(left: string, right: string): number;
export declare function canonicalizeCatalog(input: readonly CatalogTool[]): CanonicalCatalog;
export declare function routeCapability(call: ToolCall, catalog: CanonicalCatalog, expectedCatalogDigest: string, trusted: TrustedCapability, classifier: ClassifierDecision): RouteDecision;
