# Architecture

## Current state

L-Note is a hosted offline-first knowledge workspace with:

- independently installable knowledge packs in IndexedDB;
- adaptive MiniSearch / SQLite-FTS5 / IndexedDB-postings retrieval;
- hash-routed packages, documents, concepts, statements, notes and package creation;
- list and graph views over the same resources;
- internal PDF viewing with exact page anchors;
- reviewed cross-document discrepancies with source dates and deterministic diffs;
- browser-local Markdown/TXT/JSON package creation;
- local RU/EN voice search;
- optional local WebLLM answers over bounded evidence;
- deterministic citation and statement-support verification;
- a persisted transfer queue shared by packages, language models and speech models;
- a collapsible desktop sidebar and a static PWA build.

A routed dialog has exactly one vertical scroll container: `.dialog-body`.

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
src/core/          serializable domain-neutral contracts and ports
src/adapters/      browser storage, search, model and speech implementations
src/services/      workflows, queues and state transitions
src/pages/         page and routed-resource rendering/controllers
src/ui/            reusable controls, typography, dialogs and graphs
src/helpers/       deterministic parsing, matching and formatting
src/workers/       SQLite, fallback search, speech and WebLLM runtimes
src/integrations/  isolated external-product boundaries
```

`src/app-parts/` is composition-only transitional code. New behavior belongs in the layers above and is wired from a small app-part.

## Public application boundary

The web shell is composed through replaceable ports:

```text
StoragePort
SearchPort / AsyncSearchPort
DomainQueryPlannerPort
LocalModelPort
SpeechRecognitionPort
EvidenceVerifierPort
```

The generic core contains no DOM, IndexedDB, SQL, WebGPU, speech-runtime or medical-policy assumptions.

## Adaptive search

```text
small corpus
  → MiniSearch in JavaScript memory

large corpus
  → SQLite + FTS5
  → Dedicated Worker
  → IndexedDB virtual filesystem

SQLite unavailable
  → IndexedDB postings Worker

all disk adapters unavailable
  → deterministic in-memory fallback
```

The initial large-corpus threshold is 5,000 search records or approximately 8 MiB of indexable text. It remains a benchmark target rather than a permanent device limit.

FTS5 stores weighted title, document, alias, entity, tag and body fields. It supplies BM25 candidates and a vocabulary for bounded typo correction. The application then converts results into the common `SearchResult` contract and integer `0–100%` relative relevance.

A corpus fingerprint allows an unchanged database to reopen without rebuilding. When disk search is active, the page drops the large flattened record array and retains only knowledge metadata and bounded result/evidence working sets.

The SQLite connection belongs to one Dedicated Worker. Commands are serialized, and close is awaited before a fallback backend or replacement Worker is opened.

## Retrieval and evidence

```text
query
  → Unicode and ё/е normalization
  → aliases and optional domain planning
  → memory or disk candidate retrieval
  → exact/prefix/fuzzy ranking
  → source, statement, concept and note resolution
  → bounded evidence envelope
  → optional local generation
  → citation-ID and statement-support verification
```

The verifier checks citation existence, meaningful term support, numbers and negation mismatches. It is conservative and replaceable; it is not a clinical inference model.

## Source discrepancies

Prepared packs may contain reviewed `statementRelations`:

```text
supports
contradicts
refines
supersedes
equivalent
different_scope
```

Cross-pack references use qualified runtime IDs:

```text
pack-id::claim-id
pack-id::document-id
```

The browser builds a symmetric discrepancy index, places one Phosphor marker after the exact disputed passage and groups all linked comparisons under it. Each comparison retains both quotes, document and pack titles, dates, relation type, review provenance and a deterministic token diff.

The client never chooses a winning source, infers obsolescence from date or removes another version. Candidate detection, classification and any preferred/current designation belong to a stronger preparation workflow with human review.

## Worker roles

```text
service-worker.js
  offline shell and runtime-asset delivery only

sqlite-search-worker.js
  serialized SQLite/FTS5 connection

search-worker.js
  IndexedDB-postings fallback

speech-worker.js
  local multilingual speech recognition

webllm-worker.js
  one active local language model
```

The Service Worker does not own database connections, mutable search state or the transfer queue.

## Models and speech

The local language-model profiles target devices with approximately 8–12 GB shared memory. Only one language model may be active. Selecting another profile unloads the previous engine; cached weights remain on disk.

`SpeechRecognitionPort` is independent from the language model. Browser audio is mixed to mono, resampled to 16 kHz and processed by multilingual Whisper Tiny/Base. The transcript enters the ordinary text-search path.

## Persisted transfers

All long browser downloads now use one `TransferQueue` persisted through `StoragePort`:

```text
package download
language-model load
speech-model load
        ↓
TransferQueue
        ↓
queued / active / interrupted / completed / failed / cancelled
```

The queue provides:

- up to four ordinary active operations;
- priority ordering and active-resource deduplication;
- serializable progress, bytes, attempts and messages;
- cancellation through `AbortSignal` or Worker termination;
- retry/removal controls;
- automatic package-download restart after reload;
- explicit manual continuation for interrupted model loads;
- a compact global panel shown only while attention is needed.

Model handlers still enforce the separate invariant that only one inference model is active, even when ordinary package files download in parallel. Low-level failures are logged for diagnostics, while the panel stores short user-facing messages.

## Routing, readers and graphs

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

The package creator uses `#/package/new`. Browser history owns nested card traversal. Back moves through the chain; full Close returns to the recorded base page. Graph nodes use the same route registry.

A document may reference an internal asset plus document/section page anchors. Cross-pack comparison links use qualified document IDs but otherwise follow the same reader contract.

## Preparation and distribution

Light browser path:

```text
Markdown / TXT / JSON / pasted text
  → deterministic parsing and sectioning
  → abbreviation discovery
  → validation and preview
  → JSON download or immediate installation
```

Strong-device path:

```text
PDF / DOCX / databases / notes
  → deterministic extraction and provenance
  → OCR only where text is absent
  → chunks, aliases, concepts and source-linked statements
  → compare against existing prepared claims
  → numeric, unit, negation, date and scope checks
  → optional LLM proposals
  → mandatory human review
  → optional prebuilt SQLite/FTS artifacts
  → installable pack
```

Model output may propose structure but never silently replace source text or resolve a source disagreement.

## L-Note and MiniMed

L-Note remains domain-neutral. It owns portable contracts, pack composition, generic storage/search/model/speech ports, graph projection, personal overlays, routing and evidence orchestration.

MiniMed retains medical query parsing, clinical ranking, source policy, dose/regimen validation, abstention and safety benchmarks. The compatibility surface exists, but the active L-Note core is not connected to the MiniMed application.

## Next ordered work

1. Add deterministic strong-device discrepancy candidate detection against an existing prepared corpus.
2. Add review UI for accepting, editing or dismissing proposed concepts, statements and relations.
3. Add optional local/server LLM classification after deterministic candidate retrieval.
4. Add PDF/DOCX extraction, OCR and database exporters.
5. Package optional prebuilt SQLite/FTS artifacts for large packs.
6. Benchmark search, speech and models on representative Snapdragon 7-class devices.
7. Consider OPFS and vector adapters after the current baseline is measured.

Live MiniMed integration and native Android/iOS packaging remain deferred.
