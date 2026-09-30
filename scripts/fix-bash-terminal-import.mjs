#!/usr/bin/env node
/**
 * fix-bash-terminal-import.mjs — drop the dead `settingsNamespace` import from dsh-bash-terminal.
 *
 * Symptom (2026-09-30, reported as "conversations stop for no reason"): the plugin had been
 * failing to load for hours, but only as two log lines nobody reads —
 *
 *   [E] [host-resolved-root-include] .../dsh-bash-terminal/lib/index.js:22
 *   [W] [hmr] tool-bash-terminal (dsh-bash-terminal): failed to import
 *
 *   import { settingsNamespace } from "@deepseek-ai/dsh-settings";
 *   SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not provide an
 *   export named 'settingsNamespace'
 *
 * The symbol is imported and then never referenced anywhere in the file — dead import left
 * over from the pre-0.2 settings API. dsh-settings 0.2.0-rc.1 exports only SettingsConflictError,
 * SettingsForms, default and redactSecrets, so the module-level import alone is enough to fail
 * the whole plugin. Any conversation that needed a shell command had no bash tool at all.
 *
 * Idempotent, and safe to run against a freshly installed tree. Not a git repo and not a
 * tracked file, so this has to be re-applied after every pnpm install — bootstrap calls it
 * for that reason.
 *
 * Usage: node scripts/fix-bash-terminal-import.mjs [--check]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CHECK = process.argv.includes('--check');
const HOME = process.env.USERPROFILE || process.env.HOME || '';
const TARGET = join(HOME, '.dsh', 'profiles', 'web', 'node_modules', 'dsh-bash-terminal', 'lib', 'index.js');
const LINE = /import \{ settingsNamespace \} from "@deepseek-ai\/dsh-settings";\r?\n/;

if (!existsSync(TARGET)) {
  console.log(`  dsh-bash-terminal not installed at ${TARGET} — nothing to do`);
  process.exit(0);
}

const src = readFileSync(TARGET, 'utf8');
if (!LINE.test(src)) {
  console.log('  dsh-bash-terminal: import already absent — nothing to do');
  process.exit(0);
}

// Only remove it if the symbol is genuinely unused; if the plugin grew a real use of it,
// deleting the import would break the build and the right move is to adapt the call site.
const uses = (src.match(/\bsettingsNamespace\b/g) || []).length;
if (uses > 1) {
  console.error(`  dsh-bash-terminal: settingsNamespace is referenced ${uses} times — this fix no longer applies; the call site needs adapting.`);
  process.exit(1);
}

if (CHECK) {
  console.error('  dsh-bash-terminal: the dead settingsNamespace import is PRESENT (not applied)');
  process.exit(1);
}

writeFileSync(TARGET, src.replace(LINE, ''));
console.log('  dsh-bash-terminal: removed the dead settingsNamespace import');
