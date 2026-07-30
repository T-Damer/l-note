# Architecture

## Current state

L-Note is a hosted, offline-first knowledge workspace with:

- checksummed JSON knowledge packs stored in IndexedDB;
- MiniSearch exact, prefix, alias and fuzzy retrieval with deterministic fallback;
- optional domain query planners outside the generic search engine;
- hash-routed packages, documents, concepts, statements and notes;
- source-linked statements, relations, backlinks and a separate personal-note overlay;
- optional WebLLM over a versioned evidence envelope;
- model installation that is independent from question/evidence entry;
- a model-first Ask page: compact name/parameters/size/power state, then progress/error/retry, then the question workspace;
- shared `Text`, Icon, Card, Button, SourceCard and routed-dialog primitives;
- list/graph views for packages, documents, sections, concepts and relations;
- SCSS partials and a deterministic static-PWA build;
- headless-Chrome E2E for direct links, reload, nested Back, full-chain Close and modal scrolling.

The outer dialog and its shell never scroll. `.dialog-body` is the only vertical scroll container; the document root and body are locked while a routed card is open. The header reserves Back, title and Close columns, so hiding Back cannot move Close away from the right edge.

## L-Note Core and MiniMed

L-Note is the domain-neutral runtime. MiniMed should consume it as an adapter-backed core, not copy its infrastructure and not move clinical policy into L-Note.

L-Note owns:

```text
portable contracts and stable IDs
pack installation and composition
storage/search/model ports
concepts, statements, relations and backlinks
personal overlay
versioned evidence collection
generic evidence-verification boundary
hash-routing primitives
shared generic UI primitives
generic knowledge-graph projection
```

MiniMed continues to own:

```text
medical query parsing and negation
clinical intent and section ranking
medical aliases and taxonomy
dose/regimen validation
clinical abstention and safety gates
medical benchmark suites and source policy
```

## Public adapter API

Stable pre-release entrypoints:

```text
l-note/core
l-note/adapters/browser
l-note/integrations/minimed
```

Important modules:

```text
src/core/contracts.*               public pack/resource/evidence contracts
src/core/ports.*                   Search, Storage, DomainPlanner, LocalModel, EvidenceVerifier
src/core/runtime.*                 headless pack/note/search composition
src/core/application-adapter.*     bundle of runtime ports for an application
src/core/knowledge-graph.*         generic graph projection and category inference
src/adapters/runtime-adapters.*    MiniSearch, IndexedDB/memory and WebLLM
src/integrations/minimed-adapter.* MiniMed compatibility boundary
```

`KnowledgeApplicationAdapter` bundles storage, search, domain planners, an optional local model and an optional evidence verifier. `composeKnowledgeApplicationRuntime()` builds the headless runtime without DOM assumptions. The hosted web application runs through this adapter rather than constructing its core services directly.

The MiniMed adapter requires at least one medical query planner, an evidence verifier, MiniMed-owned analysis/ranking/dose/abstention functions and a benchmark-suite ID. These are compatibility requirements, not medical implementations in L-Note.

## Storage and retrieval

JSON remains the current transport and small/medium browser artifact. It is not the permanent search abstraction.

```text
MiniSearch + IndexedDB   current browser implementation
SQLite + FTS5            planned large-pack and MiniMed implementation
optional vector adapter  planned semantic/hybrid layer
```

Retrieval order:

1. Normalize Unicode, Russian `ё/е`, punctuation and whitespace.
2. Expand declared concept names and aliases.
3. Apply optional domain planners.
4. Retrieve with field boosts, prefix and fuzzy matching.
5. Use deterministic Damerau–Levenshtein fallback when MiniSearch is unavailable.
6. Normalize displayed relevance to `0–100%`; it is never diagnostic probability.
7. Resolve results to sources, statements, concepts and personal notes.
8. Build a bounded, versioned evidence envelope.
9. Optionally verify and synthesize through application/domain adapters.

Every ranking failure becomes a regression test. Domain vocabulary belongs in a plugin or pack.

## Local-model boundary

Downloading and loading a model does not require a question or retrieved evidence. The selected `LocalModelPort` is prepared first; a question and evidence become mandatory only when generation begins.

```text
selected model off
  → compact metadata and download interface
  → percentage + approximate loaded/total/remaining size + speed
  → ready or structured error with retry
  → selected model on
  → reveal question and answer workspace
  → retrieve local evidence
  → generate from evidence only
  → validate source identifiers
```

Selecting another unloaded model hides the workspace again. Approximate byte/speed values are derived from the configured model size and WebLLM progress callbacks. Exact resumable byte ranges, cancellation and a shared model/document priority queue remain future runtime capabilities.

## Routing, dialogs and graph

Stable routes:

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

Browser history owns nested card traversal. Back moves through the card chain; full Close returns to the recorded base page and removes forward card routes. A shared routed-dialog controller owns show/close, back visibility and dialog content surfaces; resource-specific body renderers are the remaining migration step.

The package graph uses the same resource routes. Its data model contains available/installed package, document, section and concept nodes plus containment, mention and concept-relation edges. An uninstalled package node opens its normal routed installation card.

Category colors are SCSS variables. Explicit pack categories take priority; the generic projector may infer presentation categories from metadata without changing the knowledge contract. Multiple weighted categories render proportional gradients. A downloadable demonstration pack includes a 50/50 pediatrics/dentistry tooth-eruption node.

## Preparation boundary

```text
reviewed records or Markdown/TXT/JSON
  → deterministic parsing and provenance
  → optional local/remote extraction proposals
  → exact-quote validation
  → validated portable pack
```

PDF/DOCX parsing, OCR and database exporters belong before this normalized contract. Model output may propose structure but never silently replace source text.

## Next ordered work

1. Replace the three resource-specific body renderers with the shared routed-dialog renderer and split transitional app fragments into pages/services/helpers.
2. Add shared field/switch primitives and finish interaction-state auditing.
3. Add browser E2E for graph/list switching and node navigation.
4. Add internal local PDF assets with exact anchors.
5. Add cancellation and a persistent model/document download queue where runtimes allow it.
6. Add SQLite/FTS5 behind `SearchPort`/`StoragePort`.
7. Connect the adapter in MiniMed and require MiniMed’s existing retrieval/safety benchmarks before migration.

Android and iOS remain deferred until the hosted web core is stable.
