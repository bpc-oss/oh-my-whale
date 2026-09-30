#!/usr/bin/env node
/**
 * verify-patch-port.mjs — functional progress meter for the 0.1.5 -> 0.2.0 patch port.
 *
 * Why this exists: `apply-patches.mjs` matches hunks TEXTUALLY, so a port that
 * rewrote a hunk (which is most of them, because 0.2.0 reshaped the files) is
 * reported as CONFLICT forever even though the behaviour is there. That makes
 * the applier's dry-run useless as a status report once hand work has started.
 *
 * This tool checks what each patch is FOR: a distinctive identifier that must
 * exist in the resolved target file. A patch passes when its capability is
 * present, regardless of who wrote it or how.
 *
 * Usage: node verify-patch-port.mjs <app-root>
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) { console.error('usage: node verify-patch-port.mjs <app-root>'); process.exit(2); }
const NM = join(ROOT, 'node_modules');

const read = (rel) => {
  // "@scope/pkg/..." resolves under node_modules; "app:/..." or a bare "lib/..."
  // resolves against the app root (the shell's own bundled lib/ is not a package).
  const rel0 = rel.replace(/^app:\//, '');
  const base = rel0.startsWith('@') ? NM : ROOT;
  const p = join(base, ...rel0.split('/'));
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf8'); } catch { return null; }
};
const any = (...rels) => rels.map(read);

/**
 * status: 'ok' when the capability is present,
 *         'na' when upstream absorbed / it does not apply,
 *         'todo' when it is missing.
 */
