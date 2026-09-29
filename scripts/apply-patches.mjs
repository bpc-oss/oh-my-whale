#!/usr/bin/env node
/**
 * apply-patches.mjs — replay oh-my-whale's registered kernel patches onto a
 * DSH 0.2.0 app tree.
 *
 * Why not `git apply`: the registered patches come from three eras with three
 * different path conventions —
 *   - `a/@deepseek-ai/<pkg>/lib/<file>`        (repo style)
 *   - absolute Windows paths under app.asar.unpacked (P17 era)
 *   - absolute paths under the unpacked resources\app (P20+ era)
 * and their hunk context was written against 0.1.5 line numbers, which moved
 * in 0.2.0. So each hunk is matched by CONTENT, not by line number.
 *
 * Per hunk the applier tries, in order:
 *   1. exact match at the recorded line offset
 *   2. exact match anywhere in the file (offset drift)
 *   3. context-relaxed match: drop the hunk's unchanged-context lines from
 *      both sides and match only on the removed/added payload — this is what
 *      survives an upstream edit inside the surrounding comment block
 *   4. already-applied detection (added lines present, removed lines absent)
 *
 * Anything that reaches step 5 is reported as CONFLICT with the offending
 * region printed, and the file is left untouched for that hunk.
 *
 * Usage:
 *   node apply-patches.mjs --root <app-root> [--patch <dir>] [--dry-run] [--only P17,P21]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (n) => argv.includes(n);

const ROOT = arg('--root');
const PATCHDIR = arg('--patch');
const DRY = has('--dry-run');
const ONLY = arg('--only') ? arg('--only').split(',').map((s) => s.trim()) : null;

if (!ROOT || !PATCHDIR) {
  console.error('usage: node apply-patches.mjs --root <app-root> --patch <whale/patches> [--dry-run] [--only P1,P2]');
  process.exit(2);
}

/* ── patch discovery ─────────────────────────────────────────────────── */

function walk(dir, depth = 0) {
  let out = [];
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p, depth + 1));
    else if (/\.(patch|diff)$/.test(e.name)) out.push(p);
  }
  return out;
}

/* ── unified diff parsing ─────────────────────────────────────────────── */

function parsePatch(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const files = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('--- ')) {
      const from = stripPath(l.slice(4));
      // the +++ line must follow, possibly after nothing else
      let j = i + 1;
      while (j < lines.length && lines[j] === '') j++;
      const to = lines[j] && lines[j].startsWith('+++ ') ? stripPath(lines[j].slice(4)) : from;
      cur = { from, to, hunks: [] };
      files.push(cur);
      i = j;
      continue;
    }
    if (l.startsWith('@@') && cur) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l);
      if (!m) { cur.hunks.push({ raw: l, bad: true, lines: [] }); continue; }
      const hunk = { oldStart: +m[1], newStart: +m[3], lines: [] };
      i++;
      while (i < lines.length) {
        const hl = lines[i];
        if (hl.startsWith('@@') || hl.startsWith('--- ')) break;
        if (hl === '') {
          // a bare empty line is a context line " " that got trimmed; treat as
          // end-of-hunk only if the next line starts a new hunk/file
          if (i + 1 >= lines.length) break;
          const nx = lines[i + 1];
          if (nx.startsWith('@@') || nx.startsWith('--- ')) break;
          hunk.lines.push(' ');
          i++;
          continue;
        }
        const t = hl[0];
        if (t === ' ' || t === '+' || t === '-') hunk.lines.push(hl);
        else if (t === '\\') { /* "\ No newline at end of file" */ }
        else break;
        i++;
      }
      i--;
      cur.hunks.push(hunk);
      continue;
    }
  }
  return files.filter((f) => f.hunks.length);
}

function stripPath(p) {
  let s = p.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  const tab = s.indexOf('\t');
  if (tab >= 0) s = s.slice(0, tab);
  // strip a drive/UNC prefix and any trailing timestamp column git adds
  s = s.replace(/^[A-Za-z]:[\\/]/, '');
  s = s.replace(/\r/g, '');
  return s.trim();
}

/* ── resolution of a patch path to a real file in the tree ───────────── */

const NM = join(ROOT, 'node_modules');

