---
name: dev-doc-site-sync
description: Use when publishing, updating, moving, or removing documentation website pages in any repository — editing the site manifest or navigation mapping, diagnosing a page missing from the generated site, fixing projected documentation links, or running the docs build/check workflow after website-content changes. Generalized from deepseek-harness' dsh-doc-site-sync; swap the example paths and commands for the repository's own.
---

# Synchronizing a Documentation Website

Keep repository Markdown as the only editable content source. Treat the website as a tested projection: a manifest selects public pages, a generator rewrites them into a disposable generated tree, and the static-site builder (VitePress, Docusaurus, or the repository's choice) builds that tree. The paths, commands, and helper names below are examples from one repository — replace them with the current repository's own equivalents before acting.

## Read the owning contracts

- Read the repository's documentation standards (AGENTS.md / CONTRIBUTING.md / docs/) and use [dsh-doc-standards](../dsh-doc-standards/SKILL.md) when deciding where content belongs or changing product documentation prose.
- If the repository keeps bilingual pairs, follow its pairing contract (e.g. `docs/i18n/README.md`); never invoke an extended translation workflow automatically.
- Read the current page type and entries in the site manifest before changing it; do not rely on a remembered field set.
- Read the site builder configuration before adding a new section, sidebar collection, locale, or top-level navigation item.

## Classify the change

- **Edit an already published page:** change only its canonical Markdown source. Do not touch the manifest unless its route or navigation metadata changes.
- **Publish a new page:** create it in its owning docs tier, then add one manifest entry.
- **Rename, move, or remove a page:** update the canonical file, manifest entry, and inbound repository links atomically. Remove stale manifest entries; the check gate rejects missing sources.
- **Publish a generated catalog:** map the generated docs file, but change its generator or source metadata rather than editing the catalog by hand.
- **Change site structure:** update the manifest for ordinary pages; update the builder configuration only when the existing sidebar, section, or locale model cannot express the change.

Never edit or commit generated/cache/build output directories (for example `website/.generated/`, `.cache/`, `.dist/`). Keep generated catalogs under the docs tree, freshness-gate them there, and publish them through the manifest.

## Add or update a manifest entry

Set every manifest field deliberately. Typical fields:

- `source`: repository-relative canonical Markdown path. For a complete bilingual pair, add the primary language path through the pairing helper; it derives the sibling, the content locales, and counterpart aliases.
- `route`: public site path.
- `label`: sidebar label, not necessarily the document H1.
- `sidebar` / `section`: reuse existing collections unless the information architecture genuinely needs another; if adding a section, also place it in the builder's section order.
- `order`: stable order within the section.
- `sourceAliases`: optional additional repository paths that should resolve to this page when links are projected. It does not create another public route.

Use the fallback helper (e.g. `mirroredPages()`) only for a source that intentionally falls back to the same available language in both route trees; convert it to the pairing helper when its counterpart is added. Keep the manifest an explicit public allowlist. Do not publish internal material — RFCs, postmortems, testing guides, maintainer workflows — merely because it exists under docs/; add it only when the user explicitly expands what the site publishes.

## Preserve link behavior

Write normal repository-relative Markdown links in canonical docs. The projector rules (adapt to the repository's implementation):

- A target present in the manifest becomes a site-relative route.
- An existing target outside the manifest becomes a source link (GitHub or equivalent), including supported line suffixes.
- An image is the exception: its file is copied into the generated tree and referenced from there, so the site serves it regardless of repository visibility. It must be a regular file inside the repository.
- External URLs, site-absolute URLs, email links, and fragment-only links remain unchanged.
- A missing repository-relative target fails projection instead of silently producing a broken link.
- Cross-page fragments use the canonical heading id. If an authored heading emits a different site id, place an explicit anchor (`<a id="..."></a>`) immediately before it; add generated aliases in the owning generator.

Do not write site-specific routes into canonical Markdown just to satisfy the builder. Use source aliases for directory-style repository links that should resolve to a mapped index page.

## Preview and validate

Run the repository's local docs preview while editing (for example `pnpm docs:dev`). The dev server watches mapped source files and reprojects them; restart it after changing the manifest if the new source is not picked up automatically.

Run the focused website gate before treating the mapping as valid (for example `pnpm docs:check`). If Markdown link checks pass but the site build reports a missing fragment, follow the reported source and target paths and preserve the canonical id with an explicit anchor in authored Markdown or in the owning generator.

Before committing a documentation-site change, run the repository's doc-sync and lint gates plus `git diff --check`. Use [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md) before pushing when it applies. Report the canonical files changed, manifest entries added or removed, public routes affected, and the exact checks run.

## Keep deployment separate

Synchronizing content into the site build does not publish it to the internet. Do not add hosting permissions, deployment workflows, custom domains, or public hosting unless the user explicitly requests deployment and confirms the hosting policy.
