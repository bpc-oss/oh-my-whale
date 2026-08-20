---
name: dev-translate-docs
description: Manually run the extended bilingual-document workflow in any repository — generated briefings, delegated prose translation, whole-document translation, and scoped pairing verification — for language pairs whose docs must stay consistent and natural in both sides. Generalized from deepseek-harness' dsh-translate-docs.
disable-model-invocation: true
user-invocable: true
---

# Translating Bilingual Documentation

## Invocation boundary

Run this extended workflow only when the user explicitly invokes `dev-translate-docs` by name. Never select or load it for ordinary documentation work, from another skill, or from an inferred translation need; routine translation follows the one-shot, one-pass rule in the repository's own writing standards.

## What this skill is

**This skill is guidance, not a translation memory.** It is the workflow map for keeping a language pair (`foo.md` ↔ `foo.zh.md`, or whatever pair the repository uses) consistent and natural in both languages. Both languages carry equal authority — a change is authored in either one, and that side is the source for that update. You are the translator: the rules below say what must hold, not how to phrase any particular sentence — phrasing judgment is yours, terminology is not.

## Triage by change type — this decides everything else

- **Update** (pair exists, one side edited): follow the update path below. It is briefing-driven and deliberately cheap: no corpus reading, no git archaeology, smallest counterpart edit. Never re-translate a whole document to apply an update — a minimal update preserves the reviewed phrasing of everything that didn't change; a re-translation throws that review away.
- **New pair** (no counterpart yet): follow the whole-document path below.
- **Deleted or renamed doc**: delete or rename the counterpart and any consistency record alongside it — the gate reports an incomplete pair otherwise.

## The update path (briefing-driven)

The briefing-driven path matches corpus-quality at a fraction of the cost.

1. **Generate the briefing.** Use the repository's pairing tooling when it exists (for example a briefing command that takes any file of the pair and, run bare, briefs every out-of-sync pair). If no tooling exists, derive the briefing yourself: map the change at the narrowest safely aligned granularity — changed Markdown units (paragraph, table row, list item, heading), then whole heading sections, then whole document — and include the authored side's diff since the last confirmed-consistent state, each changed unit's last-confirmed source, current source, and current counterpart text (with line numbers), the terminology rows the change touches, and the binding update rules.
2. **Mechanical-only diff? Apply it directly.** When every change lies inside code fences that the pair shares byte-identically, splice the edited fences into the counterpart and structure-validate the result before writing — no subagent, no hand-editing.
3. **Prose diff? Delegate to a subagent, passing the briefing.** The briefing is the translator's whole working set — the subagent does not re-read the corpus or re-derive the diff. It escalates to the whole-document path's sources of truth only when the briefing leaves a specific decision genuinely unanswerable — an unlisted term with no precedent in the surrounding text, or a whole-document briefing (both sides changed, or neither units nor sections align), which always means reconciling by hand under the repository's translation rules.
4. **Smallest edit that covers the diff.** Preserve the reviewed phrasing of everything the diff does not touch, then verify the changed hunks clause by clause against the source: nothing added, nothing dropped, terminology per the table, code spans verbatim.
5. **Record and verify, scoped.** Run the repository's pairing verification on the touched pair(s) only — a scoped write names exactly the pairs you confirmed; a bulk re-record must be an explicit all. Run the corpus-wide check in the normal doc gate, not per update.

## The whole-document path (new pairs)

When translations need to be written from scratch, the orchestrating agent does not translate: spawn a subagent to do the translation work. The translator reads the sources of truth below first, then translates the whole file into the other language — section by section for long documents, keeping each section's structure locked to the source as you go rather than fixing structure at the end.

### Sources of truth (read, don't re-summarize)

- The repository's pairing contract (e.g. `docs/i18n/README.md`): the file pair, the consistency record (both-side blob hashes), the language-switcher lines, scope, and exclusions.
- The repository's translation rules (e.g. `docs/i18n/translation-rules.md`): faithfulness, structure preservation, terminology discipline, typography levels.
- The terminology table (e.g. `docs/i18n/terminology.md`): binding in both directions. Load it BEFORE translating, not when a term feels uncertain; the terms you don't notice are the ones that drift.
- Any automated pipeline template: agents using this skill do not render it; the terminology table is the only file the automated renderer injects, while this skill and the translation rules remain binding for agent-authored translations.
- [dsh-prose-standard](../dsh-prose-standard/SKILL.md): required prose coverage and editorial judgment. Apply it to both sides without adding or dropping source propositions.

### Translate

- **Pass 1 — write, don't transpose.** Read a semantic unit, then restate it as a native technical author in the nearest style sample's register. Preserve the required frame without forcing sentence-by-sentence correspondence.
- **Pass 2 — verify against the source, clause by clause.** Fidelity is checked here, not written in: confirm nothing was added or dropped, every term follows the table, and each code span survived verbatim. Fix by rewriting the sentence natively, not by patching words into it.
- **Read the completed counterpart alone.** After the source comparison, read the translated file without the source beside it and rewrite phrasing whose awkwardness only becomes visible in isolation.
- Write only the final text to the file, never drafts or notes.
- Every term in the terminology table renders exactly as specified. For the target language, use its column; an unlisted term needs a citable OSS/vendor precedent or stays in the source language marked as pending. Never invent a rendering inline.
- Code blocks are byte-identical across the pair, comments included. Relative links keep their `.md` targets; only the switcher line links the counterpart.
- If the repository has a pairing gate, it checks heading depths, fenced blocks, table row and column counts, list kinds, ordered-list starts, list item counts, and link targets. In Pass 2, manually verify list and table order, noncanonical list numbering, inline code, emphasis, meaning, terminology, and tone.

## Find the work

- If pairing tooling exists, its list command prints every in-scope document as missing / out-of-sync / ok; missing and out-of-sync rows are contract violations.
- In a PR that edits paired docs, the work list is the diff itself: every changed side of a pair needs its counterpart updated and the pair re-recorded in the same PR, and the gate goes red if you forget.

## Finish the pair

1. Switcher: `[English](foo.md) | 中文` immediately after the Chinese file's H1, `English | [中文](foo.zh.md)` after the English file's H1 — add both if this is a new pair, except that a generator-owned source stays byte-identical to generator output and omits its switcher while the counterpart still links back.
2. Record consistency: recompute and record both sides' full blob hashes in the consistency record. The yaml diff in your PR is the reviewable statement "I confirmed these two say the same thing" — only run it after you actually have.
3. No manifest entry is needed for an ordinary document: every in-scope source requires a pair. Change the pairing manifest only when the owning policy documents a genuine generated, instructional, or bilingual-by-construction exclusion.
4. Before the PR: the touched pairs are green under the scoped check; the corpus-wide doc gate runs once at PR level, not inside each translation task.
5. Keep the PR reviewable: state which pairs are new versus minimally updated and list pending terms prominently.

## How to respond to translation review

Follow the code-review reporting guidance ([dsh-code-review](../dsh-code-review/SKILL.md#reporting-findings)): evaluate each comment on its merits, and for terminology comments, remember the terminology table is the contract — apply a reviewer's rendering decision to the terminology table, not only to one file.
