#!/usr/bin/env node
/**
 * port-bash-terminal-020.mjs — port dsh-bash-terminal to the 0.2.0 settings model.
 *
 * 0.2.0 deleted the `settingsScope` service (zero occurrences in the whole 0.2.0
 * app tree) and SettingsForms has no register(). A plugin's settings are now its
 * ENTRY CONFIG, read by the loader and passed to apply(ctx, config).
 *
 * dsh-bash-terminal 0.3.11 already declares `Config` with `defaultShell`, so the
 * 0.2.0-native home for the user's terminal choice is that entry's config
 * (`- id: tool-bash-terminal / config: { defaultShell: gitbash }`).
 *
 * Host half (lib/index.js)
 *   - drop ctx.settings.register(...); the loader already validated `config`
 *   - settingsScope.get().defaultShell -> the validated local `defaultShell`
 *
 * Client half (dist/client.js)
 *   - drop "settingsScope" from inject
 *   - drop ctx.settingsScope.bind(...); the row renders from the value the
 *     entry config carries. The edit path is intentionally left inert rather
 *     than guessed at: 0.2.0 drives settings rows through the settings page's
 *     bridge, and a wrong write path would be worse than no write path.
 *
 * Usage: node port-bash-terminal-020.mjs <dsh-bash-terminal root>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) { console.error('usage: node port-bash-terminal-020.mjs <dsh-bash-terminal root>'); process.exit(2); }
const HOST = join(ROOT, 'lib', 'index.js');
const CLIENT = join(ROOT, 'dist', 'client.js');
const done = [];

// ── host half ───────────────────────────────────────────────────────────
if (existsSync(HOST)) {
  let s = readFileSync(HOST, 'utf8');
  if (s.includes('ctx.settings.register(')) {
    const FIND = [
      '  const settingsScope = ctx.settings.register(',
      '    settingsNamespace(SETTINGS_NAMESPACE),',
      '    z.object({ defaultShell: z.union(SHELLS.map((s) => z.const(s))).default(defaultShell) }),',
      '    { base: { defaultShell } }',
      '  );',
    ].join('\n');
    const REPLACE = [
      '  // 0.2.0: SettingsForms has no register() and the `settingsScope` service is',
      '  // gone. The entry Config already carries `defaultShell` (validated just',
      '  // above), and the loader passes that config to apply(ctx, config), so the',
      '  // user\'s terminal choice lives in the entry\'s config row.',
      '  const currentShell = () => defaultShell;',
    ].join('\n');
    if (s.includes(FIND)) { s = s.replace(FIND, REPLACE); done.push('host: drop settings.register'); }
    else { console.error('ANCHOR MISS: host register block'); process.exitCode = 1; }
  } else {
    console.log('  already: host register');
  }
  if (s.includes('settingsScope.get().defaultShell')) {
    s = s.split('settingsScope.get().defaultShell').join('currentShell()');
    done.push('host: read the shell from the entry config');
  }
  writeFileSync(HOST, s, 'utf8');
} else { console.error('missing', HOST); process.exitCode = 1; }

// ── client half ─────────────────────────────────────────────────────────
if (existsSync(CLIENT)) {
  let s = readFileSync(CLIENT, 'utf8');
  if (s.includes('var inject = ["slots", "locale", "settingsScope"];')) {
    s = s.replace(
      'var inject = ["slots", "locale", "settingsScope"];',
      '// 0.2.0: the `settingsScope` service no longer exists.\nvar inject = ["slots", "locale"];'
    );
    done.push('client: drop settingsScope from inject');
  } else if (s.includes('settingsScope')) {
    console.error('ANCHOR MISS: client inject list shape changed');
    process.exitCode = 1;
  } else { console.log('  already: client inject'); }

  if (s.includes('ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })')) {
    s = s.replace(
      '  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });',
      [
        '  // 0.2.0: no settingsScope. The row renders the terminal choice the entry',
        '  // config carries; the settings page owns edits now.',
        '  const scope = {',
        '    getSnapshot: () => ({ value: { defaultShell: DEFAULT_SHELL }, revision: -1, writable: false }),',
        '    subscribe: () => () => {},',
        '    set: () => {}',
        '  };',
      ].join('\n')
    );
    done.push('client: inert settingsScope shim');
  } else if (s.includes('settingsScope')) {
    console.error('ANCHOR MISS: client scope bind');
    process.exitCode = 1;
  } else { console.log('  already: client scope'); }
  writeFileSync(CLIENT, s, 'utf8');
} else { console.error('missing', CLIENT); process.exitCode = 1; }

console.log('applied:', done.join(', '));
process.exit(process.exitCode || 0);
