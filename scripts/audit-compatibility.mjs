#!/usr/bin/env node
/**
 * audit-compatibility.mjs — is every entry in the profile's compatibility.json still
 * doing a job?
 *
 * The file grants EXACT-version exemptions: `"<pkg>@<version>": ["<dsh version>", ...]`
 * (dsh-app-boot's profile-compatibility.js — isVersionList / isExactPluginVersion).
 * An entry naming a version that is no longer installed is dead weight; an entry for a
 * plugin whose peers the kernel already satisfies is an unnecessary permission. Both are
 * reported, because a stale permission list is exactly the sort of thing that quietly
 * stops mattering after an upgrade and then quietly starts blocking.
 *
 * Found on 2026-09-30: `@agent-os/dsh-governance@0.1.0` was granting an exemption to a
 * version the profile no longer installs (it is on 0.2.0 now), and 0.2.0 needs no
 * exemption at all — its peers are ^0.2.0-rc.1, which kernel 0.2.0-rc.1 satisfies.
 * So the entry was deleted rather than re-keyed.
 *
 * Usage: node audit-compatibility.mjs [--json]
 */
import { readFileSync } from 'node:fs';

const HOME = (process.env.USERPROFILE || process.env.HOME || '').replace(/\\/g, '/');
const LOCALAPPDATA = (process.env.LOCALAPPDATA || '').replace(/\\/g, '/');
const PROFILE = `${HOME}/.dsh/profiles/web`;

const asJson = process.argv.includes('--json');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

const compat = readJson(`${PROFILE}/compatibility.json`);
const profilePkg = readJson(`${PROFILE}/package.json`);
const kernelPkg = readJson(`${LOCALAPPDATA}/Programs/DSH Desktop/resources/app/node_modules/@deepseek-ai/dsh/package.json`);

if (!compat || !profilePkg || !kernelPkg) {
  console.error('could not read compatibility.json / package.json / kernel package.json');
  process.exit(2);
}
const kernelVer = kernelPkg.version;
const deps = profilePkg.dependencies || {};

/** Enough of semver for the peer ranges that actually appear here. */
function satisfies(range, v) {
  if (!range || range === '*' || range === 'latest') return true;
  const r = String(range);
  const clean = r.replace(/^[\^~>=<\s]*/, '');
  const [vCore] = v.split('-');
  const [cCore] = clean.split('-');
  const rv = vCore.split('.').map(Number);
  const cv = cCore.split('.').map(Number);
  if (r.startsWith('^')) {
    if (rv[0] !== cv[0]) return false;
    if (cv[0] > 0) return rv[1] === cv[1];
    if (cv[1] > 0) return rv[1] === cv[1] && rv[2] === cv[2];
    return rv[2] === cv[2];
  }
  if (r.startsWith('~')) return rv[0] === cv[0] && rv[1] === cv[1];
  return v === clean;
}

const installedVersion = (name) => readJson(`${PROFILE}/node_modules/${name}/package.json`)?.version ?? null;
const kernelSatisfiesPeers = (name) => {
  const peers = readJson(`${PROFILE}/node_modules/${name}/package.json`)?.peerDependencies;
  if (!peers) return null;
  return Object.entries(peers)
    .filter(([dep]) => dep.startsWith('@deepseek-ai/'))
    .every(([, range]) => satisfies(range, kernelVer));
};

const stale = [], unnecessary = [], live = [];
for (const [key, versions] of Object.entries(compat)) {
  const at = key.lastIndexOf('@');
  const name = key.slice(0, at);
  const granted = key.slice(at + 1);
  const installed = installedVersion(name);
  if (installed && installed !== granted) { stale.push({ key, granted, installed }); continue; }
  if (kernelSatisfiesPeers(name) === true) { unnecessary.push({ key }); continue; }
  live.push({ key, versions });
}

if (asJson) {
  console.log(JSON.stringify({ kernel: kernelVer, stale, unnecessary, live: live.map((l) => l.key) }, null, 2));
} else {
  console.log(`kernel: ${kernelVer}\n`);
  console.log(`DEAD — grant names a version no longer installed (${stale.length}):`);
  for (const s of stale) console.log(`  ${s.key}\n      grants ${s.granted}, installed ${s.installed}`);
  console.log(`\nUNNECESSARY — kernel already satisfies the plugin's peers (${unnecessary.length}):`);
  for (const s of unnecessary) console.log(`  ${s.key}`);
  console.log(`\nLOAD-BEARING (${live.length}):`);
  for (const l of live) console.log('  ' + l.key);
}
process.exit(stale.length ? 1 : 0);