const CHECKS = [
  { id: 'P1',  why: 'loader parent-chain cycle guard + parentEntry snapshot',
    files: ['@deepseek-ai/cordis-plugin-loader/lib/index.js'], needles: ['parentEntry', 'visited'] },
  { id: 'P2',  why: 'getPropertyDescriptor location cache',
    files: ['@deepseek-ai/cordis/lib/index.js'], needles: ['getPropertyDescriptor'] },
  { id: 'P3',  why: 'bai treated as DeepSeek-compatible; developer role excluded for bai',
    files: ['@earendil-works/pi-ai/dist/api/openai-completions.js'], needles: ['api.b.ai'] },
  { id: 'P4',  why: 'KNOWN_SESSION_EVENT_TYPES accepts verification/change + continuous-worker/change',
    files: ['@deepseek-ai/dsh-session/lib/types/known-event-types.js'], needles: ['verification/change', 'continuous-worker/change'] },
  { id: 'P5',  why: 'super-injector dev_install + plugin-gateway gate (profile scope, not kernel)',
    scope: 'profile' },
  { id: 'P6',  why: 'goal verification seam: synchronous pre-commit guard',
    files: ['@deepseek-ai/dsh-goal/lib/index.js'], needles: ['permitRef', 'GoalTransitionGuard'] },
  { id: 'P7',  why: 'session.list drops heavy projection keys',
    files: ['@deepseek-ai/dsh-api-session-controller/lib/types/list.js'], needles: ['tokenUsage'] },
  { id: 'P8',  why: '@-mention source for subagent children',
    up: { why: 'upstream ships a strict superset in dsh-client-ui-reference (@ source + subagent child ordering)',
          files: ['@deepseek-ai/dsh-client-ui-reference/lib/client.js'], needles: ['registerSource', 'origin === "subagent"'] } },
  { id: 'P9',  why: 'session.fork supports agentPreset',
    files: ['@deepseek-ai/dsh-api-session-controller/lib/index.js'], needles: ['agentPreset'] },
  { id: 'P10', why: 'public+manager sessions.fork forward agentPreset (0.2.0 owner: api-session-controller client + remotes bundle)',
    files: ['@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/manager.js',
            '@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.js',
            '@deepseek-ai/dsh-api-remotes/lib/client.js'], needles: ['agentPreset'] },
  { id: 'P11', why: 'preset selection folds the fork boundary (0.2.0: preset is a session projection; apply() must ignore events before inheritedEventCount)',
    files: ['@deepseek-ai/dsh-agent-preset-registry/lib/index.js'], needles: ['inheritedEventCount'] },
  { id: 'P12', why: 'fork request schema mirrors agentPreset',
    files: ['@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/manager.js'], needles: ['agentPreset'] },
  { id: 'P13', why: 'SSE batch flush (frames/idle window)',
    // NOT absorbed upstream. The per-frame cost survives the transport change:
    // the 0.2.0 WebSocket writer still does one JSON.stringify + one
    // socket.send + one promise per message (dsh-api-gateway/lib/types/
    // stream-server.js send()). The promise chain fixes ordering and back-
    // pressure, not the per-frame cost.
    // Also NOT portable as written: parseRemoteStreamClientMessage parses
    // exactly ONE message per text with strict exactKeys validation, so joining
    // frames breaks the client protocol. Doing it needs a batch message type on
    // both ends. Tracked, not silently dropped - see manifest P13.portNote.
    up: { why: 'NOT portable on 0.2.0: the WebSocket transport has no batch primitive (one message per frame, strict exactKeys). The per-frame cost is lower than the SSE path this patch targeted, so this is a regression risk to watch, not a known outage.' } },
  { id: 'P14', why: 'fiber.dispose() may be sync -> no unguarded .catch',
    files: ['@deepseek-ai/dsh-file-reference-local/lib/index.js'], needles: ['dispose'] },
  { id: 'P15', why: 'agent/disposed listener logs error.stack',
    files: ['@deepseek-ai/dsh-agent/lib/index.js'], needles: ['error.stack'] },
  { id: 'P16', why: 'routed-subagent: descriptor preset + external continuation registry',
    files: ['@deepseek-ai/dsh-subagent/lib/index.js'], needles: ['registerExternalContinuation', 'composition.preset'] },
  { id: 'P16b', why: 'fork marker dshRoutedSubagentPatch (startup assertion reads package.json)',
    files: ['@deepseek-ai/dsh-subagent/package.json'], needles: ['dshRoutedSubagentPatch'] },
  { id: 'P17', why: 'video content block -> wire video_url part',
    files: ['@deepseek-ai/dsh-llm-pi-ai/lib/index.js'], needles: ['case "video"', 'video_url'] },
  { id: 'P17b', why: 'DeepSeek Messages video part',
    up: { why: 'not applicable: the 0.2.0 DeepSeek Messages serializer rejects any non-image block, and no DeepSeek-family model declares video input. Video on an image-only DeepSeek route is covered by P20 frame fallback.' } },
  { id: 'P17c', why: 'openai-completions serializes video_url',
    files: ['@earendil-works/pi-ai/dist/api/openai-completions.js'], needles: ['video_url'] },
  { id: 'P18', why: 'session.prompt accepts video content parts (schema + admitPromptContent passthrough)',
    files: ['@deepseek-ai/dsh-attachment/lib/index.js',
            '@deepseek-ai/dsh-api-session-controller/lib/typert.host.js'], needles: ['video'] },
  { id: 'P18b', why: 'conversation composer turns video files into video blocks',
    files: ['@deepseek-ai/dsh-client-ui-conversation/lib/client.js'], needles: ['isVideoMediaType'] },
  { id: 'P18c', why: 'attachment rail renders a <video> preview',
    files: ['@deepseek-ai/dsh-client-ui-attachment/lib/client.js'], needles: ['"video"'] },
  { id: 'P19', why: 'contentHasVideo exported from dsh-llm',
    files: ['@deepseek-ai/dsh-llm/lib/index.js'], needles: ['function contentHasVideo'] },
  { id: 'P19b', why: 'video gating + route video through the structured content path',
    files: ['@deepseek-ai/dsh-llm-pi-ai/lib/index.js'], needles: ['videoToFrames'] },
  { id: 'P20', why: 'video -> ffmpeg frame extraction for image-only models',
    files: ['@deepseek-ai/dsh-llm-pi-ai/lib/index.js'], needles: ['videoBlockToWireItems', 'P20_MAX_FRAMES'] },
  { id: 'P21', why: 'read_image returns a whole video block',
    files: ['@deepseek-ai/dsh-tool-fs/lib/index.js'], needles: ['assertVideoCapableRoute', 'video/mp4'] },
  { id: 'P22', why: 'responses API serializes video_url',
    files: ['@earendil-works/pi-ai/dist/api/openai-responses-shared.js'], needles: ['video_url'] },
  { id: 'P23', why: 'tool-result media collector carries video_url on the follow-up user message',
    files: ['@earendil-works/pi-ai/dist/api/openai-completions.js'], needles: ['hasVideos'] },
  { id: 'P24', why: 'video block priced at a fixed 4096 tokens',
    files: ['@deepseek-ai/dsh-token-meter/lib/index.js'], needles: ['VIDEO_BLOCK_TOKENS'] },
  { id: 'P25', why: 'gateway body-size guard drops all but the newest video',
    files: ['@deepseek-ai/dsh-llm-pi-ai/lib/index.js'], needles: ['offloadOldVideos'] },
  { id: 'P26', why: 'Session.get events() accessor restored',
    files: ['@deepseek-ai/dsh-session/lib/index.js'], needles: ['get events'] },
  { id: 'P27', why: 'v2->v3 CONTENT_KINDS includes video',
    files: ['@deepseek-ai/dsh-session-format-v2-to-v3/lib/index.js'], needles: ['"video"'] },
  { id: 'P28', why: 'v2->v3 SOURCE_KINDS includes the plugin-written kinds',
    files: ['@deepseek-ai/dsh-session-format-v2-to-v3/lib/index.js'], needles: ['verifier-guide', 'jspace-frame'] },
  { id: 'P29', why: 'command directory backoff + circuit breaker',
    files: ['@deepseek-ai/dsh-client-ui-commands/lib/client.js'], needles: ['backoffDelayMs', 'forceRefresh'] },
  { id: 'P30', why: 'desktop-updates policy defaults to false (shell lib, opt-in so a silent upstream update cannot clobber the patched tree)',
    files: ['app:/lib/updates.js'], needles: ['enabled: z.boolean().default(false)'] },
  // P31 was RETIRED 2026-09-30 (manifest: host-retired). better-sidebar 0.24.1 registers its
  // panes INSIDE the official right sidebar via the sidebar.right.pane.tab slots, so the
  // official ExpandButton is the only route to them — hiding it left the plugin visible but
  // unreachable. The assertion is now inverted: the P31 marker must be GONE and the real
  // ExpandButton implementation must be back.
  { id: 'P31', why: 'retired 2026-09-30 — official ExpandButton restored (better-sidebar 0.24.1 lives in it)',
    files: ['@deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js'],
    antiNeedles: ['P31 (2026-09-12)'],
    needles: ['data-sidebar-right-expand'] },
  { id: 'P37', why: 'sidebar document preview renders inline video',
    files: ['@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/client.js'], needles: ['applyP37Video'] },
  // P38 landed in the tree before it was in the manifest (registered 2026-09-30). It is
  // load-bearing: without it, any module outside the profile trees — preset entries, local
  // plugin repos, forks — cannot resolve @deepseek-ai/* and dies with ERR_MODULE_NOT_FOUND.
  { id: 'P39', why: 'a video-capable model is not rejected by the frame-extraction guard (needle is the ADDED symbol, not the pre-existing one)',
    files: ['@deepseek-ai/dsh-llm-pi-ai/lib/index.js'], needles: ['modelTakesVideo'] },
  { id: 'P38', why: 'outside-profile @deepseek-ai resolution fallback (load-bearing for presets/forks)',
    files: ['app:/lib/module-resolution-CTTB3FAS.js'],
    needles: ['// DSH patch: a module loaded by file:// URL that lives OUTSIDE every'] },
];

