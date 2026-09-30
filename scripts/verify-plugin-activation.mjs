#!/usr/bin/env node
/**
 * verify-plugin-activation.mjs — prove that profile plugins actually LOAD and are
 * actually MOUNTED, not merely that they are present on disk.
 *
 * Why this exists, in two parts that both bit us for real:
 *
 * 1. A plugin whose import throws never reaches the renderer, so every DOM probe still
 *    succeeds — the host simply never mounts its client bundle. On 2026-09-30
 *    better-sidebar had been swapped to 0.24.1 and reported as "loaded, zero console
 *    errors" while `dsh-better-sidebar/lib/index.js:119` was throwing
 *    `field.volatile is not a function` on every HMR retry. The only reliable evidence
 *    was in the host error log, which nothing was reading.
 *
 * 2. "Importing cleanly" is indistinguishable from "never mounted" when the plugin is
 *    missing from dsh.profile.bundles: an unreferenced plugin produces no import error,
 *    so the log check passes on a plugin that does nothing at all. dsh-plugin-manager
 *    sat in exactly that state — in node_modules, clean log, zero effect.
 *
 * Three signals, all required:
 *   1. host log   — no import/load failure for the plugin
 *   2. wired      — listed in the profile's dsh.profile.bundles (or recorded as off)
 *   3. no shadow  — no transitive dep resolving OLDER than the top-level copy
 *
 * Signal 3 exists because "no import error" is not the same as "runs": a shadowed
 * transitive dep is the failure mode that hides best. A nested NEWER copy is normal
 * pnpm behaviour and is not reported.
 *
 * Usage: node verify-plugin-activation.mjs [--profile <dir>] [--logs <file>] [pkg...]
 * Exits 0 clean, 1 unhealthy, 2 "log too old to conclude anything".
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES = join(REPO, 'plugins', 'SOURCES.json');
const NM = join(PROFILE, 'node_modules');
const named = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/** Plugins the registry itself records as intentionally absent or turned off. */
function offByChoice() {
  const s = readJson(SOURCES);
  const list = Array.isArray(s) ? s : (s?.plugins || []);
  return new Set(list
    .filter((p) => p.removed_from_profile || p.removed_reason || /currently disabled|user (disabled|turned off)/i.test(p.description || ''))
    .map((p) => p.id));
}

function packageDir(base, name) {
  const dir = name.startsWith('@') ? join(base, ...name.split('/')) : join(base, name);
  return existsSync(join(dir, 'package.json')) ? dir : null;
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
  return null;
}

/**
 * True when another direct dependency imports this package: it is a library that runs
 * inside its host plugin, not a plugin the loader must mount.
 */
function isLibrary(name, selfDir) {
  const deps = readJson(join(PROFILE, 'package.json'))?.dependencies || {};
  for (const other of Object.keys(deps)) {
    if (other === name) continue;
    const od = join(NM, other);
    const own = readJson(join(od, 'package.json'));
    if (own?.dependencies?.[name] || own?.peerDependencies?.[name]) return true;
  }
  return false;
}

const versionOf = (dir) => readJson(join(dir, 'package.json'))?.version ?? '?';

const cmp = (a, b) => {
  const pa = String(a).split(/[.-]/).map((n) => (/^\d+$/.test(n) ? Number(n) : n));
  const pb = String(b).split(/[.-]/).map((n) => (/^\d+$/.test(n) ? Number(n) : n));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x === y) continue;
    return x < y ? -1 : 1;
  }
  return 0;
};

/**
 * Newest host/application log for today, searching BOTH the logs root and its host/
 * subdirectory.
 *
 * The subdirectory matters: a plugin that fails to import is reported by the HOST
 * process and lands in logs/host/*.log, while the application layer writes to logs/*.log.
 * Scanning only the root meant this gate — whose entire reason for existing is "the
 * host log is the only place the evidence is" — was reading the wrong file the whole
 * time. Both sets are read now, newest wins for the age report.
 */
function logCandidates(suffix) {
  if (!existsSync(LOGS)) return [];
  const out = [];
  for (const dir of [LOGS, join(LOGS, 'host')]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(suffix) && f.startsWith('dsh-')) out.push(join(dir, f));
    }
  }
  return out.sort();
}
const newestLog = (suffix) => {
  const c = logCandidates(suffix);
  return c.length ? c[c.length - 1] : null;
};

