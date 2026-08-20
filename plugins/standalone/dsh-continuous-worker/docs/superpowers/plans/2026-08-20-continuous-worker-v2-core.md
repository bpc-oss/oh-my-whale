# Continuous Worker v2 Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a disabled-by-default v2 core that persists durable employees and assignments, schedules isolated Runs with leases, accepts only explicit correlated results, verifies before success, fails closed around policy and side effects, and previews v1 migration without touching live state.

**Architecture:** New code lives under `lib/v2/` and does not import legacy runtime modules. Domain code is DSH-independent; a Node `node:sqlite` store implements atomic state; a single Supervisor depends on injected clock/executor/verifier ports; policy and migration modules are deterministic; an HTTP handler and host factory compose the core without activating it from `lib/index.js`. Each task follows red-green-refactor and ends with a focused commit.

**Tech Stack:** Node.js ESM; Node 22+ standard `node:sqlite` (tests use the bundled Node v24 executable); `node:test`; existing DSH/Cordis APIs only at the adapter boundary; no new npm dependencies.

**Spec:** `docs/plans/2026-08-20-continuous-worker-v2-design.md`

**Global Constraints:** Work only in `.worktrees/v2-core`; do not edit active DSH config/state, restart DSH, switch the active plugin, install packages, or activate v2. Preserve v1 APIs and all 123 legacy tests. Never infer completion from `idle`. Never auto-retry an ambiguous side effect. Use explicit schemas, bounded inputs, canonical paths, one-use approvals, and immutable audit events. Do not store raw chain-of-thought. After each task, a separate reviewer checks the committed diff; findings are fixed by the same implementer before the next task.

**Node command used below:** `'/mnt/c/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'`

---

## Task 1: Freeze domain and result contracts

**Files:**

- Create: `lib/v2/domain/constants.js`
- Create: `lib/v2/domain/errors.js`
- Create: `lib/v2/domain/validation.js`
- Create: `lib/v2/domain/run-state.js`
- Create: `lib/v2/domain/result-envelope.js`
- Create: `test/v2/domain-contracts.test.mjs`

- [ ] Write tests that assert accepted/rejected UUIDs, bounded strings/arrays, exact Run transitions, terminal-state immutability, first-result-only behavior, and all required ResultEnvelope fields.
- [ ] Run `node --test test/v2/domain-contracts.test.mjs` with the bundled Node and confirm failure because `lib/v2/domain/*` does not exist.
- [ ] Add frozen enums for employee, assignment, Run, approval, side-effect, outcome, and proposal states plus typed `DomainError` codes.
- [ ] Implement dependency-free validators that reject unknown fields where a trust boundary requires exact schemas, enforce byte/item limits, and return normalized immutable values.
- [ ] Implement `assertRunTransition(from, to, facts)` so `succeeded` requires both a valid result reference and PASS verification; no path uses agent `idle`.
- [ ] Implement `validateResultEnvelope(input, expected)` with protocol version 1, exact run/correlation binding, outcome enum, artifact/evidence/side-effect/proposal caps, and redacted safe summaries.
- [ ] Rerun the focused test and confirm PASS; run the legacy `npm test` and confirm no regression.
- [ ] Commit: `feat(v2): define governed run contracts`

## Task 2: Build a fail-closed SQLite store and migrations

**Files:**

- Create: `lib/v2/store/schema.js`
- Create: `lib/v2/store/sqlite-store.js`
- Create: `test/v2/sqlite-store.test.mjs`
- Create: `test/v2/helpers/temp-db.mjs`

- [ ] Write tests for new-database initialization, `application_id=1129797170`, `user_version=1`, required tables/indexes, foreign keys, WAL, duplicate idempotency rejection, transaction rollback, reopen persistence, wrong application ID, too-new schema, and failed integrity check.
- [ ] Run the focused test with bundled Node and confirm the missing-module failure.
- [ ] Define schema v1 for `employees`, `workspaces`, `assignments`, `runs`, `run_events`, `run_results`, `verification_records`, `approvals`, `side_effect_intents`, `usage_ledger`, `proposals`, and `schema_migrations`, including foreign keys and uniqueness constraints from the spec.
- [ ] Implement `openControlStore(path, options)` using `DatabaseSync`, `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=FULL`, bounded `busy_timeout`, application/version checks, `quick_check`, and transactional initialization/migration.
- [ ] Implement `withTransaction(fn)`, deterministic JSON serialization, explicit close/checkpoint, and fail-closed `StoreError` codes; never fall back to JSON.
- [ ] Rerun the focused test and confirm PASS, including reopen and corruption/version guard cases.
- [ ] Commit: `feat(v2): add sqlite control store`

## Task 3: Implement repositories and audited state changes

**Files:**

- Create: `lib/v2/store/control-repository.js`
- Create: `test/v2/control-repository.test.mjs`

