# Architecture

## Current state

L-Note is a hosted, offline-first knowledge workspace with:

- checksummed installable packs stored in IndexedDB;
- adaptive local search through MiniSearch, SQLite/FTS5 or IndexedDB postings;
- optional domain query planners outside the generic search engine;
- hash-routed packages, documents, concepts, statements, notes and package creation;
- source-linked statements, relations, backlinks and personal-note overlays;
- reviewed cross-document discrepancies with inline Phosphor markers and source diffs;
- list and graph views over the same resources;
- internal PDF viewing with document/section page anchors;
- a browser-local creator for Markdown/TXT/JSON sources and pasted text;
- browser-local RU/EN voice search;
- optional browser-local WebLLM over a bounded evidence envelope;
- deterministic statement-to-evidence support verification;
- one active language model in a Dedicated Worker;
- persistent language/speech model weights in browser caches;
- a persisted transfer-queue foundation;
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
src/adapters/      concrete search, storage and model/speech implementations
src/services/      use-case workflows and pure state transitions
src/pages/         page and routed-resource construction/rendering
src/ui/            reusable typography, controls, dialogs, graph and safe DOM helpers
src/helpers/       stateless parsing, formatting, matching and mapping
src/workers/       isolated SQLite, fallback search, speech and WebLLM runtimes
src/integrations/  isolated product boundaries such as MiniMed compatibility
```

`src/app-parts/` is temporary composition and wiring. New business logic does not belong there. Refactoring is performed only where required to deliver a feature safely.

`npm run check:structure` enforces modular file limits, selected dependency boundaries, safe DOM insertion and decreasing budgets for touched transitional files. Detailed rules live in `AGENTS.md`.

## Public application boundary

The core exposes replaceable ports rather than browser implementations:

```text
StoragePort
SearchPort / AsyncSearchPort
DomainQueryPlannerPort
LocalModelPort
SpeechRecognitionPort
EvidenceVerifierPort
```

`KnowledgeApplicationAdapter` composes the hosted application without putting DOM, IndexedDB, SQLite, WebLLM or speech runtime assumptions into `src/core/`.

## Adaptive storage and retrieval

The current decision tree is:

```text
small corpus
  → MiniSearch
  → full index in JavaScript memory

large corpus
  → SQLite + FTS5
  → Dedicated Worker
  → IndexedDB virtual filesystem

SQLite initialization/build failure
  → custom IndexedDB postings Worker

all disk adapters unavailable
  → deterministic in-memory fallback
```

A corpus is currently considered large when it has at least 5,000 search records or approximately 8 MiB of indexable text. These values are configuration defaults, not permanent device limits.

### SQLite/FTS5 path

The production large-corpus path consists of:

```text
createAdaptiveSearchPort
  → SqliteFtsSearchPort
  → sqlite-search-worker.js
  → SqliteFtsRuntime
  → SQLite 3.53.x / FTS5
  → IDBBatchAtomicVFS
  → IndexedDB
