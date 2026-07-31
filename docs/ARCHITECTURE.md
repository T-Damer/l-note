# Architecture

## Current state

L-Note is a hosted, offline-first knowledge workspace with:

- checksummed installable packs stored in IndexedDB;
- MiniSearch exact, prefix, alias and fuzzy retrieval with deterministic fallback;
- optional domain query planners outside the generic search engine;
- hash-routed packages, documents, concepts, statements and notes;
- source-linked statements, relations, backlinks and personal-note overlays;
- list/graph views for packages, documents, sections, concepts and relations;
- optional browser-local WebLLM over a versioned evidence envelope;
- one active model in a dedicated Web Worker;
- persistent model weights in the WebLLM Cache API;
- explicit model states: not downloaded, downloaded/off, loaded/on;
- manual unload with no inactivity timer;
- two deterministic evidence-size modes;
- SCSS partials and a deterministic static-PWA build.

The outer dialog and shell never scroll. `.dialog-body` is the only vertical scroll container; root and body are locked while a routed card is open. The header reserves Back, title and Close columns.

## Code organization

The intended dependency flow is:

```text
pages / application shell
        ↓
services / integrations
        ↓
core contracts and ports
        ↑
adapters / domain plugins
```

Current stable areas:

```text
src/core/          domain-neutral contracts, ports and headless runtime
src/adapters/      MiniSearch, IndexedDB and WebLLM port implementations
src/services/      storage/model/evidence workflows and pure state transitions
src/pages/         page-specific construction and rendering
src/ui/            reusable typography, controls, dialogs, graph and safe DOM helpers
src/helpers/       stateless formatting and mapping
src/integrations/  MiniMed compatibility boundary
```

`src/app-parts/` is transitional composition debt. New business logic is not added there. The model page has already been split into:

```text
src/helpers/model-formatters.js
src/services/model-lifecycle.js
src/services/local-model-loader.js
src/pages/model-lab-elements.js
src/pages/model-lab-view.js
src/pages/local-answer-view.js
```

`src/app-parts/05-model-lab.js` now owns application wiring and event coordination rather than constructing the entire page. Remaining Ask orchestration and resource-specific dialog bodies are the next extraction targets.

`npm run check:structure` enforces modular file limits, selected dependency boundaries, safe DOM insertion and decreasing budgets for touched transitional files. Detailed rules live in `AGENTS.md`.

## L-Note Core and MiniMed

L-Note is the domain-neutral runtime. MiniMed consumes it through adapters; clinical policy does not move into L-Note.

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
generic knowledge-graph projection
shared UI primitives
```

MiniMed owns:

```text
medical query parsing and negation
clinical intent and section ranking
medical aliases and taxonomy
dose/regimen validation
clinical abstention and safety gates
medical benchmark suites and source policy
```

The MiniMed compatibility adapter requires MiniMed-owned analysis, ranking, dose verification, abstention and benchmark identifiers.

## Public adapter API

```text
l-note/core
l-note/adapters/browser
l-note/integrations/minimed
```

Important modules:

```text
src/core/contracts.*               pack/resource/evidence contracts
src/core/ports.*                   Search, Storage, DomainPlanner, LocalModel, EvidenceVerifier
src/core/runtime.*                 headless pack/note/search composition
src/core/application-adapter.*     application bundle of runtime ports
src/core/knowledge-graph.*         generic graph projection
src/adapters/runtime-adapters.*    MiniSearch, IndexedDB/memory and WebLLM
src/integrations/minimed-adapter.* MiniMed compatibility boundary
```

`KnowledgeApplicationAdapter` composes the hosted application without DOM assumptions in the core.

## Storage and retrieval

```text
MiniSearch + IndexedDB   current small/medium browser implementation
SQLite + FTS5            planned large-pack and MiniMed implementation
optional vector adapter  planned semantic/hybrid layer
```

Only the active working set should eventually become JavaScript objects. Prepared documents, indexes and source assets should remain in IndexedDB, OPFS or SQLite.

Retrieval order:

1. Normalize Unicode, Russian `ё/е`, punctuation and whitespace.
2. Expand declared names and aliases.
3. Apply optional domain planners.
4. Retrieve with field boosts, prefix and fuzzy matching.
5. Use deterministic Damerau-Levenshtein fallback when MiniSearch is unavailable.
6. Normalize displayed relevance to `0–100%`; it is not diagnostic probability.
7. Resolve results to sources, statements, concepts and notes.
8. Build a bounded, versioned evidence envelope.
9. Optionally verify and synthesize through application/domain adapters.

Every ranking failure becomes a regression test. Domain vocabulary belongs in a plugin or pack.

## Local-model boundary

The target class is a mid-range device with approximately 8–12 GB shared memory and no assumption of a strong discrete GPU.

```text
Qwen3 1.7B q4f16_1   default for 8 GB
Qwen3 4B q4f16_1     quality profile for 12 GB
Phi-4 Mini q4f16_1   mathematics/formal-reasoning comparison
```

The browser lifecycle is:

```text
WebLLM cache inspection
  → not downloaded / downloaded-off / loaded-on
  → optional persistent-origin request
  → one dedicated Web Worker loads one model
  → local retrieval builds bounded evidence
  → generation uses evidence only
  → source identifiers are checked
```

Selecting another model or pressing manual unload calls `engine.unload()` and terminates the worker. Cached weights remain on disk. There is deliberately no automatic inactivity timer.

Model selection and answer mode are stored through `StoragePort`. The UI distinguishes persistent weight size from active runtime-memory estimates.

`Экономный` and `Расширенный` use deterministic source and character limits rather than tokenizing every candidate document. WebLLM applies final context/output limits.

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

Browser history owns nested card traversal. Back moves through the chain; full Close returns to the recorded base page and removes forward card routes. The package graph uses the same resource routes.

## Preparation and distribution

Heavy preparation may run on a stronger desktop or server:

```text
raw files / PDF / database export / notes
  → deterministic parsing and provenance
  → optional strong local/server LLM proposals
  → chunks, aliases, concepts, statements and relations
  → exact-quote and referential validation
  → optional prebuilt search/database artifacts
  → installable L-Note pack
```

Model output may propose structure but never silently replace source text. The current CLI accepts reviewed JSON and direct Markdown/TXT/JSON.

## Next ordered work

1. Move remaining Ask/model orchestration out of transitional app parts.
2. Replace resource-specific dialog bodies with one routed resource renderer.
3. Add internal PDF assets with exact anchors.
4. Add SQLite/FTS5 behind `SearchPort` and `StoragePort`.
5. Add a user-facing local pack-preparation workflow over the existing CLI contract.
6. Add safe cancellation and persisted download state where browser/runtime APIs support it.
7. Connect L-Note Core to MiniMed and require MiniMed retrieval, dose and safety benchmarks before migration.

Android and iOS remain deferred until the hosted web core is stable, while memory and storage decisions remain compatible with mid-range 8–12 GB devices.
