# Preset cordis rows this machine needs (not carried by any template)

Two rows were added to the live presets on 2026-09-28/29. Neither exists in
`config/.agent-presets/` (those ymls are the older shipped versions), so both are
registered here as ready-to-apply snippets.

## Row 1 — `promise-guard` mount (7 presets)

```yaml
- id: promise-guard
  name: ./promise-guard.mjs
```

Currently mounted in: ai-tube-daily, anchored-standard, autoprompt, enforce-rsi-standard, enforce-standard, j-space-standard, verifier-standard.

Without this row the plugin file is inert. The plugin turns a step that promises an
action but makes no tool call into a logged error plus one corrective turn.

## Row 2 — compaction output cap (12 presets)

```yaml
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  config:
    maxTokens: 32768
    compactionRetries: 2
```

Currently set in: ai-tube-daily, anchored-standard, autoprompt, autoprompt-reviewer, bounty-pipeline, dev, dev-reviewer, enforce-rsi-standard, enforce-standard, j-space-standard, router-standard, verifier-standard.

The shipped cap is 8192. At 8192 a Max-effort thinking model cannot summarize a
233k-token session — the host log showed `summarization truncated at the token cap` and
`returned a completed response with no content`, so compaction never shrank the context
and every later turn carried the full history. `compactionRetries: 2` covers the transient
empty-response case.

## Apply

```powershell
# inspect first
Get-Content <USERPROFILE>/.dsh/.agent-presets/<preset>/agent.cordis.yml | Select-String 'promise-guard|maxTokens'
```

`verify.ps1` checks both rows on every preset, so a preset that lost them reports DRIFT.
