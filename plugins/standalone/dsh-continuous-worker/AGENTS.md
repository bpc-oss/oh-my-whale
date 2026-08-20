# dsh-continuous-worker Project Rules

## Project Snapshot

- Purpose: a DSH-native, governed runtime for durable 7x24 AI employees. An employee has a stable identity; each assignment executes in an isolated run with explicit results, evidence, policy checks, and recovery semantics.
- Stack: Node.js ESM host plugin, React client, Cordis/DSH APIs, and Node 22 `node:sqlite` for the v2 control store.
- Important directories: `lib/` legacy host code, `lib/v2/` v2 control plane, `src/` client, `test/v2/` v2 tests, `docs/plans/` accepted design, `docs/superpowers/plans/` executable plans, `dist/` generated client bundle.
- Historical design and review files under `docs/` describe v1 and are not proof of current behavior. Use current code, tests, runtime evidence, and `PROJECT_STATUS.md` first.

## Stable Safety Boundaries

- The active `web` and `headless` DSH profiles may resolve this repository through symlinks. Do not develop directly in the active checkout; use an isolated Git worktree under `.worktrees/`.
- Do not restart DSH, switch the active plugin, edit DSH profile/global configuration, or install a persistent background service without explicit user approval.
- Treat `C:\Users\Administrator\.dsh\profiles\*\continuous-worker\` as user-owned live state. Do not mutate, delete, or migrate it during development. A future migration requires a dry-run, backup, hashes, and explicit activation approval.
- Preserve credentials, caches, sessions, existing employees, schedules, checkpoints, and unrelated dirty work.
- The v2 control plane owns permissions, budgets, approvals, hidden verification, promotion, rollback, and emergency stop. A model may propose changes but may not expand its own authority.
- Do not store or display raw chain-of-thought. Persist concise plan, decision, tool, evidence, and outcome summaries only.
- Do not silently substitute a cloud provider, lower-quality model, or weaker execution path.

## Commands

- Test legacy baseline: `npm test`
- Build client: `npm run build:client`
- Run v2 tests: `node --test test/v2/*.test.mjs`
- Run all source tests: `npm test && node --test test/v2/*.test.mjs`
- Validate Agent OS project metadata (PowerShell): `C:\Users\Administrator\.agent-os\bin\agent-os.ps1 validate-project E:\ai-files\dsh-continuous-worker`
- Close out a development session (PowerShell): `C:\Users\Administrator\.agent-os\bin\agent-lessons.ps1 closeout -Project E:\ai-files\dsh-continuous-worker`

The WSL shell currently exposes Node 20, while production v2 storage requires Node 22. Use the Codex bundled Node executable reported by `load_workspace_dependencies`, or the DSH host Node 22 runtime, for `node:sqlite` tests. Record the exact executable used.

## Engineering Rules

- Work test-first: add one failing behavioral or fault-injection test, observe the expected failure, implement the smallest production change, then rerun focused and broader tests.
- Prefer platform APIs and Node standard-library primitives over new dependencies. Add a dependency only with a documented reason and review.
- Keep the supervisor singular per plugin scope. Do not mount a scheduler/pacemaker per chat or workspace root.
- Persist employee identity separately from run execution. Every run has a fresh isolated execution context and a correlated typed terminal result.
- Never infer successful completion from `idle`, transport closure, or absence of an error. Terminal states require an explicit result plus verification evidence.
- Persist intent before external side effects and a receipt after them. If a crash leaves the outcome ambiguous, mark the run `uncertain`; do not blindly retry.
- Scheduler claims use leases and idempotency. Recovery must be deterministic and covered by crash/concurrency tests.
- Security gates fail closed for malformed identities, paths, origins, policies, migrations, and result envelopes.
- Canonicalize workspace paths and enforce containment before dispatching tools. Model prompts are not security boundaries.
- Keep team support in the data model, but do not add nested or recursive agent delegation in the v2 core milestone.
- Place temporary and generated artifacts only in directories allowed by `.agent-os/artifact-policy.json`.

## Documentation

- Current state: `PROJECT_STATUS.md`
- Latest handoff: `HANDOFF.md`
- Accepted v2 design: `docs/plans/2026-08-20-continuous-worker-v2-design.md`
- Executable implementation plan: `docs/superpowers/plans/2026-08-20-continuous-worker-v2-core.md`
- Documentation index: `docs/index.md`
- Documentation registry: `docs/registry.md`

## Verification And Review Gates

- Unit tests alone are not production proof. Keep source, built artifact, active package, policy/configuration, live DSH, UI, recovery, and independent-review evidence distinct.
- Before finishing code changes, run focused v2 tests, the full v2 suite, the legacy suite, and the client build when client code changed. Record exit status and runtime executable.
- Fault tests for storage, lease expiry, duplicate dispatch, crash recovery, cancellation, explicit result capture, path containment, and uncertain side effects are mandatory before a v2-core completion claim.
- Non-trivial file-changing tasks require independent review before closeout. A main-thread self-check is not a substitute for a reviewer-style pass. `<!-- agent-os-gate:independent_review.non_trivial_change -->`
- Phase or milestone completion requires independent review before closeout. `<!-- agent-os-gate:phase_closeout.independent_review -->`
- Critical engineering tasks require heterogeneous or stronger review when the runtime supports it, such as a different reviewer route, `deep-review`, `security-review`, or `cross-route-review`. `<!-- agent-os-gate:heterogeneous_review.critical_engineering_change -->`
- Review findings must be fixed or explicitly documented as accepted, deferred, or blocked before closeout, commit, or handoff. `<!-- agent-os-gate:findings_disposition.before_closeout -->`
- If the runtime cannot provide heterogeneous review, record that limitation in the handoff instead of silently downgrading the gate.

## Completion Gate

- For any file-changing Claude task, create or update `.agent-os/evidence/claude-claim.json` before final response. `<!-- agent-os-gate:completion_claim.file_changing_task -->`
- For high-risk changes or phase completion, trusted independent review evidence under `.agent-os/reviews/verified/` is mandatory.
- Do not claim v2 activated or production-ready without explicit user authorization plus active-runtime, restart-recovery, and UI evidence.
- Do not claim completion if required tests, review, evidence disposition, or handoff updates are missing.