const targets = named.length ? named : Object.keys(readJson(join(PROFILE, 'package.json'))?.dependencies || {});
const OFF = offByChoice();
const profilePkg = readJson(join(PROFILE, 'package.json'));
const bundles = profilePkg?.dsh?.profile?.bundles;
const hasBundleList = Array.isArray(bundles) && bundles.length > 0;
const patchText = (() => { try { return readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8'); } catch { return ''; } })();

// The HOST process writes to logs/host/*.log; the application layer writes to logs/*.log.
// Both are read: a plugin that fails to import is only ever reported by the host.
const logFiles = [...new Set([...logCandidates('.error.log'), ...logCandidates('.log')])];
const rawLog = logFiles
  .map((f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } })
  .join('\n');

// ── Only this run counts ────────────────────────────────────────────────────
// A log file accumulates across runs. better-sidebar's "failed to import" lines from
// 10:40 sat in the same file that a clean 11:51 boot appended to, and reading the whole
// file reported a fixed plugin as still broken. Filter to lines at or after --since
// (default: the host process start time, discovered from the log's own newest
// boot-marker sequence when not supplied).
const TS = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\./;
const sinceArg = opt('since', '');
let logSrc = rawLog;
let bootAt = sinceArg;
if (sinceArg) {
  logSrc = rawLog.split('\n').filter((l) => { const m = TS.exec(l); return !m || m[1] >= sinceArg; }).join('\n');
} else {
  // No --since: infer the current run from the log itself. A restart leaves a gap of
  // minutes between one run's last line and the next run's first, so the start of the
  // final gap is this boot. Without this, a plugin fixed at 11:51 still fails the gate
  // on its 01:35 breakage — dsh-better-sidebar reported 28 failures for a run that had
  // none, and a gate that cannot tell a fixed bug from a live one is worse than none.
  const stamps = [...rawLog.matchAll(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\./gm)].map((m) => m[1]);
  for (let i = 1; i < stamps.length; i++) {
    const gap = Date.parse(stamps[i].replace(' ', 'T')) - Date.parse(stamps[i - 1].replace(' ', 'T'));
    if (gap > 120000) bootAt = stamps[i];
  }
  if (bootAt) logSrc = rawLog.split('\n').filter((l) => { const m = TS.exec(l); return !m || m[1] >= bootAt; }).join('\n');
}
const newestLogPath = logFiles.length
  ? logFiles.reduce((best, f) => (statSync(f).mtimeMs > statSync(best).mtimeMs ? f : best))
  : null;
const logAgeH = newestLogPath ? (Date.now() - statSync(newestLogPath).mtimeMs) / 3.6e6 : NaN;

const rows = [];
for (const name of targets) {
  const dir = join(NM, name);
  if (!existsSync(join(dir, 'package.json'))) {
    // A declared dependency whose package directory is gone is MISSING, not "nothing to
    // check". Skipping it silently is how a removed package turns into an unexplained
    // capability gap days later — the negative control (moving the directory aside)
    // caught exactly this: the gate reported 23/23 healthy while one of 24 was absent.
    rows.push({ name, ver: '(absent)', ok: false, importFailures: 0, lastHit: '', notWired: [], shadows: [], absent: true });
    continue;
  }
  const ver = versionOf(dir);

  // 1. import failures
  //    Narrower than it looks: `[<pkg>]` alone matched EVERY line the plugin logged,
  //    including `[I] dsh-openpencil mounted` and `[I] legacy preference import:
  //    already-configured` — so a perfectly healthy set reported 72 and 84 "failures".
  //    Only a warning/error line that also carries a failure phrase counts.
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `\\[(?:W|E)\\]\\s*\\[[^\\]]*${esc}[^\\]]*\\][^\\n]*` +
    `(?:failed to import|failed to load|ERR_[A-Z_]+|is not a function|Unexpected reserved word|Cannot find module|Cannot access)`,
    'i'
  );
  const importFail = logSrc.split('\n').filter((l) => re.test(l));

  // 2. wired — DSH mounts a plugin from THREE places, and checking only the first
  //    produced six false failures:
  //      a. dsh.profile.bundles in the profile package.json
  //      b. an `- insert:` row in profiles/web/cordis.patch.yml (how dsh-token-meter-hermes
  //         is mounted — it has never been in bundles and works fine)
  //      c. a `dsh.client` / `dsh.bundle` key in the package's own package.json, which
  //         makes the loader self-assemble it from `dependencies` (how
  //         dsh-client-ui-subagent is mounted)
  //    A plugin missing from all three is installed, imports cleanly, and does nothing.
  //
  //    Libraries are exempt: a package another direct dependency imports is code that
  //    runs INSIDE its host plugin, not a plugin of its own. @bpc-oss/dsh-evidence is
  //    exactly that — the schema module for the verification suite, required by both
  //    dsh-verification and dsh-client-ui-verification, and never mounted itself.
  const notWired = [];
  let route = '';
  if (!OFF.has(name) && !isLibrary(name, dir)) {
    const viaBundle = Array.isArray(bundles) && bundles.includes(name);
    // Only a real insert ROW counts. A plain substring search matched the dozens of
    // "#Managed by dsh-plugin-manager" comment lines in cordis.patch.yml and passed a
    // plugin that was not actually mounted — the negative control caught exactly that.
    const viaPatch = new RegExp(`^[ \\t]*(?:-[ \\t]*)?id:[ \\t]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm').test(patchText)
      || new RegExp(`^[ \\t]*name:[ \\t]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm').test(patchText);
    const own = readJson(join(dir, 'package.json'));
    const viaSelf = !!(own?.dsh?.client || own?.dsh?.bundle);
    // viaSelf fires for EVERY profile package on this machine (they all declare dsh.client
    // or dsh.bundle), which made the FAIL branch unreachable: the gate could never detect
    // the "installed, clean log, never mounted" state it was written for. Keep the boolean
    // for the all-three-absent case, but also record WHICH route applies so a bundle entry
    // quietly becoming redundant is visible instead of silently doing the work.
    route = viaBundle ? 'bundles' : viaPatch ? 'cordis.patch.yml' : viaSelf ? 'self-declared' : 'none';
    if (hasBundleList && !viaBundle && !viaPatch && !viaSelf) notWired.push(name);
  }

  // 3. stale nested dep
  const shadows = [];
  const deps = readJson(join(dir, 'package.json'));
  for (const [spec, range] of Object.entries({ ...(deps?.dependencies || {}), ...(deps?.peerDependencies || {}) })) {
    if (String(range).startsWith('file:') || String(range).startsWith('link:')) continue;
    const from = resolveFrom(spec, existsSync(join(dir, 'lib')) ? join(dir, 'lib') : dir);
    if (!from) continue;
    const top = join(NM, spec);
    if (!existsSync(join(top, 'package.json'))) continue;
    const got = versionOf(from), want = versionOf(top);
    if (got !== want && cmp(got, want) < 0) shadows.push(`${spec}: resolves ${got} (nested, OLDER) but top-level is ${want}`);
  }

  const ok = importFail.length === 0 && notWired.length === 0 && shadows.length === 0;
  rows.push({ name, ver, ok, route, importFailures: importFail.length, lastHit: importFail.length ? importFail[importFail.length - 1].slice(0, 110) : '', notWired, shadows });
}

for (const r of rows) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}@${r.ver}${r.route ? '  [' + r.route + ']' : ''}`);
  if (r.absent) console.log('        ABSENT  declared in the profile package.json but the package directory is gone from node_modules');
  if (r.importFailures) {
    console.log(`        import failures in host log: ${r.importFailures}`);
    console.log(`        last: ${r.lastHit}`);
  }
  if (r.notWired.length) console.log('        NOT WIRED  in node_modules, imports cleanly, but absent from dsh.profile.bundles, not inserted in cordis.patch.yml, and its package.json declares no dsh.client/dsh.bundle — so it is never mounted');
  for (const s of r.shadows) console.log(`        SHADOW  ${s}`);
}

const bad = rows.filter((r) => !r.ok).length;
console.log(`\nscanned since: ${bootAt ?? 'WHOLE LOG (pass --since to narrow) — historical failures may be counted'}`);
console.log(`log: ${newestLogPath ?? '(none)'} (age ${Number.isFinite(logAgeH) ? logAgeH.toFixed(1) + 'h' : 'n/a'})`);
if (Number.isFinite(logAgeH) && logAgeH > 6) {
  console.log('WARNING: host log older than 6h — a clean result only proves the log stayed clean; restart DSH and re-run.');
  process.exit(2);
}
console.log(bad ? `\n${bad} plugin(s) NOT healthy` : `\nall checked plugins healthy (${rows.length})`);
process.exit(bad ? 1 : 0);
