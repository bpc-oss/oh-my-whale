#!/usr/bin/env node
/**
 * check-plugin-imports.mjs — do the profile's plugins actually PARSE and LINK against the
 * live kernel?
 *
 * Why this exists: verify-plugin-activation.mjs reads the host log, but a plugin that fails
 * at module level never logs the phrases it greps for. On 2026-09-30 `dsh-bash-terminal`
 * had been failing for hours —
 *
 *   import { settingsNamespace } from "@deepseek-ai/dsh-settings";
 *   SyntaxError: does not provide an export named 'settingsNamespace'
 *
 * logged only as `[E] [host-resolved-root-include]` and `[W] [hmr] ... failed to import`.
 * The visible symptom was "conversations that need a shell command just stop", with no error
 * on screen — the exact failure the user reported as "terminates for no reason".
 *
 * Two phases per plugin entry:
 *   1. PARSE  — vm.SourceTextModule catches syntax errors in the entry itself
 *   2. LINK   — resolves every import against the profile tree, then the app tree (the way
 *               the desktop's own module-resolution hook does), catching a named import the
 *               target package does not export, and bare specifiers that resolve nowhere
 *
 * Requires: node --experimental-vm-modules
 * Usage: node --experimental-vm-modules scripts/check-plugin-imports.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import vm from 'node:vm';

const HOME = (process.env.USERPROFILE || process.env.HOME || '').replace(/\\/g, '/');
const LOCALAPPDATA = (process.env.LOCALAPPDATA || '').replace(/\\/g, '/');
const APP_NM = `${LOCALAPPDATA}/Programs/DSH Desktop/resources/app/node_modules`;
const PROFILE_NM = `${HOME}/.dsh/profiles/web/node_modules`;

/** Export names a module actually provides, read statically from its source. */
function exportsOf(file) {
  const src = readFileSync(file, 'utf8');
  // A CJS barrel that forwards to another file (react/jsx-runtime.js is literally
  // `module.exports = require('./cjs/react-jsx-runtime.development.js')`) cannot be judged
  // statically — the real names live one file down. Report "unknown" rather than guessing,
  // which is what turned three correct imports into false failures.
  if (/module\.exports\s*=\s*require\(/.test(src) && !/exports\.[A-Za-z_$]/.test(src)) return null;
  const names = new Set();
  for (const m of src.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const as = part.split(/\s+as\s+/);
      const n = (as[1] ?? as[0]).trim();
      if (n && !n.startsWith('type ')) names.add(n);
    }
  }
  if (/\bexport\s+default\b/.test(src)) names.add('default');
  if (/\bexport\s*\*/.test(src)) return null; // star re-export: cannot know statically
  return names;
}

