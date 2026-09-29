#!/usr/bin/env node
/**
 * post-install/p20-video-modality.mjs
 *
 * Port of the P20 "video modality" local patch onto the DSH 0.2.0 kernel that
 * ships inside desktop shell 2.0.16 (`resources/app/`, unpacked — 2.0.16
 * stopped packing app.asar).
 *
 * WHY THIS MUST BE RE-APPLIED AFTER EVERY SHELL UPGRADE
 * -----------------------------------------------------
 * `dsh-llm-pi-ai` declares a *closed* modality union used by the settings
 * schema:
 *
 *     const MODALITIES = Object.keys({ text: true, image: true });
 *
 * Any profile document that declares a video-capable model is rejected whole:
 *
 *     ValidationError: $.providers.<id>.models[0].input[2]
 *       expected "text" | "image" but got "video"
 *
 * That rejection silently drops the ENTIRE `llm-pi-ai` section, so every custom
 * provider/model disappears from the Settings UI with no error shown. Because
 * the shell ships unpacked, a Desktop auto-update / repair / reinstall
 * overwrites this file and reintroduces the loss silently. Run this after any
 * shell upgrade; verify with `scripts/verify-kernel-patches.ps1`.
 *
 * Idempotent. Fails loudly (exit 1) when the anchor is missing, so an upstream
 * layout change surfaces instead of silently no-op'ing.
 *
 * Usage: node p20-video-modality.mjs <app-root> [--check]
 *   <app-root> = %LOCALAPPDATA%\Programs\DSH Desktop\resources\app
 *   --check    = report only, never write (exit 1 if the patch is absent)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const ROOT = args.find((a) => !a.startsWith('--'));
if (!ROOT) {
  console.error('usage: node p20-video-modality.mjs <app-root> [--check]');
  process.exit(2);
}

const ALREADY = /const MODALITIES = Object\.keys\(\{\s*text: true,\s*image: true,\s*video: true\s*\}\);/;
const ANCHOR = /const MODALITIES = Object\.keys\(\{\s*text: true,\s*image: true\s*\}\);/;

const target = join(ROOT, 'node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js');

let src;
try {
  src = readFileSync(target, 'utf8');
} catch (e) {
  console.error(`MISSING  ${target}\n         ${e.message}`);
  console.error('         Is <app-root> the resources\\app directory? (2.0.16+ ships unpacked)');
  process.exit(1);
}

if (ALREADY.test(src)) {
  console.log(`NOOP     P20 video modality already present: ${target}`);
  process.exit(0);
}

if (!ANCHOR.test(src)) {
  console.error(`ANCHOR   P20 video modality: MODALITIES literal not found in\n         ${target}`);
  console.error('         Upstream layout changed — re-derive the patch before shipping it.');
  process.exit(1);
}

if (CHECK_ONLY) {
  console.error(`DRIFT    P20 video modality missing (check mode, nothing written)\n         ${target}`);
  process.exit(1);
}

const out = src.replace(
  ANCHOR,
  'const MODALITIES = Object.keys({\n\ttext: true,\n\timage: true,\n\tvideo: true\n});'
);
writeFileSync(target, out, 'utf8');

if (!ALREADY.test(readFileSync(target, 'utf8'))) {
  console.error('FAILED   post-write verification did not find the patched form; file left as written');
  process.exit(1);
}
console.log(`PATCHED  P20 video modality: added "video" to the closed modality union\n         ${target}`);
