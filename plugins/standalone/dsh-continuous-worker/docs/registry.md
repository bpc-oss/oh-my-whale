# Documentation Registry

This registry defines what belongs in each documentation area.

## Document Types

- `status`: concise current project state, recent changes, blockers, and next steps.
- `handoff`: session closeout summary for the next Codex, Claude Desktop, Claude CLI, or human operator.
- `architecture`: durable system structure, boundaries, and dependency direction.
- `decisions`: accepted long-lived tradeoffs and their consequences.
- `bugs`: non-obvious defects, root causes, and regression protection.
- `incidents`: production, security, data, or service incidents.
- `runbooks`: repeatable operational or recovery procedures.
- `changes/events`: immutable task-level change events.
- `changelog`: derived summaries built from change events.
- `specifications`: accepted product behavior, contracts, and invariants.
- `data-contract`: canonical data locations, immutability boundaries, and required run evidence.
- `schema`: stable warehouse/table/view contracts and row-count checks.
- `analysis-runbook`: durable workflow for safe data inspection, run manifests, and session recovery.
- `lineage`: minimum input-to-run-to-output traceability fields and drill-through conventions.

## Canonical Paths

- `PROJECT_STATUS.md`: current project state.
- `HANDOFF.md`: latest session handoff.
- `.agent/tasks/active/<task-id>/`: current task contract, evidence, and handoff.
- `docs/changelog/YYYY-MM.md`: evidence-backed completed changes.
- `docs/bugs/<slug>.md`: recurring or important bugs and prevention notes.
- `docs/decisions/<slug>.md`: durable decisions and consequences.
- `docs/incidents/<slug>.md`: high-impact incidents; ask before writing sensitive details.
- `docs/runbooks/<slug>.md`: reusable operational procedures.
- `docs/templates/`: documentation templates.
- `docs/DATA_CONTRACT.md`: data locations, immutability rules, and required evidence for analysis runs.
- `docs/SCHEMA.md`: warehouse engine, schema registry, and stable table/view contracts.
- `docs/ANALYSIS_RUNBOOK.md`: standard analysis bootstrap order, safe inspection commands, manifests, and closeout steps.
- `docs/LINEAGE.md`: minimum lineage model for raw files, warehouse objects, runs, and result outputs.

## Source Priority

Use current code, config, tests, runtime evidence, and task evidence before historical docs. Use `PROJECT_STATUS.md` and `HANDOFF.md` for current state. Treat old bugs, incidents, decisions, changelog, and runbooks as memory that can be stale.

## Rules

- Use `unknown` instead of inventing missing history.
- Do not store temporary TODOs or chat transcripts as durable facts.
- Keep root `AGENTS.md` focused on stable project-specific instructions and link here for details.
- Keep `CLAUDE.md` as a short pointer to root `AGENTS.md`.
- Move progress and closeout notes to `PROJECT_STATUS.md`, `HANDOFF.md`, or `.agent/tasks/*/handoff.json`.
- Auto-archive only low-risk, evidence-backed local docs updates. Ask before writing incident, security, privacy, money, legal, or uncertain facts.
- Only docs explicitly marked as Agent OS policy sources may strengthen runtime gates. Ordinary prose, blueprints, and specs are informative until registered as policy sources.
- Do not use durable docs as a reason to full-read large generated SQL/data/log artifacts when a schema doc, manifest, bounded preview, or query can answer the question faster and safer.