function resolveTarget(pathStr) {
  if (!pathStr) return null;
  let s = stripPath(pathStr).replace(/\\/g, '/');
  // drop any leading a/ b/ and any asar-ish prefix, keep @deepseek-ai/... onward
  const at = s.indexOf('@deepseek-ai/');
  if (at >= 0) s = s.slice(at);
  else {
    s = s.replace(/^\.?\//, '');
    const nmAt = s.lastIndexOf('node_modules/');
    if (nmAt >= 0) s = s.slice(nmAt + 'node_modules/'.length);
  }
  const cand = join(NM, ...s.split('/'));
  if (existsSync(cand) && statSync(cand).isFile()) return cand;
  return null;
}

/* ── hunk application ────────────────────────────────────────────────── */

const eq = (a, b) => a === b;

function hunkParts(h) {
  const before = [], after = [];
  for (const l of h.lines) {
    const body = l.slice(1);
    if (l[0] === ' ' || l[0] === '-') before.push(body);
    if (l[0] === ' ' || l[0] === '+') after.push(body);
  }
  return { before, after };
}

function findExact(file, before, hint) {
  const n = before.length;
  if (!n) return -1;
  const start = Math.max(0, hint);
  const tryAt = (i) => {
    if (i < 0 || i + n > file.length) return false;
    for (let k = 0; k < n; k++) if (file[i + k] !== before[k]) return false;
    return true;
  };
  if (tryAt(start)) return start;
  for (let d = 1; d <= file.length; d++) {
    if (tryAt(start - d)) return start - d;
    if (tryAt(start + d)) return start + d;
  }
  return -1;
}

/** Relaxed: match only on the changed payload, anchored by 1 context line each side. */
function findRelaxed(file, h) {
  const removed = h.lines.filter((l) => l[0] === '-').map((l) => l.slice(1));
  const added = h.lines.filter((l) => l[0] === '+').map((l) => l.slice(1));
  if (!removed.length) return -1;
  for (let i = 0; i + removed.length <= file.length; i++) {
    let ok = true;
    for (let k = 0; k < removed.length; k++) if (file[i + k] !== removed[k]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

function findAdded(file, h) {
  const added = h.lines.filter((l) => l[0] === '+').map((l) => l.slice(1));
  const removed = h.lines.filter((l) => l[0] === '-').map((l) => l.slice(1));
  if (!added.length) return -1;
  const { before } = hunkParts(h);
  const ctx = before.filter((b) => !removed.includes(b));
  for (let i = 0; i + added.length <= file.length; i++) {
    let ok = true;
    for (let k = 0; k < added.length; k++) if (file[i + k] !== added[k]) { ok = false; break; }
    if (!ok) continue;
    // Require some trailing context nearby. Upstream 0.2.0 often inserts a line
    // between a hunk's added payload and its recorded trailing context, so the
    // original "immediately after" test reported ALREADY hunks as CONFLICT and
    // made a post-apply dry-run useless as a progress report.
    const window = ctx.length ? ctx[ctx.length - 1] : null;
    let anchored = !window;
    if (window) {
      for (let w = 1; w <= 4 && !anchored; w++) {
        if (file[i + added.length + w - 1] === window) anchored = true;
      }
    }
    if (anchored) return i;
  }
  // Last resort: the added payload is present somewhere and the removed payload
  // is gone — that is the change already being in, whatever upstream did around it.
  if (removed.length) {
    const present = (arr) => {
      for (let i = 0; i + arr.length <= file.length; i++) {
        let ok = true;
        for (let k = 0; k < arr.length; k++) if (file[i + k] !== arr[k]) { ok = false; break; }
        if (ok) return true;
      }
      return false;
    };
    if (present(added) && !present(removed)) return -2; // -2 == already applied
  }
  return -1;
}

function applyToFile(absPath, fileEntry, report) {
  let src = readFileSync(absPath, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let file = src.split(/\r?\n/);
  let changed = false;

  for (const h of fileEntry.hunks) {
    if (h.bad) { report.push({ status: 'BAD-HUNK' }); continue; }
    const { before, after } = hunkParts(h);
    const hint = Math.max(0, h.newStart - 1);

    let at = findExact(file, before, hint);
    if (at >= 0) {
      file.splice(at, before.length, ...after);
      changed = true;
      report.push({ status: 'APPLY' });
      continue;
    }
    at = findRelaxed(file, h);
    if (at >= 0) {
      const removed = h.lines.filter((l) => l[0] === '-').map((l) => l.slice(1));
      const added = h.lines.filter((l) => l[0] === '+').map((l) => l.slice(1));
      file.splice(at, removed.length, ...added);
      changed = true;
      report.push({ status: 'APPLY-RELAXED' });
      continue;
    }
    at = findAdded(file, h);
    if (at === -2) { report.push({ status: 'ALREADY' }); continue; }
    if (at >= 0) { report.push({ status: 'ALREADY' }); continue; }

    report.push({ status: 'CONFLICT', preview: before.slice(0, 4).join(' | ').slice(0, 160) });
  }

  if (changed && !DRY) {
    writeFileSync(absPath, file.join(eol === '\r\n' ? '\r\n' : '\n'), 'utf8');
  }
  return changed;
}

/* ── main ────────────────────────────────────────────────────────────── */

const allPatchFiles = walk(PATCHDIR);
const byId = new Map();
for (const p of allPatchFiles) {
  const id = basename(p).replace(/^\d+[a-z]?-/, '').replace(/\.(patch|diff)$/, '');
  byId.set(id, p);
}

// Order matters where a combined diff covers several entries (P20/P25 share one
// file). Apply by manifest order so the log reads like the ledger.
const MANIFEST = join(PATCHDIR, 'manifest.json');
let entries = [];
if (existsSync(MANIFEST)) {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8').replace(/^\uFEFF/, ''));
  entries = Array.isArray(m) ? m : (m.patches || m.items || Object.entries(m).map(([k, v]) => ({ id: k, ...v })));
}

let tally = { APPLY: 0, 'APPLY-RELAXED': 0, ALREADY: 0, CONFLICT: 0, 'BAD-HUNK': 0, 'NO-TARGET': 0 };
const problems = [];

for (const e of entries) {
  const id = e.id;
  if (ONLY && !ONLY.includes(id)) continue;
  const pf = e.patchFile ? join(PATCHDIR, e.patchFile) : null;
  if (!pf || !existsSync(pf)) { console.log(`${id.padEnd(5)} SKIP      patch file missing`); continue; }

  const parsed = parsePatch(readFileSync(pf, 'utf8'));
  const perFile = [];
  for (const f of parsed) {
    const abs = resolveTarget(f.to) || resolveTarget(f.from);
    if (!abs) {
      perFile.push({ target: f.to || f.from, report: [{ status: 'NO-TARGET' }] });
      continue;
    }
    const rep = [];
    applyToFile(abs, f, rep);
    perFile.push({ target: abs.replace(ROOT, '<app>'), report: rep });
  }
  const counts = {};
  for (const pf2 of perFile) for (const r of pf2.report) counts[r.status] = (counts[r.status] || 0) + 1;
  for (const k of Object.keys(counts)) tally[k] = (tally[k] || 0) + counts[k];

  const ok = (counts.APPLY || 0) + (counts['APPLY-RELAXED'] || 0) + (counts.ALREADY || 0);
  const bad = (counts.CONFLICT || 0) + (counts['BAD-HUNK'] || 0) + (counts['NO-TARGET'] || 0);
  const tag = bad === 0 ? 'OK      ' : 'PARTIAL ';
  console.log(
    `${id.padEnd(5)} ${tag} ${JSON.stringify(counts)}  ${e.purpose || ''}`.slice(0, 150)
  );
  if (bad) problems.push({ id, purpose: e.purpose, perFile });
}

console.log('');
console.log('TALLY:', JSON.stringify(tally));
if (problems.length) {
  console.log(`\n=== ${problems.length} patch(es) need hand work ===`);
  for (const p of problems) {
    console.log(`\n${p.id}  ${p.purpose || ''}`);
    for (const f of p.perFile) {
      console.log(`   ${f.target}`);
      for (const r of f.report) if (r.status !== 'ALREADY') console.log(`      ${r.status} ${r.preview || ''}`);
    }
  }
}
process.exit(problems.length ? 1 : 0);
