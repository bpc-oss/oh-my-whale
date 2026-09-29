#!/usr/bin/env node
/**
 * port-full-remote-020.mjs — port dsh-full-remote to the 0.2.0 package set.
 *
 * 0.2.0 removed @deepseek-ai/dsh-client-runtime (dsh-client-runtime was split
 * into per-controller client modules; the remaining half, dsh-client-connection,
 * is what provides the `connection` service now).
 *
 * dsh-full-remote 0.3.7:
 *   - dsh.client.inject: [ "@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-slots" ]
 *   - peerDependencies:   { "@deepseek-ai/dsh-client-runtime": ">=0.1.0-rc.5 <0.2", … }
 *
 * Its client half requires only `react` and uses `ctx.get("locale")` plus the
 * `connection` service, so swapping the inject target is sufficient; nothing in
 * lib/ imports the removed package.
 *
 * Peer ranges are widened to the 0.2.0 line so the kernel's compatibility
 * preflight stops denying the row.
 *
 * Usage: node port-full-remote-020.mjs <dsh-full-remote package root>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) { console.error('usage: node port-full-remote-020.mjs <dsh-full-remote root>'); process.exit(2); }
const PKG = join(ROOT, 'package.json');
if (!existsSync(PKG)) { console.error('not found:', PKG); process.exit(1); }

const raw = readFileSync(PKG, 'utf8');
const j = JSON.parse(raw.replace(/^\uFEFF/, ''));
const changes = [];

// 1. client inject: the connection service now comes from dsh-client-connection
const inject = j.dsh?.client?.inject;
if (Array.isArray(inject)) {
  if (inject.includes('@deepseek-ai/dsh-client-runtime')) {
    j.dsh.client.inject = inject.map((x) =>
      x === '@deepseek-ai/dsh-client-runtime' ? '@deepseek-ai/dsh-client-connection' : x
    );
    changes.push('client.inject: dsh-client-runtime -> dsh-client-connection');
  } else {
    console.log('  already: client.inject');
  }
}

// 2. peerDependencies: drop the removed package, widen the rest onto 0.2.0
const peers = j.peerDependencies;
if (peers && typeof peers === 'object') {
  if (peers['@deepseek-ai/dsh-client-runtime']) {
    delete peers['@deepseek-ai/dsh-client-runtime'];
    changes.push('peerDependencies: dropped dsh-client-runtime');
  }
  for (const [k, v] of Object.entries(peers)) {
    if (!k.startsWith('@deepseek-ai/')) continue;
    // ">=0.1.0-rc.5 <0.2" / "^0.1.0-rc.6" -> accept the 0.2.0 line too
    if (v.includes('<0.2')) {
      peers[k] = v.replace('<0.2', '<0.3');
      changes.push(`peerDependencies["${k}"]: ${v} -> ${peers[k]}`);
    }
  }
}

if (!changes.length) {
  console.log('nothing to do (already ported)');
  process.exit(0);
}
writeFileSync(PKG, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('applied:');
for (const c of changes) console.log('  -', c);
console.log('  ->', PKG);
