# dsh-voice-input

High-quality [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) voice input plugin.

## Highlights

- **Local offline ASR (two-pass)**: browser mic → host [sherpa-onnx-node](https://github.com/k2-fsa/sherpa-onnx). Streaming **zipformer2 + silero VAD** renders partials live while you speak; VAD-finalized segments are re-recognized offline by **SenseVoice** (punctuation + ITN built in) — the same "second pass" architecture cloud ASRs use: fast to screen, accurate to finalize. Free, private, no audio leaves the machine;
- **Disfluency cleanup**: conservative rule-based removal of fillers (嗯/那个/就是说…) so dictation reads like written text;
- **Live draft echo**: recognized text appears in the composer as you speak (deduped, never stacked);
- **Zero-config fallback**: browser Web Speech when no local models are installed;
- **Settings status**: 设置 → 通用 → 语音输入 shows the engine badge (本地离线识别 ✓（SenseVoice 二遍）/ 浏览器识别) and model diagnostics;
- **Global hotkey**: default `Ctrl+Space` (skips when an input is focused);
- **Preset-agnostic**: behaves as another input method in any preset (code/standard/minimal…).

## Install

```sh
# 1. Install the plugin (local dir or git repo)
dsh plugin --profile web add "file:C:/<you>/dsh-voice-input"
# or from GitHub: dsh plugin --profile web add "github:<you>/dsh-voice-input"

# 2. Download local offline models (~340MB total, resumable)
cd dsh-voice-input && npm run models

# 3. Point the model dir in the profile's cordis.patch.yml:
#    - id: voice
#      config:
#        modelDir: "C:/<you>/dsh-voice-input/dsh-voice-models"

# 4. Restart dsh web, open a session, click 🎤 (or Ctrl+Space) and speak.
```

Works without models too (browser fallback); with models it switches to local offline ASR automatically.

## Config (cordis.patch.yml `voice` row)

| Field | Default | Description |
|---|---|---|
| `engine` | `auto` | `auto`（local if models, else browser）｜`native` ｜ `browser` |
| `modelDir` | `''` | Local model root (absolute path; empty = browser fallback) |
| `asrDir` | `asr-zh` | Streaming ASR subdir (zipformer2, live partials) |
| `senseDir` | `sense-voice` | SenseVoice second-pass subdir (finals, punctuation+ITN) |
| `secondPass` | `auto` | `auto`（SenseVoice if present）｜`sensevoice` ｜ `off`（save RAM） |
| `clean` | `true` | Disfluency cleanup on finals |
| `vadThreshold` | `0.3` | VAD silence threshold; lower = less clipping at boundaries |
| `tailPadSeconds` | `0.6` | Tail-pad duration compensating fading endings |
| `hotkey` | `ctrl+space` | Global hotkey (`alt+space`; empty disables) |
| `lang` | `auto` | Web Speech fallback language (`auto`｜`zh-CN`｜`en-US`) |
| `autoSend` | `false` | Auto-submit when dictation ends |
| `punct` | `smart` | Final punctuation: `smart` ｜ `keep` ｜ `none` |

## Architecture

```
Browser (client half)                           host (Node half)
┌──────────────────────────┐      /voice RPC     ┌──────────────────────────────┐
│ 🎤 button / settings / hotkey│  (loopback)     │ engine decision (auto/native)  │
│ mic → 16k PCM → base64    │ ─────────────────► │ silero VAD + zipformer2 live  │
│ chunked push (256ms)      │ ◄───────────────── │ streaming partials (fast)     │
│ live draft echo / auto-send│   {delta, final}  │ VAD segments → SenseVoice     │
└──────────────────────────┘                     │ re-recognition (accurate,     │
                                                  │ punct+ITN) → cleanup → punct  │
                                                  │ session pool (LRU isolated)   │
                                                  └──────────────────────────────┘
```

- Only the host knows the truth about the engine (config + model load result); it publishes via `/voice.ping` / `/voice.config`, the client just consumes;
- Single-chunk RPC failures don't abort a round (only sustained failure with no text surfaces an error); concurrent sessions are isolated by sessionId;
- Audio flows only between browser and host — no third-party service.

## Develop

```sh
npm install
npm test          # vitest: punctuation / cleanup / config / wire / session pool
npm run models    # download models (zipformer2 + VAD + SenseVoice)
node tools/asr-smoke.mjs --model-dir ./dsh-voice-models   # end-to-end smoke (2nd pass)
```

## License

MIT. ASR engine [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache-2.0); models from [csukuangfj](https://huggingface.co/csukuangfj) (zipformer2 zh int8 / silero VAD / SenseVoice int8, commercial-friendly).
