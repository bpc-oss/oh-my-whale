#!/usr/bin/env node
/**
 * verify-plugin-activation.mjs — prove that profile plugins actually LOADED,
 * not merely that they are present on disk.
 *
 * Why this exists: a plugin whose import throws never reaches the renderer, so
 * every DOM probe still succeeds — the host simply never mounts its client
 * bundle. On 2026-09-30 better-sidebar had been swapped to 0.24.1 and reported
 * as "loaded, zero console errors" while `dsh-better-sidebar/lib/index.js:119`
 * was throwing `field.volatile is not a function` on every HMR retry. The only
 * reliable evidence was in the host error log, which nothing was reading.
 *
 * Two independent signals, both required:
 *   1. host log   — no `failed to import` / loader error for the plugin
 *   2. shadowing  — the package the plugin resolves is not an older duplicate
 *
 * The second signal exists because "no import error" is not the same as "runs":
 * a shadowed transitive dep is the failure mode that hides best.
 *
 * Usage: node verify-plugin-activation.mjs [--profile <dir>] [--log <file>] [pkg...]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve as resolvePath, parse as parsePath } from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
// Defaults derive from the environment so no user path is baked into the repo
// (check-private.ps1 flags a literal "C:/Users/<name>" as a leak).
const HOME = process.env.USERPROFILE || process.env.HOME || '';
const APPDATA = process.env.APPDATA || '';
const PROFILE = opt('profile', `${HOME}/.dsh/profiles/web`);
const LOGS = opt('logs', `${APPDATA}/DSH Desktop/logs`);
const named = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

const NM = join(PROFILE, 'node_modules');

/** Declared dependencies of a plugin, by package.json name. */
function depsOf(dir) {
  try {
    const m = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return { ...(m.dependencies || {}), ...(m.peerDependencies || {}) };
  } catch { return {}; }
}

/** Where `spec` resolves for a module living in `fromDir` (mirrors Node's walk-up). */
function resolveFrom(spec, fromDir) {
  let dir = fromDir;
  for (;;) {
    const cand = join(dir, 'node_modules', spec);
    if (existsSync(join(cand, 'package.json'))) return cand;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  try { return createRequire(join(fromDir, 'noop.js')).resolve(spec + '/package.json'); } catch {}
  return null;
}

function versionOf(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? '?'; } catch { return '?'; }
}

/** Newest log file pair for today, error log preferred. */
function newestLog(sub) {
  if (!existsSync(LOGS)) return null;
  const files = readdirSync(LOGS)
    .filter((f) => f.endsWith('.log') && f.startsWith('dsh-') && f.includes(sub))
    .sort();
  return files.length ? join(LOGS, files[files.length - 1]) : null;
}

/**
 * Default target set: the profile's DIRECT dependencies only. Scanning all of
 * node_modules buries the signal — ordinary libraries legitimately carry older
 * nested copies of their own deps (pnpm pins per-importer), and that is not a
 * defect. A DSH plugin is a direct dependency of the profile, so the direct set
 * is both the meaningful one and the stable one.
 */
function directDeps() {
  try {
    const m = JSON.parse(readFileSync(join(PROFILE, 'package.json'), 'utf8'));
    return Object.keys(m.dependencies || {});
  } catch { return []; }
}

const targets = named.length ? named : directDeps();

const errLog = newestLog('.error.log');
const logSrc = errLog ? readFileSync(errLog, 'utf8') : '';
const logAgeH = errLog ? ((Date.now() - statSync(errLog).mtimeMs) / 3.6e6) : NaN;

let bad = 0;
const rows = [];
for (const name of targets) {
  const dir = join(NM, name);
  if (!existsSync(join(dir, 'package.json'))) continue; // not installed — not this check's business
  const ver = versionOf(dir);
  const libDir = existsSync(join(dir, 'lib')) ? join(dir, 'lib') : dir;

  // --- signal 1: import failures in the host log
  const re = new RegExp(`\\[${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\\n]*|${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*(failed to import|failed to load)`, 'i');
  const hits = logSrc.split('\n').filter((l) => re.test(l));
  const importFail = hits.filter((l) => /failed to import|failed to load|Cannot find|is not a function|Unexpected/i.test(l));

  // --- signal 2: a transitive dep resolving OLDER than the top-level copy
  // Nested copies are normal and good: pnpm pins per-importer when versions
  // diverge, and a nested NEWER copy is exactly how a plugin escapes a stale
  // top-level shadow (better-sidebar 0.24.1 -> nested schemastery 3.18.4 while
  // the top level still serves dsh-verification on 3.18.1). Only a nested
  // *older* copy means the plugin is running against stale code.
  const shadows = [];
  const cmp = (a, b) => {
    const pa = a.split(/[.-]/).map((n) => (/^\d+$/.test(n) ? Number(n) : n));
    const pb = b.split(/[.-]/).map((n) => (/^\d+$/.test(n) ? Number(n) : n));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] ?? 0, y = pb[i] ?? 0;
      if (x === y) continue;
      return x < y ? -1 : 1;
    }
    return 0;
  };
  for (const [spec, range] of Object.entries(depsOf(dir))) {
    if (range.startsWith('file:') || range.startsWith('link:')) continue;
    const from = resolveFrom(spec, libDir);
    if (!from) continue;
    const top = join(NM, spec);
    if (!existsSync(join(top, 'package.json'))) continue;
    const got = versionOf(from), want = versionOf(top);
    if (got === want) continue;
    if (cmp(got, want) < 0) shadows.push(`${spec}: resolves ${got} (nested, OLDER) but top-level is ${want}`);
  }

  const ok = importFail.length === 0 && shadows.length === 0;
  if (!ok) bad++;
  rows.push({ name, ver, ok, importFailures: importFail.length, lastHit: importFail.length ? importFail[importFail.length - 1].slice(0, 100) : '', shadows });
}

for (const r of rows) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${r.name}@${r.ver}`);
  if (r.importFailures) {
    console.log(`        import failures in host log: ${r.importFailures}`);
    console.log(`        last: ${r.lastHit}`);
  }
  for (const s of r.shadows) console.log(`        SHADOW  ${s}`);
}
console.log(`\nlog: ${errLog ?? '(none)'} (age ${Number.isFinite(logAgeH) ? logAgeH.toFixed(1) + 'h' : 'n/a'})`);
if (Number.isFinite(logAgeH) && logAgeH > 6) {
  console.log('WARNING: host log is older than 6h — a clean result only proves the log stayed clean, restart DSH and re-run.');
  process.exit(2);
}
console.log(bad ? `\n${bad} plugin(s) NOT healthy` : `\nall checked plugins healthy (${rows.length})`);
process.exit(bad ? 1 : 0);
