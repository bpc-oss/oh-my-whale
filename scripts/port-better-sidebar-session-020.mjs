#!/usr/bin/env node
/**
 * port-better-sidebar-session-020.mjs — give dsh-better-sidebar the current
 * session on 0.2.0.
 *
 * THE BREAK
 * ---------
 * The Sidebar component did:
 *
 *     const sessionList = useSyncExternalStore(..., () => ctx.sessions.list.getSnapshot(), ...);
 *     const current = sessionList.current;
 *     useEffect(() => { store.setSession(current) }, [current]);
 *
 * 0.1.5's sessions.list snapshot carried `current`. 0.2.0's does not:
 *
 *     this.list = createSnapshotStore({ ids: [], byId: {}, phase: "pending", projectionsBySession: {} });
 *
 * so `current` was permanently undefined, `store.setSession(undefined)` ran, and
 * the entire panel sat in its no-session state: the floating toggle rendered the
 * `noSession` label ("选择一个会话以使用侧边栏"), clicking it did nothing, and the
 * explorer had no root. This is the "右边的侧边栏点不开" report.
 *
 * WHERE 0.2.0 PUT IT
 * -------------------
 * dsh-client-ui-workspace owns the selection now, still persisted under the same
 * key, and also holds the live retain reference:
 *
 *     super(ctx, "uiWorkspace");
 *     this.selection = createSnapshotStore({}, { persist: { name: "dsh.sessions.current" } });
 *     this.mainReference = reference;          // { sessionId, ... }
 *
 * THIS PATCH
 * ----------
 * Adds a resolver that prefers the 0.2.0 source and falls back to the 0.1.5
 * shape, then subscribes to BOTH so the panel reacts when either changes. The
 * old path stays so the plugin still works on a 0.1.x tree.
 *
 * Usage: node port-better-sidebar-session-020.mjs <dsh-better-sidebar root>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) { console.error('usage: node port-better-sidebar-session-020.mjs <dsh-better-sidebar root>'); process.exit(2); }
const FILE = join(ROOT, 'lib', 'client.js');

let s = readFileSync(FILE, 'utf8');
if (s.includes('betterSidebarCurrentSessionId')) { console.log('nothing to do (already ported)'); process.exit(0); }

// 1. inject list: the uiWorkspace service carries the selection in 0.2.0
// NOT added to `inject`. An unsatisfied entry in a plugin's inject list blocks
// the WHOLE plugin from ever activating, which takes the whole renderer down -
// that is exactly what happened when this was first tried. Resolve the service
// lazily at call time instead, so an absent uiWorkspace degrades to the 0.1.5
// read rather than deadlocking the entry.

// 2. resolver + hook, placed just before the Sidebar component
const SIDEBAR_ANCHOR = '\t\tfunction Sidebar(props) {';
const HOOK = `		/**
		* The session this panel belongs to. 0.2.0 moved the persisted selection
		* (still "dsh.sessions.current") onto the uiWorkspace service and dropped
		* \`current\` from sessions.list, so the 0.1.5 read returned undefined and the
		* panel rendered its no-session state. Prefer the new source, fall back to
		* the old shape so the plugin still runs on a 0.1.x tree.
		* @param ctx - client plugin context.
		* @returns the current session id, or undefined when none is selected.
		*/
		function betterSidebarCurrentSessionId(ctx) {
			const workspace = ctx.get("uiWorkspace");
			const live = workspace?.mainReference?.sessionId;
			if (typeof live === "string" && live.length > 0) return live;
			const saved = workspace?.selection?.getSnapshot?.()?.sessionId;
			if (typeof saved === "string" && saved.length > 0) return saved;
			return ctx.sessions?.list?.getSnapshot?.()?.current;
		}
		/** Subscribe to whichever current-session source this build exposes. */
		function useBetterSidebarCurrentSession(ctx) {
			return (0, react.useSyncExternalStore)((0, react.useMemo)(() => {
				// NOTE: property access on a plugin ctx THROWS for a service the entry does
					// not inject ("cannot get property X without inject"). Only ctx.get() is
					// safe here - which is also why uiWorkspace is NOT in the inject list.
					const stores = [ctx.get("uiWorkspace")?.selection, ctx.sessions?.list].filter((store) => typeof store?.subscribe === "function");
				return (callback) => {
					for (const store of stores) store.subscribe(callback);
					return () => {
						for (const store of stores) store.unsubscribe?.(callback);
					};
				};
			}, [ctx]), (0, react.useCallback)(() => betterSidebarCurrentSessionId(ctx), [ctx]));
		}
		function Sidebar(props) {`;
if (!s.includes(SIDEBAR_ANCHOR)) { console.error('ANCHOR MISS: Sidebar component'); process.exit(1); }
s = s.replace(SIDEBAR_ANCHOR, HOOK);

// 3. the component reads the resolved id instead of list.current
const OLD_READ = [
  '\t\t\tconst sessionList = (0, react.useSyncExternalStore)((0, react.useMemo)(() => (callback) => ctx.sessions.list.subscribe(callback), [ctx]), (0, react.useCallback)(() => ctx.sessions.list.getSnapshot(), [ctx]));',
  '\t\t\tconst current = sessionList.current;',
].join('\n');
const NEW_READ = [
  '\t\t\tconst current = useBetterSidebarCurrentSession(ctx);',
  '\t\t\tconst sessionList = (0, react.useSyncExternalStore)((0, react.useMemo)(() => (callback) => ctx.sessions.list.subscribe(callback), [ctx]), (0, react.useCallback)(() => ctx.sessions.list.getSnapshot(), [ctx]));',
].join('\n');
if (!s.includes(OLD_READ)) { console.error('ANCHOR MISS: session read'); process.exit(1); }
s = s.replace(OLD_READ, NEW_READ);

writeFileSync(FILE, s, 'utf8');
console.log('applied: better-sidebar resolves the current session from uiWorkspace (0.2.0) with a 0.1.5 fallback');
console.log('  ->', FILE);
