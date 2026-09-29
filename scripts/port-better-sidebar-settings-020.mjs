#!/usr/bin/env node
/**
 * port-better-sidebar-settings-020.mjs — port dsh-better-sidebar's host half to
 * the 0.2.0 settings API.
 *
 * What 0.2.0 changed
 * ------------------
 * `SettingsForms` (the `settings` service) no longer has `register()`. It derives
 * every namespace from the Loader's config editor:
 *
 *     schema(entry) { return entry.fiber?.runtime?.Config }   // must be a zod schema
 *     describe()     { ... ns: entry.options.id ... }        // namespace == entry id
 *
 * So a plugin's settings namespace IS its entry id, and the schema has to be that
 * entry's static `Config`.
 *
 * The 0.1.5 failure was self-inflicted and self-locking: `settings.register()`
 * threw inside `ctx.inject(["settings"], ...)`, which aborted the plugin's
 * `apply`, so its fiber never activated, so `runtime.Config` never existed, so
 * settings could not resolve either. The sidebar still rendered (the client half
 * is a separate module) but no preference could persist.
 *
 * Edits
 * -----
 *   1. drop the `settingsNamespace` import — gone from dsh-settings in 0.2.0;
 *   2. namespace = the entry id;
 *   3. drop `settings.register()`;
 *   4. pass `viewOf` where the scope was (syncToolsGate only called get());
 *   5. `scope.watch()` -> the `settings/updated` event the host itself uses;
 *   6. move the `Config` block to AFTER `PrefsSchema` and spread the preference
 *      shape into it, so the entry actually exposes those fields. Moving is
 *      required: spreading at the original position is a TDZ read and throws
 *      "Cannot access 'PrefsSchema' before initialization".
 *
 * Usage: node port-better-sidebar-settings-020.mjs <dsh-better-sidebar package root>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) { console.error('usage: node port-better-sidebar-settings-020.mjs <dsh-better-sidebar root>'); process.exit(2); }
const FILE = join(ROOT, 'lib', 'index.js');
if (!existsSync(FILE)) { console.error('not found:', FILE); process.exit(1); }

let src = readFileSync(FILE, 'utf8');
const before = src;
const applied = [];
let failed = false;

const once = (label, find, replace) => {
  if (src.includes(find)) { src = src.replace(find, replace); applied.push(label); return; }
  if (src.includes(replace)) { console.log(`  already: ${label}`); return; }
  console.error(`  ANCHOR MISS: ${label}`);
  failed = true;
};

// 1
once(
  'drop settingsNamespace import',
  'import { SettingsConflictError, settingsNamespace } from "@deepseek-ai/dsh-settings";',
  'import { SettingsConflictError } from "@deepseek-ai/dsh-settings";'
);

// 2
once(
  'namespace = entry id',
  '\t\tconst ns = settingsNamespace(SIDEBAR_PREFS_NS);',
  '\t\t// 0.2.0: the settings namespace IS the Loader entry id; settingsNamespace()\n' +
  '\t\t// no longer exists on @deepseek-ai/dsh-settings.\n' +
  '\t\tconst ns = SIDEBAR_PREFS_NS;'
);

// 3
once(
  'drop settings.register',
  '\t\tconst scope = sctx.settings.register(ns, PrefsSchema);\n',
  '\t\t// 0.2.0: no settings.register() — the schema comes from this entry\'s\n' +
  '\t\t// static Config (see the Config/PrefsSchema merge) and the namespace is\n' +
  '\t\t// the entry id.\n'
);

// 4a. syncToolsGate took the scope object and called scope.get(); it now takes
//     the accessor itself, so the call sites pass viewOf directly.
once(
  'syncToolsGate takes the accessor',
  [
    'const syncToolsGate = (scope) => {',
    '\t\tif (scope.get().agentTerminalTools) {',
  ].join('\n'),
  [
    '// 0.2.0: takes the view accessor, not a settings scope object (there is no',
    '// register() to obtain one from any more).',
    'const syncToolsGate = (view) => {',
    '\t\tif (view().agentTerminalTools) {',
  ].join('\n')
);

// 4 + 5
once(
  'settings watch',
  ['\t\tsyncToolsGate(scope);', '\t\tscope.watch(() => {', '\t\t\tsyncToolsGate(scope);', '\t\t});'].join('\n'),
  [
    '\t\tsyncToolsGate(viewOf);',
    '\t\t// scope.watch() has no 0.2.0 equivalent; settings/updated is the channel',
    '\t\t// the host itself listens on.',
    '\t\tctx.on("settings/updated", (updated) => {',
    '\t\t\tif (updated === ns) syncToolsGate(viewOf);',
    '\t\t});',
  ].join('\n')
);

// 6 — move Config after PrefsSchema and merge the preference shape in
const CFG_HEAD = 'const Config = z.object({';
const CFG_TAIL = '\treconnectGraceMs: z.number().step(1).min(0).default(3e4)\n});';
const PREFS_HEAD = 'const PrefsSchema = z.object({';

if (src.includes('...PrefsSchema.shape')) {
  console.log('  already: Config carries the preference shape');
} else {
  const ci = src.indexOf(CFG_HEAD);
  const cj = ci >= 0 ? src.indexOf(CFG_TAIL, ci) : -1;
  const pi = src.indexOf(PREFS_HEAD);
  // PrefsSchema's block ends at the first "\n});" after its start
  const pj = pi >= 0 ? src.indexOf('\n});', pi) + 4 : -1;
  if (ci < 0 || cj < 0 || pi < 0 || pj < 0 || ci > pi) {
    console.error('  ANCHOR MISS: could not locate Config / PrefsSchema blocks');
    failed = true;
  } else {
    const configBlock = src.slice(ci, cj + CFG_TAIL.length);
    const prefsEnd = src.indexOf('\n});', pi) + 4;
    const mergedConfig = configBlock.replace(
      CFG_TAIL,
      '\treconnectGraceMs: z.number().step(1).min(0).default(3e4),\n' +
        '\t// sidebar preferences: a separate settings namespace under 0.1.5, folded in\n' +
        '\t// here because 0.2.0 derives each namespace from the entry\'s Config.\n' +
        '\t...PrefsSchema.shape\n});'
    );
    // drop the original Config, then re-insert it right after PrefsSchema
    src = src.slice(0, ci) + src.slice(cj + CFG_TAIL.length);
    const pi2 = src.indexOf(PREFS_HEAD);
    const pj2 = src.indexOf('\n});', pi2) + 4;
    src = src.slice(0, pj2) + '\n' + mergedConfig + src.slice(pj2);
    applied.push('move Config after PrefsSchema and merge PrefsSchema.shape');
    void prefsEnd;
  }
}

if (src === before) {
  console.log('nothing to do (already ported)');
  process.exit(failed ? 1 : 0);
}
writeFileSync(FILE, src, 'utf8');
console.log('applied:', applied.join(', '));
console.log('  ->', FILE);
if (failed) { console.log('INCOMPLETE: resolve the anchors above before shipping'); process.exit(1); }
