#!/usr/bin/env node
/**
 * zcode-facts.mjs — report the registered zcode override's facts as flat text.
 *
 * verify.ps1 used to read ~/.zcode/v2/provider_config.json with PowerShell 5.1's
 * ConvertFrom-Json, which throws on shapes node handles fine (deep nesting, some
 * escapes). The gate then reported a DRIFT on a perfectly good config — the same
 * class of false negative as the earlier 700-character window bug.
 *
 * Emits KEY=VALUE lines so no JSON parser is involved downstream.
 *
 * Usage: node zcode-facts.mjs <provider_config.json>
 */
import { readFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2];
if (!FILE || !existsSync(FILE)) { console.log('PARSE=missing'); process.exit(0); }

let doc;
try {
  doc = JSON.parse(readFileSync(FILE, 'utf8').replace(/^\uFEFF/, ''));
} catch (e) {
  console.log('PARSE=error');
  console.log('PARSE_ERROR=' + String(e.message).slice(0, 160));
  process.exit(1);
}

const rules = doc?.config?.modelConfigRules?.providerModelRules ?? [];
const rule = rules.find((r) => r?.modelId === 'stealth/space-bunny-alpha');
console.log('PARSE=ok');
console.log('RULE_FOUND=' + String(Boolean(rule)));
if (!rule) process.exit(0);

const cfg = rule.config ?? {};
const levels = cfg?.optionSpecs?.reasoningLevel?.values ?? [];
console.log('LEVELS=' + levels.join(','));
// "enabled" means: key absent, or explicitly true. A `disabled` key at all is a
// failure - the provider rejects that level.
console.log('ENABLED_OK=' + String(!Object.hasOwn(cfg, 'enabled') || cfg.enabled === true));
console.log('HAS_DISABLED=' + String(Object.hasOwn(cfg, 'disabled')));
console.log('CONTEXT_WINDOW=' + String(cfg?.properties?.contextWindow ?? ''));
console.log('SUPPORTS_IMAGE=' + String(cfg?.properties?.inputFormat?.supportsImage === true));
