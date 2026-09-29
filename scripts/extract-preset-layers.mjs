#!/usr/bin/env node
/**
 * extract-preset-layers.mjs — move the generated preset declarations out of the
 * profile's own cordis.patch.yml and into a real bundle package whose
 * `dsh.bundle.patch` is an ARRAY of layer files.
 *
 * WHY: dsh-web-app declares its presets as
 *     "dsh": { "bundle": { "patch": [ "./cordis.patch.yml",
 *                                    "./presets/standard.patch.yml", … ] } }
 * i.e. one FILE per layer, composed in order. Rows injected into the PROFILE's
 * own patch are composed differently, and under 0.2.0 every preset child entry
 * except the first reports "never started" (no fiber) — the modules resolve fine
 * (they are file:// URLs and parse as ESM) but never get applied.
 *
 * Usage: node extract-preset-layers.mjs <profile-dir> [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const PROFILE = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!PROFILE) { console.error('usage: node extract-preset-layers.mjs <profile-dir> [--apply]'); process.exit(2); }

const PATCH = join(PROFILE, 'cordis.patch.yml');
const MARK = '# 2026-09-29 kernel 0.2.0 preset declarations';
const PKG_DIR = join(PROFILE, 'local-presets');
const MARKER = '# END oh-my-whale generated preset declarations';

const src = readFileSync(PATCH, 'utf8').replace(/^\uFEFF/, '');
const at = src.indexOf(MARK);
if (at < 0) { console.error('generated block not found in', PATCH); process.exit(1); }

const head = src.slice(0, at).replace(/\s*$/, '\n');
const block = src.slice(at);
// drop the header comment lines, keep the YAML
const yaml = block.slice(block.indexOf('- insert:'));
if (!yaml.includes(MARKER)) { console.error('missing end marker; regenerate with migrate-presets-to-020.mjs first'); process.exit(1); }

// Each `- insert:` item is one preset: "    - id: preset-<name>" … up to the next one.
const items = [];
const re = /^ {4}- id: (preset-[A-Za-z0-9_.-]+)\s*$/gm;
const marks = [...yaml.matchAll(re)];
for (let i = 0; i < marks.length; i++) {
  const name = marks[i][1].replace(/^preset-/, '');
  const start = marks[i].index;
  const end = i + 1 < marks.length ? marks[i + 1].index : yaml.indexOf(MARKER);
  const chunk = yaml.slice(start, end).replace(/\s+$/, '');
  if (!chunk) continue;
  const body = chunk.split('\n').map((l) => (l.startsWith('    ') ? l.slice(4) : l)).join('\n');
  // A layer FILE is a top-level patch array. dsh-web-app ships
  //   - insert:
  //       - id: preset-minimal
  // so each preset layer must re-wrap its single item; dropping the wrapper
  // makes the file a bare entry list the loader never composes.
  const reindented = chunk.split('\n').map((l) => (l.trim() === '' ? '' : '  ' + l)).join('\n');
  items.push({ name, file: `preset-${name}.patch.yml`, body: `- insert:\n${reindented}` });
}

console.log(`presets found in the block: ${items.length}`);

// files the migrated block referenced, so the layer package can note them
const refs = [...new Set([...block.matchAll(/file:\/\/\/([^'\"]+)/g)].map((m) => m[1].replace(/\//g, '\\')))];
const comment = [
  '# oh-my-whale generated preset layer.',
  '#',
  '# 0.1.5 dsh-agent-presets scanned ~/.dsh/.agent-presets; 0.2.0 splits it into',
  '# dsh-agent-preset (one preset = one Loader row) + dsh-agent-preset-registry (the',
  '# service). Nothing scans the directory, so presets must be DECLARED, and the',
  '# declaration must live in its own bundle patch LAYER - dsh-web-app declares its',
  '# presets the same way (dsh.bundle.patch is an array of files).',
  '#',
  '# Local entry names are file:// URLs: host-process-entry.js clears loader.internal,',
  '# so the loader does a BARE import(name) and a Windows path is not a module',
  '# specifier. ./x.mjs would resolve against the profile dir, not the preset dir.',
  '#',
  '# Regenerate: node scripts\\migrate-presets-to-020.mjs then scripts\\extract-preset-layers.mjs --apply',
  '',
].join('\n');

const pkg = {
  name: 'dsh-local-presets',
  version: '0.0.0',
  private: true,
  description: 'Local agent presets declared for DSH 0.2.0 (one patch layer per preset).',
  dsh: { bundle: { patch: items.map((i) => `./${i.file}`) } },
};

if (!APPLY) {
  console.log('--apply not given; would write', items.length, 'layer files + package.json to', PKG_DIR);
  console.log('and remove the generated block from', PATCH);
  process.exit(0);
}

rmSync(PKG_DIR, { recursive: true, force: true });
mkdirSync(PKG_DIR, { recursive: true });
for (const it of items) {
  writeFileSync(join(PKG_DIR, it.file), `${comment}${it.body}\n${MARKER}\n`, 'utf8');
}
writeFileSync(join(PKG_DIR, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
writeFileSync(PATCH, head, 'utf8');

// register in the profile manifest
const pf = join(PROFILE, 'package.json');
const manifest = JSON.parse(readFileSync(pf, 'utf8').replace(/^\uFEFF/, ''));
manifest.dependencies['dsh-local-presets'] = 'file:./local-presets';
const bundles = manifest.dsh.profile.bundles;
if (!bundles.includes('dsh-local-presets')) {
  const at2 = bundles.indexOf('@deepseek-ai/dsh-web-app');
  bundles.splice(at2 >= 0 ? at2 + 1 : 0, 0, 'dsh-local-presets');
}
writeFileSync(pf, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`wrote ${items.length} layer files + package.json into ${PKG_DIR}`);
console.log('registered dsh-local-presets in the profile dependencies and bundles');
console.log('removed the generated block from', PATCH);
