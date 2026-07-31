# Architecture

## Current state

L-Note is a hosted, offline-first knowledge workspace with:

- checksummed installable packs stored in IndexedDB;
- exact, prefix, alias and fuzzy retrieval through MiniSearch with deterministic fallback;
- optional domain query planners outside the generic search engine;
- hash-routed packages, documents, concepts, statements and notes;
- source-linked statements, relations, backlinks and personal-note overlays;
- list and graph views over the same resources;
- optional browser-local WebLLM over a bounded evidence envelope;
- one active model in a dedicated Web Worker;
- persistent model weights in the WebLLM Cache API;
- explicit model states: not downloaded, downloaded/off and loaded/on;
- manual unload with no inactivity timer;
- SCSS partials and a deterministic static-PWA build.

A routed dialog has one vertical scroll container: `.dialog-body`. The page root and body remain locked behind it, and the header reserves Back, title and Close columns.

## Code organization

Dependency flow:

```text
pages / application shell
        ↓
services / integrations
        ↓
core contracts and ports
        ↑
adapters / domain plugins
```

Directory ownership:

```text
src/core/          domain-neutral contracts, ports and headless runtime
src/adapters/      MiniSearch, IndexedDB and WebLLM port implementations
src/services/      use-case workflows and pure state transitions
src/pages/         page and routed-resource construction/rendering
src/ui/            reusable typography, controls, dialogs, graph and safe DOM helpers
src/helpers/       stateless formatting, matching and mapping
src/integrations/  product boundaries such as MiniMed
```

`src/app-parts/` is temporary composition and wiring. New business logic does not belong there. The model and Ask slices are now split into:

```text
src/helpers/model-formatters.js
src/services/model-lifecycle.js
src/services/model-preferences.js
src/services/local-model-loader.js
src/services/evidence-query.js
src/pages/model-lab-elements.js
src/pages/model-lab-view.js
src/pages/evidence-view.js
src/pages/local-answer-view.js
```

Routed knowledge resources use one registry and separate renderers:

```text
src/pages/routed-resource-renderer.js
src/pages/package-resource-view.js
src/pages/document-resource-view.js
src/pages/concept-resource-view.js
src/pages/statement-resource-view.js
```

The registry owns dispatch and missing-resource handling. The shared routed-dialog controller owns lifecycle, Back/Close availability and the heading/body surfaces. Resource renderers only resolve data and build content. Only the note editor still enters the registry through a transitional compatibility function.

The legacy local DOM builder and resource-type switch were removed from the shell. Modular rendering uses `src/ui/dom.js`, which inserts text and nodes rather than raw HTML.

`npm run check:structure` enforces:

- a 300-line hard limit for modular source;
- selected dependency boundaries;
- no raw `innerHTML` assignment in modular source;
- decreasing budgets for touched transitional files.

Detailed rules and preferred 200-line/30-line targets live in `AGENTS.md`.

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
hash routing and routed-resource contracts
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

`KnowledgeApplicationAdapter` composes the hosted application without DOM assumptions in the core. Search, storage and local-model implementations remain replaceable ports.

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

Every reported ranking failure becomes a regression test. Domain vocabulary belongs in a plugin or pack.

## Local-model boundary

The target class is a mid-range device with approximately 8–12 GB shared memory and no assumption of a strong discrete GPU.

```text
Qwen3 1.7B q4f16_1   default for 8 GB
Qwen3 4B q4f16_1     quality profile for 12 GB
Phi-4 Mini q4f16_1   mathematics/formal-reasoning comparison
```

Lifecycle:

```text
WebLLM cache inspection
  → not downloaded / downloaded-off / loaded-on
  → optional persistent-origin request
  → one dedicated Web Worker loads one model
  → local retrieval builds bounded evidence
  → generation uses evidence only
  → source identifiers are checked
```

Selecting another model or pressing manual unload calls `engine.unload()` and terminates the worker. Cached weights remain on disk. There is deliberately no inactivity timer.

Model selection and answer mode are stored through `StoragePort`. `Экономный` and `Расширенный` use deterministic source and character limits instead of tokenizing every candidate document; WebLLM applies final context/output limits.

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

Browser history owns nested card traversal. Back moves through the chain; full Close returns to the recorded base page and removes forward card routes. Direct links and reload restore the route. Graph nodes use the same registry and route contract.

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

1. Extract the note editor and remaining Ask coordination from transitional app parts.
2. Add internal PDF assets and exact page/section anchors.
3. Add SQLite/FTS5 behind `SearchPort` and `StoragePort`.
4. Add a user-facing local pack-preparation workflow over the existing CLI contract.
5. Add safe cancellation and persisted transfer state where browser/runtime APIs support it.
6. Connect L-Note Core to MiniMed and require MiniMed retrieval, dose and safety benchmarks before migration.

Android and iOS remain deferred until the hosted web core is stable, while memory and storage decisions remain compatible with mid-range 8–12 GB devices.