```

The FTS table stores the complete serialized search record as an unindexed payload plus weighted searchable fields:

```text
title            4.5
document title   3.5
body             1.0
aliases           5.0
entity names      4.5
tags              1.4
```

FTS5 provides BM25 candidate retrieval and prefix indexes. The `fts5vocab` table supplies bounded typo candidates, which are filtered with the existing Damerau-Levenshtein logic before a second query. Results are converted back into the common `SearchResult` shape and normalized to `0–100%` relative relevance.

A corpus fingerprint is stored with the index. If the enabled pack versions and note state are unchanged, the next Worker reuses the existing database instead of rebuilding it. When the disk adapter is active, the headless runtime drops its large flattened record array after the Worker build; the page retains only the knowledge metadata and active result/evidence working set.

All SQL commands on a connection are serialized. Statistics queries are sequential, and adapter cleanup waits for SQLite to close before terminating the Worker or trying a fallback backend. This is required by an asynchronous IndexedDB VFS.

The real browser smoke test verifies:

1. FTS5 schema creation;
2. exact Russian retrieval;
3. typo correction;
4. suggestions;
5. graceful Worker/connection close;
6. opening a second Worker;
7. reusing and querying the persisted FTS index.

The hosted GitHub Pages build uses IndexedDB VFS because the official SQLite OPFS path requires response isolation headers unavailable on that host. A future controlled host or native shell may provide an OPFS adapter without changing the search contract.

### Retrieval pipeline

1. Normalize Unicode, Russian `ё/е`, punctuation and whitespace.
2. Expand declared names and aliases.
3. Apply optional domain planners.
4. Select memory or disk search from corpus size/capabilities.
5. Retrieve exact, weighted prefix and fuzzy candidates.
6. Normalize displayed relevance to `0–100%`; it is not diagnostic probability.
7. Resolve results to sources, statements, concepts and notes.
8. Build a bounded, versioned evidence envelope.
9. Optionally synthesize through a local model.
10. Verify citation IDs and statement support against cited fragments.

Every reported ranking failure becomes a regression test. Domain vocabulary belongs in a plugin or pack.

## Reviewed source discrepancies

A discrepancy is not inferred from raw document text at display time. A strong-device preparation workflow creates a reviewed relation between two source statements and stores it in optional package-level `statementRelations`.

```text
statement relation
  sourceClaimId
  targetClaimId
  type
  status
  reason
  detectedBy
  confidence
```

Supported relation types are:

```text
supports
contradicts
refines
supersedes
equivalent
different_scope
```

`different_scope` is deliberately separate from `contradicts`: different populations, jurisdictions, formulations, dates or other conditions may explain an apparent mismatch. `supersedes` is accepted only as an explicit preparation/review decision; the client does not infer obsolescence from publication dates.

Claim IDs and document IDs are local to a pack. Cross-pack routes and relations use qualified runtime IDs:

```text
pack-id::claim-id
pack-id::document-id
```

This prevents equal local IDs from different packages from overwriting one another and ensures that a comparison opens the exact document version.

At runtime:

```text
enabled packs
  → symmetric statement-discrepancy index
  → exact source-quote position in each section
  → one Phosphor warning marker per disputed passage
  → one disclosure containing all comparisons attached to that passage
```

The disclosure shows:

- every linked source statement rather than one selected answer;
- document and pack titles;
- `effectiveFrom`, source publication date or pack publication date;
- the exact evidence quote from each side;
- a deterministic token-level diff;
- relation status, reason and preparation provenance;
- routed actions for opening either complete document.

The browser client is neutral. It never selects a winning source, rewrites a source statement, hides a newer or older version, or converts a conflict into a scope difference. It displays only reviewed relations and silently leaves unresolved external references unavailable until their packages are installed.

A future strong-device preparation stage will retrieve similar existing claims, compare numbers, units, negation, dates and shared entities, optionally ask a local/server LLM to classify the candidate, and require a user/domain reviewer to accept, edit or dismiss it. Selecting a preferred/current statement is also a preparation decision, not a browser-side inference.

## Worker roles

```text
service-worker.js
  application shell, local assets and runtime-cache delivery only

sqlite-search-worker.js
  one serialized SQLite/FTS5 connection over IndexedDB VFS

search-worker.js
  custom IndexedDB-postings fallback

speech-worker.js
  local multilingual ASR

webllm-worker.js
  one active local language model
```

The Service Worker does not own a database connection or search state. Browsers may terminate it at any time; persistent search belongs in a Dedicated Worker and IndexedDB/SQLite.

## Local speech boundary

`SpeechRecognitionPort` is domain-neutral. The hosted adapter records microphone audio, mixes channels, resamples to 16 kHz and sends a `Float32Array` to a Dedicated Worker. The current profiles are multilingual Whisper Tiny and Base with Russian, English or automatic RU/EN selection.

Downloaded artifacts stay in the Transformers.js browser cache. The active speech model can be cancelled/unloaded independently from the language model. A transcript is only another input to the normal query pipeline; speech recognition does not implement its own search rules.

## Local language-model and evidence boundary

The target class is a mid-range device with approximately 8–12 GB shared memory and no assumption of a strong discrete GPU.

```text
Qwen3 1.7B q4f16_1   default for 8 GB
Qwen3 4B q4f16_1     quality profile for 12 GB
Phi-4 Mini q4f16_1   mathematics/formal-reasoning comparison
```

Lifecycle:

```text
browser-cache inspection
  → not downloaded / downloaded-off / loaded-on
  → optional persistent-origin request
  → one Dedicated Worker loads one model
  → retrieval builds bounded evidence
  → generation uses evidence only
  → citation IDs and statement support are checked
