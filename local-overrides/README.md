# Managed local overrides (post-baseline client/config changes)

Registered 20260929. These are changes made **after** the v209 baseline was captured and
that no `bootstrap.ps1` template covers. They live here so a DSH Desktop update, a
profile regeneration, or a fresh machine can detect and re-apply them instead of losing
them silently.

## What is registered

| Area | Registered where | Live target |
|---|---|---|
| Preset code (`RESIDENT_VISION_TOOLS = ['read_image']`, 6 presets) | `config/.agent-presets/<preset>/tool-bootstrap.mjs` | `~/.dsh/.agent-presets/<preset>/tool-bootstrap.mjs` |
| preset cordis rows (`promise-guard` mount, compaction cap) | `local-overrides/preset-cordis-rows/README.md` | `~/.dsh/.agent-presets/<preset>/agent.cordis.yml` |
| autoprompt residentTools | `local-overrides/dsh-preset-autoprompt-resident-read-image.patch` | `~/.dsh/.agent-presets/autoprompt/agent.cordis.yml` |
| Local preset plugin `promise-guard` | `plugins/standalone/dsh-promise-guard/` + `plugins/SOURCES.json` | `~/.dsh/.agent-presets/<preset>/promise-guard.mjs` |
| Legacy vision-toolkit removal (bundle + dep + disabled row) | `profile/package.json.template`, `profile/cordis.patch.yml.template`, `plugins/SOURCES.json` | `~/.dsh/profiles/web/*` |
| DSH settings (local vision backend, bunny model caps) | `local-overrides/dsh-settings-native-vision-and-bunny-model.patch` | `~/.dsh/settings.yaml` |
| zcode reasoning levels | `local-overrides/zcode-commandcode-reasoning-levels.patch` | `~/.zcode/v2/provider_config.json` |
| kimi-code provider + model | `local-overrides/kimi-code-0.36.1-commandcode-space-bunny-alpha.patch` | `~/.kimi-code/config.toml` |

Two cordis rows are registered per preset because no template carries them:

- `- id: promise-guard` + `name: ./promise-guard.mjs` — without it the plugin file is inert.
- `dsh-compaction-basic.maxTokens: 32768` (+ `compactionRetries: 2`) — the shipped 8192 cannot
  summarize a 233k-token Max-effort session, so compaction never shrinks the context.

## Apply / verify

```powershell
# read-only drift check across every registered override
powershell -NoProfile -File .\local-overrides\verify.ps1

# re-apply one patch after a DSH update wiped it (review the diff first)
git -C $HOME\.dsh apply --check ..\local-overrides\<file>.patch   # dry
git -C $HOME\.dsh apply ..\local-overrides\<file>.patch
```

The autoprompt preset yml is **privacy-hostile** (it embeds absolute user paths), so its
change is registered as a diff instead of a copy. Every other preset and plugin file is a
**copy, not a diff**: `bootstrap.ps1` / `template-render.ps1`
own deploying them, so re-applying means copying the source over the live file.

## Secret policy

`scripts/check-private.ps1` must stay green. API keys belong in the live config or the
environment, never in this repository — every patch here is redacted to
`{{COMMANDCODE_API_KEY}}`.

## Why the legacy vision toolkit was removed

The toolkit existed for text-only agents: `vision_glance` / `vision_ground` /
`vision_detect` uploaded the image to an external VLM and returned text. On a
multimodal route the native `read_image` tool is strictly better — the image enters the
model's own context (`dsh-read_image` evidence: it answered questions about a screenshot
directly). The toolkit also forced a three-step dance (`dev_tool_search` →
`vision_toolkit_activate` → tool call) because its schemas only mount after its skill is
loaded, which is what produced the "said it would look, then stopped" failures.

Residual capability loss is deliberate: the pixel/graphics operations (crop, pixel_diff,
dominant_colors, trace, html_screenshot, long-screenshot OCR, extract_foreground) are gone
with it. They are recoverable by re-adding the bundle; nothing else depends on them.
