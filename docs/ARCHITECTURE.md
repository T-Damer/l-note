# Architecture

## Current state

L-Note is a hosted, offline-first knowledge workspace with:

- checksummed installable knowledge packs stored in IndexedDB;
- MiniSearch exact, prefix, alias and fuzzy retrieval with deterministic fallback;
- optional domain query planners outside the generic search engine;
- hash-routed packages, documents, concepts, statements and notes;
- source-linked statements, relations, backlinks and a separate personal-note overlay;
- optional browser-local WebLLM over a versioned evidence envelope;
- one active model at a time, running in a dedicated Web Worker;
- two answer modes with deterministic evidence-size limits;
- list/graph views for packages, documents, sections, concepts and relations;
- SCSS partials and a deterministic static-PWA build;
- headless-Chrome E2E for routes, dialogs, modal scrolling and graph installation/navigation.

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

The MiniMed compatibility adapter requires MiniMed-owned analysis, ranking, dose verification, abstention and benchmark identifiers. These are compatibility requirements, not medical implementations in L-Note.

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

`KnowledgeApplicationAdapter` bundles storage, search, domain planners, an optional local model and an optional evidence verifier. `composeKnowledgeApplicationRuntime()` builds the headless runtime without DOM assumptions. The hosted application runs through this adapter rather than constructing its core services directly.

## Storage and retrieval

JSON remains the current transport and small/medium browser artifact. It is not the permanent search abstraction.

```text
MiniSearch + IndexedDB   current browser implementation
SQLite + FTS5            planned large-pack and MiniMed implementation
optional vector adapter  planned semantic/hybrid layer
```

Only the current working set should eventually be materialized as JavaScript objects. Prepared documents, search tables and source assets should stay in IndexedDB, OPFS or SQLite, while retrieval returns bounded sections for the active query.

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

The target class is a mid-range local device with approximately 8–12 GB of shared memory and no assumption of a strong discrete GPU. The current browser matrix uses only built-in WebLLM artifacts:

```text
Qwen3 1.7B q4f16_1   default for 8 GB, compact mode preferred
Qwen3 4B q4f16_1     quality profile for 12 GB, detailed mode preferred
Phi-4 Mini q4f16_1   alternative for mathematics and formal reasoning
```

The built-in Qwen3 4B is used instead of a custom Qwen3-4B-Instruct-2507 conversion. A 2507 profile may be added later only through a reproducible, integrity-checked conversion and benchmark run.

The browser lifecycle is:

```text
weights downloaded once
  → persistent WebLLM Cache API storage
  → user explicitly loads one selected model
  → dedicated Web Worker owns WebLLM/WASM inference
  → question workspace becomes available
  → evidence is retrieved from local packs
  → answer is generated from bounded evidence only
```

Exactly one model may be active. Selecting another model explicitly unloads the current engine and terminates its worker before the replacement can load. Downloaded weights remain on disk. There is deliberately no automatic inactivity timer: the model remains active until the user changes it, unload support is invoked explicitly, or the page/runtime is terminated.

The UI distinguishes:

```text
persistent weight estimate
active runtime-memory estimate
model on/off state
```

The two answer modes avoid requiring a tokenizer pass over every document:

```text
Экономный    fewer sources, smaller character budget, shorter generation
Расширенный  more sources, larger character budget, longer generation
```

These are deterministic character/source limits, not exact token guarantees. WebLLM still applies the final model context and output-token limits.

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

Browser history owns nested card traversal. Back moves through the card chain; full Close returns to the recorded base page and removes forward card routes. A shared routed-dialog controller owns show/close, back visibility and dialog surfaces; resource-specific body renderers are the remaining migration step.

The package graph uses the same resource routes. Its data model contains available/installed package, document, section and concept nodes plus containment, mention and concept-relation edges. An uninstalled package node opens its normal routed installation card.

Category colors are SCSS variables. Explicit pack categories take priority; the generic projector may infer presentation categories from metadata without changing the knowledge contract. Multiple weighted categories render proportional gradients.

## Preparation and distribution boundary

Heavy preparation may run on a stronger desktop or server, while the resulting pack remains usable on a weaker offline device:

```text
raw documents / PDF / database export / notes
  → deterministic parsing and provenance
  → optional strong local/server LLM proposals
  → chunking, aliases, concepts, statements and relations
  → exact-quote and referential validation
  → optional prebuilt search/database artifacts
  → installable L-Note pack
```

Model output may propose structure but never silently replace source text. The portable pack remains the reviewed installation boundary.

The current CLI already accepts reviewed JSON and direct Markdown/TXT/JSON. The planned user-facing preparation workflow should let a user select local files, choose deterministic-only or LLM-assisted preparation, review proposed links and export an installable pack. PDF/DOCX parsing, OCR and database exporters belong before the normalized pack contract.

## Next ordered work

1. Replace the remaining resource-specific renderers with the shared routed-dialog renderer and split transitional app fragments into pages/services/helpers.
2. Add internal local PDF assets with exact anchors.
3. Add SQLite/FTS5 behind `SearchPort`/`StoragePort`, keeping MiniMed policy outside the generic adapter.
4. Add a user-facing local pack-preparation workflow over the existing CLI contract.
5. Add cancellation and persistent model/document download state where browser/runtime APIs support it.
6. Connect the adapter in MiniMed and require MiniMed’s existing retrieval/safety benchmarks before migration.

Android and iOS remain deferred until the hosted web core is stable, but memory and storage decisions should remain compatible with mid-range 8–12 GB devices.
