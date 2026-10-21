# dsh-subagent-model

![License](https://img.shields.io/badge/license-MIT-blue)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that shows a **read-only [provider / model] badge** in subagent session composers — so you can see at a glance which model a dispatched subagent was configured with.

## What it does

- When you open a **subagent session window**, the composer input area shows a badge with the current `provider / model`
- A green dot means the subagent is live; greyed "session ended" means it is not running anymore
- Main-thread sessions render nothing (the official model-selection UI owns those)

## What it does NOT do (v0.1)

- No manual switching. The official client gate plus the host agent resolver fence (`agent-busy`) intentionally block generic `session.selectModel` for addressed subagents. Switching needs an upstream subagent-scoped RPC.

## Install

```bat
mklink /J "<plugin-dir>\node_modules" "<harness>\resources\host\node_modules"
```

Add to your profile: `"dsh-subagent-model": "link:<plugin-dir>"` in dependencies and `"dsh-subagent-model"` in `dsh.profile.bundles`.

## License

MIT