- [ ] Write tests for creating/listing/updating employees, workspaces and assignments; materializing a due Run once; atomic claim competition; lease renewal ownership; explicit result insertion once; verification-gated success; new-attempt retry; immutable terminal states; append-only ordered events; approval and side-effect uniqueness.
- [ ] Run the focused test and confirm the expected missing repository failure.
- [ ] Implement repository methods with parameterized SQL and transaction boundaries: `createEmployee`, `createWorkspace`, `createAssignment`, `materializeDueRun`, `claimNextRun`, `renewLease`, `markExecuting`, `recordResult`, `recordVerification`, `transitionRun`, `createRetryAttempt`, `createApproval`, `consumeApproval`, `declareSideEffect`, and `recordSideEffectReceipt`.
- [ ] Ensure every state change appends a `run_events` row in the same transaction and all reads return parsed immutable snapshots.
- [ ] Add conditional updates that return a conflict instead of overwriting when state, lease owner, policy version, or nonce changed.
- [ ] Rerun focused and SQLite tests and confirm PASS.
- [ ] Commit: `feat(v2): add transactional control repository`

## Task 4: Add workspace, capability, budget, approval, and side-effect policy

**Files:**

- Create: `lib/v2/policy/workspace-policy.js`
- Create: `lib/v2/policy/policy-engine.js`
- Create: `lib/v2/policy/side-effect-gate.js`
- Create: `test/v2/policy.test.mjs`

- [ ] Write tests for Windows drive/UNC/case/separator normalization, sibling-prefix attacks, `..`, symlink/junction final-path escape via injected resolver, missing roots, unknown tools, deny precedence, budget exhaustion, approval parameter-hash drift, expiry, replay, and crash between intent and receipt.
- [ ] Run the focused test and observe the missing-module failure.
- [ ] Implement `canonicalizeWorkspace` and component-level `assertContainedPath` using injected final-path/stat functions so production can use the host filesystem and tests remain deterministic.
- [ ] Implement `PolicyEngine.authorize(action, context)` with exact capability IDs, default deny, deny precedence, risk classification, policy-version binding, and usage-ledger checks.
- [ ] Implement one-use approval validation using canonical parameter hashing, subject/run binding, expiry, and atomic consumption.
- [ ] Implement `SideEffectGate.execute(intent, operation)` so intent is durable before the operation and receipt is durable afterward; classify a thrown/terminated ambiguous operation as `unknown` and return `uncertain`, never automatic retry.
- [ ] Rerun focused tests and all v2 tests and confirm PASS.
- [ ] Commit: `feat(v2): enforce policy and side effect receipts`

## Task 5: Implement the single Supervisor, leases, and recovery matrix

**Files:**

- Create: `lib/v2/supervisor/supervisor.js`
- Create: `lib/v2/supervisor/recovery.js`
- Create: `test/v2/supervisor.test.mjs`
- Create: `test/v2/helpers/fakes.mjs`

- [ ] Write fake-clock/fake-executor tests proving one due Assignment creates one Run, two Supervisors cannot both dispatch it, concurrency limits hold, lease heartbeats extend ownership, stop prevents new dispatch, and execution I/O occurs outside database transactions.
- [ ] Add fault tests for crash after claim, after session creation, after side-effect declaration, after result submission, and during verification; assert the exact recovery table from the spec.
- [ ] Run the focused test and confirm failure because Supervisor is absent.
- [ ] Implement `Supervisor.start()`, `tick()`, `stop()`, and `recoverExpiredRuns()` with one in-process tick mutex, injected clock/timers, bounded batch size, instance ID, lease duration, and abort signals.
- [ ] Implement materialize -> claim -> dispatch -> explicit result -> verify -> terminal sequencing, with retries creating new attempts and `uncertain` blocking blind retry.
- [ ] Ensure timer callbacks capture errors into health/audit state rather than creating unhandled rejections.
- [ ] Rerun focused tests, repeat the concurrency test at least 20 times, then run all v2 tests.
- [ ] Commit: `feat(v2): add leased single supervisor`

## Task 6: Add the explicit execution protocol and DSH adapter boundary

**Files:**

- Create: `lib/v2/execution/execution-port.js`
- Create: `lib/v2/execution/run-context.js`
- Create: `lib/v2/execution/dsh-executor.js`
- Create: `test/v2/execution.test.mjs`

- [ ] Write contract tests using a fake DSH context for fresh session creation, minimal context compilation, per-Run `finish_run` registration, correlation-token binding, duplicate/late result rejection, timeout abort, user cancellation, missing result, transport failure, reconcile, usage events, and no `idle` completion path.
- [ ] Run the focused test and observe the missing-module failure.
- [ ] Define `ExecutionPort` contract guards and build a frozen `RunContext` containing only the approved identity version, Assignment contract, canonical workspace, capabilities, budget, memory summary, and result protocol.
- [ ] Implement `DshExecutor` against the locally verified agent/tool lifecycle APIs, creating a fresh isolated session for every Run and unregistering/invalidating the result channel at terminal cleanup.
- [ ] Convert lifecycle/transport errors into explicit adapter error codes; never synthesize a completed envelope.
- [ ] Record actual usage values delivered by DSH and mark unavailable metrics as unknown rather than zero.
- [ ] Rerun execution and supervisor tests and confirm PASS.
- [ ] Commit: `feat(v2): add explicit dsh run execution bridge`

