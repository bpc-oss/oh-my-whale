import { createBackendAuth } from "./backend-auth.mjs";
import { access, appendFile, chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import Schema from "@deepseek-ai/schemastery";
import { createServer, request } from "node:http";
import { createServer as createServer$1 } from "node:https";
import { createGzip, gunzipSync } from "node:zlib";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { homedir, networkInterfaces } from "node:os";
import { isIP } from "node:net";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { renderSVG } from "uqr";
//#endregion
//#region src/config.ts
/** Public Schemastery schema for the reverse-proxy plugin. */
const Config = Schema.object({
	listenHost: Schema.string().default("127.0.0.1").description("Default bind address. 0.0.0.0 / :: bind every interface but are not copyable destinations — the panel reports a reachable address separately. Prefer a concrete LAN IP for phone-on-WiFi. The UI can override this at runtime."),
	listenPort: Schema.number().min(0).max(65535).default(3081).description("Default local tunnel target port; 0 chooses a free port; the UI can override it at runtime."),
	backendHost: Schema.string().default("127.0.0.1").description("DeepSeek Harness Web backend host. Must be a loopback address, not a wildcard (0.0.0.0 / ::). TCP connects here; Host/Origin rewrite always uses 127.0.0.1 regardless."),
	backendPort: Schema.number().min(0).max(65535).default(0).description("DeepSeek Harness Web backend port; 0 follows webServer.port."),
	cloudflaredPath: Schema.string().default("").description("Optional explicit path to a cloudflared binary for the one-click quick tunnel. When empty the tunnel resolves the binary via PATH, then a pinned, SHA256-verified download cache under the state file directory."),
	stateFile: Schema.string().default("").description("Durable state file; empty uses $DSH_HOME/reverse-proxy.json."),
	autoRestore: Schema.boolean().default(true).description("Restore the last enabled state after DeepSeek Harness restarts."),
	maxRequestBytes: Schema.number().min(1024).default(167772160).description("Maximum request body size. Default 160 MiB matches the Harness /api bridge so remote vision image RPCs (DeepSeek-V4-Flash-Vision-Exp) are not 413d before the backend."),
	upstreamTimeoutMs: Schema.number().min(1e3).default(15e3).description("Timeout while connecting TCP to the DeepSeek Harness backend, and (for POST/PUT/etc.) waiting for the first response byte after the client finishes sending the body. Does not cover body transfer itself, and is not applied to GET/HEAD (SSE)."),
	sessionMaxAgeSeconds: Schema.number().min(60).default(2592e3).description("Absolute lifetime of a device session from creation (and legacy idle window when sessionIdleSeconds is 0)."),
	sessionIdleSeconds: Schema.number().min(0).default(0).description("Inactivity timeout in seconds (0 = disabled; uses lastSeenAt). When set, sessions expire after this idle window independently of sessionMaxAgeSeconds."),
	cookieName: Schema.string().default("dsh_reverse_proxy_session").description("Authentication session cookie name."),
	maxHeaderSizeBytes: Schema.number().min(1024).default(16384).description("Maximum HTTP header size accepted by the proxy."),
	headersTimeoutMs: Schema.number().min(1e3).default(15e3).description("Timeout for a client to send a complete request head. Must not exceed requestTimeoutMs."),
	requestTimeoutMs: Schema.number().min(1e3).default(3e5).description("Timeout for a complete request (headers plus body) accepted by the proxy. The effective request timeout is at least headersTimeoutMs. Default 5 minutes covers large remote vision uploads."),
	keepAliveTimeoutMs: Schema.number().min(1e3).default(5e3).description("Keep-alive timeout for idle proxy connections."),
	loginDelayMs: Schema.number().min(0).max(1e4).default(250).description("Fixed delay after a failed login, slowing token guessing."),
	loginMaxAttempts: Schema.number().min(1).default(5).description("Failed login attempts per remote IP before that IP is locked out."),
	loginLockoutSeconds: Schema.number().min(10).default(300).description("Lockout duration for a remote IP that exceeded loginMaxAttempts."),
	upgradeMaxAttempts: Schema.number().min(1).default(10).description("Failed WebSocket upgrade attempts per remote IP before that IP is locked out."),
	upgradeLockoutSeconds: Schema.number().min(10).default(300).description("Lockout duration for a remote IP that exceeded upgradeMaxAttempts."),
	approvalMode: Schema.boolean().default(false).description("Require local approval for every new device before it can reach DeepSeek Harness."),
	maxSessions: Schema.number().min(1).max(64).default(16).description("Maximum concurrent device sessions; the stalest session is evicted past this cap."),
	logRequests: Schema.boolean().default(false).description("Log every proxied request at debug level."),
	auditLog: Schema.boolean().default(true).description("Append structured JSONL audit events (login, approve, revoke, rotate, token reveal) next to the state file."),
	auditLogFile: Schema.string().default("").description("Audit JSONL path; empty uses <stateFile without .json>.audit.jsonl."),
	allowedCidrs: Schema.array(Schema.string()).default([]).description("Optional remote IP allowlist (CIDR or bare IP). Empty = allow all authenticated clients. Loopback is always allowed."),
	allowTokenRead: Schema.boolean().default(false).description("When true, GET /token reveals the standing access token over loopback. Keep false unless local tooling requires token re-read; rotate-token always returns the replacement token."),
	tlsCertFile: Schema.string().default("").description("Optional PEM certificate path for local TLS on the proxy listen port (pair with tlsKeyFile). Empty = plain HTTP."),
	tlsKeyFile: Schema.string().default("").description("Optional PEM private key path for local TLS (pair with tlsCertFile)."),
	trustForwardedProto: Schema.boolean().default(false).description("When true, trust inbound X-Forwarded-Proto from a reverse-edge for Secure cookies and upstream proto. Leave false unless a trusted TLS terminator sits in front."),
	trustForwardedFor: Schema.boolean().default(false).description("When true and the direct peer is loopback, derive the remote client IP for CIDR / rate limiting / audit from the rightmost X-Forwarded-For value (loopback and malformed values are never trusted). Only enable behind a trusted local tunnel/edge that appends this header; do not enable for LAN direct access."),
	trustCloudflareConnectingIp: Schema.boolean().default(false).description("When true and the direct peer is loopback, also trust Cloudflare's CF-Connecting-IP header. Enable only for a local Cloudflare connector; other tunnels can relay a client-supplied CF header unchanged."),
	compressResponses: Schema.boolean().default(true).description("When true, gzip compressible HTTP responses (HTML/JS/CSS/JSON/SVG) for clients that send Accept-Encoding: gzip. SSE, WebSocket, fonts, already-encoded bodies, and responses under 1 KB are not compressed."),
	cacheHashedAssets: Schema.boolean().default(true).description("When true, add Cache-Control: public, max-age=31536000, immutable on successful hashed /assets/* responses that have no upstream cache header. index.html and /api are never cached.")
});
//#endregion
//#region src/security.ts
/**
* security — credential primitives.
*
* Token generation, constant-time comparison, and cookie parsing. HTML
* escaping lives in http-util.js (it is output plumbing, not a secret).
*/
const TOKEN_BYTES = 24;
/** Generate a URL-safe access token with enough entropy for public tunnels. */
function generateAccessToken() {
	return randomBytes(TOKEN_BYTES).toString("base64url");
}
/** Compare secrets without leaking a useful length or prefix timing signal. */
function safeEqual(actual, expected) {
	const left = Buffer.from(String(actual));
	const right = Buffer.from(String(expected));
	if (left.length !== right.length) {
		timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
		return false;
	}
	return timingSafeEqual(left, right);
}
function parseCookies(header) {
	const cookies = {};
	for (const field of String(header ?? "").split(";")) {
		const at = field.indexOf("=");
		if (at < 1) continue;
		const key = field.slice(0, at).trim();
		const value = field.slice(at + 1).trim();
		if (key.length > 0) cookies[key] = value;
	}
	return cookies;
}
//#endregion
//#region src/sessions.ts
/**
* sessions — per-device session store.
*
* Owns the device credential lifecycle (login/validate/approve/revoke,
* expiry, cap eviction, persistence shapes) plus the User-Agent label
* derivation. Pure in-memory and synchronous: the host persists via
* serialize()/hydrate() and the onChange callback.
*/
/**
* Per-device session store for the reverse proxy.
*
* Every device that logs in with the access token gets its OWN session
* credential: an id + a random 192-bit secret held only in that device's
* cookie. The state file stores only the secret's hash, so revoking one
* device never affects the others and the master access token stays out of
* the cookies entirely.
*
* The store is deliberately synchronous in-memory: the host owns
* persistence and passes hydrate()/serialize() data around; every mutation
* that matters is surfaced through the onChange callback (the host
* debounces state writes).
*/
const ID_BYTES = 16;
const SECRET_BYTES = 24;
function newSessionSecret() {
	return randomBytes(SECRET_BYTES).toString("base64url");
}
/** Thrown when approval mode has reached its hard session admission limit. */
var SessionCapacityError = class extends Error {
	constructor() {
		super("session capacity reached");
		this.name = "SessionCapacityError";
	}
};
function newSessionId() {
	return randomBytes(ID_BYTES).toString("base64url");
}
function validSessionIp(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : void 0;
}
function hashSessionSecret(secret) {
	return createHash("sha256").update(`dsh-reverse-proxy/session-secret/v1\0${secret}`).digest("base64url");
}
function encodeSessionCookie(id, secret) {
	return `${id}.${secret}`;
}
/** Session Set-Cookie (login or expiry). Logout must repeat `Secure` when the original cookie had it, or HTTPS browsers keep the old cookie. */
function sessionCookie(name, value, options) {
	return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${options.maxAgeSeconds}${options.secure ? "; Secure" : ""}`;
}
/** Split a cookie value; returns undefined for malformed input. */
function decodeSessionCookie(value) {
	const text = String(value ?? "");
	const at = text.indexOf(".");
	if (at < 1 || at === text.length - 1) return void 0;
	return {
		id: text.slice(0, at),
		secret: text.slice(at + 1)
	};
}
const BROWSERS = [
	[/Edg\//, "Edge"],
	[/OPR\/|\bOpera\b/i, "Opera"],
	[/Firefox\//, "Firefox"],
	[/Chrome\//, "Chrome"],
	[/Safari\//, "Safari"]
];
const OSES = [
	[/iPhone|iPad|iPod/, "iOS"],
	[/Android/, "Android"],
	[/Mac OS X|Macintosh/, "macOS"],
	[/Windows NT/, "Windows"],
	[/Linux/, "Linux"]
];
/** Derive a short human label from a User-Agent string. */
function deviceLabel(userAgent, fallback = "Unknown device") {
	const ua = String(userAgent ?? "").slice(0, 256);
	if (ua === "") return fallback;
	const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
	const os = OSES.find(([pattern]) => pattern.test(ua))?.[1];
	if (browser === void 0 && os === void 0) return fallback;
	return `${browser ?? "Browser"} on ${os ?? "unknown OS"}`;
}
/**
* @param {{
*   maxSessions?: number,
*   maxAgeSeconds?: number,
*   idleSeconds?: number,
*   approvalRequired?: boolean,
*   onChange?: () => void,
*   now?: () => number,
* }} options
*/
function createSessionStore(options = {}) {
	const maxSessions = options.maxSessions ?? 16;
	const maxAgeSeconds = options.maxAgeSeconds ?? 2592e3;
	const idleSeconds = options.idleSeconds ?? 0;
	const approvalRequired = options.approvalRequired === true;
	const onChange = options.onChange;
	const now = options.now ?? Date.now;
	const maxAgeMs = maxAgeSeconds * 1e3;
	const idleMs = idleSeconds > 0 ? idleSeconds * 1e3 : 0;
	/** @type {Map<string, { id: string, secretHash: string, label: string, status: 'active'|'pending'|'rejected', createdAt: number, lastSeenAt: number }>} */
	const sessions = /* @__PURE__ */ new Map();
	const changed = () => {
		onChange?.();
	};
	const expired = (session, at = now()) => {
		if (at - session.createdAt > maxAgeMs) return true;
		if (idleMs > 0 && at - session.lastSeenAt > idleMs) return true;
		if (idleMs === 0 && at - session.lastSeenAt > maxAgeMs) return true;
		return false;
	};
	const sweep = (at = now()) => {
		for (const [id, session] of sessions) if (expired(session, at)) sessions.delete(id);
	};
	/** Evict the entry with the oldest lastSeenAt, never the protected id. */
	const evictOldest = (exceptId) => {
		let oldest;
		for (const entry of sessions) {
			if (entry[0] === exceptId) continue;
			if (oldest === void 0 || entry[1].lastSeenAt < oldest[1].lastSeenAt) oldest = entry;
		}
		if (oldest !== void 0) sessions.delete(oldest[0]);
	};
	const publicShape = (session) => ({
		id: session.id,
		label: session.label,
		status: session.status,
		createdAt: session.createdAt,
		lastSeenAt: session.lastSeenAt,
		...session.createdIp !== void 0 ? { createdIp: session.createdIp } : {},
		...session.lastSeenIp !== void 0 ? { lastSeenIp: session.lastSeenIp } : {}
	});
	const touch = (session, at = now()) => {
		session.lastSeenAt = at;
		changed();
	};
	const find = (cookieValue) => {
		const decoded = decodeSessionCookie(cookieValue);
		if (decoded === void 0) return void 0;
		const session = sessions.get(decoded.id);
		if (session === void 0) return void 0;
		if (!safeEqual(hashSessionSecret(decoded.secret), session.secretHash)) return void 0;
		return session;
	};
	return {
		/** Login a new device after the access token already checked out. */
		login({ userAgent, ip }) {
			const at = now();
			sweep(at);
			if (approvalRequired) {
				if ([...sessions.values()].filter((session) => session.status !== "rejected").length >= maxSessions) throw new SessionCapacityError();
			}
			const secret = newSessionSecret();
			const id = newSessionId();
			const record = {
				id,
				secretHash: hashSessionSecret(secret),
				label: deviceLabel(userAgent),
				status: approvalRequired ? "pending" : "active",
				createdAt: at,
				lastSeenAt: at,
				...ip !== void 0 && ip !== "" ? {
					createdIp: ip,
					lastSeenIp: ip
				} : {}
			};
			sessions.set(id, record);
			while (!approvalRequired && sessions.size > maxSessions) {
				const before = sessions.size;
				evictOldest(id);
				if (sessions.size === before) break;
			}
			changed();
			return {
				id,
				secret,
				status: record.status,
				label: record.label
			};
		},
		/**
		* Re-issue a cookie for an existing device (invite retry after a lost
		* redirect). Rotates the secret so the new Set-Cookie is the only live
		* credential; status and createdAt stay put so the owner still sees one
		* device. Undefined when the session is gone, expired, or rejected.
		*/
		reissue(id, ip) {
			const at = now();
			sweep(at);
			const session = sessions.get(id);
			if (session === void 0 || expired(session, at) || session.status === "rejected") return void 0;
			const secret = newSessionSecret();
			session.secretHash = hashSessionSecret(secret);
			session.lastSeenAt = at;
			if (ip !== void 0 && ip !== "") session.lastSeenIp = ip;
			changed();
			return {
				id,
				secret,
				status: session.status,
				label: session.label
			};
		},
		/** Validate a device cookie; undefined when unknown, revoked, or expired. */
		validate(cookieValue, ip) {
			const session = find(cookieValue);
			if (session === void 0) return void 0;
			if (expired(session)) {
				sessions.delete(session.id);
				changed();
				return;
			}
			if (session.status !== "active") return void 0;
			if (ip !== void 0 && ip !== "" && session.lastSeenIp !== ip) {
				session.lastSeenIp = ip;
				changed();
			}
			touch(session);
			return publicShape(session);
		},
		/** Resolve a session regardless of status (wait-page status endpoint). */
		pending(cookieValue, id) {
			const decoded = decodeSessionCookie(cookieValue);
			if (decoded === void 0 || decoded.id !== id) return void 0;
			const session = find(cookieValue);
			if (session === void 0) return void 0;
			if (expired(session)) {
				sessions.delete(session.id);
				changed();
				return;
			}
			return session;
		},
		list() {
			sweep();
			return [...sessions.values()].filter((session) => session.status !== "rejected").map(publicShape).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
		},
		revoke(id) {
			const session = sessions.get(id);
			if (session === void 0) return false;
			if (session.status === "pending") {
				session.status = "rejected";
				session.lastSeenAt = now();
				changed();
				return true;
			}
			sessions.delete(id);
			changed();
			return true;
		},
		approve(id) {
			const session = sessions.get(id);
			if (session === void 0 || session.status !== "pending") return false;
			session.status = "active";
			session.lastSeenAt = now();
			changed();
			return true;
		},
		/**
		* Rename a device label (1–64 chars after trim). Returns false when the
		* id is unknown or the label is empty / too long.
		*/
		rename(id, label) {
			const session = sessions.get(id);
			if (session === void 0) return false;
			const next = String(label ?? "").trim();
			if (next.length === 0 || next.length > 64) return false;
			if (session.label === next) return true;
			session.label = next;
			changed();
			return true;
		},
		/** Invalidate every device (token rotation, disable). */
		clear() {
			if (sessions.size > 0) {
				sessions.clear();
				changed();
			}
		},
		/** Rebuild the store from persisted data; malformed entries are dropped. */
		hydrate(data) {
			sessions.clear();
			const list = Array.isArray(data) ? data : [];
			for (const raw of list.slice(0, maxSessions)) {
				const entry = raw;
				if (typeof entry?.id !== "string" || typeof entry?.secretHash !== "string") continue;
				if (typeof entry?.label !== "string" || entry.label.length > 128) continue;
				if (entry.status !== "active" && entry.status !== "pending") continue;
				if (!Number.isFinite(entry.createdAt) || !Number.isFinite(entry.lastSeenAt)) continue;
				const createdIp = validSessionIp(entry.createdIp);
				const lastSeenIp = validSessionIp(entry.lastSeenIp);
				sessions.set(entry.id, {
					id: entry.id,
					secretHash: entry.secretHash,
					label: entry.label,
					status: entry.status,
					createdAt: entry.createdAt,
					lastSeenAt: entry.lastSeenAt,
					...createdIp !== void 0 ? { createdIp } : {},
					...lastSeenIp !== void 0 ? { lastSeenIp } : {}
				});
			}
		},
		serialize() {
			sweep();
			return [...sessions.values()].filter((session) => session.status !== "rejected").map((session) => ({
				id: session.id,
				secretHash: session.secretHash,
				label: session.label,
				status: session.status,
				createdAt: session.createdAt,
				lastSeenAt: session.lastSeenAt,
				...session.createdIp !== void 0 ? { createdIp: session.createdIp } : {},
				...session.lastSeenIp !== void 0 ? { lastSeenIp: session.lastSeenIp } : {}
			}));
		}
	};
}
//#endregion
//#region src/hosts.ts
/**
* Host classification shared by the Node host, the proxy, and the settings
* page. Kept free of Node builtins so the client bundle can import it.
*/
/** True for bind-all wildcards: not connectable destination hosts. */
function isWildcardHost(host) {
	const value = String(host ?? "").replace(/^\[|\]$/g, "");
	return value === "" || value === "0.0.0.0" || value === "::" || value === "::0";
}
/**
* Loopback classification aligned with harness `isLoopbackHostname`:
* localhost, [::1], and any IPv4 in 127/8. Also accepts the IPv4-mapped
* form Node reports on sockets (`::ffff:127.0.0.1`).
*/
function isLoopbackHost(host) {
	let hostname = String(host ?? "").replace(/^\[|\]$/g, "").toLowerCase();
	if (hostname.startsWith("::ffff:")) hostname = hostname.slice(7);
	if (hostname === "localhost" || hostname === "::1") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
//#endregion
//#region src/http-util.ts
/**
* http-util — shared HTTP plumbing for the host control surface and the
* proxy server.
*
* Path parsing, bounded body reads, JSON/HTML responses, HTML escaping, and
* listen-address formatting. Host and proxy share one copy so response
* semantics and authority formatting cannot drift apart.
*/
/** Coerce unknown thrown values to Error for loggers. */
function asError(error) {
	return error instanceof Error ? error : new Error(String(error));
}
/** Bracket IPv6 literals so `host:port` is a legal authority. */
function formatAuthority(host, port) {
	const hostname = String(host ?? "");
	return `${hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname}:${port}`;
}
function formatHttpUrl(host, port, scheme = "http") {
	return `${scheme}://${formatAuthority(host, port)}`;
}
/** Host/Origin rewrite target: always a loopback literal, never `backendHost`. */
function rewriteLoopbackAuthority(port) {
	return formatAuthority("127.0.0.1", port);
}
/**
* Self-loop: same port, and the listen address would accept the backend.
* Wildcard listen includes every interface (including the backend);
* two loopback spellings of the same port also collide.
*/
function isSelfLoop(listenHost, listenPort, backendHost, backendPort) {
	if (Number(listenPort) !== Number(backendPort)) return false;
	if (listenHost === backendHost) return true;
	if (isWildcardHost(listenHost)) return true;
	if (isWildcardHost(backendHost) && isLoopbackHost(listenHost)) return true;
	return isLoopbackHost(listenHost) && isLoopbackHost(backendHost);
}
/** First non-internal IPv4, else loopback. Used as the copyable tunnel target. */
function firstReachableIPv4() {
	try {
		for (const addrs of Object.values(networkInterfaces() ?? {})) for (const addr of addrs ?? []) if ((addr.family === "IPv4" || addr.family === 4) && !addr.internal) return addr.address;
	} catch {}
	return "127.0.0.1";
}
/** Bind host → a host a client can actually connect to. */
function publishHost(boundHost) {
	return isWildcardHost(boundHost) ? firstReachableIPv4() : boundHost;
}
/** Bind host → every address worth listing on the panel. */
function reachableHosts(boundHost) {
	if (!isWildcardHost(boundHost)) return [boundHost];
	const hosts = ["127.0.0.1"];
	if (boundHost === "::" || boundHost === "::0" || boundHost === "[::]") hosts.push("::1");
	const lan = firstReachableIPv4();
	if (!hosts.includes(lan)) hosts.push(lan);
	return hosts;
}
/** Parse the pathname of a request URL; malformed input degrades to '/'. */
function pathnameOf(url) {
	try {
		return new URL(url ?? "/", "http://x").pathname;
	} catch {
		return "/";
	}
}
/**
* Read a request body with a hard byte cap. Rejects (and destroys the
* socket) once the stream exceeds the limit, so chunked uploads cannot
* bypass it. Rejects on parse errors for JSON callers, on 'body-too-large'
* for everything else.
* @param {import('node:http').IncomingMessage} req
* @param {number} limit maximum accepted body size in bytes
* @returns {Promise<Buffer>}
*/
function readBody(req, limit) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > limit) {
				reject(/* @__PURE__ */ new Error("body-too-large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}
/** Read a bounded JSON body; rejects on overflow or malformed JSON. */
async function readJson(req, limit = 1024) {
	const body = await readBody(req, limit);
	return JSON.parse(body.toString("utf8"));
}
/** Send a JSON response with cache/sniffing hardening. */
function sendJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(body));
}
/**
* Send an HTML response with the project's baseline security headers.
* `extra` may override any header (the wait page widens the CSP on purpose).
*/
function sendHtml(res, status, body, extra = {}) {
	res.writeHead(status, {
		"content-type": "text/html; charset=utf-8",
		"cache-control": "no-store",
		"content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
		"referrer-policy": "no-referrer",
		"x-content-type-options": "nosniff",
		...extra
	});
	res.end(body);
}
/** Escape user-influenced text before it lands inside HTML. */
function escapeHtml(value) {
	return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
}
const COMPRESSIBLE_MEDIA = /* @__PURE__ */ new Set([
	"text/html",
	"text/css",
	"text/plain",
	"text/javascript",
	"text/xml",
	"application/javascript",
	"application/json",
	"application/xml",
	"application/manifest+json",
	"application/xhtml+xml",
	"image/svg+xml"
]);
function firstHeader(value) {
	if (value === void 0) return void 0;
	const text = Array.isArray(value) ? value[0] : String(value);
	return text === "" ? void 0 : text;
}
function mediaType(contentType) {
	const raw = firstHeader(contentType);
	if (raw === void 0) return "";
	return raw.split(";", 1)[0].trim().toLowerCase();
}
function parseQ(params) {
	for (const param of params) {
		const [key, rawValue] = param.trim().split("=", 2);
		if (key.trim().toLowerCase() !== "q") continue;
		const q = Number(rawValue);
		return Number.isFinite(q) ? q : 0;
	}
	return 1;
}
/**
* RFC 9110 content-coding q-value. Missing name falls back to `*`.
* `undefined` means the client did not advertise that coding at all.
*/
function encodingQ(acceptEncoding, name) {
	const raw = Array.isArray(acceptEncoding) ? acceptEncoding.join(",") : acceptEncoding;
	if (raw === void 0 || raw.trim() === "") return void 0;
	const wanted = name.toLowerCase();
	let named;
	let star;
	for (const part of raw.split(",")) {
		const [coding, ...params] = part.trim().split(";");
		const token = coding.trim().toLowerCase();
		if (token === "") continue;
		const q = parseQ(params);
		if (token === wanted) named = q;
		else if (token === "*") star = q;
	}
	return named ?? star;
}
function acceptsGzip(acceptEncoding) {
	return (encodingQ(acceptEncoding, "gzip") ?? 0) > 0;
}
function isCompressibleMediaType(contentType) {
	const type = mediaType(contentType);
	if (type === "" || type === "text/event-stream") return false;
	if (COMPRESSIBLE_MEDIA.has(type)) return true;
	return type.endsWith("+json") || type.endsWith("+xml");
}
function declaredLength(contentLength) {
	const raw = firstHeader(contentLength);
	if (raw === void 0) return void 0;
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 ? n : void 0;
}
function alreadyEncoded(contentEncoding) {
	const raw = firstHeader(contentEncoding);
	if (raw === void 0) return false;
	return raw.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean).some((token) => token !== "identity");
}
/** Whether the proxy should wrap this upstream HTTP response in gzip. */
function shouldGzipResponse(input) {
	if (input.compressEnabled !== true) return false;
	const method = (input.method ?? "GET").toUpperCase();
	if (method === "HEAD" || method === "CONNECT") return false;
	const status = input.status ?? 200;
	if (status < 200 || status === 204 || status === 206 || status === 304) return false;
	if (!acceptsGzip(input.acceptEncoding)) return false;
	if (alreadyEncoded(input.contentEncoding)) return false;
	if (!isCompressibleMediaType(input.contentType)) return false;
	const length = declaredLength(input.contentLength);
	if (length !== void 0 && length < 1024) return false;
	return true;
}
function headerKey(headers, name) {
	const lower = name.toLowerCase();
	for (const key of Object.keys(headers)) if (key.toLowerCase() === lower) return key;
}
function readHeader(headers, name) {
	const key = headerKey(headers, name);
	return key === void 0 ? void 0 : headers[key];
}
function deleteHeader(headers, name) {
	const key = headerKey(headers, name);
	if (key !== void 0) delete headers[key];
}
/** Strip Content-Length, set Content-Encoding: gzip, merge Vary. */
function applyGzipResponseHeaders(headers) {
	deleteHeader(headers, "content-length");
	headers["content-encoding"] = "gzip";
	const varyKey = headerKey(headers, "vary");
	const vary = varyKey === void 0 ? void 0 : headers[varyKey];
	const parts = (Array.isArray(vary) ? vary.join(",") : String(vary ?? "")).split(",").map((part) => part.trim()).filter(Boolean);
	if (!parts.some((part) => part.toLowerCase() === "accept-encoding")) parts.push("Accept-Encoding");
	headers[varyKey ?? "vary"] = parts.join(", ");
}
/**
* Vite hashed filenames: `name-` + 8-char hash + extension, under `/assets/`.
* `preview-desktop.png` (7-char suffix) and `/index.html` do not match.
*/
function isHashedStaticAssetPath(pathname) {
	return /^\/assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/.test(pathname);
}
function hasCacheControl(headers) {
	return headerKey(headers, "cache-control") !== void 0;
}
/**
* Long-cache hashed `/assets/*` GETs. Never overrides an upstream Cache-Control,
* never caches errors, never touches `/api` or HTML shells.
*/
function maybeSetHashedAssetCacheControl(headers, pathname, status, enabled) {
	if (enabled !== true || status !== 200) return;
	if (!isHashedStaticAssetPath(pathname)) return;
	if (hasCacheControl(headers)) return;
	headers["cache-control"] = "public, max-age=31536000, immutable";
}
function gzipDecisionFromUpstream(req, incoming, compressEnabled) {
	return shouldGzipResponse({
		compressEnabled,
		method: req.method,
		status: incoming.statusCode,
		acceptEncoding: req.headers["accept-encoding"],
		contentType: readHeader(incoming.headers, "content-type"),
		contentEncoding: readHeader(incoming.headers, "content-encoding"),
		contentLength: readHeader(incoming.headers, "content-length")
	});
}
//#endregion
//#region src/cidr.ts
/**
* cidr — IPv4/IPv6 CIDR allowlist matching for remote proxy clients.
*
* Empty list means "allow all" (auth still required). Loopback is always
* allowed so local health checks and the host machine keep working.
*/
/** Strip IPv4-mapped IPv6 (`::ffff:a.b.c.d`) down to dotted IPv4. */
function normalizeRemoteIp(address) {
	const raw = String(address ?? "").trim();
	if (raw === "") return "";
	if (raw.startsWith("::ffff:")) return raw.slice(7);
	return raw.replace(/^\[|\]$/g, "");
}
function parseIpv4(ip) {
	const parts = ip.split(".");
	if (parts.length !== 4) return void 0;
	const nums = parts.map((part) => Number(part));
	if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return void 0;
	return (nums[0] << 24 >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}
function parseIpv6(ip) {
	let normalized = ip.toLowerCase();
	if (normalized.includes(".")) {
		const colon = normalized.lastIndexOf(":");
		if (colon < 0) return void 0;
		const dotted = parseIpv4(normalized.slice(colon + 1));
		if (dotted === void 0) return void 0;
		const high = (dotted >>> 16 & 65535).toString(16);
		const low = (dotted & 65535).toString(16);
		normalized = `${normalized.slice(0, colon + 1)}${high}:${low}`;
	}
	if (isIP(normalized) !== 6) return void 0;
	let full = normalized;
	if (full.includes("::")) {
		const [head, tail] = full.split("::");
		const headParts = head === "" ? [] : head.split(":");
		const tailParts = tail === "" ? [] : tail.split(":");
		const missing = 8 - headParts.length - tailParts.length;
		full = [
			...headParts,
			...Array.from({ length: missing }, () => "0"),
			...tailParts
		].join(":");
	}
	const parts = full.split(":");
	if (parts.length !== 8) return void 0;
	const words = parts.map((part) => Number.parseInt(part || "0", 16));
	if (words.some((w) => !Number.isInteger(w) || w < 0 || w > 65535)) return void 0;
	return words;
}
/**
* @param {string} rule  dotted IPv4, IPv6, or CIDR (`a.b.c.d/24`, `2001:db8::/32`)
* @returns {{ kind: 'v4'|'v6', network: number|number[], prefix: number } | undefined}
*/
function parseCidr(rule) {
	const text = String(rule ?? "").trim();
	if (text === "") return void 0;
	const slash = text.indexOf("/");
	const addr = slash === -1 ? text : text.slice(0, slash);
	const prefixRaw = slash === -1 ? void 0 : text.slice(slash + 1);
	const ip = normalizeRemoteIp(addr);
	const v4 = parseIpv4(ip);
	if (v4 !== void 0) {
		const prefix = prefixRaw === void 0 ? 32 : Number(prefixRaw);
		if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return void 0;
		return {
			kind: "v4",
			network: (v4 & (prefix === 0 ? 0 : 4294967295 << 32 - prefix >>> 0)) >>> 0,
			prefix
		};
	}
	const v6 = parseIpv6(ip);
	if (v6 !== void 0) {
		const prefix = prefixRaw === void 0 ? 128 : Number(prefixRaw);
		if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return void 0;
		return {
			kind: "v6",
			network: v6,
			prefix
		};
	}
}
function ipv6Matches(words, network, prefix) {
	let bits = prefix;
	for (let i = 0; i < 8; i += 1) {
		if (bits <= 0) return true;
		const take = Math.min(16, bits);
		const mask = take === 0 ? 0 : 65535 << 16 - take & 65535;
		if ((words[i] & mask) !== (network[i] & mask)) return false;
		bits -= take;
	}
	return true;
}
/** True when `address` matches any parsed rule, or the list is empty. */
function ipAllowed(address, rules) {
	if (!Array.isArray(rules) || rules.length === 0) return true;
	const ip = normalizeRemoteIp(address);
	if (ip === "") return false;
	if (isLoopbackHost(ip)) return true;
	const v4 = parseIpv4(ip);
	const v6 = v4 === void 0 ? parseIpv6(ip) : void 0;
	for (const rule of rules) {
		if (rule === void 0) continue;
		if (rule.kind === "v4" && v4 !== void 0) {
			if ((v4 & (rule.prefix === 0 ? 0 : 4294967295 << 32 - rule.prefix >>> 0)) >>> 0 === rule.network) return true;
		}
		if (rule.kind === "v6" && v6 !== void 0 && ipv6Matches(v6, rule.network, rule.prefix)) return true;
	}
	return false;
}
/** Parse a config string list; invalid entries are dropped. */
function compileCidrList(entries) {
	if (!Array.isArray(entries)) return [];
	/** @type {NonNullable<ReturnType<typeof parseCidr>>[]} */
	const out = [];
	for (const entry of entries) {
		const parsed = parseCidr(entry);
		if (parsed !== void 0) out.push(parsed);
	}
	return out;
}
//#endregion
//#region src/proxy-headers.ts
const HOP_BY_HOP = /* @__PURE__ */ new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"trailers",
	"transfer-encoding",
	"upgrade"
]);
function connectionTokens(headers) {
	const tokens = /* @__PURE__ */ new Set(["proxy-connection"]);
	const connection = headers?.connection;
	const values = Array.isArray(connection) ? connection : [connection];
	for (const value of values) for (const token of String(value ?? "").split(",")) {
		const normalized = token.trim().toLowerCase();
		if (normalized !== "") tokens.add(normalized);
	}
	return tokens;
}
const SPOOFABLE_FORWARDING = /* @__PURE__ */ new Set([
	"forwarded",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-port",
	"x-forwarded-proto",
	"x-real-ip",
	"x-dsh-reverse-proxy"
]);
const INTERNAL_HEADERS = /* @__PURE__ */ new Set([
	"cookie",
	"referer",
	"referrer"
]);
function csvHeaderPart(value, pick) {
	const text = Array.isArray(value) ? pick === "last" ? value[value.length - 1] : value[0] : value;
	const parts = String(text ?? "").split(",").map((part) => part.trim()).filter(Boolean);
	const chosen = pick === "last" ? parts[parts.length - 1] : parts[0];
	return chosen === void 0 || chosen === "" ? void 0 : chosen;
}
function lastForwardedIp(value) {
	return csvHeaderPart(value, "last");
}
function firstHeaderValue(value) {
	return csvHeaderPart(value, "first");
}
function trustedForwardedIp(value) {
	if (value === void 0) return void 0;
	const ip = normalizeRemoteIp(value);
	if (isIP(ip) === 0 || isLoopbackHost(ip)) return void 0;
	return ip;
}
/** Resolve the client address only from explicitly trusted loopback edges. */
function effectiveRemoteAddress(req, spec) {
	const direct = req.socket.remoteAddress ?? "";
	if (spec.trustForwardedFor() && isLoopbackHost(direct)) {
		if (spec.trustCloudflareConnectingIp?.() === true) {
			const cf = trustedForwardedIp(firstHeaderValue(req.headers["cf-connecting-ip"]));
			if (cf !== void 0) return cf;
		}
		const forwarded = trustedForwardedIp(lastForwardedIp(req.headers["x-forwarded-for"]));
		if (forwarded !== void 0) return forwarded;
	}
	return direct;
}
function requestIsHttps(req, tls, trustForwardedProto) {
	return tls === true || trustForwardedProto && isLoopbackHost(req.socket.remoteAddress ?? "") && firstHeaderValue(req.headers["x-forwarded-proto"])?.toLowerCase() === "https";
}
function cookieIsSecure(req, spec) {
	return requestIsHttps(req, spec.tls === true, spec.trustForwardedProto());
}
function forwardHeaders(req, backendHost, options = {}) {
	const headers = {};
	const nominated = connectionTokens(req.headers);
	for (const [key, value] of Object.entries(req.headers)) {
		const lower = key.toLowerCase();
		if (value === void 0 || value === null || lower === "host" || nominated.has(lower) || HOP_BY_HOP.has(lower) || SPOOFABLE_FORWARDING.has(lower) || INTERNAL_HEADERS.has(lower)) continue;
		headers[lower] = value;
	}
	if (options.backendCookie !== undefined) headers.cookie = options.backendCookie();
	const sourceHost = req.headers.host ?? "";
	const remote = req.socket.remoteAddress ?? "";
	const proto = requestIsHttps(req, options.tls === true, options.trustForwardedProto === true) ? "https" : "http";
	headers.host = backendHost;
	headers.origin = `http://${backendHost}`;
	headers["sec-fetch-site"] = "same-origin";
	headers["x-forwarded-for"] = options.forwardedFor ?? remote;
	headers["x-forwarded-host"] = sourceHost;
	headers["x-forwarded-proto"] = proto;
	headers["x-dsh-reverse-proxy"] = "1";
	return headers;
}
function sanitizeHeaders(headers, keep = /* @__PURE__ */ new Set()) {
	const out = {};
	const nominated = connectionTokens(headers);
	for (const [key, value] of Object.entries(headers ?? {})) {
		const lower = key.toLowerCase();
		if (value === void 0 || value === null || lower === "set-cookie") continue;
		if (nominated.has(lower) && !keep.has(lower)) continue;
		if (HOP_BY_HOP.has(lower) && !keep.has(lower)) continue;
		out[key] = value;
	}
	return out;
}
/** Drop hop-by-hop and set-cookie before relaying an upstream response. */
function sanitizeResponseHeaders(headers) {
	return sanitizeHeaders(headers);
}
/** Preserve only Connection/Upgrade for a WebSocket 101 response. */
function sanitizeUpgradeResponseHeaders(headers) {
	return sanitizeHeaders(headers, /* @__PURE__ */ new Set(["connection", "upgrade"]));
}
//#endregion
//#region src/pages.ts
/** Proxy-internal route prefix (underscored so it cannot collide with the
*  host's control surface). */
const GATE_PREFIX = "/_dsh_reverse_proxy";
const LOGIN_PATH = `${GATE_PREFIX}/login`;
/** Opt-in post-login device hub: session facts, self-rename, logout. */
const HOME_PATH = `${GATE_PREFIX}/home`;
const HOME_RENAME_PATH = `${HOME_PATH}/rename`;
/** Self-service session revocation (own cookie only). */
const LOGOUT_PATH = `${GATE_PREFIX}/logout`;
const HEALTHZ_PATH = `${GATE_PREFIX}/healthz`;
const WAIT_PREFIX = `${GATE_PREFIX}/wait`;
function waitPagePath(id) {
	return `${WAIT_PREFIX}/${id}`;
}
function waitStatusPath(id) {
	return `${WAIT_PREFIX}/${id}/status`;
}
/** Parse a wait-page or wait-status path. Undefined when it is not a wait route. */
function parseWaitPath(path) {
	if (!path.startsWith(`${WAIT_PREFIX}/`)) return void 0;
	const rest = path.slice(WAIT_PREFIX.length + 1);
	if (rest.endsWith("/status")) {
		const id = rest.slice(0, -7);
		if (id !== "" && !id.includes("/")) return {
			id,
			kind: "status"
		};
		return;
	}
	if (rest !== "" && !rest.includes("/")) return {
		id: rest,
		kind: "page"
	};
}
/** JSON for inline scripts: stringify plus `<` so `<\/script>` cannot break out. */
function jsValue(value) {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}
/** Shared card chrome for login, wait, and home (light + dark). */
const CARD_CSS = `
  :root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif}
  body{min-height:100dvh;margin:0;display:grid;place-items:center;padding:24px;
    background:radial-gradient(70% 46% at 50% -8%,#d7e4f4 0%,transparent 64%),#eef2f6;color:#15171a}
  .card{box-sizing:border-box;width:min(92vw,400px);padding:28px 28px 24px;border:1px solid #d5dbe3;border-radius:20px;background:#fff;box-shadow:0 18px 50px #1220331f}
  .kicker{margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6a7380}
  h1{font-size:22px;margin:0 0 8px;letter-spacing:-.02em}
  p{font-size:14px;line-height:1.6;color:#5b6470}
  @media(prefers-color-scheme:dark){
    body{background:radial-gradient(70% 46% at 50% -8%,#243044 0%,transparent 64%),#111418;color:#f7f8fa}
    .card{background:#1b1f24;border-color:#343a43;box-shadow:0 18px 50px #0008}
    .kicker{color:#8b95a3}p{color:#aeb6c2}
  }`;
