#!/usr/bin/env node
// Static ESM link checker for an assembled asar-root tree.
// Catches the version-skew class of bug: a consumer importing a named export
// that the resolved target module does not actually export (Node throws
// SyntaxError at instantiation, which kills the host process at boot).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';

const ROOT = process.argv[2] || '.';
const NM = join(ROOT, 'node_modules');

function walk(dir, out = [], depth = 0) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (/\.(mjs|js)$/.test(e.name) && !e.name.endsWith('.map')) out.push(p);
  }
  return out;
}

/** Resolve a bare or relative specifier to an actual file path. */
function resolveSpecifier(spec, fromFile) {
  let target;
  if (spec.startsWith('.')) {
    target = resolvePath(dirname(fromFile), spec);
  } else if (spec.startsWith('node:') || spec.startsWith('file:')) {
    return null;
  } else {
    const parts = spec.split('/');
    const pkgName = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const sub = spec.startsWith('@') ? './' + parts.slice(2).join('/') : './' + parts.slice(1).join('/');
    const pkgDir = join(NM, pkgName);
    if (!existsSync(pkgDir)) return null;
    let pj = null;
    try { pj = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')); } catch {}
    target = null;
    if (pj) {
      const exp = pj.exports;
      const pick = (key) => {
        const v = exp?.[key];
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') return v.import ?? v.default ?? v.node ?? null;
        return null;
      };
      if (sub === './') {
        target = pick('.') ?? (pj.module ? './' + pj.module : pj.main ? './' + pj.main : './index.js');
      } else {
        target = pick(sub) ?? (pj.module && sub === './' + pj.module ? pj.module : null);
      }
    }
    if (!target) target = sub === './' ? './index.js' : sub;
    target = resolvePath(pkgDir, target);
  }
  for (const cand of [target, target + '.js', target + '.mjs', target + '.cjs', join(target, 'index.js')]) {
    try { if (existsSync(cand) && statSync(cand).isFile()) return cand; } catch {}
  }
  return null;
}

/** Collect the set of export names a module file provides. */
function exportsOf(file, seen = new Set()) {
  if (seen.has(file)) return null;
  seen.add(file);
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { return null; }
  const names = new Set();
  let starFrom = null;

  // export { a, b as c } [from "x"]  /  export { default as d } from "x"
  const reExport = /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = reExport.exec(src))) {
    const from = resolveSpecifier(m[2], file);
    if (from) {
      const up = exportsOf(from, seen);
      if (up) for (const n of up) names.add(n);
      else names.add('*UNRESOLVED*');
    } else names.add('*UNRESOLVED*');
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(t);
      names.add(as ? as[1] : t.replace(/^type\s+/, ''));
    }
  }
  // export * from "x"
  const reStar = /export\s*\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s*)?from\s*["']([^"']+)["']/g;
  while ((m = reStar.exec(src))) {
    const from = resolveSpecifier(m[2], file);
    if (from && !m[1]) {
      const up = exportsOf(from, seen);
      if (up) for (const n of up) if (n !== 'default') names.add(n);
      else names.add('*UNRESOLVED*');
    } else if (m[1]) names.add(m[1]);
  }
  // export { a, b as c }  (no from)
  const reLocal = /export\s*\{([^}]*)\}(?!\s*from)/g;
  while ((m = reLocal.exec(src))) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(t);
      names.add(as ? as[1] : t.replace(/^type\s+/, ''));
    }
  }
  // export const/let/var/function/class/async function/default
  const reDecl = /export\s+(?:declare\s+)?(?:async\s+)?(const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = reDecl.exec(src))) names.add(m[2]);
  if (/\bexport\s+default\b/.test(src)) names.add('default');
  if (/\bexport\s*\*\s*as\s+/.test(src) && !starFrom) { /* handled above */ }
  // DSH 0.2.0 ships each package as a CJS-shaped bundle inside an
  // `window.__ModuleLoader__.load({ factory })` wrapper that Electron's loader
  // turns back into an ES namespace. Its exports are plain assignments.
  const reAssign = /(?:^|[^.\w$])exports\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = reAssign.exec(src))) names.add(m[1]);
  if (/\bmodule\.exports\s*=/.test(src)) names.add('default');
  return names;
}

/** Parse named imports out of a module. */
function importsOf(src) {
  const out = [];
  const re = /import\s+([^;'"]*?)\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1].trim();
    const spec = m[2];
    const braced = /\{([^}]*)\}/.exec(clause);
    const named = [];
    if (braced) {
      for (const part of braced[1].split(',')) {
        const t = part.trim();
        if (!t) continue;
        const mm = /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+[A-Za-z_$][\w$]*)?$/.exec(t);
        if (mm) named.push(mm[1]);
        else if (t.startsWith('...')) named.push(null); // namespace re-export inside braces
      }
    }
    const def = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.test(clause);
    out.push({ spec, named, default: !!def && !clause.startsWith('{') });
  }
  // bare `import "x"` side effects are not link-relevant
  return out;
}

// Only first-party @deepseek-ai sources. Nested third-party copies vendored
// inside them (yaml, commander, ...) carry their own unresolved-link noise that
// the runtime never touches, so they are out of scope.
function isFirstParty(file) {
  const rel2 = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  const segs = rel2.split('/');
  const first = segs.indexOf('node_modules');
  if (first < 0) return true; // app lib/ and build/
  if (segs[first + 1] !== '@deepseek-ai') return false;
  return segs.indexOf('node_modules', first + 1) < 0; // skip nested deps
}
const files = walk(NM).filter((f) => f.includes('@deepseek-ai')).filter(isFirstParty);
files.push(...walk(join(ROOT, 'lib')));
files.push(...walk(join(ROOT, 'build')).slice(0, 500));

const cache = new Map();
const getExports = (f) => {
  if (!cache.has(f)) cache.set(f, exportsOf(f));
  return cache.get(f);
};

const problems = [];
let checked = 0;
for (const f of files) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  for (const imp of importsOf(src)) {
    if (!imp.spec.startsWith('@deepseek-ai/') && !imp.spec.startsWith('.')) continue;
    if (!imp.named.length && !imp.default) continue;
    checked++;
    const target = resolveSpecifier(imp.spec, f);
    if (!target) {
      problems.push({ kind: 'UNRESOLVED_SPECIFIER', file: rel(f), spec: imp.spec, want: imp.named });
      continue;
    }
    const ex = getExports(target);
    if (!ex) continue;
    if (ex.has('*UNRESOLVED*') && ex.size === 1) continue; // can't determine; skip
    const missing = imp.named.filter((n) => n !== null && !ex.has(n));
    if (missing.length) {
      problems.push({ kind: 'MISSING_NAMED_EXPORT', file: rel(f), spec: imp.spec, target: rel(target), want: missing });
    }
  }
}

function rel(p) {
  const r = resolvePath(ROOT);
  return p.startsWith(r) ? p.slice(r.length + 1) : p;
}

const byKind = {};
for (const p of problems) (byKind[p.kind] ||= []).push(p);
console.log(`scanned ${files.length} files, ${checked} link edges`);
for (const [k, v] of Object.entries(byKind)) {
  console.log(`\n## ${k}: ${v.length}`);
  for (const p of v.slice(0, 60)) {
    console.log(`  ${p.file}\n    import ${JSON.stringify(p.want)} from '${p.spec}'  ->  ${p.target ?? '(unresolved)'}`);
  }
  if (v.length > 60) console.log(`  ... +${v.length - 60} more`);
}
console.log(`\nTOTAL PROBLEMS: ${problems.length}`);
process.exit(problems.length ? 1 : 0);
