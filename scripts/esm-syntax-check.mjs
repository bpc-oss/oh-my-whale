#!/usr/bin/env node
/**
 * esm-syntax-check.mjs — parse every first-party module in an app tree as ESM.
 *
 * Why this exists: `node --check` parses as CommonJS and happily accepts code
 * that is a SyntaxError under ESM (e.g. top-level `await` on the wrong side of
 * an export, or a reserved word used as an identifier in module context). A
 * real boot failure came from exactly that gap — 2026-09-14, `Unexpected
 * reserved word`, shipped past a `node --check` gate.
 *
 * vm.SourceTextModule is the only check that matches what the loader does.
 *
 * Usage: node esm-syntax-check.mjs <app-root> [subdir ...]
 */
import vm from 'node:vm';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('usage: node esm-syntax-check.mjs <app-root> [subdir ...]');
  process.exit(2);
}

const roots = process.argv.slice(3).length ? process.argv.slice(3) : ['node_modules/@deepseek-ai'];

function walk(dir, out = []) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(mjs|js)$/.test(e.name) && !e.name.endsWith('.map')) out.push(p);
  }
  return out;
}

function isFirstParty(file) {
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  const segs = rel.split('/');
  const first = segs.indexOf('node_modules');
  if (first < 0) return true;
  if (segs[first + 1] !== '@deepseek-ai') return false;
  return segs.indexOf('node_modules', first + 1) < 0;
}

const files = [];
for (const r of roots) files.push(...walk(join(ROOT, r)));
files.push(...walk(join(ROOT, 'lib')));
const scoped = files.filter(isFirstParty);

const bad = [];
let checked = 0;
for (const f of scoped) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  checked++;
  try {
    // eslint-disable-next-line no-new
    new vm.SourceTextModule(src, { identifier: f });
  } catch (e) {
    bad.push({ f, msg: String(e.message).split('\n')[0] });
  }
}

console.log(`esm-syntax-check: parsed ${checked} first-party modules as ESM`);
if (bad.length) {
  console.log(`\nSYNTAX ERRORS: ${bad.length}`);
  for (const b of bad) console.log(`  ${b.f.replace(ROOT, '<app>')}\n     ${b.msg}`);
  process.exit(1);
}
console.log('SYNTAX ERRORS: 0');
