#!/usr/bin/env node
/**
 * plug-client-check.mjs — why a PROFILE plugin's client half fails to boot.
 *
 * The desktop's client Loader loads each plugin's `./client` entry in the
 * renderer. An ESM link error there (a named import the target no longer
 * exports) kills the renderer, which is what
 * `renderer boot failed (plugins: ...)` reports — with no message.
 *
 * This resolves each @deepseek-ai import of those entries against BOTH the
 * profile's node_modules and the app tree, and reports missing named exports.
 *
 * Usage: node plug-client-check.mjs <plugin> [subpath] ...
 *        node plug-client-check.mjs dsh-bash-terminal dist/client.js
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

import { homedir } from 'node:os';
import { join as joinPath } from 'node:path';
const NM_PROFILE = joinPath(homedir(), '.dsh', 'profiles', 'web', 'node_modules');
const NM_APP = joinPath(homedir(), 'AppData', 'Local', 'Programs', 'DSH Desktop', 'resources', 'app', 'node_modules');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function exportsOf(src) {
  const s = new Set();
  for (const m of src.matchAll(/^\s*exports\.([A-Za-z_$][\w$]*)\s*=/gm)) s.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const t of m[1].split(',')) {
      const x = t.trim();
      if (!x) continue;
      const a = /\bas\s+([\w$]+)\s*$/.exec(x);
      s.add(a ? a[1] : x.replace(/^type\s+/, ''));
    }
  }
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g)) s.add(m[1]);
  if (/\bexport\s+default\b/.test(src)) s.add('default');
  return s;
}

/** Resolve a package (+ optional subpath) to a file, profile first then app. */
function resolvePkg(pkg, sub) {
  // Scoped names keep their scope directory: @deepseek-ai/dsh-x lives at
  // node_modules/@deepseek-ai/dsh-x, NOT node_modules/dsh-x.
  const rel = pkg.startsWith('@') ? pkg.split('/').join('/') : pkg;
  for (const base of [join(NM_PROFILE, ...rel.split('/')), join(NM_APP, ...rel.split('/'))]) {
    const pjPath = join(base, 'package.json');
    if (!existsSync(pjPath)) continue;
    let j;
    try { j = JSON.parse(readFileSync(pjPath, 'utf8').replace(/^\uFEFF/, '')); } catch { continue; }
    const ex = j.exports || {};
    const key = sub ? './' + sub.replace(/^\.\//, '') : '.';
    let cand = ex[key] ?? (sub ? undefined : ex['.']) ?? (sub ? undefined : j.main);
    if (cand && typeof cand === 'object') cand = cand.default ?? cand.browser ?? cand.import;
    let p = cand ? join(base, String(cand)) : join(base, 'index.js');
    if (!existsSync(p) || !p.endsWith('.js')) {
      const alt = join(p, 'index.js');
      if (existsSync(alt)) p = alt;
    }
    if (existsSync(p) && p.endsWith('.js')) {
      let src;
      try { src = readFileSync(p, 'utf8'); } catch { continue; }
      return { p, src, from: base === join(NM_PROFILE, pkg) ? 'profile' : 'app' };
    }
  }
  return null;
}

const args = process.argv.slice(2);
if (!args.length) { console.error('usage: node plug-client-check.mjs <plugin> [subpath] ...'); process.exit(2); }
const pairs = [];
for (let i = 0; i < args.length; i += 2) pairs.push([args[i], args[i + 1]]);

let problems = 0;
for (const [plugin, sub] of pairs) {
  let entry;
  if (sub && sub.endsWith('.js')) {
    for (const base of [NM_PROFILE, NM_APP, process.cwd()]) {
      const cand = resolvePath(base, sub);
      if (existsSync(cand)) {
        entry = { p: cand, src: readFileSync(cand, 'utf8'), from: base === NM_PROFILE ? 'profile' : base === NM_APP ? 'app' : 'path' };
        break;
      }
    }
  } else {
    entry = resolvePkg(plugin, sub);
  }
  if (!entry) { console.log(`\n${plugin}: client entry not found (${sub || '.'})`); problems++; continue; }
  console.log(`\n=== ${plugin} [${sub || '.'}] from ${entry.from}: ${entry.p.replace(NM_PROFILE, '<profile>').replace(NM_APP, '<app>')}`);
  const reqRe = /(?:require\(|from\s+)["'](@deepseek-ai\/[^"']+)["']/g;
  const seen = new Set();
  for (const m of entry.src.matchAll(reqRe)) {
    const spec = m[1];
    if (seen.has(spec)) continue;
    seen.add(spec);
    const parts = spec.split('/');
    const pkg = parts.slice(0, 2).join('/');
    const rest = parts.slice(2).join('/');
    const t = resolvePkg(pkg, rest) || resolvePkg(pkg, null);
    if (!t) { console.log(`  MISSING PACKAGE  ${spec}`); problems++; continue; }
    const ex = exportsOf(t.src);
    // names used from this spec
    const names = new Set();
    for (const mm of entry.src.matchAll(new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*require\\(["']${esc(spec)}["']\\)`, 'g')))
      for (const x of mm[1].split(',')) { const y = x.trim().split(':').pop().trim(); if (y) names.add(y); }
    for (const mm of entry.src.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${esc(spec)}["']`, 'g')))
      for (const x of mm[1].split(',')) { const y = x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim(); if (y) names.add(y); }
    for (const mm of entry.src.matchAll(new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*require\\(["']${esc(spec)}["']\\)`, 'g')))
      names.add('default:' + mm[1]);
    const miss = [...names].filter((n) => !n.startsWith('default:') && !ex.has(n));
    const usesDefault = [...names].some((n) => n.startsWith('default:'));
    const missingDefault = usesDefault && !ex.has('default');
    console.log(`  ${spec}`);
    console.log(`     resolved in ${t.from}, exports=${ex.size}${usesDefault ? ', default used' : ''}${missingDefault ? '  MISSING=default' : ''}${miss.length ? `  MISSING=${miss.join(', ')}` : ''}`);
    if (miss.length || missingDefault) problems++;
  }
}
console.log(`\nPROBLEMS: ${problems}`);
process.exit(problems ? 1 : 0);