## Task 7: Implement v1 read-only discovery and migration preview

**Files:**

- Create: `lib/v2/migration/legacy-discovery.js`
- Create: `lib/v2/migration/migration-preview.js`
- Create: `test/v2/migration-preview.test.mjs`
- Create: `test/v2/fixtures/legacy/worker.json`
- Create: `test/v2/fixtures/legacy/queue.json`

- [ ] Write tests for source hashing, valid legacy employee/queue discovery, malformed JSON, missing fields, dangerous workspaces, duplicate identities, stale running entries, unknown records, deterministic preview output, and proof that fixture mtimes/bytes are unchanged.
- [ ] Run the focused test and confirm failure before implementation.
- [ ] Implement bounded, read-only discovery with explicit file allowlist, maximum size, content SHA-256, parse diagnostics, and no broad directory traversal.
- [ ] Implement normalization to candidate v2 employees/assignments plus a deterministic report of create/conflict/drop/manual-review items, all bound to source path/hash.
- [ ] Expose no apply/import writer in Phase 1.
- [ ] Rerun the focused test twice and compare identical normalized output; run all v2 tests.
- [ ] Commit: `feat(v2): add legacy migration preview`

## Task 8: Compose the disabled v2 runtime and minimal HTTP API

**Files:**

- Create: `lib/v2/api/http-handler.js`
- Create: `lib/v2/api/application-service.js`
- Create: `lib/v2/host/create-v2-runtime.js`
- Create: `lib/v2/index.js`
- Create: `test/v2/api.test.mjs`
- Create: `test/v2/host-runtime.test.mjs`

- [ ] Write tests for resource routes, strict JSON/content-type/body limits, exact loopback hostname/IP parsing, trusted Origin, CSRF token, unknown fields, actor audit, sanitized errors, health component separation, one runtime per plugin scope, idempotent start/stop, and default-disabled behavior.
- [ ] Run focused tests and confirm failure before implementation.
- [ ] Implement `ApplicationService` methods for employees, workspaces, assignments, manual Run creation/cancel, approvals, health, and migration preview; services call repositories/policy rather than legacy globals.
- [ ] Implement a framework-neutral HTTP handler under `/continuous-worker/v2/*` with exact route matching and injected authentication/CSRF verification; do not accept root/session as a required resource selector.
- [ ] Implement `createV2Runtime(deps, config)` that opens the store, validates health, constructs exactly one Supervisor, registers routes once, and remains inert unless `config.enabled === true`.
- [ ] Export v2 from `lib/v2/index.js` without importing it from the active legacy `lib/index.js` in this phase.
- [ ] Rerun focused tests, all v2 tests, legacy tests, and `npm run build:client`.
- [ ] Commit: `feat(v2): compose disabled core runtime and api`

## Task 9: Prove the integrated fault model and close the core milestone

**Files:**

- Create: `test/v2/core-fault-matrix.test.mjs`
- Modify: `package.json`
- Create: `PROJECT_STATUS.md`
- Create: `HANDOFF.md`
- Modify: `docs/index.md`

- [ ] Add one end-to-end fake-host scenario: create employee/workspace/Assignment, materialize/claim/execute, submit explicit result, verify evidence, and reach `succeeded` with ordered events.
- [ ] Add table-driven crash/recovery scenarios for every row in the design recovery matrix plus duplicate finish, late finish, expired approval, lease loss, cancellation, and ambiguous side effect.
- [ ] Run the fault matrix with bundled Node and confirm any intentionally omitted behavior fails before the final fixes.
- [ ] Make only the minimal fixes needed for the fault matrix; do not broaden Phase 1 scope.
- [ ] Add `test:v2` and `test:all` scripts that use the current Node executable without embedding a machine-specific absolute path in `package.json`.
- [ ] Run `npm test`; run bundled Node `--test test/v2/*.test.mjs`; run `npm run build:client`; record exact commands, versions, counts, exit statuses, and limitations in `PROJECT_STATUS.md` and `HANDOFF.md`.
- [ ] Run Agent OS `validate-project`; record unrelated global-entry drift separately from project failures.
- [ ] Have an independent reviewer inspect the full branch for correctness/security and a separate verifier check every MUST acceptance scenario and non-goal; resolve or explicitly disposition all findings.
- [ ] Confirm `git diff main...HEAD`, `git status --short`, and that no active DSH config/state path changed.
- [ ] Commit: `test(v2): verify core recovery and handoff`

## Completion Boundary

Passing this plan means the **isolated source implementation of v2 Core** is ready for DSH-adapter canary planning. It does not mean the active plugin was switched, the desktop UI was redesigned, production data was migrated, restart recovery was proven in the live host, or closed-desktop 7x24 operation exists. Those require later plans and explicit user authorization.
