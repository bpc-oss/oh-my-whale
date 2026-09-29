#!/usr/bin/env node
/**
 * port-full-remote-picker-020.mjs — stop dsh-full-remote from pinning a second
 * directory picker on 0.2.0.
 *
 * The plugin's own comment states the contract: "directory-picker-auto chooses
 * the native picker for an attended loopback host... the host plugin creates the
 * browse pair at runtime when the official ids are not already in the tree."
 *
 * Its guard only asks whether the CANONICAL BROWSE ids are present:
 *
 *     shouldPinBrowseDirectoryPicker = !["directory-picker-browse",
 *                                        "ui-directory-picker-browse"].some(inTree)
 *
 * That was right on 0.1.5, where the tree had no adaptive picker at all. 0.2.0
 * ships one, and the plugin therefore pins the browse pair on top of it — and
 * @deepseek-ai/dsh-host-directory-picker-browse throws
 * `service "directoryPicker" has been registered` on every boot.
 *
 * Fix: treat the 0.2.0 official pickers as "already in the tree" too, which is
 * what the plugin always meant. Idempotent.
 *
 * Usage: node port-full-remote-picker-020.mjs <dsh-full-remote lib/index.js>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = process.argv[2];
if (!FILE) { console.error('usage: node port-full-remote-picker-020.mjs <lib/index.js>'); process.exit(2); }

let src = readFileSync(FILE, 'utf8');

const FIND = 'function shouldPinBrowseDirectoryPicker(input) {';
const REPLACE = [
  '// 0.2.0: the official adaptive/native pickers ship in the tree, and',
  '// dsh-api-workspace-controller provides the same `directoryPicker` service.',
  '// Pinning the browse pair on top of either makes the second registrant throw',
  '// "service \\"directoryPicker\\" has been registered" on every boot.',
  'const OFFICIAL_DIRECTORY_PICKER_ENTRY_IDS = ["directory-picker", "directory-picker-auto", "directory-picker-native", "api-workspace-controller"];',
  'function shouldPinBrowseDirectoryPicker(input) {',
].join('\n');

if (src.includes('OFFICIAL_DIRECTORY_PICKER_ENTRY_IDS')) {
  console.log('nothing to do (already ported)');
  process.exit(0);
}
if (!src.includes(FIND)) { console.error('ANCHOR MISS: shouldPinBrowseDirectoryPicker'); process.exit(1); }
src = src.replace(FIND, REPLACE);

const BODY_FIND = '\treturn !CANONICAL_BROWSE_ENTRY_IDS.some((id) => ids.has(id));';
const BODY_REPLACE = [
  '\tconst hasCanonical = CANONICAL_BROWSE_ENTRY_IDS.some((id) => ids.has(id));',
  '\tconst hasOfficial = OFFICIAL_DIRECTORY_PICKER_ENTRY_IDS.some((id) => ids.has(id));',
  '\treturn !hasCanonical && !hasOfficial;',
].join('\n');
if (!src.includes(BODY_FIND)) { console.error('ANCHOR MISS: pin guard body'); process.exit(1); }
src = src.replace(BODY_FIND, BODY_REPLACE);

writeFileSync(FILE, src, 'utf8');
console.log('applied: browse picker is no longer pinned when an official picker is in the tree');
console.log('  ->', FILE);