/** A package directory -> its real entry file, via package.json main/exports. */
function entryOfPackage(dir) {
  let m;
  try { m = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { return null; }
  const exp = m.exports && typeof m.exports === "object" ? m.exports["."] : undefined;
  const rel = (typeof exp === 'string' ? exp : exp && (exp.default ?? exp.import)) || m.main || './index.js';
  const relPath = String(rel).replace(/^\.\//, '');
  for (const c of [join(dir, relPath), join(dir, 'index.js')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function resolveFile(spec, fromDir) {
  if (spec.startsWith(".")) {
    const p = resolvePath(fromDir, spec);
    for (const c of [p, `${p}.js`, join(p, "index.js")]) if (existsSync(c) && statSync(c).isFile()) return c;
    return null;
  }
  // The desktop's loader hook accepts BARE names for kernel packages: `cordis` resolves to
  // @deepseek-ai/cordis. Without that fallback this check reports a long tail of false
  // "cannot resolve 'cordis'".
  const names = spec.startsWith('@') || spec.includes('/') ? [spec] : [spec, `@deepseek-ai/${spec}`];
  for (const name of names) {
    // profile tree first (a sibling pinned there wins), then the app tree — the order the
    // desktop loader hook uses for kernel packages a plugin imports.
    for (const base of [PROFILE_NM, APP_NM]) {
      const p = join(base, ...name.split('/'));
      if (existsSync(p) && statSync(p).isDirectory()) { const e = entryOfPackage(p); if (e) return e; }
      const f = `${p}.js`;
      if (existsSync(f) && statSync(f).isFile()) return f;
    }
  }
  // Subpath imports (`pkg/sub`) are resolved through package.json "exports", which a
  // plain path probe cannot see. Use Node's own resolver from both trees before giving
  // up, so a plugin that imports an officially exported subpath is not a false FAIL.
  for (const base of [PROFILE_NM, APP_NM]) {
    try {
      const r = createRequire(join(base, '_probe.js'));
      return r.resolve(spec);
    } catch { /* try the next tree */ }
  }
  return null;
}

let pkg;
try { pkg = JSON.parse(readFileSync(join(PROFILE, 'package.json'), 'utf8')); }
catch { pkg = JSON.parse(readFileSync(`${HOME}/.dsh/profiles/web/package.json`, 'utf8')); }

const problems = [];
let checked = 0, links = 0;

for (const name of Object.keys(pkg.dependencies || {})) {
  const dir = join(PROFILE_NM, name);
  if (!existsSync(join(dir, 'package.json'))) continue;
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { continue; }
  const main = typeof manifest.main === 'string' ? manifest.main : './lib/index.js';
  const entry = join(dir, main.replace(/^\.\//, ''));
  if (!existsSync(entry) || !entry.endsWith('.js')) continue;
  checked++;

  const src = readFileSync(entry, 'utf8');

  // phase 1: parse
  try {
    // eslint-disable-next-line no-new
    new vm.SourceTextModule(src, { identifier: entry });
  } catch (e) {
    problems.push({ name, kind: 'PARSE', detail: String(e.message).split('\n')[0].slice(0, 130) });
    continue;
  }

  // phase 2: link
  // Skip two things that cannot break the runtime and only produced false findings:
  //  - `import type` — erased by tsc, so a missing TYPE cannot break a built bundle
  //    (dsh-super-injector imports SlotsService this way; the class does not exist at runtime)
  //  - comment lines — build notes name tools that are not runtime deps ("tsdown client bundle")
  const scan = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  for (const m of scan.matchAll(/(?:^|\n)\s*import\s+(?!type\b)(?:([^'";]*?)\s+from\s+)?['"]([^'"]+)['"]/g)) {
    const clause = (m[1] || '').trim();
    const spec = m[2];
    // Node builtins: 'node:fs' and the bare 'fs' / 'fs/promises' / 'path' forms.
    if (spec.startsWith('node:') || ['crypto','fs','path','os','util','url','stream','events','http','https','net','zlib','child_process','worker_threads','buffer','assert','tty','readline','perf_hooks','diagnostics_channel','dns','timers','v8','vm','process','module','querystring','string_decoder','punycode','cluster','constants','dgram','inspector'].includes(spec) || spec.startsWith('fs/')) continue;
    links++;
    const target = resolveFile(spec, dirname(entry));
    if (!target) {
      problems.push({ name, kind: 'UNRESOLVED', detail: `cannot resolve '${spec}'` });
      continue;
    }
    const named = clause.match(/\{([^}]*)\}/);
    if (!named) continue;
    const have = exportsOf(target);
    if (have === null) continue;              // star re-export, cannot judge
    const want = named[1].split(',').map((s) => s.split(/\s+as\s+/)[0].trim()).filter((s) => s && !s.startsWith('type '));
    const missing = want.filter((w) => !have.has(w));
    if (missing.length) {
      problems.push({ name, kind: 'NO-EXPORT', detail: `'${spec}' has no export named ${missing.join(', ')}` });
    }
  }
}

for (const p of problems) {
  console.log(`FAIL  ${p.name}  [${p.kind}]`);
  console.log(`      ${p.detail}`);
}
console.log(`\nchecked ${checked} plugin entries, ${links} import edges, ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
