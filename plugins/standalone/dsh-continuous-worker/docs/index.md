# Documentation Index

Use this file as a concise navigation entry for durable project knowledge.

## Core

- Architecture:
- Testing:
- Release:
- Data contract: `docs/DATA_CONTRACT.md`
- Schema: `docs/SCHEMA.md`
- Analysis runbook: `docs/ANALYSIS_RUNBOOK.md`
- Lineage: `docs/LINEAGE.md`
- Runbooks: `docs/runbooks/`

## Records

- Current status: `PROJECT_STATUS.md`
- Handoff: `HANDOFF.md`
- Decisions: `docs/decisions/`
- Bugs: `docs/bugs/`
- Incidents: `docs/incidents/`
- Changelog: `docs/changelog/`
- Templates: `docs/templates/`

## Notes

- Keep this index short.
- Link to durable docs; do not paste temporary task status here.
- Put changing project state in `PROJECT_STATUS.md` or `HANDOFF.md`, not in `AGENTS.md`.
- Historical memory docs are diagnostic context; current code, tests, task evidence, and handoff files remain the source of truth.
- For data-heavy projects, prefer docs, manifests, bounded previews, and warehouse queries over full file reads of generated SQL, datasets, or logs.
- For a full data-project scaffold or legacy mapping plan, use `agent-os.ps1 init-data-project <repo> --new|--existing`.
