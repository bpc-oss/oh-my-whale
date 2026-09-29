# dsh-promise-guard (local preset plugin)

Turns a silent broken promise into a visible error plus one corrective turn.
Hooks `step/end`; when a step made **no tool call** and its final assistant text reads
as a promise (trailing `:`/`：`, or promise phrasing) it:

1. logs a `logger.warn` line (host-log evidence), and
2. prepends a `next-turn` instruction: do it now (`dev_tool_search` first when the tool
   is not in the catalog), or state the exact blocker.

Guards: skipped when the step called a tool; skipped when the text ends in `?` (asking
the user); rate limited 3 nudges / 15 min / session; subagents skipped; every internal
error is swallowed into a warn so a guard bug can never brick a session.

## Where it is installed (2026-09-29)

Mounted in 7 presets: ai-tube-daily, anchored-standard, autoprompt, enforce-rsi-standard, enforce-standard, j-space-standard, verifier-standard.

Orphan copies were **removed** from the other presets (the file existed without a mount
row, so it was inert and only made drift checks ambiguous): a plugin file is only
meaningful together with its `- id: promise-guard` row. Install the row and the file
together.

## Install (per preset)

```powershell
Copy-Item plugins/standalone/dsh-promise-guard/promise-guard.mjs `
  "$HOME\.dsh\.agent-presets\<preset>\promise-guard.mjs" -Force
```

and add the mount row to that preset's `agent.cordis.yml` (id must be `promise-guard`):

```yaml
- id: promise-guard
  name: ./promise-guard.mjs
```

Source sha256: `57b1d84672f7f156…`
Unit test (offline, 9 checks): `scripts/dsh-local-overrides/guard_test.mjs`.
