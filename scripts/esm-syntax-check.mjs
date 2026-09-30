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
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('usage: node esm-syntax-check.mjs <app-root> [subdir ...]');
  process.exit(2);
}

// Default roots: the kernel tree AND the profile's DIRECT plugin dependencies.
//
// The profile side used to go unchecked entirely — a negative control appended syntax
// garbage to ~/.dsh/profiles/web/node_modules/dsh-bash-terminal/lib/index.js and
// esm-syntax-check, verify-plugin-activation and drift-scan all stayed green. A profile
// plugin is loaded by the same ESM loader as the kernel, so its parse errors are exactly
// as fatal.
//
// Direct dependencies only, deliberately. Scanning the whole profile node_modules pulls in
// transitive test fixtures: has-symbols ships test/shams/*.js as browser globals — illegal
// `return` at top level by design, never loaded by DSH. Those are false positives, and a
// gate that cries wolf is a gate nobody runs.
const HOME = (process.env.USERPROFILE || process.env.HOME || '').replace(/\\/g, '/');
function profilePluginRoots() {
  if (!HOME) return [];
  const nm = `${HOME}/.dsh/profiles/web/node_modules`;
  let pkg;
  try { pkg = JSON.parse(readFileSync(`${HOME}/.dsh/profiles/web/package.json`, 'utf8')); } catch { return []; }
  const out = [];
  for (const name of Object.keys(pkg.dependencies || {})) {
    const d = `${nm}/${name}`;
    if (existsSync(d)) out.push(d);
  }
  return out;
}
const DEFAULT_ROOTS = ['node_modules/@deepseek-ai', ...profilePluginRoots()];
const roots = process.argv.slice(3).length ? process.argv.slice(3) : DEFAULT_ROOTS;

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

/**
 * First-party = the kernel's own @deepseek-ai packages, or a profile DIRECT dependency's
 * own code. Two exclusions are deliberate and both were found by turning the gate loose:
 *
 *   - a nested node_modules (dsh-full-remote ships istanbul-reports, whose
 *     lib/html-spa/src/*.js are JSX sources with bare `<`, needing Babel — not ESM, and
 *     never loaded by DSH);
 *   - transitive test fixtures (has-symbols ships test/shams/*.js as browser globals with
 *     a top-level `return`).
 *
 * Both are third-party code that happens to sit under a first-party directory. A gate that
 * flags them teaches people to ignore it.
 */
const PROFILE_PKGS = new Set(profilePluginRoots().map((d) => d.replace(/\\/g, '/').replace(/\/+$/, '')));

function isFirstParty(file) {
  const norm = file.replace(/\\/g, '/');
  const rel = norm.startsWith(ROOT.replace(/\\/g, '/')) ? norm.slice(ROOT.replace(/\\/g, '/').length + 1) : norm;
  const segs = rel.split('/');
  const first = segs.indexOf('node_modules');
  if (first < 0) return true;
  // kernel side
  if (segs[first + 1] === '@deepseek-ai') return segs.indexOf('node_modules', first + 1) < 0;
  // profile side: the package directory must be one of the declared direct dependencies,
  // and nothing below it may open another node_modules.
  for (const pkg of PROFILE_PKGS) {
    if (norm.startsWith(`${pkg}/`) && segs.indexOf('node_modules', first + 1) < 0) return true;
  }
  return false;
}

const files = [];
// join(ROOT, r) would corrupt an absolute profile path, so resolve each root on its own
// terms: absolute roots stand, relative ones hang off the app root.
const resolveRoot = (r) => (isAbsolute(r) ? r : join(ROOT, r));
for (const r of roots) files.push(...walk(resolveRoot(r)));
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