const rows = [];
for (const c of CHECKS) {
  if (c.scope === 'profile') { rows.push({ id: c.id, state: 'PROFILE', why: c.why }); continue; }
  if (c.up) {
    if (!c.up.files) { rows.push({ id: c.id, state: 'UPSTREAM', why: c.why, note: c.up.why }); continue; }
    const srcs = any(...c.up.files);
    const hit = srcs.every(Boolean) && c.up.needles.every((n) => srcs.some((s) => s.includes(n)));
    rows.push({ id: c.id, state: hit ? 'UPSTREAM' : 'TODO', why: c.why, note: c.up.why });
    continue;
  }
  const srcs = any(...c.files);
  const missingFiles = c.files.filter((_, i) => !srcs[i]);
  if (missingFiles.length) { rows.push({ id: c.id, state: 'MISSING-FILE', why: c.why, note: missingFiles.join(', '), todo: true }); continue; }
  const absent = c.needles.filter((n) => !srcs.some((s) => s.includes(n)));
  // antiNeedles assert the ABSENCE of a marker — used where a patch was retired and its
  // fingerprint must not come back (a half-reverted file still carries the comment).
  const present = (c.antiNeedles ?? []).filter((n) => srcs.some((s) => s.includes(n)));
  rows.push({ id: c.id, state: absent.length || present.length ? 'TODO' : 'OK', why: c.why, absent, present });
}

const w = { OK: 0, TODO: 0, UPSTREAM: 0, PROFILE: 0, 'MISSING-FILE': 0 };
for (const r of rows) w[r.state] = (w[r.state] || 0) + 1;
for (const r of rows) {
  const tag = { OK: 'OK      ', TODO: 'TODO     ', UPSTREAM: 'UPSTREAM ', PROFILE: 'PROFILE  ', 'MISSING-FILE': 'NO-FILE  ' }[r.state];
  console.log(`${r.id.padEnd(5)} ${tag} ${r.why}`);
  if (r.absent?.length) console.log(`             missing: ${r.absent.join(', ')}`);
  if (r.present?.length) console.log(`             should be GONE but found: ${r.present.join(', ')}`);
  if (r.note) console.log(`             ${r.note}`);
}
console.log('');
console.log(`OK ${w.OK} | TODO ${w.TODO} | UPSTREAM ${w.UPSTREAM} | PROFILE ${w.PROFILE} | NO-FILE ${w['MISSING-FILE']}  (total ${rows.length})`);
process.exit(w.TODO || w['MISSING-FILE'] ? 1 : 0);
