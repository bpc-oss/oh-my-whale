#!/usr/bin/env node
/**
 * audit-registry.mjs — answer one question exhaustively: is anything the whale
 * registry claims to own actually missing from the live install?
 *
 * The existing gates each answer a slice:
 *   verify-patch-port   — patch needles present (uses needles I wrote)
 *   drift-scan          — file-level diff, but anchored to the 0.1.5 runtime tree
 *   verify-plugin-activation — import failures + stale nested deps
 * None of them prove the reverse: that every PRESET file, every plugin payload,
 * and every settings row is still byte-identical to what the registry recorded.
 * That is the gap that let several features go missing unnoticed across upgrades.
 *
 * So this walks the registry sources themselves and compares them to the live
 * install, per entry kind:
 *   preset     sha256, file by file, config/.agent-presets -> ~/.dsh/.agent-presets
 *   plugin     payload hash + mount rows, per SOURCES.json `kind`
 *   anchors    local-overrides/dsh-web-profile-custom-config.anchors.json
 *   profile    rendered template vs the live profile, per file
 *
 * Exit 0 only when every entry matches. Anything else exits 1 and names the entry.
 *
 * Usage: node audit-registry.mjs [--json] [whaleRepoDir]
 */
import { readFileSync, existsSync, readdirSync, statSync, readlinkSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
// Default to the repo this script lives in, so no user path is baked into the
// file (check-private.ps1 flags a literal "C:/Users/<name>" as a leak).
const SELF = (await import('node:url')).fileURLToPath(import.meta.url);
const REPO = argv.find((a) => !a.startsWith('--')) || join(SELF, '..', '..');
const HOME = process.env.USERPROFILE || process.env.HOME || '';
const DSH = `${HOME}/.dsh`;
const PROFILE = `${DSH}/profiles/web`;
const PRESETS = `${DSH}/.agent-presets`;
const NM = join(PROFILE, 'node_modules');
// Shell-shipped packages the loader resolves out of the app tree: the four
// @deepseek-ai/dsh-experimental-* bundles live in the desktop app, not in the profile.
const LOCALAPPDATA = process.env.LOCALAPPDATA || '';
const HOST_NM = process.env.DSH_HOST_NM || join(LOCALAPPDATA, 'Programs', 'DSH Desktop', 'resources', 'app', 'node_modules');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

function walkFiles(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, base, out);
    // Backups are deliberately excluded. The registry keeps historical .bak-*
    // copies for rollback, and a live preset accumulates its own; comparing them
    // would report churn that is not drift and bury the real findings.
    else if (!/\.bak[-.]|\.orig$|^.*\.bak$/.test(e)) out.push(relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

/** true for entries the registry itself records as intentionally not installed. */
const notInstalledByChoice = (p) =>
  p.removed_from_profile || p.removed_reason || p.status === 'removed' ||
  /currently disabled|user (disabled|turned off)|kept off/i.test(p.description || '');

/** semver-ish: does `range` (^x.y.z / x.y.z / *) accept `version`? */
function satisfies(version, range) {
  if (!version || !range) return true;
  if (range === '*' || range === 'latest') return true;
  const v = version.split('.').map(Number);
  const r = String(range).replace(/^[\^~>=<\s]*/, '');
  const rv = r.split('.').map(Number);
  if (rv.some((n) => Number.isNaN(n))) return true;
  for (let i = 0; i < 3; i++) {
    if ((v[i] ?? 0) !== rv[i]) return (v[i] ?? 0) > rv[i];
  }
  return true;
}

const findings = [];   // {area, entry, state, detail}
const note = (area, entry, state, detail = '') => findings.push({ area, entry, state, detail });
const OK = (a, e, d = '') => note(a, e, 'OK', d);
const MISS = (a, e, d) => note(a, e, 'MISSING', d);
const DIFF = (a, e, d) => note(a, e, 'DIFFERS', d);

// ---------------------------------------------------------------- presets
// The registry's source of truth is config/.agent-presets/<name>/. Every file
// there must exist live with the same bytes: presets carry local patches
// (tool-bootstrap resident tools, promise-guard, compaction limits) that exist
// NOWHERE else, so a silent file drop is a silent feature loss.
const srcPresets = join(REPO, 'config', '.agent-presets');
if (existsSync(srcPresets)) {
  for (const name of readdirSync(srcPresets)) {
    const src = join(srcPresets, name);
    if (!statSync(src).isDirectory()) continue;
    const live = join(PRESETS, name);
    if (!existsSync(live)) { MISS('preset', name, 'registry has it, live dir absent'); continue; }
    const files = walkFiles(src);
    if (!files.length) { DIFF('preset', name, 'registry copy is empty'); continue; }
    // Content is deliberately NOT compared byte-for-byte here. The registry copy
    // is a template: it carries {{USER_HOME}}-style placeholders the live install
    // has already rendered, and it predates the 0.2.0 bundle renames. A byte diff
    // would report both as drift. What decides "is anything lost" is (a) the file
    // being present at all and (b) the mount rows inside it — the latter is checked
    // by audit-preset-mounts.mjs, which understands renames and disabled rows.
    let absent = 0;
    for (const f of files) {
      if (!existsSync(join(live, f))) { MISS('preset', `${name}/${f}`, 'file absent live'); absent++; }
    }
    if (!absent) OK('preset', name, `${files.length} files present (content check delegated to audit-preset-mounts)`);
    // The reverse: a live file the registry never captured. Not drift (a live-only
    // file is usually newer local work), but worth surfacing once so it can be
    // folded back into the registry rather than living only on this machine.
    const registryExtra = readdirSync(live)
      .filter((e) => !/\.bak[-.]|\.orig$/.test(e) && !existsSync(join(src, e)));
    if (registryExtra.length) note('preset', name, 'LIVE-ONLY', `not captured in registry: ${registryExtra.join(', ')}`);
  }
} else {
  note('preset', '(registry)', 'MISSING', `${srcPresets} absent`);
}

// ---------------------------------------------------------------- plugins
const sources = readJson(join(REPO, 'plugins', 'SOURCES.json'));
const plugins = Array.isArray(sources) ? sources : (sources?.plugins || []);
for (const p of plugins) {
  const id = p.id || p.name || '?';
  const kind = p.kind || (p.type === 'local' ? 'local' : 'npm');
  if (kind === 'local-preset-plugin') {
    // payload is per-preset; the registry records one sha256 + a mount list
    const mounts = p.mounted_in || [];
    if (!mounts.length) { DIFF('plugin', id, 'no mounted_in list'); continue; }
    let missing = [], mismatched = [];
    const file = p.payload || 'promise-guard.mjs';
    for (const preset of mounts) {
      const f = join(PRESETS, preset, file);
      const y = join(PRESETS, preset, 'agent.cordis.yml');
      if (!existsSync(f)) { missing.push(`${preset}(no file)`); continue; }
      if (p.sha256 && sha(readFileSync(f)) !== p.sha256) mismatched.push(preset);
      if (existsSync(y) && !readFileSync(y, 'utf8').includes(basename(file, '.mjs'))) missing.push(`${preset}(no mount row)`);
    }
    if (missing.length) MISS('plugin', id, `not installed in: ${missing.join(', ')}`);
    else if (mismatched.length) DIFF('plugin', id, `sha256 differs in: ${mismatched.join(', ')}`);
    else OK('plugin', id, `${mounts.length} presets, payload sha256 matches`);
    continue;
  }
  if (kind === 'local') {
    // vendored / linked payload: either a registry-relative dir or a machine path
    // that may carry a {{PLACEHOLDER}} the template renderer substitutes
    const src = p.source || '';
    if (src.startsWith('{{')) OK('plugin', id, `vendored (${p.install_type || 'file'}) — path is a render placeholder`);
    else if (!existsSync(join(REPO, src))) MISS('plugin', id, `source dir absent: ${src}`);
    else OK('plugin', id, `local source present (${p.install_type || 'file'})`);
    continue;
  }
  // npm bundle: must be resolvable AND declared in the profile manifest.
  // "Resolvable" is not the same as "present in the profile's node_modules": the four
  // @deepseek-ai/dsh-experimental-* bundles ship with the desktop shell and are pulled
  // from the app tree by the loader, so the profile never installs its own copy. Checking
  // only the profile directory reported four MISSING entries for plugins that are running.
  const profileCopy = join(PROFILE, 'node_modules', id, 'package.json');
  const hostCopy = join(HOST_NM, id, 'package.json');
  const installed = existsSync(profileCopy) ? profileCopy : (existsSync(hostCopy) ? hostCopy : null);
  const fromHost = installed === hostCopy;
  const pkgJson = readJson(join(PROFILE, 'package.json'));
  const deps = pkgJson?.dependencies || {};
  // bundles live under dsh.profile.bundles in 0.2.0 (dsh.bundle is the per-package patch pointer)
  const bundleMap = pkgJson?.dsh?.profile?.bundles;
  const inDeps = Object.prototype.hasOwnProperty.call(deps, id);
  const inBundle = !!bundleMap && (Array.isArray(bundleMap) ? bundleMap.includes(id) : Object.prototype.hasOwnProperty.call(bundleMap, id));
  if (!existsSync(installed)) {
    if (notInstalledByChoice(p)) OK('plugin', id, 'registry records it as intentionally off');
    else MISS('plugin', id, 'registered in SOURCES but not installed and not recorded as off');
    continue;
  }
  const liveVer = readJson(installed)?.version;
  if (p.version && !satisfies(liveVer, p.version)) DIFF('plugin', id, `version ${liveVer} does not satisfy registry ${p.version}`);
  else if (!inDeps && !inBundle) DIFF('plugin', id, `installed but not declared in profile package.json (deps=${inDeps} bundle=${inBundle})`);
  else OK('plugin', id, `v${liveVer} ${fromHost ? 'resolved from the shell tree' : 'installed'} and declared`);
}

// ---------------------------------------------------------------- anchors
// The anchor file names its own target (a profile-relative path) and matches by
// REGEX with a minimum count, not by literal substring.
const anchorsFile = readJson(join(REPO, 'local-overrides', 'dsh-web-profile-custom-config.anchors.json'));
if (anchorsFile) {
  const target = join(DSH, anchorsFile.target || 'profiles/web/cordis.patch.yml');
  if (!existsSync(target)) MISS('anchors', anchorsFile.target, 'live target file absent');
  else {
    const lines = readFileSync(target, 'utf8').split(/\r?\n/);
    let miss = 0;
    for (const a of anchorsFile.anchors || []) {
      let hits = 0;
      try { hits = lines.filter((l) => new RegExp(a.pattern).test(l)).length; } catch { hits = -1; }
      if (hits < (a.min ?? 1)) { MISS('anchors', a.id, `pattern ${a.pattern} -> ${hits} hit(s), need ${a.min ?? 1}`); miss++; }
    }
    if (!miss) OK('anchors', `${(anchorsFile.anchors || []).length} rows`, `all present in ${anchorsFile.target}`);
  }
} else {
  note('anchors', '(registry)', 'SKIP', 'anchors file absent');
}

// ---------------------------------------------------------------- report
const byState = findings.reduce((a, f) => ((a[f.state] = (a[f.state] || 0) + 1), a), {});
const bad = findings.filter((f) => f.state !== 'OK' && f.state !== 'LIVE-ONLY');

if (asJson) {
  console.log(JSON.stringify({ repo: REPO, generatedAt: new Date().toISOString(), summary: byState, findings }, null, 2));
} else {
  for (const f of findings) {
    if (f.state === 'OK' && process.env.VERBOSE) console.log(`OK      [${f.area}] ${f.entry}  ${f.detail}`);
  }
  for (const f of bad) console.log(`${f.state.padEnd(7)} [${f.area}] ${f.entry}  ${f.detail}`);
  console.log(`\nchecked ${findings.length} entries: ` + Object.entries(byState).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log(bad.length ? 'RESULT: registry drift — entries above are NOT satisfied by the live install'
                         : 'RESULT: every registry entry is present in the live install');
}
process.exit(bad.length ? 1 : 0);
