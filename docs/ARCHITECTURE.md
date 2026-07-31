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
- a persisted collapsible desktop sidebar;
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
src/integrations/  isolated product boundaries such as MiniMed compatibility
```

`src/app-parts/` is temporary composition and wiring. New business logic does not belong there. Decreasing file budgets are enforced for every transitional fragment touched during extraction.

The model and Ask slices are split into:

```text
src/helpers/model-formatters.js
src/services/model-lifecycle.js
src/services/model-preferences.js
src/services/local-model-loader.js
src/services/evidence-query.js
src/services/ask-workflow.js
src/pages/model-lab-elements.js
src/pages/model-lab-view.js
src/pages/ask-page-controller.js
src/pages/evidence-view.js
src/pages/local-answer-view.js
```

`ask-workflow` decides whether an action loads a model, requests a question, collects evidence or generates an answer. It has no DOM access. `ask-page-controller` owns form/status/button behavior and receives lifecycle callbacks from the shell.

Notes are split into:

```text
src/services/note-workflow.js
src/pages/note-resource-view.js
src/pages/notes-list-view.js
```

The service normalizes saved and imported records. The routed editor resolves statements and concept links through accessors supplied by the shell. The list renderer owns note cards and timestamps.

Routed knowledge resources use one registry and separate renderers/controllers:

```text
src/pages/routed-resource-renderer.js
src/pages/package-resource-view.js
src/pages/document-resource-view.js
src/pages/concept-resource-view.js
src/pages/statement-resource-view.js
src/pages/note-resource-view.js
```

The registry owns dispatch and missing-resource handling. The shared routed-dialog controller owns lifecycle, Back/Close availability and heading/body surfaces. Resource renderers only resolve data and construct content.

The desktop shell uses `src/pages/sidebar-controller.js`. It prepares accessible labels, persists the collapsed state through `StoragePort` and exposes CSS tooltips without adding sidebar state to routing.

The legacy local DOM builder and resource-type switch were removed from the shell. Modular rendering uses `src/ui/dom.js`, which inserts text and nodes rather than raw HTML.

`npm run check:structure` enforces:

- a 300-line hard limit for modular source;
- selected dependency boundaries;
- no raw `innerHTML` assignment in modular source;
- decreasing budgets for touched transitional files.

Detailed rules and preferred 200-line/30-line targets live in `AGENTS.md`.

## L-Note Core and MiniMed

L-Note remains the domain-neutral runtime. A compatibility boundary exists, but connecting the active L-Note core to the MiniMed application is intentionally deferred until explicit approval. Current work must not migrate MiniMed behavior or data into L-Note.

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

MiniMed retains ownership of:

```text
medical query parsing and negation
clinical intent and section ranking
medical aliases and taxonomy
dose/regimen validation
clinical abstention and safety gates
medical benchmark suites and source policy
```

Any future connection must first satisfy MiniMed-owned retrieval, dose and safety benchmarks. The compatibility adapter must not be treated as a completed product integration.

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
SQLite + FTS5            planned large-pack implementation
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

1. Continue reducing the remaining transitional catalog/search/runtime shell.
2. Add internal PDF assets and exact page/section anchors.
3. Add SQLite/FTS5 behind `SearchPort` and `StoragePort`.
4. Add a user-facing local pack-preparation workflow over the existing CLI contract.
5. Add safe cancellation and persisted transfer state where browser/runtime APIs support it.
6. Continue interaction-state and click-target auditing.

Live MiniMed integration is excluded from this sequence. Android and iOS remain deferred until the hosted web core is stable, while memory and storage decisions remain compatible with mid-range 8–12 GB devices.