```

Selecting another model or pressing manual unload calls `engine.unload()` and terminates the Worker. Cached weights remain on disk. There is deliberately no inactivity timer.

The deterministic evidence verifier splits output into statements and checks citations, content-term overlap, numeric values and negation mismatches. It is conservative and replaceable through `EvidenceVerifierPort`; it is not a clinical NLI model.

Confirmed source discrepancies are currently rendered in readers but are not yet injected into every generated-answer evidence envelope. That is a separate TODO so model prompts do not silently gain unresolved or irrelevant comparisons.

## Routing, readers and graph

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

The package creator uses `#/package/new?from=library&depth=1`. Browser history owns nested card traversal. Back moves through the chain; full Close returns to the recorded base page and removes forward card routes. Direct links and reload restore the route. Graph nodes use the same registry and route contract.

A document may reference a local asset and section page anchors. The routed document reader displays the PDF in the same modal and changes the page fragment when a source-linked section is opened. Cross-pack comparison links use qualified document IDs but otherwise follow the same hash-routing contract.

## Preparation and distribution

Lightweight on-device path:

```text
Markdown / TXT / JSON / pasted text
  → local parsing and deterministic sectioning
  → abbreviation discovery
  → schema and reference validation
  → preview
  → download JSON or install through StoragePort
```

Heavy desktop/server path:

```text
raw files / PDF / DOCX / database export / notes
  → deterministic extraction and provenance
  → OCR only where a text layer is absent
  → chunks, aliases, concepts and source-linked statements
  → retrieve candidate statements from existing prepared packs
  → numeric, unit, negation, date and scope checks
  → optional strong local/server LLM proposals and discrepancy classification
  → exact-quote and referential validation
  → human review of concepts, statements, relations and discrepancies
  → optional preferred/current statement designation
  → optional prebuilt SQLite/search artifacts
  → installable L-Note pack
```

Model output may propose structure but never silently replace source text or resolve a source disagreement without review.

## Transfers

`TransferQueue` persists task state through `StoragePort`, limits active operations to four, supports priorities, progress, deduplication, `AbortSignal` cancellation and retry. The package streaming handler validates SHA-256 before installation.

The remaining product work is to route every package/model/speech download through this queue and finish the visible restore/resume controls. Exactly one inference model remains active even when several files download concurrently.

## L-Note Core and MiniMed

L-Note remains the domain-neutral runtime. The compatibility boundary exists, but the active core is not connected to the MiniMed application in this PR.

L-Note owns:

```text
portable contracts and stable IDs
pack preparation, installation and composition
storage/search/model/speech ports
generic concepts, statements, entity relations and reviewed source discrepancies
personal overlay
versioned evidence collection and verification boundary
hash routing and knowledge-graph projection
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

Any future connection requires separate approval and MiniMed-owned retrieval, dose and safety benchmarks. The compatibility adapter is not a completed product integration.

## Next ordered work

1. Add strong-device candidate detection and human review for source discrepancies.
2. Add reviewed, optional LLM-assisted enrichment to the package creator/preparer.
3. Add PDF/DOCX extraction, OCR and database exporters on a stronger device/server.
4. Package optional prebuilt SQLite/FTS artifacts for large distributable packs.
5. Complete transfer-queue wiring and restore/resume UI.
6. Benchmark search, speech and models on Snapdragon 7-class 8 GB and 12 GB devices.
7. Consider OPFS and vector adapters after the IndexedDB/FTS baseline is measured.
8. Refactor transitional shell only when one of these features requires it.

Live MiniMed integration is excluded from this sequence. Android and iOS remain deferred until the hosted web core is stable.
