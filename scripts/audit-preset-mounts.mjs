#!/usr/bin/env node
/**
 * audit-preset-mounts.mjs — do the presets still MOUNT everything the registry
 * says they mount?
 *
 * A byte-for-byte preset diff cannot answer that. The registry copy is a
 * TEMPLATE: it carries {{USER_HOME}} / {{DSH_USER_HOME}} placeholders that the
 * live install has already rendered, and it predates the 0.2.0 migration that
 * renamed some bundle ids. Both differences look like drift and neither is.
 *
 * What actually matters is narrower and decidable: for every `- id: <bundle>`
 * row the registry lists for a preset, is an equivalent row present live? That
 * is what decides whether a tool, a preset, or an MCP entry is reachable.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.USERPROFILE || process.env.HOME || '';
// Default to the repo this script lives in, so no user path is baked into the
// file (check-private.ps1 flags a literal "C:/Users/<name>" as a leak).
const SELF = (await import('node:url')).fileURLToPath(import.meta.url);
const REPO = process.argv[2] || join(SELF, '..', '..');
const SRC = join(REPO, 'config', '.agent-presets');
const LIVE = join(HOME, '.dsh', '.agent-presets');

/**
 * Bundle ids that were deliberately renamed during the 0.1.5 -> 0.2.0 migration.
 * Key: id as written in the registry template. Value: what the live profile uses.
 */
const RENAMED = {
  'workflow-worker-thread': 'workflow-ptc',
};

const idRows = (text) => [...text.matchAll(/^[ \t]*-[ \t]*id:[ \t]*(\S+)[ \t]*$/gm)].map((m) => m[1]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasId = (text, id) => new RegExp(`^[ \\t]*-[ \\t]*id:[ \\t]*${esc(id)}[ \\t]*$`, 'm').test(text);

let checked = 0;
const missing = [];
const ahead = [];

if (!existsSync(SRC)) { console.error('registry preset dir absent:', SRC); process.exit(2); }
if (!existsSync(LIVE)) { console.error('live preset dir absent:', LIVE); process.exit(2); }

for (const preset of readdirSync(SRC)) {
  const s = join(SRC, preset), l = join(LIVE, preset);
  if (!statSync(s).isDirectory()) continue;
  if (!existsSync(l)) { missing.push({ preset, id: '(whole preset)', why: 'live dir absent' }); continue; }
  const reg = join(s, 'agent.cordis.yml'), liv = join(l, 'agent.cordis.yml');
  if (!existsSync(reg) || !existsSync(liv)) continue;

  const regText = readFileSync(reg, 'utf8');
  const livText = readFileSync(liv, 'utf8');
  for (const id of idRows(regText)) {
    checked++;
    const want = RENAMED[id];
    if (hasId(livText, id)) continue;
    if (want && hasId(livText, want)) continue;              // renamed upstream — fine
    // A row that the live file has only as a disabled:true is a deliberate
    // turn-off by the user, not a lost mount.
    const disabledRow = new RegExp(`^[ \\t]*-[ \\t]*id:[ \\t]*${esc(id)}[ \\t]*\\n(?:[ \\t].*\\n)*?[ \\t]*disabled:[ \\t]*true`, 'm').test(livText);
    if (disabledRow) { ahead.push({ preset, id, why: 'present but disabled:true (user turn-off)' }); continue; }
    missing.push({ preset, id, why: want ? `absent (and renamed target ${want} absent)` : 'absent' });
  }
}

for (const m of missing) console.log(`MISSING  ${m.preset.padEnd(22)} ${m.id}  ${m.why}`);
for (const a of ahead) console.log(`DISABLED ${a.preset.padEnd(22)} ${a.id}  ${a.why}`);
console.log(`\nmount ids checked: ${checked} | missing: ${missing.length} | deliberately disabled: ${ahead.length}`);
console.log(missing.length ? 'RESULT: presets are missing mounts the registry expects'
                           : 'RESULT: every registry mount is present live');
process.exit(missing.length ? 1 : 0);
