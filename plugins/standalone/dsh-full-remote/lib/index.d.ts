import Schema from "@deepseek-ai/schemastery";
import { IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
//#region src/tunnel.d.ts
type TunnelState = 'off' | 'starting' | 'online' | 'error';
interface TunnelStatus {
  state: TunnelState;
  publicUrl?: string;
  /** Progress stage while starting; an error token when state is 'error'. */
  detail?: string;
}
interface TunnelManager {
  status(): TunnelStatus;
  start(): Promise<TunnelStatus>;
  stop(): Promise<TunnelStatus>;
}
interface TunnelManagerOptions {
  /** URL the tunnel forwards to (the proxy listener); evaluated at each start. */
  target: () => string;
  /** Explicit cloudflared path from config; checked first when non-empty. */
  configuredPath?: string;
  /** Directory holding the downloaded binary cache. */
  cacheDir: string;
  spawnFn?: typeof spawn;
  fetchFn?: typeof fetch;
  audit?: (event: string, fields?: Record<string, unknown>) => void;
  log?: (message: string) => void;
}
declare function createTunnelManager(options: TunnelManagerOptions): TunnelManager;
//#endregion
//#region src/config.d.ts
/** Public Schemastery schema for the reverse-proxy plugin. */
declare const Config: Schema<Schemastery.ObjectS<{
  listenHost: Schema<string, string>;
  listenPort: Schema<number, number>;
  backendHost: Schema<string, string>;
  backendPort: Schema<number, number>;
  cloudflaredPath: Schema<string, string>;
  stateFile: Schema<string, string>;
  autoRestore: Schema<boolean, boolean>;
  maxRequestBytes: Schema<number, number>;
  upstreamTimeoutMs: Schema<number, number>;
  sessionMaxAgeSeconds: Schema<number, number>;
  sessionIdleSeconds: Schema<number, number>;
  cookieName: Schema<string, string>;
  maxHeaderSizeBytes: Schema<number, number>;
  headersTimeoutMs: Schema<number, number>;
  requestTimeoutMs: Schema<number, number>;
  keepAliveTimeoutMs: Schema<number, number>;
  loginDelayMs: Schema<number, number>;
  loginMaxAttempts: Schema<number, number>;
  loginLockoutSeconds: Schema<number, number>;
  upgradeMaxAttempts: Schema<number, number>;
  upgradeLockoutSeconds: Schema<number, number>;
  approvalMode: Schema<boolean, boolean>;
  maxSessions: Schema<number, number>;
  logRequests: Schema<boolean, boolean>;
  auditLog: Schema<boolean, boolean>;
  auditLogFile: Schema<string, string>;
  allowedCidrs: Schema<string[], string[]>;
  allowTokenRead: Schema<boolean, boolean>;
  tlsCertFile: Schema<string, string>;
  tlsKeyFile: Schema<string, string>;
  trustForwardedProto: Schema<boolean, boolean>;
  trustForwardedFor: Schema<boolean, boolean>;
  trustCloudflareConnectingIp: Schema<boolean, boolean>;
  compressResponses: Schema<boolean, boolean>;
  cacheHashedAssets: Schema<boolean, boolean>;
}>, Schemastery.ObjectT<{
  listenHost: Schema<string, string>;
  listenPort: Schema<number, number>;
  backendHost: Schema<string, string>;
  backendPort: Schema<number, number>;
  cloudflaredPath: Schema<string, string>;
  stateFile: Schema<string, string>;
  autoRestore: Schema<boolean, boolean>;
  maxRequestBytes: Schema<number, number>;
  upstreamTimeoutMs: Schema<number, number>;
  sessionMaxAgeSeconds: Schema<number, number>;
  sessionIdleSeconds: Schema<number, number>;
  cookieName: Schema<string, string>;
  maxHeaderSizeBytes: Schema<number, number>;
  headersTimeoutMs: Schema<number, number>;
  requestTimeoutMs: Schema<number, number>;
  keepAliveTimeoutMs: Schema<number, number>;
  loginDelayMs: Schema<number, number>;
  loginMaxAttempts: Schema<number, number>;
  loginLockoutSeconds: Schema<number, number>;
  upgradeMaxAttempts: Schema<number, number>;
  upgradeLockoutSeconds: Schema<number, number>;
  approvalMode: Schema<boolean, boolean>;
  maxSessions: Schema<number, number>;
  logRequests: Schema<boolean, boolean>;
  auditLog: Schema<boolean, boolean>;
  auditLogFile: Schema<string, string>;
  allowedCidrs: Schema<string[], string[]>;
  allowTokenRead: Schema<boolean, boolean>;
  tlsCertFile: Schema<string, string>;
  tlsKeyFile: Schema<string, string>;
  trustForwardedProto: Schema<boolean, boolean>;
  trustForwardedFor: Schema<boolean, boolean>;
  trustCloudflareConnectingIp: Schema<boolean, boolean>;
  compressResponses: Schema<boolean, boolean>;
  cacheHashedAssets: Schema<boolean, boolean>;
}>>;
/** Validated plugin config: every field carries its Schema default. */
type RuntimeConfig = ReturnType<typeof Config>;
//#endregion
//#region src/runtime-types.d.ts
/** Stable status shape shared by the runtime and loopback control surface. */
interface RuntimeStatus {
  enabled: boolean;
  running: boolean;
  target: string;
  backend: string;
  listen: {
    host: string;
    port: number;
  };
  bound: {
    host: string;
    port: number;
  };
  reachables: string[];
  wildcard: boolean;
  approvalMode: boolean;
  tls: boolean;
  auditLog: boolean;
  trustForwardedFor: boolean;
  reason?: string;
  tunnel: TunnelStatus;
}
//#endregion
//#region src/index-enhancements.d.ts
declare function injectViewport(html: string): string;
/**
 * Inject the small browser compatibility/bootstrap payload into the host
 * index. This transform is deliberately pure and idempotent because the
 * host may invoke index taps more than once during a reload.
 */
declare function injectIndexEnhancements(html: string): string;
//#endregion
//#region src/index.d.ts
declare const name = "reverse-proxy";
declare const inject: string[];
/**
 * The subset of the Cordis context plus the `webServer` service this host
 * entry consumes. Declared structurally so the plugin typechecks without
 * depending on `@deepseek-ai/dsh-host-webserver`.
 */
interface RuntimeContext {
  logger: {
    warn(message: string | Error): void;
    info(message: string): void;
    debug(message: string): void;
  };
  get?(name: string): unknown;
  webServer: {
    readonly port: number;
    register(route: {
      kind: 'exact' | 'prefix';
      path: string;
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): () => void;
    tapIndex(transform: (html: string) => string): () => void;
  };
  effect(effect: () => () => void | Promise<void>, label?: string): unknown;
}
/** Injectable runtime dependencies; tests replace the tunnel factory. */
interface RuntimeDeps {
  createTunnel?: typeof createTunnelManager;
}
declare function createRuntime(ctx: RuntimeContext, config: RuntimeConfig, deps?: RuntimeDeps): {
  restore: () => Promise<void>;
  dispose: () => Promise<void>;
  status: () => Promise<RuntimeStatus>;
  start: () => Promise<RuntimeStatus>;
  stop: () => Promise<RuntimeStatus>;
  token: () => Promise<string>;
  rotateToken: () => Promise<{
    accessToken: string;
    enabled: boolean;
    running: boolean;
    target: string;
    backend: string;
    listen: {
      host: string;
      port: number;
    };
    bound: {
      host: string;
      port: number;
    };
    reachables: string[];
    wildcard: boolean;
    approvalMode: boolean;
    tls: boolean;
    auditLog: boolean;
    trustForwardedFor: boolean;
    reason?: string;
    tunnel: TunnelStatus;
  }>;
  setListen: (host: unknown, port: unknown) => Promise<RuntimeStatus>;
  selfCheck: () => Promise<{
    running: boolean;
    fence: {
      ok: boolean;
      method: string;
      status: number;
      rewriteAuthority: string;
      detail?: string;
    };
    tls: boolean;
    auditLog: boolean;
    allowTokenRead: boolean;
    trustForwardedFor: boolean;
  }>;
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};
/**
 * Publish an authenticated local reverse-proxy endpoint for any tunnel client.
 */
declare function apply(ctx: RuntimeContext, config: RuntimeConfig): void;
//#endregion
export { Config, type RuntimeConfig, RuntimeDeps, apply, createRuntime, inject, injectIndexEnhancements, injectViewport, name };
//# sourceMappingURL=index.d.ts.map