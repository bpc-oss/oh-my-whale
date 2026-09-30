// apply-p40-live-model-selection.mjs — re-read the modelSelection projection on every read.
//
// THE BUG
// -------
// @deepseek-ai/dsh-api-session-controller/lib/index.js, inside selectionFor(agent):
//
//   let picked = projectionState.pending === null ? void 0 : agentModelSelection(projectionState.pending);
//   const defaultModel = this.ctx.agentDefaultModel;
//   const selection = {
//     get current() {
//       if (picked !== void 0) return picked;                  // (1) captured ONCE, at construction
//       const loggedHeader = agent.session.requestHeader();    // (2) fall back to the session header
//       if (loggedHeader === void 0) return defaultModel.currentSelection();
//       const logged = loggedHeader.config;
//       return { provider: logged.provider, model: logged.model, ... };
//     },
//     ...
//   };
//
// `picked` is evaluated once, when the Agent's selection is installed. Its only later
// writers are the `set current` setter and `consume()`; and `selectForNextRequest` — the API
// that pairs the setter with the durable `model/selection` event — has NO caller anywhere in
// the shell (verified by searching every package in the app tree).
//
// So on a RESUMED conversation:
//   1. selectionFor() runs; projectionState.pending is null -> picked = undefined
//   2. the user picks a different model; the client writes the modelSelection projection
//   3. the next request reads selection.current -> picked is still undefined -> falls to (2)
//   4. the request goes to the model the conversation was CREATED with, while the composer
//      shows the newly chosen one. Exactly the reported symptom.
//
// A brand-new conversation is unaffected: its selection is constructed after the user has
// already chosen, so `picked` is populated.
//
// THE FIX
// -------
// Read the projection on every access instead of trusting a value captured at construction.
// `picked` stays as the explicit-override channel (setter / consume), so nothing else moves.
//
// Implementation note — this cost one wasted patch. The first attempt used `this.ctx` inside
// the getter. That is WRONG: `this` in an object-literal getter is the object literal, so
// `this.ctx` is undefined and the try/catch swallowed it, making the patch a silent no-op.
// The context has to be captured in a closure beside the object.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const CHECK = process.argv.includes('--check');
const TARGET = join(process.env.LOCALAPPDATA || '', 'Programs', 'DSH Desktop', 'resources', 'app',
  'node_modules', '@deepseek-ai', 'dsh-api-session-controller', 'lib', 'index.js');

if (!existsSync(TARGET)) { console.log('  target not installed — nothing to do'); process.exit(0); }
const src = readFileSync(TARGET, 'utf8');
if (src.includes('P40 (2026-09-30)')) { console.log('  P40 already applied'); process.exit(0); }

const T2 = '\t\t';      // method level
const T3 = '\t\t\t';    // statement level
const T4 = '\t\t\t\t';  // getter body
const T5 = '\t\t\t\t\t';  // inside try

// (a) capture the context in a closure, immediately before the object literal
const DECL_ANCHOR = `${T3}const selection = {\n`;
if (!src.includes(DECL_ANCHOR)) {
  console.error('  declaration anchor not found — the kernel reshaped this block; re-locate before patching.');
  process.exit(1);
}
const DECL = [
  `${T3}/* P40 (2026-09-30): the context for the live projection read below. The getter cannot`,
  `${T3} * use \`this.ctx\` — \`this\` inside an object-literal getter is the object literal, not the`,
  `${T3} * service, so \`this.ctx\` is undefined and the lookup would fail silently. */`,
  `${T3}const selectionCtx = this.ctx;`,
  DECL_ANCHOR,
].join('\n');

// (b) consult the projection on every read, ahead of the captured `picked`
const BODY_ANCHOR = `${T4}if (picked !== void 0) return picked;\n`;
if (!src.includes(BODY_ANCHOR)) {
  console.error('  getter-body anchor not found — the kernel reshaped this block; re-locate before patching.');
  process.exit(1);
}
const BODY = [
  `${T4}/* P40 (2026-09-30): re-read the modelSelection projection instead of trusting \`picked\`,`,
  `${T4} * which the constructor evaluated once. A resumed conversation installs its selection`,
  `${T4} * BEFORE the user picks a model, and the only later writer of \`picked\``,
  `${T4} * (selectForNextRequest) has no caller in the shell — so the projection update was`,
  `${T4} * invisible and every request fell through to session.requestHeader(), i.e. the model`,
  `${T4} * the conversation was created with, while the composer showed the new one. */`,
  `${T4}let liveSelection;`,
  `${T4}try {`,
  `${T5}const live = selectionCtx.sessionProjections.stateOf(agent.session, "modelSelection");`,
  `${T5}if (live != null && live.pending != null) liveSelection = agentModelSelection(live.pending);`,
  `${T4}} catch {}`,
  `${T4}if (liveSelection !== void 0) return liveSelection;`,
  BODY_ANCHOR,
].join('\n').replace(/\t5/g, '\t\t\t\t\t');

if (CHECK) { console.error('  P40 is NOT applied'); process.exit(1); }
if (!existsSync(`${TARGET}.bak-p40`)) copyFileSync(TARGET, `${TARGET}.bak-p40`);
writeFileSync(TARGET, src.replace(DECL_ANCHOR, DECL).replace(BODY_ANCHOR, BODY));
console.log('  P40 applied: modelSelection projection re-read on every selection.current');
