---
name: dev-archive-agent-notes
description: Use when adding, auditing, pruning, archiving, restoring, or reviewing design decision records (ADRs / design notes) in any repository — checks every new note for superseded active records, classifies implemented notes by future decision value, deletes rejected notes that no longer prevent a tempting mistake, and applies the frozen archive rules.
---

# Curating Design Decision Records

Reduce the active decision corpus without erasing history that can still guide work. Judge every note semantically; word count and age are discovery aids, never archive criteria. "Notes" here means the repository's design-decision records (Agent Notes, ADRs, decision logs) — adapt the paths and verifiers to the repository's own convention.

## Read the contracts

Read the repository's note rules (how to file a note, the per-lifecycle skeleton, and the Alternatives-considered mandate), the archive instructions, and the applicable active lifecycle instructions before classifying. Use current code, configuration, package docs, generated catalogs, newer notes, and inbound links to establish whether a rationale still owns or constrains anything.

## Check supersession when adding a note

Every new note triggers a scoped audit of active notes covering the same decision, mechanism, or rejected alternative. Classify each full or partial supersession while writing the new note: archive qualifying implemented notes in the same PR, retain and cross-link partial supersessions or independently useful rationale, reject obsolete proposals, and delete rejected notes that no longer prevent a plausible mistake. Apply the consolidation rule when the new owner absorbs every unique proposition; do not defer a known match to a later corpus audit.

## Classify by future value

Apply these lifecycle-specific outcomes:

- **Implemented — keep active:** retain a note when its rationale, alternatives, negative guarantees, durable/wire semantics, ownership boundary, security rule, or reintroduction condition is likely to guide a future change. Length does not matter.
- **Implemented — archive:** archive a note when the shipped decision is complete and its body is unlikely to guide future work, such as one-off UI chrome, a narrow adapter, a minor closed bug, superseded implementation detail, or process history whose current behavior is obvious elsewhere.
- **Proposed — never archive:** keep a live proposal active; if it is no longer worth pursuing, reject it with an honest reason and satisfy the rejected lifecycle format.
- **Rejected — keep only as a guardrail:** retain a rejection only when the losing proposal remains a tempting, meaningful mistake and the note explains why it loses.
- **Rejected — delete:** delete the whole record when the rejected idea is obsolete, superseded, no longer plausible, or unlikely to prevent re-litigation. Repair or delete inbound links.

Do not archive toward a quota. Inspect every note in scope, classify analogous groups under one principle, use best judgment for close cases, and record genuinely borderline decisions for the handoff.

## Archive one implemented record

1. Move the complete record (all language variants plus the consistency sidecar, if the repository keeps them) from `implemented/` to the archive path; the active-lifecycle marker is deliberately absent from the archive path.
2. Make no body edits. Insert only an `Archived: YYYY-MM-DD` line immediately below the status line, using the archival date and the same value on every side.
3. Re-record the sidecar hashes mechanically for the metadata-only edits. Do not translate, reformat, update facts, or repair links inside the note.
4. Search for inbound links from active prose. Redirect them to current authority, retarget them to the archived path only when the historical snapshot is intentionally cited, or delete them. Never verify or repair links out of the archived note.
5. Run the repository's archive verifier (in append-only mode it first proves every existing seal still matches, then adds only the new record's hashes). Run the normal verifier afterward.

After the record is sealed, never edit, move, translate, reformat, or delete it. Archived notes remain valid inbound-link targets but are historical snapshots, not authority for current behavior.

## Validate and report

Run the archive verifier's focused test plus the repository's doc gate, lint, and `git diff --check`; select any additional evidence through [dev-pre-push-checks](../dev-pre-push-checks/SKILL.md).

Report active implemented notes kept, implemented notes archived, rejected notes kept/deleted, proposed notes rejected if any, and every genuinely borderline case with its word count and chosen outcome. Do not claim archived outbound links are valid: the archive verifier intentionally never checks them.
