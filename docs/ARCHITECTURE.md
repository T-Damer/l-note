# Architecture

## Current state

The active web prototype currently provides:

- installable, checksummed JSON knowledge packs persisted in IndexedDB;
- MiniSearch full-text, prefix, alias and fuzzy retrieval with a deterministic fallback;
- optional domain query expansion isolated from the generic search engine;
- normalized `0–100%` retrieval relevance;
- routed packages, documents, concepts, statements and notes using hash URLs and browser history;
- Back traversal through linked cards and one full-chain Close operation;
- exact source-linked statements, relations, backlinks and a separate personal-note overlay;
- optional browser-local WebLLM over retrieved evidence only;
- one model comparison block with Gemma 3 1B, preferred Qwen3 1.7B and Phi-4 Mini;
- SCSS source partials for palette, themes, base, layout, components, dialogs and utilities;
- a deterministic style builder that generates `styles.css` before local and production builds;
- static PWA hosting through GitHub Pages.

The next implementation slice is typed core ports, browser E2E coverage for routed dialogs, and a reusable component/typography/icon layer. The complete future backlog lives only in `TASKS.md`.

## Product and shared-core boundary

L-Note is the canonical **domain-neutral knowledge runtime**, not a replacement for MiniMed's medical domain layer.

The reusable layer is expected to contain:

```text
@lnote/contracts     pack, document, section, concept, statement, relation and evidence contracts
@lnote/core          installed-pack composition, entity resolution, backlinks, statements and personal overlay
@lnote/search        SearchPort plus generic ranking and fusion contracts
@lnote/storage       StoragePort plus IndexedDB and future SQLite adapters
@lnote/llm           provider-independent grounded-evidence orchestration
```

MiniMed should consume those capabilities through adapters and retain ownership of:

```text
medical query parsing and negation
clinical intent and section ranking
medical aliases and taxonomy
dose and regimen validation
clinical abstention and safety gates
medical benchmarks and source policies
```

This prevents medicine from leaking into the universal core without weakening MiniMed into a generic lowest-common-denominator search app. Before MiniMed imports the core, shared contracts and ports should become typed and UI-independent.

## Runtime

```text
static PWA shell
  ├─ pack catalog (network-first, cached)
  ├─ selected JSON packs → checksum verification → IndexedDB
  ├─ flattened sections/notes → MiniSearch or built-in fuzzy fallback
  ├─ optional domain query expanders
  ├─ concepts + relations + exact statements → linked readers/backlinks
  ├─ personal notes → separate IndexedDB store
  └─ optional WebLLM → retrieved evidence only
```

The browser runtime is serverless and static-host friendly. Search, linked reading, notes and deterministic evidence remain useful without a model.

## Storage and search boundary

JSON is currently both the transport format and the small-corpus prototype artifact. It is not the permanent search abstraction.

Search consumers should depend on a future `SearchPort`, not on MiniSearch result objects. The first adapters are expected to be:

```text
MiniSearch + IndexedDB   small/medium browser packs
SQLite + FTS5            large local packs and MiniMed
optional vector adapter  semantic or hybrid retrieval
```

A SQLite adapter should be reusable by L-Note and MiniMed, while medical query planning remains a MiniMed plugin.

## Retrieval path

1. Normalize Unicode, Russian `ё`/`е`, dashes, punctuation and whitespace.
2. Expand declared concept names and aliases.
3. Apply optional domain expanders, such as the isolated MiniMed demo vocabulary.
4. Run MiniSearch with title/alias boosts, prefix search and fuzzy matching.
5. Fall back to the embedded Damerau–Levenshtein scorer when MiniSearch is unavailable.
6. Normalize displayed relevance relative to the current result set; this is not diagnostic probability.
7. Resolve results to their pack, document, section, concepts, statements and source metadata.
8. Merge the separately stored personal layer according to the selected ranking policy.
9. For complex questions, select a bounded evidence set and list linked personal conflicts.
10. Only then may an optional local model synthesize an answer; unknown source IDs are rejected.

Every reported ranking failure should become a regression test. Domain-specific vocabulary belongs in a plugin or pack, not in the generic search engine.

## Route boundary

Hash URLs are the portable navigation contract for static hosting and future Capacitor shells:

```text
#/search
#/ask
#/library
#/notes
#/package/:id
#/document/:id
#/concept/:id
#/statement/:id
#/note/:id
```

The URL is the source of truth for opened resources. Browser history owns nested card traversal. A resource route stores its base page and chain depth; Back returns through the chain, while full Close returns to the base page and truncates forward resource routes.

Routing belongs to the application shell rather than the headless knowledge core. Stable IDs and resource resolvers belong to the core contract.

## Styling boundary

All authored style source lives under `styles/`. `styles/main.scss` defines partial order; `tools/build-styles.mjs` generates `styles.css`. The current builder intentionally supports CSS-compatible SCSS plus deterministic `@use` ordering without adding a new runtime dependency. Sass-only features require adding an explicit compiler and lockfile update.

Palette values, light/dark semantic assignments and future graph category colors are centralized. Components should consume semantic variables rather than repeat literals.

## Pack preparation boundary

Two preparation paths are supported:

```text
reviewed manifest/documents/concepts/statements/relations
  → deterministic compiler
  → validated pack
```

or:

```text
Markdown / TXT / JSON
  → deterministic parsing + provenance + abbreviation discovery
  → optional local OpenAI-compatible or Replicate extraction
  → exact-quote validation
  → validated pack
```

Arbitrary PDF/DOCX parsing, OCR, database exporters and domain ETL belong before the normalized authoring contract. The core invariant is provenance-first: a structured statement is publishable only when its exact quote resolves inside a supplied section. Model output is a proposal, never a silent replacement for source text.

## Personal overlay

Reference packs are immutable installed inputs. Notes live in another object store and may link to a stable statement using `observation`, `supports`, `refines`, `contradicts` or `supersedes`. Even `supersedes` changes only local ranking; both versions remain visible and traceable.

## Planned compatible layers

- typed public contracts and adapter ports;
- SQLite/FTS and vector-index artifacts;
- browser E2E routing coverage;
- reusable UI components, `Text` typography and Phosphor icons;
- internal PDF/source assets;
- knowledge graph view;
- persistent prioritized model/document download queue;
- signed catalogs, dependencies, delta updates and rollback;
- temporal statement validity and applicability conditions;
- optional sync of the personal overlay;
- Capacitor only after the web core stabilizes.
