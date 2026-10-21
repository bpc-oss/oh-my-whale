#!/usr/bin/env node
/**
 * audit-plugin-sources.mjs — prove that a fresh machine can resolve every
 * non-registry dependency from a source committed to THIS repository.
 *
 * It checks three classes of omissions that drift-scan cannot see:
 *   1. a package.json dependency whose SOURCES.json registry entry is missing;
 *   2. a local/link dependency whose standalone source snapshot is absent or
 *      whose package.json name does not match the dependency id;
 *   3. a preset's `name: ./x.mjs` row or a relative import that points at a
 *      file not captured in config/.agent-presets.
 *
 * Usage: node scripts/audit-plugin-sources.mjs [repo]
 * Exit 0 only when every check passes.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const SELF = fileURLToPath(import.meta.url);
const REPO = process.argv[2] || join(dirname(SELF), '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const errors = [];
const checks = [];
const fail = (area, detail) => errors.push(`FAIL [${area}] ${detail}`);
const ok = (area, detail) => checks.push(`OK   [${area}] ${detail}`);

const sourcesPath = join(REPO, 'plugins', 'SOURCES.json');
const pkgPath = join(REPO, 'profile', 'package.json.template');
const sources = readJson(sourcesPath);
const pkg = readJson(pkgPath);
const plugins = Array.isArray(sources) ? sources : sources.plugins || [];
const byId = new Map(plugins.map((p) => [p.id, p]));

function standaloneDir(entry) {
  if (entry.path) return join(REPO, entry.path.replace(/\//g, '\\'));
  const idDir = String(entry.id || '').replace(/^[^/]+\//, '');
  return join(REPO, 'plugins', 'standalone', idDir);
}

function checkStandalone(entry, where) {
  const dir = standaloneDir(entry);
  const manifestPath = join(dir, 'package.json');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail(where, `standalone source absent: ${relative(REPO, dir)}`);
    return;
  }
  if (!existsSync(manifestPath)) {
    fail(where, `standalone source has no package.json: ${relative(REPO, dir)}`);
    return;
  }
  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (e) {
    fail(where, `invalid package.json in ${relative(REPO, dir)}: ${e.message}`);
    return;
  }
  if (entry.id && manifest.name !== entry.id) {
    fail(where, `package name mismatch: registry id=${entry.id}, snapshot=${manifest.name}`);
  }
  if (!entry.package_spec || !entry.package_spec.includes('{{PLUGIN_SOURCES_DIR}}')) {
    fail(where, `standalone package_spec must target {{PLUGIN_SOURCES_DIR}}/: ${entry.package_spec || '(missing)'}`);
  }
  ok(where, `standalone snapshot ${relative(REPO, dir)} (${manifest.name}@${manifest.version || '?'})`);
}

// 1. Every dependency declared by the rendered profile must have a registry entry.
for (const [id, spec] of Object.entries(pkg.dependencies || {})) {
  const entry = byId.get(id);
  if (!entry) {
    fail('dependency', `${id} is in package.json.template but not SOURCES.json`);
    continue;
  }

  if (spec.startsWith('file:vendor-archives/')) {
    if (entry.install_type !== 'vendor-archive') {
      fail('vendor', `${id} spec is vendor-archives but registry install_type=${entry.install_type}`);
    }
    const src = entry.source ? join(REPO, String(entry.source).replace(/\//g, '\\')) : '';
    if (!src || !existsSync(src)) fail('vendor', `${id} source archive absent: ${entry.source || '(missing source)'}`);
    else ok('vendor', `${id} <- ${entry.source}`);
  } else if (spec.startsWith('link:') || spec.startsWith('file:{{PLUGIN_SOURCES_DIR}}/')) {
    if (entry.type !== 'standalone') {
      fail('standalone', `${id} is a plugin-sources path but registry type=${entry.type}`);
    } else {
      checkStandalone(entry, id);
    }
  } else if (spec.startsWith('github:')) {
    if (entry.type !== 'github' || !entry.repo) fail('github', `${id} has a github spec but no registry repo`);
    else ok('github', `${id} <- ${entry.repo}#${entry.ref || 'default'}`);
  } else if (spec.startsWith('file:./')) {
    const target = join(REPO, 'profile', spec.slice('file:./'.length).replace(/\//g, '\\'));
    if (!existsSync(target)) fail('local', `${id} relative source absent: ${relative(REPO, target)}`);
    else ok('local', `${id} <- ${relative(REPO, target)}`);
  } else {
    if (entry.type !== 'npm') fail('npm', `${id} uses a semver spec but registry type=${entry.type}`);
    else if (!entry.package_spec) fail('npm', `${id} has no package_spec`);
    else ok('npm', `${id} ${entry.package_spec}`);
  }
}

// 2. Every standalone registry entry must be complete on its own.
for (const entry of plugins) {
  if (entry.type === 'standalone') checkStandalone(entry, entry.id || '(no id)');
  if (entry.kind === 'local-preset-plugin') {
    if (!entry.source || !entry.payload) fail('preset-plugin', `${entry.id}: source/payload missing`);
    else {
      const payload = join(REPO, String(entry.source).replace(/\//g, '\\'), entry.payload);
      if (!existsSync(payload)) fail('preset-plugin', `${entry.id}: payload absent ${relative(REPO, payload)}`);
      else if (entry.sha256 && sha256(payload) !== entry.sha256) fail('preset-plugin', `${entry.id}: payload sha256 differs`);
      else ok('preset-plugin', `${entry.id} <- ${relative(REPO, payload)}`);
    }
  }
}

// 3. Preset local rows and relative imports must resolve inside the captured preset.
const presetRoot = join(REPO, 'config', '.agent-presets');
if (!existsSync(presetRoot)) {
  fail('presets', `missing directory: ${relative(REPO, presetRoot)}`);
} else {
  for (const preset of readdirSync(presetRoot)) {
    const dir = join(presetRoot, preset);
    if (!statSync(dir).isDirectory() || preset.startsWith('.')) continue;
    const yml = join(dir, 'agent.cordis.yml');
    if (existsSync(yml)) {
      const text = readFileSync(yml, 'utf8');
      for (const m of text.matchAll(/^\s*name:\s*\.\/([A-Za-z0-9_.\-/]+\.mjs)\s*$/gm)) {
        const ref = join(dir, m[1].replace(/\//g, '\\'));
        if (!existsSync(ref)) fail('preset-row', `${preset}: ./${m[1]} -> missing ${relative(REPO, ref)}`);
        else ok('preset-row', `${preset}: ./${m[1]}`);
      }
    }
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      for (const m of text.matchAll(/\bfrom\s+['"](\.\/[^'"]+)['"]/g)) {
        const ref = join(dir, m[1].replace(/\//g, '\\'));
        if (!existsSync(ref)) fail('preset-import', `${preset}/${file}: ${m[1]} missing`);
      }
    }
  }
  ok('presets', `scanned ${readdirSync(presetRoot).filter((p) => statSync(join(presetRoot, p)).isDirectory()).length} preset directories`);
}

// 4. Every directory committed under plugins/standalone must be registered, so a
// future source drop cannot silently become an untracked, unreproducible asset.
const standaloneRoot = join(REPO, 'plugins', 'standalone');
if (existsSync(standaloneRoot)) {
  const registeredDirs = new Set(
    plugins
      .filter((p) => (p.type === 'standalone' && p.path) || p.kind === 'local-preset-plugin')
      .map((p) => basename(String(p.path || p.source || '').replace(/\\/g, '/'))),
  );
  for (const dir of readdirSync(standaloneRoot)) {
    if (!statSync(join(standaloneRoot, dir)).isDirectory()) continue;
    if (registeredDirs.has(dir)) ok('registry', `standalone/${dir} is registered`);
    else fail('registry', `standalone/${dir} exists but has no SOURCES.json entry`);
  }
}

const summary = `checked ${Object.keys(pkg.dependencies || {}).length} dependencies, ${plugins.length} registry entries, ${checks.length} source/import assertions`;
if (errors.length) {
  for (const e of errors) console.error(e);
  console.error(`\n${summary}`);
  console.error(`${errors.length} problem(s)`);
  process.exit(1);
}
for (const c of checks) console.log(c);
console.log(`\n${summary}`);
console.log('RESULT: every dependency has a reproducible source snapshot');
