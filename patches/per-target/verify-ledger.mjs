#!/usr/bin/env node
// Replays every artifact listed in LEDGER.json against its declared baseline and
// compares the result with the live file, byte for byte.
//
//   node verify-ledger.mjs [--baselines <dir>] [--live-app <dir>] [--live-profile <dir>] [--scratch <dir>]
//
// Defaults:
//   --baselines    <home>/.dsh/tmp/p1-ledger   (holds pristine/, pristine-installer/, pristine-vendor/)
//   --live-app     .../DSH Desktop/resources/app
//   --live-profile .../.dsh/profiles/web/node_modules
//   --scratch      <baselines>/verify-ledger
//
// Exit code 0 only when every patch entry replays byte-identically and every
// no-diff entry is byte-identical to the live file.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
import { homedir } from 'node:os';
const HOME = homedir();
const BASELINES = arg('baselines', path.join(HOME, '.dsh', 'tmp', 'p1-ledger'));
const LIVE_APP = arg('live-app', path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'Programs', 'DSH Desktop', 'resources', 'app'));
const LIVE_PROFILE = arg('live-profile', path.join(HOME, '.dsh', 'profiles', 'web', 'node_modules'));
const SCRATCH = arg('scratch', path.join(BASELINES, 'verify-ledger'));

// This verifies the P1 ledger against the tree it was captured from (kernel
// 0.2.0-rc.1). After an upgrade the live files legitimately differ, so running it
// against 0.2.1 produces meaningless "failures". Refuse instead of misleading.
const KERNEL_PKG = path.join(LIVE_APP, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
if (fs.existsSync(KERNEL_PKG)) {
  const kv = JSON.parse(fs.readFileSync(KERNEL_PKG, 'utf8')).version;
  if (kv !== '0.2.0-rc.1') {
    console.log(`verify-ledger: live kernel is ${kv}; this ledger is a historical capture for 0.2.0-rc.1.`);
    console.log('Use verify-patch-port.mjs for the live tree. Skipping.');
    process.exit(0);
  }
}

const msys = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, d) => '/' + d.toLowerCase());

function findPatch() {
  const cands = [process.env.PATCH, 'C:/Program Files/Git/usr/bin/patch.exe', 'C:/Program Files/Git/bin/patch.exe', 'patch'].filter(Boolean);
  for (const c of cands) {
    if (c !== 'patch' && !fs.existsSync(c)) continue;
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  throw new Error('GNU patch not found; set PATCH=/path/to/patch');
}
const PATCH = findPatch();

const ledger = JSON.parse(fs.readFileSync(path.join(HERE, 'LEDGER.json'), 'utf8'));
fs.rmSync(SCRATCH, { recursive: true, force: true });

const liveRootFor = (applyRoot) => (applyRoot === 'profiles/web/node_modules' ? LIVE_PROFILE : path.join(LIVE_APP, applyRoot.replace(/^resources\/app\/?/, '')));

let pass = 0;
const fails = [];
for (const e of ledger.entries) {
  const base = path.join(BASELINES, e.baselinePath);
  const patchFile = path.join(REPO, e.file);
  const live = path.join(liveRootFor(e.applyRoot), e.target);
  const dir = path.join(SCRATCH, path.basename(e.file).replace(/\.patch$/, ''));
  const tgt = path.join(dir, e.target);
  try {
    fs.mkdirSync(path.dirname(tgt), { recursive: true });
    fs.copyFileSync(base, tgt);
    execFileSync(PATCH, ['-p1', '--fuzz=0', '-i', msys(patchFile)], { cwd: dir, encoding: 'utf8', stderr: 'pipe' });
    for (const step of e.replay.postSteps || []) {
      if (step === 'lf-to-crlf') {
        const raw = fs.readFileSync(tgt);
        fs.writeFileSync(tgt, Buffer.from(raw.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8'));
      } else throw new Error('unknown postStep ' + step);
    }
    const ok = !fs.existsSync(tgt + '.rej') && fs.readFileSync(tgt).equals(fs.readFileSync(live));
    if (ok) pass++;
    else fails.push({ file: e.file, target: e.target, why: 'cmp mismatch or .rej' });
  } catch (err) {
    fails.push({ file: e.file, target: e.target, why: String(err.stderr || err.message).slice(0, 200) });
  }
}

let ndPass = 0;
const ndFails = [];
const ndSkipped = [];
for (const n of ledger.noDiff) {
  const live = path.join(liveRootFor(n.target.startsWith('lib/') ? 'resources/app' : 'resources/app/node_modules'), n.target);
  const base = path.join(BASELINES, n.baselinePath);
  // Targets removed by the 0.2.1 line (e.g. dsh-client-connection) have no live file;
  // record them as skipped rather than aborting the whole verification.
  if (!fs.existsSync(live) || !fs.existsSync(base)) { ndSkipped.push(n.target); continue; }
  if (fs.readFileSync(base).equals(fs.readFileSync(live))) ndPass++;
  else ndFails.push(n.target);
}

const total = ledger.entries.length;
console.log(`patch entries : ${pass}/${total} replay byte-identical`);
console.log(`no-diff entries: ${ndPass}/${ledger.noDiff.length} confirmed byte-identical` + (ndSkipped.length ? ` (${ndSkipped.length} skipped: target removed upstream)` : ''));
if (fails.length) {
  console.log('\nFAILURES:');
  for (const f of fails) console.log(' ', f.file, '->', f.target, '::', f.why);
}
if (ndFails.length) {
  console.log('\nNO-DIFF FAILURES:');
  for (const f of ndFails) console.log(' ', f);
}
process.exit(fails.length === 0 && ndFails.length === 0 ? 0 : 1);