const LOGIN_EXTRA_CSS = `label{display:block;font-size:13px;font-weight:600;margin:22px 0 8px}input,button{box-sizing:border-box;width:100%;min-height:48px;border-radius:12px;font:inherit}input{padding:0 14px;border:1px solid #c8ced7;background:transparent;color:inherit}button{margin-top:14px;border:0;background:#111;color:#fff;font-weight:650;cursor:pointer}button.secondary{background:transparent;color:#3d4652;border:1px solid #c8ced7}@media(prefers-color-scheme:dark){input{border-color:#4b535e}button{background:#f7f8fa;color:#111}button.secondary{background:transparent;color:#c9d1dc;border-color:#4b535e}}@media(prefers-reduced-motion:no-preference){button{transition:transform .15s ease}button:active{transform:scale(.98)}}`;
const WAIT_EXTRA_CSS = `.device{font-size:13px;color:#8a93a0;margin-top:14px}.spinner{width:18px;height:18px;border:2px solid #c8ced7;border-top-color:#111;border-radius:50%;margin-top:22px;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-color-scheme:dark){.device{color:#7c8694}.spinner{border-color:#4b535e;border-top-color:#f7f8fa}}`;
const LOGIN_COPY = {
	zh: {
		title: "DeepSeek Harness 远程访问",
		intro: "此入口由通用反向代理保护。请输入本机控制面显示的访问令牌。",
		inviteHint: "正在使用一次性邀请登录…",
		label: "访问令牌",
		submit: "进入 DeepSeek Harness",
		invalidToken: "令牌无效，请重试。",
		invalidInvite: "邀请已失效或已使用。如果刚才已经登录成功，直接打开首页即可；否则请回到控制面板重新生成邀请。",
		invalidRequest: "请求无效，请重试。",
		deviceHome: "设备主页"
	},
	en: {
		title: "DeepSeek Harness remote access",
		intro: "This entry is protected by a reverse proxy. Enter the access token shown in the local control panel.",
		inviteHint: "Signing in with a one-time invite…",
		label: "Access token",
		submit: "Enter DeepSeek Harness",
		invalidToken: "Invalid token, please retry.",
		invalidInvite: "This invite expired or was already used. If you were just signed in, open the home page directly; otherwise ask the owner to generate a new invite.",
		invalidRequest: "Invalid request, please retry.",
		deviceHome: "Device home"
	}
};
const WAIT_COPY = {
	zh: {
		title: "等待审批",
		intro: "此设备已提交访问请求，请在本机控制面板中批准。",
		pending: "等待批准中…",
		rejected: "访问请求被拒绝。",
		expired: "会话已失效，请重新登录。"
	},
	en: {
		title: "Waiting for approval",
		intro: "This device has requested access. Approve it from the local control panel.",
		pending: "Waiting for approval…",
		rejected: "Access request was rejected.",
		expired: "This session expired. Please sign in again."
	}
};
const HOME_COPY = {
	zh: {
		title: "设备主页",
		intro: "你已连接到这台 DeepSeek Harness。",
		via: "当前入口",
		device: "本设备",
		ip: "登录 IP",
		signedIn: "登录时间",
		expires: "会话最长保留至",
		security: "安全状态",
		tokenGate: "访问令牌门已启用",
		approvalOn: "新设备需主人审批后才能访问",
		approvalOff: "新设备登录即可访问（未开启审批）",
		enter: "进入 DeepSeek Harness",
		renameLabel: "给这台设备起个名字",
		renameHint: "主人会在设备列表里看到这个名字，例如「小王的 iPhone」。",
		renameSubmit: "保存名字",
		logout: "退出登录",
		logoutHint: "退出后这台设备的会话立即失效，再次访问需要重新登录。"
	},
	en: {
		title: "Device home",
		intro: "You are connected to this DeepSeek Harness.",
		via: "Current entry",
		device: "This device",
		ip: "Login IP",
		signedIn: "Signed in",
		expires: "Session kept until",
		security: "Security posture",
		tokenGate: "Access-token gate is on",
		approvalOn: "New devices require the owner’s approval",
		approvalOff: "New devices get in on login (approval off)",
		enter: "Enter DeepSeek Harness",
		renameLabel: "Name this device",
		renameHint: "The owner sees this name in the device list, e.g. \"Juan’s iPhone\".",
		renameSubmit: "Save name",
		logout: "Sign out",
		logoutHint: "Signing out revokes this device’s session immediately; the next visit needs a fresh login."
	}
};
const HOME_EXTRA_CSS = `.via{font-size:12px;color:#8a93a0;word-break:break-all;margin:-2px 0 0}dl{margin:18px 0 0;display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:13px}dt{color:#8a93a0;font-weight:600}dd{margin:0;word-break:break-all}.enter{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;min-height:48px;margin-top:22px;border-radius:12px;background:#111;color:#fff;font-weight:650;text-decoration:none}.rename{margin-top:24px;padding-top:20px;border-top:1px solid #e2e7ee}.rename label{display:block;font-size:13px;font-weight:600;margin:0 0 8px}.rename input,.rename button,.logout button{box-sizing:border-box;width:100%;min-height:48px;border-radius:12px;font:inherit}.rename input{padding:0 14px;border:1px solid #c8ced7;background:transparent;color:inherit}.rename button{margin-top:10px;background:transparent;color:#3d4652;border:1px solid #c8ced7;cursor:pointer}.logout{margin-top:22px}.logout button{background:transparent;color:#b3261e;border:1px solid #e0b4b0;cursor:pointer}.hint{font-size:12px;color:#8a93a0;margin:8px 0 0}@media(prefers-color-scheme:dark){.via,.hint,dt{color:#7c8694}.enter{background:#f7f8fa;color:#111}.rename{border-top-color:#343a43}.rename input{border-color:#4b535e}.rename button{color:#c9d1dc;border-color:#4b535e}.logout button{color:#f2b8b5;border-color:#6b3a38}}`;
/** Pick the page locale: zh default, 'en' for explicit non-zh headers. */
function loginLocale(req) {
	const header = String(req.headers["accept-language"] ?? "").toLowerCase();
	if (header !== "" && !header.startsWith("zh")) return "en";
	return "zh";
}
function shell(locale, title) {
	return `<!doctype html><html lang="${locale === "en" ? "en" : "zh-CN"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title><style>${CARD_CSS}`;
}
/** Token login gate. `error` is always one of our own copy tokens.
*  Prefill comes only from invite links (`?invite=`); token values are never
*  placed in the URL or the form to avoid leaking them through history. */
function loginPage(locale, error = "", prefill = {}) {
	const copy = LOGIN_COPY[locale] ?? LOGIN_COPY.zh;
	const message = error === "" ? "" : `<p role="alert">${error}</p>`;
	const safeInvite = escapeHtml(String(prefill.invite ?? "").slice(0, 128));
	const useInvite = safeInvite !== "";
	const autoSubmit = useInvite ? `<script>document.addEventListener('DOMContentLoaded',function(){var f=document.getElementById('login');if(f)f.requestSubmit()})<\/script>` : "";
	const fields = useInvite ? `<input type="hidden" name="invite" value="${safeInvite}"><p>${copy.inviteHint}</p><button type="submit">${copy.submit}</button>` : `<label for="token">${copy.label}</label><input id="token" name="token" type="password" autocomplete="current-password" required autofocus><button type="submit">${copy.submit}</button><button type="submit" name="next" value="home" class="secondary">${copy.deviceHome}</button>`;
	return `${shell(locale, copy.title)}${LOGIN_EXTRA_CSS}</style></head><body><main class="card"><p class="kicker">dsh-full-remote</p><h1>${copy.title}</h1><p>${copy.intro}</p>${message}<form id="login" method="post" action="${LOGIN_PATH}">${fields}</form>${autoSubmit}</main></body></html>`;
}
/** First-visit approval waiting page: polls its own session status. */
function waitPage(locale, id, label) {
	const copy = WAIT_COPY[locale] ?? WAIT_COPY.zh;
	const safeLabel = escapeHtml(label);
	const poll = `fetch(${jsValue(waitStatusPath(id))},{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(function(d){if(d.status==='active'){location.href='/'}else if(d.status==='rejected'){clearInterval(t);document.getElementById('state').textContent=${jsValue(copy.rejected)}}else if(d.status==='unknown'){clearInterval(t);document.getElementById('state').textContent=${jsValue(copy.expired)}}},function(){})`;
	return `${shell(locale, copy.title)}${WAIT_EXTRA_CSS}</style></head><body><main class="card"><p class="kicker">dsh-full-remote</p><h1>${copy.title}</h1><p>${copy.intro}</p><p class="device">${safeLabel}</p><div class="spinner" aria-hidden="true"></div><p id="state">${copy.pending}</p><script>var t=setInterval(function(){${poll}},2000)<\/script></main></body></html>`;
}
/** Format a timestamp for the page locale (server timezone — the gate pages
*  have no client clock access under the zero-JS CSP). */
function formatPageTime(locale, ts) {
	return new Date(ts).toLocaleString(locale === "en" ? "en-US" : "zh-CN", { hour12: false });
}
/** Opt-in device hub reached from the login page's secondary button or a
*  direct visit. Zero-JS: enter is a link, rename/logout are plain forms. */
function homePage(locale, data) {
	const copy = HOME_COPY[locale] ?? HOME_COPY.zh;
	const safeLabel = escapeHtml(data.label);
	const via = data.host === "" ? "" : `<p class="via">${copy.via}: ${escapeHtml(data.host)}</p>`;
	const ipRow = data.createdIp === void 0 || data.createdIp === "" ? "" : `<dt>${copy.ip}</dt><dd>${escapeHtml(data.createdIp)}</dd>`;
	const expires = formatPageTime(locale, data.createdAt + data.sessionMaxAgeSeconds * 1e3);
	const approval = data.approvalMode ? copy.approvalOn : copy.approvalOff;
	return `${shell(locale, copy.title)}${HOME_EXTRA_CSS}</style></head><body><main class="card"><p class="kicker">dsh-full-remote</p><h1>${copy.title}</h1><p>${copy.intro}</p>${via}<dl><dt>${copy.device}</dt><dd>${safeLabel}</dd>${ipRow}<dt>${copy.signedIn}</dt><dd>${formatPageTime(locale, data.createdAt)}</dd><dt>${copy.expires}</dt><dd>${expires}</dd><dt>${copy.security}</dt><dd>${copy.tokenGate} · ${approval}</dd></dl><a class="enter" href="/">${copy.enter}</a><form class="rename" method="post" action="${HOME_RENAME_PATH}"><label for="label">${copy.renameLabel}</label><input id="label" name="label" type="text" maxlength="64" value="${safeLabel}"><p class="hint">${copy.renameHint}</p><button type="submit">${copy.renameSubmit}</button></form><form class="logout" method="post" action="${LOGOUT_PATH}"><button type="submit">${copy.logout}</button><p class="hint">${copy.logoutHint}</p></form></main></body></html>`;
}
//#endregion
//#region src/proxy.ts
/**
* proxy — the authenticated local reverse-proxy server.
*
* One Node http.Server in front of the DeepSeek Harness Web backend:
* login gate (token + per-device session), optional approval wait pages,
* header sanitization, stream-level body limits, and full WebSocket/SSE
* upgrade forwarding with both-end teardown on close.
*
* All user-facing copy is delegated to pages.ts; session state lives in the
* caller-supplied session store (defaults to an in-memory one).
*/
const LOGIN_FAILURE_DELAY_MS = 250;
const MAX_TRACKED_LOGIN_IPS = 4096;
/** Mirrors the createSessionStore default so a caller that omits
*  sessionMaxAgeSeconds still gets a valid cookie Max-Age. */
const DEFAULT_SESSION_MAX_AGE_SECONDS = 2592e3;
const GATE_PAGE_HEADERS = {
	"content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
	"referrer-policy": "no-referrer"
};
/**
* Per-IP failed-login tracker with a lockout window. The fixed per-attempt
* delay alone is parallelizable; this bounds total guessing capacity per
* source address. Memory is bounded: past the cap, expired entries are
* swept, and under an active spoofed-source attack the oldest entry is
* evicted so the proxy can never be driven to unbounded memory.
* @param {{ loginMaxAttempts?: number, loginLockoutMs?: number }} spec
*/
function createLoginTracker(spec) {
	const maxAttempts = spec.loginMaxAttempts ?? 5;
	const lockoutMs = spec.loginLockoutMs ?? 3e5;
	/** @type {Map<string, { failures: number, inFlight: number, firstFailure: number, lockedUntil?: number }>} */
	const buckets = /* @__PURE__ */ new Map();
	const sweepExpired = (now) => {
		for (const [ip, bucket] of buckets) if (bucket.lockedUntil !== void 0 && bucket.lockedUntil <= now) buckets.delete(ip);
		else if (now - bucket.firstFailure > lockoutMs) buckets.delete(ip);
	};
	return {
		/** @returns {number} seconds the client must wait; 0 means allowed. */
		check(ip, now = Date.now()) {
			const bucket = buckets.get(ip);
			if (bucket?.lockedUntil !== void 0) {
				if (bucket.lockedUntil > now) return Math.ceil((bucket.lockedUntil - now) / 1e3);
				buckets.delete(ip);
			}
			return 0;
		},
		/** Reserve one attempt before reading a body or awaiting the delay. */
		reserve(ip, now = Date.now()) {
			const existing = buckets.get(ip);
			const bucket = existing === void 0 || now - existing.firstFailure > lockoutMs ? {
				failures: 0,
				inFlight: 0,
				firstFailure: now
			} : existing;
			if (bucket.lockedUntil !== void 0 && bucket.lockedUntil > now) return Math.ceil((bucket.lockedUntil - now) / 1e3);
			if (bucket.failures + bucket.inFlight >= maxAttempts) {
				bucket.lockedUntil = now + lockoutMs;
				buckets.set(ip, bucket);
				return Math.ceil(lockoutMs / 1e3);
			}
			bucket.inFlight += 1;
			buckets.set(ip, bucket);
			return 0;
		},
		fail(ip, now = Date.now()) {
			const bucket = buckets.get(ip);
			if (bucket === void 0 || now - bucket.firstFailure > lockoutMs) {
				buckets.set(ip, {
					failures: 1,
					inFlight: 0,
					firstFailure: now
				});
				return;
			}
			bucket.inFlight = Math.max(0, bucket.inFlight - 1);
			bucket.failures += 1;
			if (bucket.failures >= maxAttempts) bucket.lockedUntil = now + lockoutMs;
		},
		success(ip) {
			buckets.delete(ip);
		},
		prune(now = Date.now()) {
			if (buckets.size <= MAX_TRACKED_LOGIN_IPS) return;
			sweepExpired(now);
			if (buckets.size <= MAX_TRACKED_LOGIN_IPS) return;
			let oldest;
			for (const entry of buckets) if (oldest === void 0 || entry[1].firstFailure < oldest[1].firstFailure) oldest = entry;
			if (oldest !== void 0) buckets.delete(oldest[0]);
		}
	};
}
function writeRawHead(socket, statusCode, statusMessage, headers) {
	const lines = [`HTTP/1.1 ${statusCode} ${statusMessage}`];
	for (const [key, value] of Object.entries(headers)) if (Array.isArray(value)) for (const item of value) lines.push(`${key}: ${item}`);
	else if (value !== void 0) lines.push(`${key}: ${value}`);
	socket.write(`${lines.join("\r\n")}\r\n\r\n`);
}
function denySocket(socket, status = "403 Forbidden", body = "forbidden\n") {
	socket.write(`HTTP/1.1 ${status}\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\n${body}`);
	socket.destroy();
}
function drainRequest(req) {
	req.resume();
}
function sendText(res, status, body, extra = {}) {
	res.writeHead(status, {
		"content-type": "text/plain; charset=utf-8",
		"cache-control": "no-store",
		...extra
	});
	res.end(body);
}
function redirect(res, location, extra = {}) {
	res.writeHead(303, {
		location,
		"cache-control": "no-store",
		...extra
	});
	res.end();
}
/**
* Deadline for establishing TCP to the loopback Harness backend.
* Cleared as soon as the socket is connected (including keep-alive reuse).
* Must not cover body transfer: Harness buffers `/api` JSON (vision images)
* before it writes response headers, and a phone tunnel can take longer than
* `upstreamTimeoutMs` to push those bytes.
*/
function armUpstreamConnectTimeout(up, timeoutMs) {
	const timer = setTimeout(() => {
		up.destroy(/* @__PURE__ */ new Error("upstream timeout"));
	}, timeoutMs);
	timer.unref();
	const clear = () => {
		clearTimeout(timer);
	};
	up.once("socket", (socket) => {
		if (!socket.connecting) {
			clear();
			return;
		}
		socket.once("connect", clear);
		socket.once("error", clear);
	});
	up.once("error", clear);
	up.once("response", clear);
	return clear;
}
function inboundMethodHasBody(method) {
	const verb = (method ?? "GET").toUpperCase();
	return verb !== "GET" && verb !== "HEAD";
}
/** After the client finishes a POST body, wait this long for upstream headers. */
function armUpstreamFirstByteTimeout(up, timeoutMs, alreadyResponded) {
	if (alreadyResponded()) return () => {};
	const timer = setTimeout(() => {
		up.destroy(/* @__PURE__ */ new Error("upstream timeout"));
	}, timeoutMs);
	timer.unref();
	const clear = () => {
		clearTimeout(timer);
	};
	up.once("response", clear);
	up.once("error", clear);
	up.once("close", clear);
	return clear;
}
function pipeUpstreamBody(incoming, res, gzip) {
	if (!gzip) {
		incoming.on("error", () => {
			if (!res.destroyed) res.destroy();
		});
		incoming.pipe(res);
		return;
	}
	const gzipStream = createGzip({ level: 6 });
	incoming.on("error", () => {
		gzipStream.destroy();
		if (!res.destroyed) res.destroy();
	});
	gzipStream.on("error", () => {
		incoming.destroy();
		if (!res.destroyed) res.destroy();
	});
	incoming.pipe(gzipStream).pipe(res);
}
function proxyRequest(req, res, spec, sessionId) {
	const contentLength = Number(req.headers["content-length"] ?? 0);
	if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > spec.maxRequestBytes) {
		drainRequest(req);
		sendText(res, 413, "request too large\n", { connection: "close" });
		return;
	}
	const up = request({
		hostname: spec.backendHost,
		port: spec.backendPort,
		path: req.url,
		method: req.method,
		headers: forwardHeaders(req, spec.rewriteAuthority, {
			tls: spec.tls === true,
			trustForwardedProto: spec.trustForwardedProto(),
			forwardedFor: effectiveRemoteAddress(req, spec),
			backendCookie: spec.backendCookie
		})
	}, (incoming) => {
		clearConnectTimeout();
		const status = incoming.statusCode ?? 502;
		const responseHeaders = sanitizeResponseHeaders(incoming.headers);
		maybeSetHashedAssetCacheControl(responseHeaders, pathnameOf(req.url), status, spec.cacheHashedAssets);
		const gzip = gzipDecisionFromUpstream(req, {
			statusCode: status,
			headers: responseHeaders
		}, spec.compressResponses);
		if (gzip) applyGzipResponseHeaders(responseHeaders);
		res.writeHead(status, responseHeaders);
		pipeUpstreamBody(incoming, res, gzip);
	});
	spec.trackUpstream?.(up);
	const releaseSession = spec.trackSession(sessionId, () => {
		up.destroy();
		if (!res.destroyed) res.destroy();
	});
	res.once("close", releaseSession);
	up.once("close", releaseSession);
	const clearConnectTimeout = armUpstreamConnectTimeout(up, spec.upstreamTimeoutMs);
	up.on("error", () => {
		clearConnectTimeout();
		if (!res.headersSent) sendText(res, 502, "bad gateway\n");
		else res.destroy();
	});
	let received = 0;
	let overflow = false;
	req.on("data", (chunk) => {
		received += chunk.length;
		if (!overflow && received > spec.maxRequestBytes) {
			overflow = true;
			clearConnectTimeout();
			req.unpipe(up);
			up.destroy();
			if (!res.headersSent) sendText(res, 413, "request too large\n", { connection: "close" });
			else res.destroy();
		}
	});
	const abortUpstream = () => {
		up.destroy();
	};
	req.once("error", abortUpstream);
	req.once("aborted", abortUpstream);
	res.once("close", () => {
		if (!res.writableEnded) abortUpstream();
	});
	if (inboundMethodHasBody(req.method)) req.once("end", () => {
		if (overflow || res.headersSent) return;
		armUpstreamFirstByteTimeout(up, spec.upstreamTimeoutMs, () => res.headersSent);
	});
	req.pipe(up);
}
async function handleLogin(req, res, spec) {
	const locale = loginLocale(req);
	if (req.method === "GET") {
		sendHtml(res, 200, loginPage(locale, "", { invite: new URL(req.url ?? "/", "http://localhost").searchParams.get("invite") ?? "" }), GATE_PAGE_HEADERS);
		return;
	}
	if (req.method !== "POST") {
		drainRequest(req);
		res.writeHead(405, { allow: "GET, POST" });
		res.end();
		return;
	}
	let reserved = false;
	try {
		const remote = effectiveRemoteAddress(req, spec);
		if (spec.ipAllowed !== void 0 && !spec.ipAllowed(remote)) {
			drainRequest(req);
			spec.audit?.("login.denied", {
				reason: "cidr",
				remote
			});
			sendText(res, 403, "forbidden\n");
			return;
		}
		const retryAfter = spec.loginTracker.reserve(remote);
		if (retryAfter > 0) {
			drainRequest(req);
			spec.audit?.("login.locked", {
				remote,
				retryAfter
			});
			sendText(res, 429, "too many attempts\n", { "retry-after": String(retryAfter) });
			return;
		}
		reserved = true;
		const form = new URLSearchParams((await readBody(req, 4096)).toString("utf8"));
		const delayMs = spec.loginDelayMs ?? LOGIN_FAILURE_DELAY_MS;
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		const inviteCode = form.get("invite") ?? "";
		const usedInvite = inviteCode !== "";
		const consumed = usedInvite ? spec.inviteStore?.consume(inviteCode, remote) : void 0;
		if (!(usedInvite ? consumed?.ok === true : safeEqual(form.get("token") ?? "", spec.accessToken))) {
			spec.loginTracker.fail(remote);
			reserved = false;
			spec.loginTracker.prune();
			spec.audit?.("login.fail", {
				remote,
				via: usedInvite ? "invite" : "token"
			});
			sendHtml(res, 401, loginPage(locale, usedInvite ? (LOGIN_COPY[locale] ?? LOGIN_COPY.zh).invalidInvite : (LOGIN_COPY[locale] ?? LOGIN_COPY.zh).invalidToken), GATE_PAGE_HEADERS);
			return;
		}
		spec.loginTracker.success(remote);
		reserved = false;
		let session;
		if (usedInvite && consumed?.retry === true) {
			session = consumed.sessionId !== void 0 ? spec.sessionStore.reissue(consumed.sessionId, remote) : void 0;
			if (session === void 0) {
				spec.audit?.("login.fail", {
					remote,
					via: "invite",
					reason: "retry-session-gone"
				});
				sendHtml(res, 401, loginPage(locale, (LOGIN_COPY[locale] ?? LOGIN_COPY.zh).invalidInvite), GATE_PAGE_HEADERS);
				return;
			}
		} else {
			try {
				session = spec.sessionStore.login({
					userAgent: req.headers["user-agent"],
					ip: remote
				});
			} catch (error) {
				if (!(error instanceof SessionCapacityError)) throw error;
				spec.audit?.("login.fail", {
					remote,
					via: "token",
					reason: "session-capacity"
				});
				sendText(res, 429, "too many devices\n", { "retry-after": "10" });
				return;
			}
			if (usedInvite) spec.inviteStore?.bindSession?.(inviteCode, session.id);
		}
		spec.audit?.("login.ok", {
			remote,
			sessionId: session.id,
			status: session.status,
			via: usedInvite ? "invite" : "token",
			...consumed?.retry === true ? { retry: true } : {}
		});
		const secure = cookieIsSecure(req, spec);
		redirect(res, session.status === "pending" ? waitPagePath(session.id) : form.get("next") === "home" ? HOME_PATH : "/", {
			"set-cookie": sessionCookie(spec.cookieName, encodeSessionCookie(session.id, session.secret), {
				maxAgeSeconds: spec.sessionMaxAgeSeconds,
				secure
			}),
			"referrer-policy": "no-referrer"
		});
	} catch {
		if (reserved) spec.loginTracker.fail(effectiveRemoteAddress(req, spec));
		sendHtml(res, 400, loginPage(locale, LOGIN_COPY[locale].invalidRequest), GATE_PAGE_HEADERS);
	}
}
function handleWaitRoutes(req, res, spec, path, cookie) {
	const wait = parseWaitPath(path);
	if (wait === void 0 || req.method !== "GET") return false;
	const session = spec.sessionStore.pending(cookie, wait.id);
	if (wait.kind === "status") {
		res.writeHead(200, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end(`${JSON.stringify({ status: session?.status ?? "unknown" })}\n`);
		return true;
	}
	if (session === void 0) {
		redirect(res, LOGIN_PATH);
		return true;
	}
	if (session.status === "active") {
		redirect(res, "/");
		return true;
	}
	sendHtml(res, 200, waitPage(loginLocale(req), session.id, session.label), GATE_PAGE_HEADERS);
	return true;
}
async function handleDevicePages(req, res, spec, path, cookie) {
	if (path === HOME_PATH && req.method === "GET") {
		const session = spec.sessionStore.validate(cookie, effectiveRemoteAddress(req, spec));
		if (session === void 0) {
			drainRequest(req);
			redirect(res, LOGIN_PATH);
			return true;
		}
		sendHtml(res, 200, homePage(loginLocale(req), {
			host: req.headers.host ?? "",
			label: session.label,
			...session.createdIp !== void 0 ? { createdIp: session.createdIp } : {},
			createdAt: session.createdAt,
			sessionMaxAgeSeconds: spec.sessionMaxAgeSeconds,
			approvalMode: spec.approvalMode === true
		}), GATE_PAGE_HEADERS);
		return true;
	}
	if (path === HOME_RENAME_PATH && req.method === "POST") {
		const remote = effectiveRemoteAddress(req, spec);
		const session = spec.sessionStore.validate(cookie, remote);
		if (session === void 0) {
			drainRequest(req);
			redirect(res, LOGIN_PATH);
			return true;
		}
		try {
			const form = new URLSearchParams((await readBody(req, 4096)).toString("utf8"));
			if (spec.sessionStore.rename(session.id, form.get("label") ?? void 0)) spec.audit?.("session.rename", {
				remote,
				sessionId: session.id,
				self: true
			});
		} catch {
			drainRequest(req);
		}
		redirect(res, HOME_PATH);
		return true;
	}
	if (path === LOGOUT_PATH && req.method === "POST") {
		const remote = effectiveRemoteAddress(req, spec);
		const session = spec.sessionStore.validate(cookie, remote);
		if (session !== void 0) {
			spec.sessionStore.revoke(session.id);
			spec.closeSessionConnections(session.id);
			spec.audit?.("session.logout", {
				remote,
				sessionId: session.id
			});
		} else drainRequest(req);
		redirect(res, LOGIN_PATH, {
			"set-cookie": sessionCookie(spec.cookieName, "", {
				maxAgeSeconds: 0,
				secure: cookieIsSecure(req, spec)
			}),
			"referrer-policy": "no-referrer"
		});
		return true;
	}
	return false;
}
/**
* Start an authenticated reverse proxy suitable for any external tunnel.
*/
function listenProxy(spec) {
	const rewriteAuthority = rewriteLoopbackAuthority(spec.backendPort);
	const tlsOption = typeof spec.tls === "object" && spec.tls !== null ? spec.tls : void 0;
	const tlsEnabled = tlsOption !== void 0 || spec.tls === true;
	const upgradedSockets = /* @__PURE__ */ new Set();
	const upstreamSockets = /* @__PURE__ */ new Set();
	const sessionConnections = /* @__PURE__ */ new Map();
	const trackSession = (sessionId, close) => {
		const connections = sessionConnections.get(sessionId) ?? /* @__PURE__ */ new Set();
		connections.add(close);
		sessionConnections.set(sessionId, connections);
		return () => {
			connections.delete(close);
			if (connections.size === 0) sessionConnections.delete(sessionId);
		};
	};
	const closeSessionConnections = (sessionId) => {
		const connections = sessionConnections.get(sessionId);
		if (connections === void 0) return;
		sessionConnections.delete(sessionId);
		for (const close of connections) close();
	};
	const trackUpstream = (up) => {
		upstreamSockets.add(up);
		up.once("close", () => upstreamSockets.delete(up));
	};
	const runtimeSpec = {
		...spec,
		tls: tlsEnabled,
		trustForwardedProto: typeof spec.trustForwardedProto === "function" ? spec.trustForwardedProto : () => spec.trustForwardedProto === true,
		trustForwardedFor: typeof spec.trustForwardedFor === "function" ? spec.trustForwardedFor : () => spec.trustForwardedFor === true,
		trustCloudflareConnectingIp: typeof spec.trustCloudflareConnectingIp === "function" ? spec.trustCloudflareConnectingIp : () => spec.trustCloudflareConnectingIp === true,
		rewriteAuthority,
		trackUpstream,
		loginTracker: createLoginTracker(spec),
		sessionStore: spec.sessionStore ?? createSessionStore({ maxAgeSeconds: spec.sessionMaxAgeSeconds }),
		sessionMaxAgeSeconds: spec.sessionMaxAgeSeconds ?? DEFAULT_SESSION_MAX_AGE_SECONDS,
		trackSession,
		closeSessionConnections,
		compressResponses: spec.compressResponses !== false,
		cacheHashedAssets: spec.cacheHashedAssets !== false
	};
	const upgradeTracker = createLoginTracker({
		loginMaxAttempts: spec.upgradeMaxAttempts ?? 10,
		loginLockoutMs: spec.upgradeLockoutMs ?? 3e5
	});
	const denyCidr = (req, res) => {
		const remote = effectiveRemoteAddress(req, runtimeSpec);
		if (spec.ipAllowed === void 0 || spec.ipAllowed(remote)) return false;
		spec.audit?.("access.denied", {
			reason: "cidr",
			remote,
			path: pathnameOf(req.url)
		});
		drainRequest(req);
		sendText(res, 403, "forbidden\n");
		return true;
	};
	const logRequest = spec.log === void 0 ? void 0 : (req, res) => {
		res.once("finish", () => {
			spec.log({
				method: req.method,
				path: pathnameOf(req.url),
				status: res.statusCode,
				remote: effectiveRemoteAddress(req, runtimeSpec)
			});
		});
	};
	const onRequest = async (req, res) => {
		logRequest?.(req, res);
		const path = pathnameOf(req.url);
		const cookie = parseCookies(req.headers.cookie)[spec.cookieName];
		if (denyCidr(req, res)) return;
		if (path === HEALTHZ_PATH) {
			res.writeHead(200, {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store"
			});
			res.end("{\"ok\":true}\n");
			return;
		}
		if (path === LOGIN_PATH) {
			await handleLogin(req, res, runtimeSpec);
			return;
		}
		if (handleWaitRoutes(req, res, runtimeSpec, path, cookie)) return;
		if (await handleDevicePages(req, res, runtimeSpec, path, cookie)) return;
		if (path.startsWith(spec.controlPrefix)) {
			drainRequest(req);
			sendText(res, 403, "forbidden\n");
			return;
		}
		const session = runtimeSpec.sessionStore.validate(cookie, effectiveRemoteAddress(req, runtimeSpec));
		if (session === void 0) {
			drainRequest(req);
			if (req.method === "GET" || req.method === "HEAD") redirect(res, LOGIN_PATH);
			else {
				res.writeHead(401, {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store"
				});
				res.end("{\"error\":\"authentication-required\"}\n");
			}
			return;
		}
		try { proxyRequest(req, res, runtimeSpec, session.id); }
		catch { drainRequest(req); sendText(res, 503, "backend authentication unavailable\n"); }
	};
	const serverOptions = {
		maxHeaderSize: spec.maxHeaderSizeBytes ?? 16384,
		requestTimeout: Math.max(spec.requestTimeoutMs ?? 3e5, spec.headersTimeoutMs ?? 15e3),
		headersTimeout: spec.headersTimeoutMs ?? 15e3,
		keepAliveTimeout: spec.keepAliveTimeoutMs ?? 5e3
	};
	const server = tlsOption !== void 0 ? createServer$1({
		...serverOptions,
		key: tlsOption.key,
		cert: tlsOption.cert
	}, onRequest) : createServer(serverOptions, onRequest);
	server.on("upgrade", (req, socket, head) => {
		upgradedSockets.add(socket);
		socket.once("close", () => upgradedSockets.delete(socket));
		const upgradeRemote = effectiveRemoteAddress(req, runtimeSpec);
		if (spec.ipAllowed !== void 0 && !spec.ipAllowed(upgradeRemote)) {
			denySocket(socket, "403 Forbidden");
			spec.audit?.("access.denied", {
				reason: "cidr",
				remote: upgradeRemote,
				path: pathnameOf(req.url),
				upgrade: true
			});
			return;
		}
		const upgradeRetryAfter = upgradeTracker.check(upgradeRemote);
		if (upgradeRetryAfter > 0) {
			denySocket(socket, "429 Too Many Requests", "too many requests\n");
			spec.audit?.("upgrade.locked", {
				remote: upgradeRemote,
				retryAfter: upgradeRetryAfter,
				path: pathnameOf(req.url),
				upgrade: true
			});
			return;
		}
		const path = pathnameOf(req.url);
		const cookie = parseCookies(req.headers.cookie)[spec.cookieName];
		const session = runtimeSpec.sessionStore.validate(cookie, upgradeRemote);
		if (path.startsWith(spec.controlPrefix) || session === void 0) {
			upgradeTracker.fail(upgradeRemote);
			upgradeTracker.prune();
			denySocket(socket, "401 Unauthorized");
			spec.audit?.("access.denied", {
				reason: "auth",
				remote: upgradeRemote,
				path: pathnameOf(req.url),
				upgrade: true
			});
			spec.log?.({
				method: req.method,
				path: pathnameOf(req.url),
				status: 401,
				remote: upgradeRemote
			});
			return;
		}
		try { runtimeSpec.backendCookie?.(); } catch { denySocket(socket, "503 Service Unavailable"); return; }
		const headers = forwardHeaders(req, rewriteAuthority, {
			tls: tlsEnabled,
			trustForwardedProto: runtimeSpec.trustForwardedProto(),
			forwardedFor: upgradeRemote,
			backendCookie: spec.backendCookie
		});
		headers.connection = "Upgrade";
		headers.upgrade = req.headers.upgrade ?? "websocket";
		const up = request({
			hostname: spec.backendHost,
			port: spec.backendPort,
			path: req.url,
			method: "GET",
			headers
		});
		trackUpstream(up);
		const releaseSession = session === void 0 ? void 0 : runtimeSpec.trackSession(session.id, () => {
			socket.destroy();
			up.destroy();
		});
		if (releaseSession !== void 0) socket.once("close", releaseSession);
		up.setTimeout(spec.upstreamTimeoutMs, () => {
			up.destroy();
		});
		up.on("upgrade", (upRes, upSocket, upHead) => {
			trackUpstream(upSocket);
			upgradeTracker.success(upgradeRemote);
			spec.audit?.("ws.open", {
				remote: upgradeRemote,
				path: pathnameOf(req.url),
				status: upRes.statusCode ?? 101
			});
			spec.log?.({
				method: req.method,
				path: pathnameOf(req.url),
				status: upRes.statusCode ?? 101,
				remote: upgradeRemote
			});
			writeRawHead(socket, upRes.statusCode ?? 101, upRes.statusMessage ?? "Switching Protocols", sanitizeUpgradeResponseHeaders(upRes.headers));
			if (upHead.length > 0) socket.write(upHead);
			if (head.length > 0) upSocket.write(head);
			upSocket.pipe(socket);
			socket.pipe(upSocket);
		});
		up.on("response", (upRes) => {
			spec.audit?.("ws.reject", {
				remote: upgradeRemote,
				path: pathnameOf(req.url),
				status: upRes.statusCode ?? 502
			});
			upRes.resume();
			writeRawHead(socket, upRes.statusCode ?? 502, upRes.statusMessage ?? "Bad Gateway", {
				...sanitizeResponseHeaders(upRes.headers),
				Connection: "close"
			});
			socket.destroy();
		});
		up.on("error", () => {
			socket.destroy();
		});
		socket.on("error", () => {
			up.destroy();
		});
		up.end();
	});
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(spec.listenPort, spec.listenHost, () => {
			server.off("error", reject);
			const address = server.address();
			const port = typeof address === "object" && address !== null ? address.port : spec.listenPort;
			let closed = false;
			resolve({
				host: spec.listenHost,
				port,
				closeSession: closeSessionConnections,
				close: () => new Promise((done, closeReject) => {
					if (closed) {
						done();
						return;
					}
					closed = true;
					sessionConnections.clear();
					for (const socket of upgradedSockets) socket.destroy();
					for (const up of upstreamSockets) up.destroy();
					server.closeAllConnections?.();
					let settled = false;
					const finish = (error) => {
						if (settled) return;
						settled = true;
						clearTimeout(timer);
						if (error === void 0) done();
						else closeReject(error);
					};
					const timer = setTimeout(() => {
						for (const socket of upgradedSockets) socket.destroy();
						for (const up of upstreamSockets) up.destroy();
						server.closeAllConnections?.();
						if (server.listening) finish(/* @__PURE__ */ new Error("close-timeout"));
						else finish();
					}, 2e3);
					timer.unref?.();
					server.close((error) => finish(error ?? void 0));
				})
			});
		});
	});
}
//#endregion
//#region src/persist.ts
/**
* persist — the plugin's durable state file (0600, atomic writes).
*
* Read side is defensive: malformed input can be surfaced to the runtime
* without being mistaken for a first install and overwritten.
*/
/** Default durable state location. */
function defaultStateFile() {
	return join(process.env.DSH_HOME || join(homedir(), ".dsh"), "reverse-proxy.json");
}
/**
* Missing or malformed state is treated as a clean disabled installation.
* Runtime listen overrides are kept only when they are well-formed, so a
* hand-edited state file can never crash the proxy at startup.
* @param {string} path
* @returns {Promise<{
*   enabled: boolean,
*   accessToken?: string,
*   listenHost?: string,
*   listenPort?: number,
*   sessions?: unknown[],
* }>}
*/
function normalizeState(parsed) {
	const value = parsed;
	const listenHost = value?.listenHost;
	const listenPort = value?.listenPort;
	return {
		enabled: value?.enabled === true,
		...typeof value?.accessToken === "string" && value.accessToken.length >= 24 ? { accessToken: value.accessToken } : {},
		...typeof listenHost === "string" && listenHost.length > 0 && listenHost.length <= 253 && !/[\s/\\]/.test(listenHost) ? { listenHost } : {},
		...typeof listenPort === "number" && Number.isInteger(listenPort) && listenPort >= 0 && listenPort <= 65535 ? { listenPort } : {},
		...Array.isArray(value?.sessions) ? { sessions: value.sessions } : {}
	};
}
/** Read state while preserving whether it was absent, valid, malformed, or unreadable. */
async function readStateDetailed(path = defaultStateFile()) {
	try {
		const raw = await readFile(path, "utf8");
		try {
			return {
				state: normalizeState(JSON.parse(raw)),
				status: "valid"
			};
		} catch (error) {
			return {
				state: { enabled: false },
				status: "malformed",
				error
			};
		}
	} catch (error) {
		if (error.code === "ENOENT") return {
			state: { enabled: false },
			status: "missing"
		};
		return {
			state: { enabled: false },
			status: "unreadable",
			error
		};
	}
}
/**
* Write atomically so a terminated process cannot leave truncated JSON.
* @param {string} path
* @param {{
*   enabled: boolean,
*   accessToken: string,
*   listenHost?: string,
*   listenPort?: number,
*   sessions?: unknown[],
* }} state
* @returns {Promise<void>}
*/
async function writeState(path, state) {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
		encoding: "utf8",
		mode: 384
	});
	await rename(temporary, path);
}
//#endregion
//#region src/tunnel.ts
/**
* tunnel — one-click Cloudflare quick tunnel in front of the proxy listener.
*
* The tunnel forwards to the PROXY (never the backend directly), so the token
* gate, approval, CIDR allowlist and audit all keep applying to tunnel
* traffic. Quick tunnels (trycloudflare) are free and anonymous; the URL is
* random per start, so nothing here is persisted or restored across restarts.
*
* Binary resolution order: configured path → PATH → download cache →
* on-demand download from the pinned GitHub release, SHA256-verified against
* the embedded table before it is ever written to the cache. No postinstall
* bundling (pnpm ≥10 blocks build scripts by default; a fat binary also
* punishes every installer who never opens a tunnel).
*/
/** Pinned upstream release. Bump together with CLOUDFLARED_ASSETS hashes. */
const CLOUDFLARED_VERSION = "2026.8.2";
/**
* Release artifacts of the pinned version (hashes verified locally against
* the published files). Windows arm64 has no upstream build — PATH discovery
* covers machines that already have cloudflared installed.
*/
const CLOUDFLARED_ASSETS = {
	"darwin-x64": {
		asset: "cloudflared-darwin-amd64.tgz",
		sha256: "f1727723c586500e2092368ae21871b3df7ddfd2cb097f22d81bee4a9c458bb4",
		tgz: true
	},
	"darwin-arm64": {
		asset: "cloudflared-darwin-arm64.tgz",
		sha256: "9042c2c5d8b2de78e60f313d5fb31b6c5c1cebde787a3caf1f2c9588084ac442",
		tgz: true
	},
	"linux-x64": {
		asset: "cloudflared-linux-amd64",
		sha256: "fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2",
		tgz: false
	},
	"linux-arm64": {
		asset: "cloudflared-linux-arm64",
		sha256: "7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790",
		tgz: false
	},
	"win32-x64": {
		asset: "cloudflared-windows-amd64.exe",
		sha256: "c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5",
		tgz: false
	}
};
const MAX_DOWNLOAD_BYTES = 134217728;
const DOWNLOAD_TIMEOUT_MS = 6e4;
function assetForPlatform(platform, arch) {
	return CLOUDFLARED_ASSETS[`${platform}-${arch}`];
}
/** Extract the trycloudflare URL from a cloudflared log line (any stream). */
function parseTunnelUrl(text) {
	return /https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com/i.exec(text)?.[0];
}
/**
* Pull the first regular file out of a single-file .tgz (the goreleaser
* darwin layout). GNU long-name ('L') and pax ('x') metadata entries are
* skipped by type; the binary itself is type '0' (or the legacy '\0').
*/
function extractTgzSingleFile(payload) {
	const tar = gunzipSync(payload);
	let offset = 0;
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		if (header[0] === 0) break;
		const size = Number.parseInt(header.subarray(124, 136).toString("latin1").replace(/\0.*$/s, "").trim(), 8);
		if (!Number.isFinite(size) || size < 0 || offset + 512 + size > tar.length) throw new Error("corrupt tar stream");
		const type = header[156];
		offset += 512;
		if (type === 0 || type === 48) return Buffer.from(tar.subarray(offset, offset + size));
		offset += Math.ceil(size / 512) * 512;
	}
	throw new Error("no regular file in tar stream");
}
/** Forwarding-header trust is live only after cloudflared is actually proxying. */
function tunnelTrustsForwarding(state) {
	return state === "online";
}
/** Failure whose message is a stable detail token for the panel i18n. */
var TunnelError = class extends Error {
	token;
	constructor(token) {
		super(token);
		this.token = token;
	}
};
async function isExecutable(path) {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
async function findOnPath(name) {
	const pathEnv = process.env.PATH ?? "";
	const names = process.platform === "win32" ? [`${name}.exe`, name] : [name];
	for (const dir of pathEnv.split(delimiter)) {
		if (dir === "") continue;
		for (const candidate of names) {
			const full = join(dir, candidate);
			if (await isExecutable(full)) return full;
		}
	}
}
function createTunnelManager(options) {
	const spawnFn = options.spawnFn ?? spawn;
	const fetchFn = options.fetchFn ?? fetch;
	const binName = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
	const cachedBin = join(options.cacheDir, binName);
	const cachedDigest = `${cachedBin}.sha256`;
	let state = "off";
	let publicUrl;
	let detail;
	let child;
	let connectTimer;
	let downloadAbort;
	/** Bumped by stop()/start(); stale async work notices and bows out. */
	let generation = 0;
	const status = () => ({
		state,
		...publicUrl !== void 0 ? { publicUrl } : {},
		...detail !== void 0 ? { detail } : {}
	});
	const fail = (token) => {
		state = "error";
		detail = token;
		publicUrl = void 0;
		options.audit?.("tunnel.error", { detail: token });
	};
	const clearConnectTimer = () => {
		if (connectTimer !== void 0) {
			clearTimeout(connectTimer);
			connectTimer = void 0;
		}
	};
	const download = async (spec) => {
		const url = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${spec.asset}`;
		let response;
		downloadAbort = new AbortController();
		const timeout = setTimeout(() => downloadAbort?.abort(), DOWNLOAD_TIMEOUT_MS);
		timeout.unref?.();
		try {
			response = await fetchFn(url, {
				redirect: "follow",
				signal: downloadAbort.signal
			});
		} catch (error) {
			clearTimeout(timeout);
			if (error instanceof Error && error.name === "AbortError") throw new TunnelError("aborted");
			throw new TunnelError("download-failed");
		}
		if (!response.ok) {
			clearTimeout(timeout);
			throw new TunnelError("download-failed");
		}
		if (Number(response.headers?.get("content-length") ?? 0) > MAX_DOWNLOAD_BYTES) {
			clearTimeout(timeout);
			throw new TunnelError("download-too-large");
		}
		let payload;
		try {
			payload = Buffer.from(await response.arrayBuffer());
		} catch (error) {
			clearTimeout(timeout);
			if (error instanceof Error && error.name === "AbortError") throw new TunnelError("aborted");
			throw new TunnelError("download-failed");
		}
		clearTimeout(timeout);
		if (payload.byteLength > MAX_DOWNLOAD_BYTES) throw new TunnelError("download-too-large");
		if (createHash("sha256").update(payload).digest("hex") !== spec.sha256) throw new TunnelError("integrity-failed");
		const binary = spec.tgz ? extractTgzSingleFile(payload) : payload;
		const binaryDigest = createHash("sha256").update(binary).digest("hex");
		await mkdir(options.cacheDir, { recursive: true });
		const tmp = join(options.cacheDir, `.cloudflared.download-${process.pid}`);
		const digestTmp = `${tmp}.sha256`;
		await writeFile(tmp, binary);
		await writeFile(digestTmp, `${binaryDigest}\n`);
		await chmod(tmp, 493);
		await rename(tmp, cachedBin);
		await rename(digestTmp, cachedDigest);
		return cachedBin;
	};
	const cachedBinaryIsValid = async () => {
		if (!await isExecutable(cachedBin)) return false;
		try {
			const expected = (await readFile(cachedDigest, "utf8")).trim();
			if (!/^[a-f0-9]{64}$/.test(expected)) return false;
			return createHash("sha256").update(await readFile(cachedBin)).digest("hex") === expected;
		} catch {
			return false;
		}
	};
	const resolveBinary = async (setStage) => {
		const configured = options.configuredPath ?? "";
		if (configured !== "") {
			if (await isExecutable(configured)) return configured;
			throw new TunnelError("configured-path-invalid");
		}
		const onPath = await findOnPath("cloudflared");
		if (onPath !== void 0) return onPath;
		if (await cachedBinaryIsValid()) return cachedBin;
		const spec = assetForPlatform(process.platform, process.arch);
		if (spec === void 0) throw new TunnelError("unsupported-platform");
		setStage("downloading");
		return download(spec);
	};
	const spawnTunnel = (gen, bin) => {
		let spawned;
		let logTail = "";
		try {
			spawned = spawnFn(bin, [
				"tunnel",
				"--url",
				options.target(),
				"--no-autoupdate"
			], { stdio: [
				"ignore",
				"pipe",
				"pipe"
			] });
		} catch {
			fail("spawn-failed");
			return;
		}
		child = spawned;
		const onData = (chunk) => {
			if (gen !== generation || state !== "starting") return;
			logTail = `${logTail}${chunk.toString("utf8")}`.slice(-4096);
			const url = parseTunnelUrl(logTail);
			if (url === void 0) return;
			clearConnectTimer();
			state = "online";
			publicUrl = url;
			detail = void 0;
			options.audit?.("tunnel.start", { publicUrl: url });
			options.log?.(`reverse-proxy: cloudflared tunnel online at ${url}`);
		};
		spawned.stdout?.on("data", onData);
		spawned.stderr?.on("data", onData);
		spawned.once("error", () => {
			if (child !== spawned) return;
			child = void 0;
			clearConnectTimer();
			if (gen === generation && state === "starting") fail("spawn-failed");
		});
		spawned.once("exit", () => {
			if (child !== spawned) return;
			child = void 0;
			clearConnectTimer();
			if (gen !== generation) return;
			if (state === "starting") fail("connect-failed");
			else if (state === "online") fail("exited");
		});
		connectTimer = setTimeout(() => {
			connectTimer = void 0;
			if (gen !== generation || state !== "starting") return;
			fail("connect-timeout");
			if (child === spawned) {
				child = void 0;
				spawned.kill();
			}
		}, 45e3);
		connectTimer.unref?.();
	};
	const run = async (gen) => {
		let bin;
		try {
			bin = await resolveBinary((stage) => {
				if (gen === generation && state === "starting") detail = stage;
			});
		} catch (error) {
			if (gen !== generation) return;
			fail(error instanceof TunnelError && error.token !== "aborted" ? error.token : "download-failed");
			return;
		}
		if (gen !== generation || state !== "starting") return;
		detail = "connecting";
		spawnTunnel(gen, bin);
	};
	return {
		status,
		start() {
			if (state === "starting" || state === "online") return Promise.resolve(status());
			const gen = ++generation;
			state = "starting";
			detail = "resolving";
			publicUrl = void 0;
			run(gen);
			return Promise.resolve(status());
		},
		async stop() {
			const wasActive = state === "starting" || state === "online";
			generation += 1;
			clearConnectTimer();
			downloadAbort?.abort();
			downloadAbort = void 0;
			const current = child;
			child = void 0;
			if (current !== void 0) {
				const exited = new Promise((resolve) => current.once("exit", () => resolve()));
				current.kill();
				const grace = new Promise((resolve) => {
					setTimeout(resolve, 3e3).unref?.();
				});
				await Promise.race([exited, grace]);
				if (current.exitCode === null && current.signalCode === null) current.kill("SIGKILL");
			}
			state = "off";
			publicUrl = void 0;
			detail = void 0;
			if (wasActive) options.audit?.("tunnel.stop");
			return status();
		}
	};
}
//#endregion
//#region src/audit.ts
/**
* audit — append-only JSONL security event log next to the state file.
*
* Failures to write never throw into the request path; they warn through
* the supplied logger. Disabled when auditLog is empty/false.
*
* The log is size-capped: past `maxBytes` it rotates to `<path>.1` (one
* generation kept, older events discarded). Writes are serialized through a
* queue so concurrent events cannot interleave a rotation.
*/
/** Default rotation threshold for the append-only audit log. */
const DEFAULT_MAX_AUDIT_BYTES = 8388608;
/**
* @param {{
*   path?: string,
*   enabled?: boolean,
*   maxBytes?: number,
*   warn?: (error: Error) => void,
* }} options
*/
function createAuditLog(options = {}) {
	const enabled = options.enabled === true && typeof options.path === "string" && options.path !== "";
	const path = options.path;
	const warn = options.warn;
	const maxBytes = typeof options.maxBytes === "number" && options.maxBytes > 0 ? options.maxBytes : DEFAULT_MAX_AUDIT_BYTES;
	let queue = Promise.resolve();
	const write = (event, fields = {}) => {
		if (!enabled || path === void 0) return queue;
		const line = `${JSON.stringify({
			ts: (/* @__PURE__ */ new Date()).toISOString(),
			event,
			...fields
		})}\n`;
		queue = queue.then(async () => {
			try {
				await mkdir(dirname(path), { recursive: true });
				if (await stat(path).then((info) => info.size, () => 0) >= maxBytes) {
					await rm(`${path}.1`, { force: true });
					await rename(path, `${path}.1`);
				}
				await appendFile(path, line, {
					encoding: "utf8",
					mode: 384
				});
			} catch (error) {
				warn?.(asError(error));
			}
		});
		return queue;
	};
	return {
		enabled,
		path: enabled ? path : void 0,
		record: write
	};
}
/** Default audit path beside the state file. */
function defaultAuditPath(statePath) {
	return `${String(statePath).replace(/\.json$/i, "")}.audit.jsonl`;
}
const TAIL_READ_BYTES = 65536;
function parseJsonl(text, event) {
	const events = [];
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue;
		try {
			const parsed = JSON.parse(line);
			if (event !== void 0 && parsed.event !== event) continue;
			events.push(parsed);
		} catch {}
	}
	return events;
}
/**
* Read the most recent audit events from a JSONL audit file.
*
* Only the tail of the file is read, so a large append-only audit log does
* not have to be loaded fully into memory. Malformed lines are skipped so a
* partially written line never breaks the control panel. A missing/unreadable
* file is treated as an empty log.
*/
async function readAuditLog(path, limit = 50, event) {
	if (path === void 0 || path === "") return [];
	let handle;
	try {
		handle = await open(path, "r");
		const { size } = await handle.stat();
		if (size === 0) return [];
		const readSize = Math.min(size, TAIL_READ_BYTES);
		const buffer = Buffer.alloc(readSize);
		await handle.read(buffer, 0, readSize, size - readSize);
		let text = buffer.toString("utf8");
		if (size > readSize) {
			const firstNewline = text.indexOf("\n");
			if (firstNewline === -1) return [];
			text = text.slice(firstNewline + 1);
		}
		return parseJsonl(text, event).slice(-limit);
	} catch {
		return [];
	} finally {
		await handle?.close().catch(() => {});
	}
}
/**
* Read the full audit log for export.
*
* This is an explicit user action (download), so it is allowed to read the
* whole file. Malformed lines are skipped and an optional event filter is
* applied.
*/
async function readAuditLogAll(path, event) {
	if (path === void 0 || path === "") return [];
	try {
		return parseJsonl(await readFile(path, "utf8"), event);
	} catch {
		return [];
	}
}
//#endregion
//#region src/invites.ts
/**
* invites — short-lived one-time login codes for phone QR / invite links.
*
* The master access token never appears in the invite URL. Each code is
* single-use and expires; rotating the token clears every outstanding invite.
*/
const CODE_BYTES = 18;
const DEFAULT_TTL_MS = 9e5;
const DEFAULT_MAX_PENDING = 32;
/** Same-IP retry grace after a successful consume. A flaky tunnel can drop
*  the login redirect after the code was already consumed; the browser then
*  re-POSTs the same code. Without a grace the retry would deadlock into the
*  token form even though the first attempt actually signed in. */
const DEFAULT_RETRY_GRACE_MS = 6e4;
function createInviteStore(options = {}) {
	const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
	const maxPending = options.maxPending ?? DEFAULT_MAX_PENDING;
	const retryGraceMs = options.retryGraceMs ?? DEFAULT_RETRY_GRACE_MS;
	const codes = /* @__PURE__ */ new Map();
	const prune = (now = Date.now()) => {
		for (const [code, entry] of codes) if (entry.expiresAt <= now) codes.delete(code);
		while (codes.size > maxPending) {
			const oldest = codes.keys().next().value;
			if (oldest === void 0) break;
			codes.delete(oldest);
		}
	};
	return {
		/**
		* Mint a fresh one-time code. Returns the plaintext code (store only
		* expiry — codes are high-entropy and never persisted to disk).
		*/
		issue() {
			prune();
			const code = randomBytes(CODE_BYTES).toString("base64url");
			codes.set(code, { expiresAt: Date.now() + ttlMs });
			return code;
		},
		/**
		* Consume a code. The first consume marks the code used and records the
		* client IP; a repeat consume from the SAME IP inside the retry grace
		* window is treated as a legitimate browser retry (ok + retry) so a
		* lost redirect cannot deadlock the phone into the token form. Any other
		* reuse is rejected and the code is forgotten.
		*/
		consume(code, ip, now = Date.now()) {
			const key = String(code ?? "");
			if (key === "") return { ok: false };
			const entry = codes.get(key);
			if (entry === void 0) return { ok: false };
			if (entry.expiresAt <= now) {
				codes.delete(key);
				return { ok: false };
			}
			if (entry.usedAt === void 0) {
				entry.usedAt = now;
				entry.usedIp = ip === void 0 || ip === "" ? void 0 : ip;
				return {
					ok: true,
					retry: false
				};
			}
			if (ip !== void 0 && ip !== "" && entry.usedIp !== void 0 && entry.usedIp === ip && now - entry.usedAt <= retryGraceMs) return {
				ok: true,
				retry: true,
				sessionId: entry.sessionId
			};
			codes.delete(key);
			return { ok: false };
		},
		/** Remember the device session minted on first consume so a retry can reuse it. */
		bindSession(code, sessionId) {
			const entry = codes.get(code);
			if (entry === void 0 || entry.usedAt === void 0) return;
			entry.sessionId = sessionId;
		},
		clear() {
			codes.clear();
		},
		/** Test helper / diagnostics. */
		size() {
			prune();
			return codes.size;
		}
	};
}
//#endregion
//#region src/self-check.ts
/**
* self-check — probe whether Host/Origin rewrite would open the harness
* privilege fence for `settings.describe`.
*
* Hits the backend directly with the same rewriteAuthority the proxy uses.
* A 403 means the fence is still closed; any other status means the Host
* check passed (the method may still 404/400 without a full RPC body).
*/
const METHOD = "settings.describe";
const PATH = `/api/${METHOD}`;
/**
* @param {{
*   backendHost: string,
*   backendPort: number,
*   timeoutMs?: number,
* }} spec
* @returns {Promise<{
*   ok: boolean,
*   method: string,
*   status: number,
*   rewriteAuthority: string,
*   detail?: string,
* }>}
*/
function probeFence(spec) {
	const rewriteAuthority = rewriteLoopbackAuthority(spec.backendPort);
	const timeoutMs = spec.timeoutMs ?? 3e3;
	const body = JSON.stringify({
		type: "client-request",
		rpcId: "dsh-full-remote-self-check",
		method: METHOD,
		payload: { args: {} }
	});
	return new Promise((resolve) => {
		const up = request({
			hostname: spec.backendHost,
			port: spec.backendPort,
			path: PATH,
			method: "POST",
			headers: {
				host: rewriteAuthority,
				origin: `http://${rewriteAuthority}`,
				"sec-fetch-site": "same-origin",
				"content-type": "application/json",
				"content-length": Buffer.byteLength(body),
				"x-dsh-reverse-proxy": "1",
				...(spec.backendCookie ? { cookie: spec.backendCookie() } : {})
			}
		}, (incoming) => {
			clearTimeout(timer);
			incoming.resume();
			const status = incoming.statusCode ?? 0;
			resolve({
				ok: status !== 401 && status !== 403 && status !== 0,
				method: METHOD,
				status,
				rewriteAuthority,
				...status === 401 ? { detail: "backend-authentication-denied" } : status === 403 ? { detail: "privilege-fence-denied" } : {}
			});
		});
		const timer = setTimeout(() => {
			up.destroy(/* @__PURE__ */ new Error("self-check timeout"));
		}, timeoutMs);
		timer.unref?.();
		up.on("error", (error) => {
			clearTimeout(timer);
			resolve({
				ok: false,
				method: METHOD,
				status: 0,
				rewriteAuthority,
				detail: asError(error).message
			});
		});
		up.end(body);
	});
}
//#endregion
//#region src/qr-svg.ts
/**
* qr-svg — invite-link QR via `uqr` (no canvas / CDN).
*/
/**
* @param {string} text
* @returns {string | null}
*/
function qrToSvg(text) {
	const value = String(text ?? "");
	if (value === "" || value.length > 512) return null;
	try {
		return renderSVG(value, {
			ecc: "M",
			border: 2
		});
	} catch {
		return null;
	}
}
//#endregion
//#region src/control.ts
/**
* Frozen control-surface identifiers (roadmap §7.1 class 2/3/4).
*
* Plugin id, cookie name, this prefix, the forwarding header, and the
* polyfill marker are frozen: renaming any of them drops sessions or
* silently disables anti-spoof stripping. Only the npm package name moves.
*
* The client bundle imports this module (no Node builtins).
*/
const CONTROL_PREFIX = "/dsh-reverse-proxy";
//#endregion
//#region src/config-validation.ts
/** Security invariants shared by every reverse-proxy runtime entry point. */
/** Reject security-sensitive partial or malformed configuration at load time. */
function validateRuntimeConfig(config) {
	const certFile = typeof config.tlsCertFile === "string" ? config.tlsCertFile : "";
	const keyFile = typeof config.tlsKeyFile === "string" ? config.tlsKeyFile : "";
	if (certFile.trim() !== "" !== (keyFile.trim() !== "")) throw new Error("reverse-proxy: tlsCertFile and tlsKeyFile must be configured together.");
	if (config.trustCloudflareConnectingIp === true && config.trustForwardedFor !== true) throw new Error("reverse-proxy: trustCloudflareConnectingIp requires trustForwardedFor to be enabled.");
	for (const [key, min, max] of [
		[
			"maxRequestBytes",
			1024,
			268435456
		],
		[
			"upstreamTimeoutMs",
			1e3,
			6e5
		],
		[
			"sessionMaxAgeSeconds",
			60,
			31536e3
		],
		[
			"sessionIdleSeconds",
			0,
			31536e3
		],
		[
			"maxHeaderSizeBytes",
			1024,
			16777216
		],
		[
			"headersTimeoutMs",
			1e3,
			6e5
		],
		[
			"requestTimeoutMs",
			1e3,
			864e5
		],
		[
			"keepAliveTimeoutMs",
			1e3,
			6e5
		],
		[
			"loginDelayMs",
			0,
			1e4
		],
		[
			"loginMaxAttempts",
			1,
			1e4
		],
		[
			"loginLockoutSeconds",
			10,
			86400
		],
		[
			"upgradeMaxAttempts",
			1,
			1e4
		],
		[
			"upgradeLockoutSeconds",
			10,
			86400
		],
		[
			"maxSessions",
			1,
			64
		]
	]) {
		const value = config[key];
		if (value === void 0) continue;
		if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) throw new Error(`reverse-proxy: ${String(key)} must be an integer between ${min} and ${max}.`);
	}
	if (config.cookieName !== void 0) {
		const cookieName = typeof config.cookieName === "string" ? config.cookieName : "";
		if (cookieName === "" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(cookieName)) throw new Error("reverse-proxy: cookieName must be a valid RFC cookie token.");
	}
	const invalidCidrs = (Array.isArray(config.allowedCidrs) ? config.allowedCidrs : []).filter((entry) => typeof entry !== "string" || parseCidr(entry) === void 0);
	if (invalidCidrs.length > 0) throw new Error(`reverse-proxy: allowedCidrs contains invalid CIDR entries: ${invalidCidrs.map((entry) => JSON.stringify(entry)).join(", ")}`);
}
/** Keep the backend SSRF boundary at every runtime entry point. */
function validateBackendHost(backendHost) {
	if (isWildcardHost(backendHost)) throw new Error(`reverse-proxy: backendHost "${backendHost}" is a wildcard listen address, not a backend. Use 127.0.0.1.`);
	if (!isLoopbackHost(backendHost)) throw new Error(`reverse-proxy: backendHost "${backendHost}" must be a loopback address (127.0.0.1 / localhost / ::1). A non-loopback backend would let authenticated remote clients reach an arbitrary TCP target.`);
}
const PAGE_BOOTSTRAP_SOURCE = "(function(){var c=globalThis.crypto;if(c&&typeof c.randomUUID!==\"function\"&&typeof c.getRandomValues===\"function\"){function u(){var b=c.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=[];for(var i=0;i<16;i++){var s=b[i].toString(16);h[i]=s.length===1?\"0\"+s:s}return h[0]+h[1]+h[2]+h[3]+\"-\"+h[4]+h[5]+\"-\"+h[6]+h[7]+\"-\"+h[8]+h[9]+\"-\"+h[10]+h[11]+h[12]+h[13]+h[14]+h[15]}try{Object.defineProperty(c,\"randomUUID\",{value:u,configurable:true})}catch(e){try{c.randomUUID=u}catch(e2){}}}var AS=globalThis.AbortSignal;if(AS&&typeof AS.any!==\"function\"){AS.any=function(ss){var x=new AbortController();function a(){x.abort()};for(var i=0;i<ss.length;i++){if(ss[i].aborted){x.abort();return x.signal}ss[i].addEventListener(\"abort\",a,{once:true})}return x.signal}}var CONN=" + JSON.stringify("@deepseek-ai/dsh-client-connection") + ";function wrapApply(fn){if(fn&&fn.__dshFullRemoteApply)return fn;function wrapped(ctx){var result=fn.apply(this,arguments);function pin(){if(!ctx||typeof ctx.get!==\"function\"||globalThis.__DSH_FULL_REMOTE_TRUSTED__!==1)return;try{var connection=ctx.get(\"connection\",false);if(connection&&typeof connection===\"object\"){Object.defineProperty(connection,\"isLoopback\",{value:true,configurable:true,enumerable:true,writable:true})}}catch(e5){try{console.warn(\"[dsh-full-remote] could not pin connection.isLoopback\",e5)}catch(e5b){}}}if(result&&typeof result.then===\"function\")return result.then(function(v){pin();return v});pin();return result}try{Object.defineProperty(wrapped,\"__dshFullRemoteApply\",{value:true})}catch(eW){wrapped.__dshFullRemoteApply=true}return wrapped}function wrapExports(mod){if(!mod)return mod;try{if(typeof mod.apply===\"function\")mod.apply=wrapApply(mod.apply);if(mod.default&&typeof mod.default.apply===\"function\")mod.default.apply=wrapApply(mod.default.apply)}catch(e8){try{console.warn(\"[dsh-full-remote] ModuleLoader export wrap failed\",e8);globalThis.__DSH_FULL_REMOTE_BOOTSTRAP_FAILED__=1}catch(e8b){}}return mod}function wrapLoadFn(fn){if(typeof fn!==\"function\")return fn;if(fn.__dshFullRemoteLoad)return fn;function wrappedLoad(h){if(h&&h.id===CONN&&typeof h.factory===\"function\"){var inner=h.factory;h=Object.assign({},h,{factory:function(req){return wrapExports(inner(req))}})}return fn.call(this,h)};try{Object.defineProperty(wrappedLoad,\"__dshFullRemoteLoad\",{value:true})}catch(eL){wrappedLoad.__dshFullRemoteLoad=true}return wrappedLoad}function installLoadTrap(loader){if(!loader)return;var desc;try{desc=Object.getOwnPropertyDescriptor(loader,\"load\")}catch(eD){desc=undefined}if(desc&&typeof desc.set===\"function\"&&desc.set.__dshFullRemoteLoadTrap)return;var current=wrapLoadFn(typeof loader.load===\"function\"?loader.load:undefined);function setLoad(v){current=wrapLoadFn(v)}setLoad.__dshFullRemoteLoadTrap=true;try{Object.defineProperty(loader,\"load\",{configurable:true,enumerable:true,get:function(){return current},set:setLoad})}catch(eT){if(typeof loader.load===\"function\")loader.load=wrapLoadFn(loader.load)}}function wrapCreate(loader){if(!loader||typeof loader.create!==\"function\"||loader.create.__dshFullRemoteCreate)return;var origCreate=loader.create;function wrappedCreate(){var result=origCreate.apply(this,arguments);installLoadTrap(this);installLoadTrap(loader);if(result&&result!==loader&&result!==this)installLoadTrap(result);return result}try{Object.defineProperty(wrappedCreate,\"__dshFullRemoteCreate\",{value:true})}catch(eC){wrappedCreate.__dshFullRemoteCreate=true}try{loader.create=wrappedCreate}catch(eC2){try{console.warn(\"[dsh-full-remote] ModuleLoader create wrap failed\",eC2)}catch(eC3){}}}function wrapLoader(loader){if(!loader)return loader;installLoadTrap(loader);wrapCreate(loader);try{Object.defineProperty(loader,\"__dshFullRemoteTrusted\",{value:true})}catch(e9){loader.__dshFullRemoteTrusted=true}return loader}var current;try{current=globalThis.__ModuleLoader__;Object.defineProperty(globalThis,\"__ModuleLoader__\",{configurable:true,enumerable:true,get:function(){return current},set:function(v){current=wrapLoader(v)}});if(current)current=wrapLoader(current);try{Object.defineProperty(globalThis,\"__DSH_FULL_REMOTE_TRUSTED__\",{value:1,configurable:true})}catch(e3){try{globalThis.__DSH_FULL_REMOTE_TRUSTED__=1}catch(e4){}}}catch(e10){try{console.warn(\"[dsh-full-remote] __ModuleLoader__ wrap failed — settings may stay memory-scoped\",e10);globalThis.__DSH_FULL_REMOTE_BOOTSTRAP_FAILED__=1}catch(e10b){}}})();";
//#endregion
//#region src/index-enhancements.ts
const VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover";
const INDEX_BOOTSTRAP = `<script data-plugin="dsh-reverse-proxy">${PAGE_BOOTSTRAP_SOURCE}<\/script>`;
function injectViewport(html) {
	return html.replace(/content="width=device-width, initial-scale=1(?:, viewport-fit=cover)?"/, `content="${VIEWPORT}"`);
}
/**
* Inject the small browser compatibility/bootstrap payload into the host
* index. This transform is deliberately pure and idempotent because the
* host may invoke index taps more than once during a reload.
*/
function injectIndexEnhancements(html) {
	const withViewport = injectViewport(html);
	if (!withViewport.includes("<head>")) return withViewport;
	if (withViewport.includes("data-plugin=\"dsh-reverse-proxy\"")) return withViewport;
	return withViewport.replace("<head>", `<head>${INDEX_BOOTSTRAP}`);
}
//#endregion
//#region src/control-routes.ts
function isLoopbackOrigin(origin) {
	if (origin === void 0) return true;
	try {
		return isLoopbackHost(new URL(origin).hostname);
	} catch {
		return false;
	}
}
function auditQuery(req) {
	const url = new URL(req.url ?? "/", "http://localhost");
	const rawLimit = Number(url.searchParams.get("limit") ?? 50);
	return {
		limit: Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50,
		event: url.searchParams.get("event")?.trim() || void 0
	};
}
/** Build the authenticated loopback control API without owning runtime state. */
function createControlRoutes(deps) {
	const withJson = (fn) => async (req, res) => {
		let body;
		try {
			body = await readJson(req);
		} catch {
			sendJson(res, 400, { error: "invalid-request" });
			return;
		}
		try {
			await fn(body, res);
		} catch (error) {
			deps.warn(error);
			sendJson(res, 500, { error: "action-failed" });
		}
	};
	const routes = /* @__PURE__ */ new Map();
	const route = (method, suffix, handler) => {
		routes.set(`${method} ${CONTROL_PREFIX}${suffix}`, handler);
	};
	const runAction = (action) => async (_req, res) => {
		try {
			sendJson(res, 200, await deps.exclusive(action));
		} catch (error) {
			deps.warn(error);
			sendJson(res, 500, { error: "action-failed" });
		}
	};
	route("GET", "/status", async (_req, res) => {
		sendJson(res, 200, await deps.shared(() => deps.snapshot()));
	});
	route("POST", "/self-check", async (_req, res) => {
		sendJson(res, 200, await deps.shared(() => deps.runSelfCheck()));
	});
	route("POST", "/invite", withJson(async (body, res) => {
		const invite = await deps.shared(() => deps.buildInvite(typeof body.publicBase === "string" ? body.publicBase : void 0));
		if ("error" in invite) {
			sendJson(res, invite.error === "not-running" ? 409 : 400, invite);
			return;
		}
		deps.audit.record("invite.create");
		sendJson(res, 200, invite);
	}));
	route("GET", "/token", async (_req, res) => {
		if (!deps.allowTokenRead) {
			sendJson(res, 403, { error: "token-read-disabled" });
			return;
		}
		sendJson(res, 200, { accessToken: await deps.readToken() });
	});
	route("GET", "/sessions", async (_req, res) => {
		sendJson(res, 200, { sessions: await deps.shared(() => deps.listSessions()) });
	});
	route("GET", "/audit", async (req, res) => {
		const { limit, event } = auditQuery(req);
		sendJson(res, 200, await deps.shared(async () => ({
			enabled: deps.audit.enabled,
			events: await readAuditLog(deps.audit.path, limit, event)
		})));
	});
	route("GET", "/audit/export", async (req, res) => {
		const { event } = auditQuery(req);
		const events = await deps.shared(() => readAuditLogAll(deps.audit.path, event));
		res.writeHead(200, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			"content-disposition": "attachment; filename=\"dsh-reverse-proxy-audit.json\"",
			"x-content-type-options": "nosniff"
		});
		res.end(JSON.stringify(events, null, 2));
	});
	route("POST", "/tunnel/start", async (_req, res) => {
		const outcome = await deps.exclusive(() => deps.startTunnel());
		if (outcome !== "ok") {
			sendJson(res, outcome === "not-running" || outcome === "disposed" ? 409 : 400, { error: outcome });
			return;
		}
		sendJson(res, 200, await deps.shared(() => deps.snapshot()));
	});
	route("POST", "/tunnel/stop", async (_req, res) => {
		sendJson(res, 200, await deps.exclusive(() => deps.stopTunnel()));
	});
	const mutateSession = (action) => withJson(async (body, res) => {
		const id = typeof body.id === "string" ? body.id : "";
		const label = typeof body.label === "string" ? body.label : void 0;
		sendJson(res, 200, { ok: await deps.mutateSession(action, id, label) });
	});
	route("POST", "/sessions/approve", mutateSession("approve"));
	route("POST", "/sessions/revoke", mutateSession("revoke"));
	route("POST", "/sessions/rename", mutateSession("rename"));
	route("POST", "/start", runAction(deps.start));
	route("POST", "/stop", runAction(deps.stop));
	route("POST", "/rotate-token", runAction(deps.rotateToken));
	route("POST", "/listen", withJson(async (body, res) => {
		sendJson(res, 200, await deps.setListen(body.host, body.port));
	}));
	const handle = async (req, res) => {
		if (!isLoopbackHost(req.socket.remoteAddress ?? "")) {
			sendJson(res, 403, { error: "loopback-required" });
			return;
		}
		const handler = routes.get(`${req.method} ${pathnameOf(req.url)}`);
		if (handler === void 0) {
			sendJson(res, 404, { error: "not-found" });
			return;
		}
		if (req.headers["x-dsh-reverse-proxy-control"] !== "1" || !isLoopbackOrigin(req.headers.origin)) {
			sendJson(res, 403, { error: "forbidden" });
			return;
		}
		await handler(req, res);
	};
	return { handle };
}
//#endregion
//#region src/directory-picker.ts
/**
* Pin Harness's in-app directory browser when this plugin is the only layer
* doing so. Other remote-access bundles (e.g. deepseek-harness-auth) insert
* the same official rows under the same ids; a second insert crashes boot
* with `duplicate loader entry id`.
*
* The patch therefore only disables the adaptive `directory-picker` row.
* Browse faces are created at runtime when those canonical ids are absent
* from the whole loader tree (including nested Include subtrees).
*/
const DIRECTORY_PICKER_NATIVE_OPT_OUT = "DSH_FULL_REMOTE_USE_NATIVE_PICKER";
const CANONICAL_BROWSE_ENTRY_IDS = ["directory-picker-browse", "ui-directory-picker-browse"];
const BROWSE_HOST_PACKAGE = "@deepseek-ai/dsh-host-directory-picker-browse";
const BROWSE_UI_PACKAGE = "@deepseek-ai/dsh-client-ui-directory-picker-browse";
function localEntryId(entry) {
	const local = entry.options?.id;
	if (typeof local === "string" && local !== "") return local;
	if (typeof entry.id === "string" && entry.id !== "") {
		const parts = entry.id.split(":");
		return parts[parts.length - 1];
	}
}
function loaderEntryIds(loader) {
	if (typeof loader.entries === "function") {
		const ids = [];
		for (const entry of loader.entries()) {
			const id = localEntryId(entry);
			if (id !== void 0) ids.push(id);
		}
		return ids;
	}
	return Object.keys(loader.store ?? {});
}
// 0.2.0: the official adaptive/native pickers ship in the tree, and
// dsh-api-workspace-controller provides the same `directoryPicker` service.
// Pinning the browse pair on top of either makes the second registrant throw
// "service \"directoryPicker\" has been registered" on every boot.
const OFFICIAL_DIRECTORY_PICKER_ENTRY_IDS = ["directory-picker", "directory-picker-auto", "directory-picker-native", "api-workspace-controller"];
function shouldPinBrowseDirectoryPicker(input) {
	if (input.nativeOptOut) return false;
	const ids = new Set(input.existingIds);
	const hasCanonical = CANONICAL_BROWSE_ENTRY_IDS.some((id) => ids.has(id));
	const hasOfficial = OFFICIAL_DIRECTORY_PICKER_ENTRY_IDS.some((id) => ids.has(id));
	return !hasCanonical && !hasOfficial;
}
function getOptionalLoader(ctx) {
	if (typeof ctx.get !== "function") return void 0;
	const loader = ctx.get("loader");
	if (loader === null || typeof loader !== "object") return void 0;
	if (typeof loader.create !== "function") return void 0;
	return loader;
}
async function pinBrowseDirectoryPicker(loader) {
	const ids = [];
	try {
		ids.push(await loader.create({ name: BROWSE_HOST_PACKAGE }));
		ids.push(await loader.create({ name: BROWSE_UI_PACKAGE }));
		return ids;
	} catch (error) {
		for (const id of [...ids].reverse()) await loader.remove?.(id);
		throw error;
	}
}
async function unpinBrowseDirectoryPicker(loader, ids) {
	for (const id of [...ids].reverse()) await loader.remove?.(id);
}
function startBrowsePin(ctx, nativeOptOut, onError) {
	const loader = getOptionalLoader(ctx);
	const created = [];
	let pinning = Promise.resolve();
	if (loader !== void 0 && shouldPinBrowseDirectoryPicker({
		nativeOptOut,
		existingIds: loaderEntryIds(loader)
	})) pinning = pinBrowseDirectoryPicker(loader).then((ids) => {
		created.push(...ids);
	}, onError);
	return {
		ready: pinning,
		async dispose() {
			await pinning;
			if (loader !== void 0) await unpinBrowseDirectoryPicker(loader, created);
		}
	};
}
//#endregion
//#region src/index.ts
const name = "reverse-proxy";
const inject = ["webServer", "connection"];
/** Hostnames, IPv4, and bracketed IPv6 all pass; node listen() is the final judge. */
function isValidListenHost(value) {
	if (value.length === 0 || value.length > 253) return false;
	return !/[\s/\\]/.test(value);
}
function createRuntime(ctx, config, deps = {}) {
	validateBackendHost(config.backendHost);
	validateRuntimeConfig(config);
	let bound;
	let backendAuth;
	let disposed = false;
	let state;
	/** Do not overwrite a malformed/unreadable existing state file automatically. */
	let statePersistenceBlocked = false;
	/** Last start refusal, kept in memory so the panel can explain a stopped proxy. */
	let lastFailure;
	/** Mutating operations share one exclusive queue so start/stop/listen/rotate never interleave. */
	let writeGate = Promise.resolve();
	const warn = (error) => {
		ctx.logger.warn(asError(error));
	};
	const exclusive = (fn) => {
		const run = writeGate.then(fn, fn);
		writeGate = run.then(() => {}, () => {});
		return run;
	};
	/** Reads wait for the current write to finish, then run concurrently with each other. */
	const shared = async (fn) => {
		await writeGate;
		return fn();
	};
	const statePath = config.stateFile || defaultStateFile();
	const cidrRules = compileCidrList(Array.isArray(config.allowedCidrs) ? config.allowedCidrs : []);
	const audit = createAuditLog({
		enabled: config.auditLog === true,
		path: config.auditLogFile || defaultAuditPath(statePath),
		warn: (error) => {
			ctx.logger.warn(error);
		}
	});
	const inviteStore = createInviteStore();
	const scheme = () => config.tlsCertFile && config.tlsKeyFile ? "https" : "http";
	/** One-click cloudflared quick tunnel. Session-scoped: never persisted or auto-restored (the URL is random per start). */
	const tunnel = (deps.createTunnel ?? createTunnelManager)({
		target: () => {
			if (bound === void 0) return "";
			return formatHttpUrl(isWildcardHost(bound.host) || isLoopbackHost(bound.host) ? "127.0.0.1" : bound.host, bound.port, "http");
		},
		configuredPath: config.cloudflaredPath,
		cacheDir: join(dirname(statePath), "bin"),
		audit: (event, fields) => {
			audit.record(event, fields);
		},
		log: (message) => {
			ctx.logger.info(message);
		}
	});
	/** Tunnel trust is live only after cloudflared has reached online state. */
	const tunnelLive = () => tunnelTrustsForwarding(tunnel.status().state);
	let sessionStore;
	let saveTimer;
	/** In-flight first load, memoized so concurrent callers share one read. */
	let loadPromise;
	const scheduleSave = () => {
		if (saveTimer !== void 0) return;
		saveTimer = setTimeout(() => {
			saveTimer = void 0;
			exclusive(() => save());
		}, 2e3);
		saveTimer.unref?.();
	};
	const load = () => {
		if (state !== void 0) return Promise.resolve(state);
		loadPromise ??= (async () => {
			const result = await readStateDetailed(statePath);
			const loaded = result.state;
			statePersistenceBlocked = result.status === "malformed" || result.status === "unreadable";
			if (statePersistenceBlocked) ctx.logger.warn(`reverse-proxy: state file ${statePath} is ${result.status}; keeping a temporary in-memory state and refusing automatic overwrite`);
			const regeneratedToken = loaded.accessToken === void 0;
			if (regeneratedToken) loaded.accessToken = generateAccessToken();
			state = loaded;
			sessionStore = createSessionStore({
				maxSessions: config.maxSessions,
				maxAgeSeconds: config.sessionMaxAgeSeconds,
				idleSeconds: config.sessionIdleSeconds,
				approvalRequired: config.approvalMode,
				onChange: scheduleSave
			});
			if (!regeneratedToken) sessionStore.hydrate(loaded.sessions);
			if (!statePersistenceBlocked) await save();
			return loaded;
		})();
		return loadPromise;
	};
	const save = async (options = {}) => {
		if (state === void 0) return false;
		if (statePersistenceBlocked) {
			if (options.required === true) throw new Error("reverse-proxy: durable state is unavailable");
			return false;
		}
		try {
			await writeState(statePath, {
				enabled: state.enabled,
				accessToken: state.accessToken,
				sessions: sessionStore.serialize(),
				...state.listenHost !== void 0 ? { listenHost: state.listenHost } : {},
				...state.listenPort !== void 0 ? { listenPort: state.listenPort } : {}
			});
			return true;
		} catch (error) {
			warn(error);
			statePersistenceBlocked = true;
			if (options.required === true) throw new Error("reverse-proxy: durable state write failed", { cause: error });
			return false;
		}
	};
	/** Runtime overrides from the UI win over the Config defaults. */
	const effectiveListen = () => ({
		host: typeof state?.listenHost === "string" && state.listenHost !== "" ? state.listenHost : config.listenHost,
		port: Number.isInteger(state?.listenPort) ? state?.listenPort : config.listenPort
	});
	const snapshot = async (extra = {}) => {
		await load();
		const backendPort = config.backendPort || ctx.webServer.port;
		const listen = bound === void 0 ? effectiveListen() : {
			host: bound.host,
			port: bound.port
		};
		const published = publishHost(listen.host);
		const reason = extra.reason ?? lastFailure;
		return {
			enabled: state.enabled,
			running: bound !== void 0,
			target: formatHttpUrl(published, listen.port, scheme()),
			backend: formatHttpUrl(config.backendHost, backendPort),
			listen,
			bound: listen,
			reachables: reachableHosts(listen.host).map((host) => formatHttpUrl(host, listen.port, scheme())),
			wildcard: isWildcardHost(listen.host),
			approvalMode: config.approvalMode,
			tls: scheme() === "https",
			auditLog: audit.enabled,
			trustForwardedFor: config.trustForwardedFor === true,
			tunnel: tunnel.status(),
			...reason !== void 0 ? { reason } : {}
		};
	};
	const loadTls = async () => {
		if (!config.tlsCertFile || !config.tlsKeyFile) return void 0;
		const [cert, key] = await Promise.all([readFile(config.tlsCertFile), readFile(config.tlsKeyFile)]);
		return {
			cert,
			key
		};
	};
	const closeBound = async () => {
		const current = bound;
		if (current === void 0) return;
		await current.close();
		if (bound === current) bound = void 0;
		ctx.logger.info(`reverse-proxy: stopped listening on ${formatHttpUrl(current.host, current.port, scheme())}`);
	};
	/** Stop the tunnel first so cloudflared is not still forwarding into a closing listener. */
	const teardown = async () => {
		if (backendAuth !== undefined) { await backendAuth.close(); backendAuth = undefined; }
		await tunnel.stop();
		await closeBound();
	};
	const restartTunnelIfLive = async (wasLive) => {
		if (!wasLive || bound === void 0 || disposed || scheme() === "https") return;
		await tunnel.start();
	};
	const stop = async () => {
		await load();
		await teardown();
		state.enabled = false;
		lastFailure = void 0;
		await save({ required: true });
		audit.record("proxy.stop");
		return snapshot();
	};
	const failStart = (reason) => {
		lastFailure = reason;
		return snapshot({ reason });
	};
	const start = async () => {
		await load();
		if (disposed) return failStart("disposed");
		if (bound !== void 0) {
			lastFailure = void 0;
			return snapshot();
		}
		const { host, port } = effectiveListen();
		if (statePersistenceBlocked) return failStart("state-invalid");
		const backendPort = config.backendPort || ctx.webServer.port;
		if (isSelfLoop(host, port, config.backendHost, backendPort)) {
			ctx.logger.warn(`reverse-proxy: refusing to start — listen ${formatHttpUrl(host, port, scheme())} would loop onto backend ${formatHttpUrl(config.backendHost, backendPort)}`);
			return failStart("self-loop");
		}
		let tls;
		try {
			tls = await loadTls();
		} catch (error) {
			warn(error);
			return failStart("tls-failed");
		}
		try {
			if (backendPort !== ctx.webServer.port) throw new Error("backend-auth: backend must be this Harness Web server");
			backendAuth = await createBackendAuth({ connection: ctx.connection, backendHost: config.backendHost, backendPort, timeoutMs: Math.min(config.upstreamTimeoutMs, 5000), warn: text => ctx.logger.warn(text) });
			bound = await listenProxy({
				backendCookie: () => backendAuth.cookie(),
				listenHost: host,
				listenPort: port,
				backendHost: config.backendHost,
				backendPort,
				accessToken: state.accessToken,
				cookieName: config.cookieName,
				controlPrefix: CONTROL_PREFIX,
				maxRequestBytes: config.maxRequestBytes,
				upstreamTimeoutMs: config.upstreamTimeoutMs,
				sessionMaxAgeSeconds: config.sessionMaxAgeSeconds,
				maxHeaderSizeBytes: config.maxHeaderSizeBytes,
				headersTimeoutMs: config.headersTimeoutMs,
				requestTimeoutMs: config.requestTimeoutMs,
				keepAliveTimeoutMs: config.keepAliveTimeoutMs,
				loginDelayMs: config.loginDelayMs,
				loginMaxAttempts: config.loginMaxAttempts,
				loginLockoutMs: config.loginLockoutSeconds * 1e3,
				upgradeMaxAttempts: config.upgradeMaxAttempts,
				upgradeLockoutMs: config.upgradeLockoutSeconds * 1e3,
				sessionStore,
				inviteStore,
				approvalMode: config.approvalMode,
				ipAllowed: (address) => ipAllowed(address, cidrRules),
				audit: (event, fields) => {
					audit.record(event, fields);
				},
				tls,
				trustForwardedProto: () => config.trustForwardedProto === true || tunnelLive(),
				trustForwardedFor: () => config.trustForwardedFor === true || tunnelLive(),
				trustCloudflareConnectingIp: () => config.trustCloudflareConnectingIp === true || tunnelLive(),
				compressResponses: config.compressResponses !== false,
				cacheHashedAssets: config.cacheHashedAssets !== false,
				log: config.logRequests ? (entry) => {
					ctx.logger.debug(`reverse-proxy: ${entry.remote ?? "-"} ${entry.method} ${entry.path} -> ${entry.status}`);
				} : void 0
			});
		} catch (error) {
			if (backendAuth !== undefined) { await backendAuth.close(); backendAuth = undefined; }
			warn(error);
			return failStart("listen-failed");
		}
		lastFailure = void 0;
		state.enabled = true;
		try {
			await save({ required: true });
		} catch (error) {
			state.enabled = false;
			await teardown().catch(() => {});
			throw error;
		}
		audit.record("proxy.start", {
			host: bound.host,
			port: bound.port,
			tls: tls !== void 0
		});
		ctx.logger.info(`reverse-proxy: listening on ${formatHttpUrl(bound.host, bound.port, scheme())}`);
		return snapshot();
	};
	const rotateToken = async () => {
		await load();
		const restart = bound !== void 0;
		const wasTunnel = tunnelLive();
		const previousToken = state.accessToken;
		const previousSessions = sessionStore.serialize();
		await teardown();
		state.accessToken = generateAccessToken();
		sessionStore.clear();
		inviteStore.clear();
		try {
			await save({ required: true });
		} catch (error) {
			state.accessToken = previousToken;
			sessionStore.hydrate(previousSessions);
			throw error;
		}
		audit.record("token.rotate");
		ctx.logger.info("reverse-proxy: access token rotated");
		if (restart) await start();
		await restartTunnelIfLive(wasTunnel);
		return {
			...await snapshot(),
			accessToken: state.accessToken
		};
	};
	/**
	* Change the published listen address at runtime. A running proxy is
	* restarted on the new address; when the new bind fails, the previous
	* address is restored so the user never loses an already working entry.
	*/
	const setListen = (host, port) => exclusive(async () => {
		await load();
		const hostname = String(host ?? "").trim();
		const portNumber = Number(port);
		if (!isValidListenHost(hostname) || !Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65535) return snapshot({ reason: "invalid-listen" });
		const previous = effectiveListen();
		if (hostname === previous.host && portNumber === previous.port) return snapshot();
		const wasRunning = bound !== void 0;
		const wasTunnel = tunnelLive();
		const previousHost = state.listenHost;
		const previousPort = state.listenPort;
		state.listenHost = hostname;
		state.listenPort = portNumber;
		lastFailure = void 0;
		try {
			await save({ required: true });
		} catch (error) {
			state.listenHost = previousHost;
			state.listenPort = previousPort;
			throw error;
		}
		await teardown();
		if (!wasRunning) {
			ctx.logger.info(`reverse-proxy: publish address set to ${hostname}:${portNumber}`);
			return snapshot();
		}
		if ((await start()).running) {
			await restartTunnelIfLive(wasTunnel);
			return snapshot();
		}
		state.listenHost = previous.host;
		state.listenPort = previous.port;
		await save({ required: true });
		const restored = await start();
		await restartTunnelIfLive(wasTunnel && restored.running);
		return snapshot({ reason: restored.running ? "listen-failed-restored" : "listen-failed" });
	});
	const buildInvite = async (publicBase) => {
		await load();
		const base = String(publicBase ?? "").trim().replace(/\/$/, "");
		const tunnelUrl = tunnel.status().publicUrl;
		const fallback = (await snapshot()).target;
		const origin = base === "" ? tunnelUrl ?? fallback : base;
		let url;
		try {
			url = new URL(LOGIN_PATH, origin.endsWith("/") ? origin : `${origin}/`);
		} catch {
			return { error: "invalid-base" };
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") return { error: "invalid-base" };
		if (bound === void 0) return { error: "not-running" };
		url.searchParams.set("invite", inviteStore.issue());
		const inviteUrl = url.toString();
		return {
			inviteUrl,
			qrSvg: qrToSvg(inviteUrl) ?? void 0
		};
	};
	const runSelfCheck = async () => {
		await load();
		const backendPort = config.backendPort || ctx.webServer.port;
		const fence = await probeFence({
			backendHost: config.backendHost,
			backendPort,
			timeoutMs: Math.min(config.upstreamTimeoutMs, 5e3),
			backendCookie: backendAuth ? () => backendAuth.cookie() : undefined
		});
		return {
			running: bound !== void 0,
			fence,
			tls: scheme() === "https",
			auditLog: audit.enabled,
			allowTokenRead: config.allowTokenRead === true,
			trustForwardedFor: config.trustForwardedFor === true
		};
	};
	return {
		restore: () => exclusive(async () => {
			await load();
			if (!config.autoRestore || !state.enabled || disposed) return;
			const status = await start();
			if (!status.running) ctx.logger.warn(`reverse-proxy: persisted start skipped (${status.reason ?? "unknown"})`);
		}),
		dispose: () => exclusive(async () => {
			disposed = true;
			if (saveTimer !== void 0) {
				clearTimeout(saveTimer);
				saveTimer = void 0;
			}
			await teardown();
			await save();
		}),
		status: () => shared(() => snapshot()),
		start: () => exclusive(start),
		stop: () => exclusive(stop),
		token: () => exclusive(async () => {
			await load();
			return state.accessToken;
		}),
		rotateToken: () => exclusive(rotateToken),
		setListen,
		selfCheck: () => shared(() => runSelfCheck()),
		handle: createControlRoutes({
			allowTokenRead: config.allowTokenRead === true,
			audit,
			warn,
			exclusive,
			shared,
			snapshot,
			runSelfCheck,
			buildInvite,
			readToken: () => exclusive(async () => {
				await load();
				audit.record("token.reveal");
				return state.accessToken;
			}),
			listSessions: async () => {
				await load();
				return sessionStore.list();
			},
			mutateSession: (action, id, label) => exclusive(async () => {
				await load();
				const previousSessions = sessionStore.serialize();
				const ok = action === "approve" ? sessionStore.approve(id) : action === "revoke" ? sessionStore.revoke(id) : sessionStore.rename(id, label);
				if (ok) {
					try {
						await save({ required: true });
					} catch (error) {
						sessionStore.hydrate(previousSessions);
						throw error;
					}
					if (action === "revoke") bound?.closeSession(id);
					audit.record(`session.${action}`, { id });
				}
				return ok;
			}),
			startTunnel: async () => {
				await load();
				if (disposed) return "disposed";
				if (bound === void 0) return "not-running";
				if (scheme() === "https") return "tls-unsupported";
				await tunnel.start();
				return "ok";
			},
			stopTunnel: async () => {
				await tunnel.stop();
				return snapshot();
			},
			start,
			stop,
			rotateToken,
			setListen
		}).handle
	};
}
/**
* Publish an authenticated local reverse-proxy endpoint for any tunnel client.
*/
function apply(ctx, config) {
	validateBackendHost(config.backendHost);
	const runtime = createRuntime(ctx, config);
	ctx.effect(() => {
		const unroute = ctx.webServer.register({
			kind: "prefix",
			path: CONTROL_PREFIX,
			handler: (req, res) => runtime.handle(req, res)
		});
		const untap = ctx.webServer.tapIndex(injectIndexEnhancements);
		ctx.logger.info(`reverse-proxy: control surface mounted at ${CONTROL_PREFIX} (loopback only)`);
		runtime.restore();
		const browsePin = startBrowsePin(ctx, process.env[DIRECTORY_PICKER_NATIVE_OPT_OUT] === "1", (error) => {
			ctx.logger.warn(asError(error));
		});
		return async () => {
			unroute();
			untap();
			await browsePin.dispose();
			await runtime.dispose();
		};
	}, "reverse-proxy");
}
//#endregion
export { Config, apply, createRuntime, inject, injectIndexEnhancements, injectViewport, name };

//# sourceMappingURL=index.js.map