# L-Note implementation backlog

Single source of future work. Completed items describe the active branch.

**Current focus:** finish product functionality. Adaptive SQLite/FTS5 search, reviewed source discrepancies, confirmed-discrepancy answer evidence, local voice search, the persisted transfer queue, deterministic discrepancy review, mandatory OCR review, PDF/DOCX and SQLite preparation, relational pack interchange, mandatory review of LLM semantic proposals and distributable prebuilt search artifacts are implemented; next are an optional DuckDB bulk/remote bridge and chronology-aware discrepancy preparation. Android/iOS and live MiniMed integration remain deferred.

## Universal core and MiniMed

- [x] Keep L-Note domain-neutral; medicine is a demonstration domain.
- [x] Version contracts for packs, resources, notes, search, evidence and reviewed statement relations.
- [x] Add storage, sync/async search, domain-planner, local-model, speech-recognition and evidence-verifier ports.
- [x] Run the web shell through `KnowledgeApplicationAdapter`.
- [x] Keep the MiniMed compatibility boundary isolated while clinical parsing, ranking, dose validation, abstention and benchmarks remain MiniMed-owned.
- [x] Define dependency direction, file/function limits and extraction rules in `AGENTS.md`.
- [x] Add automated modular line-limit, dependency-boundary and safe-DOM checks.
- [x] Extract model, Ask, note and routed-resource workflows enough to keep new features modular.
- [x] Add adaptive MiniSearch / SQLite-FTS5 / IndexedDB-postings search behind the generic search boundary.
- [ ] Refactor remaining transitional shell only when required by a functional change.
- [ ] Add an optional vector adapter behind the same search boundary.
- [ ] Connect the core to MiniMed only after explicit approval and MiniMed retrieval, dose and safety gates.

## Search, routes and readers

- [x] Support exact, prefix, alias and fuzzy retrieval with deterministic fallback.
- [x] Keep search usable without an LLM and normalize relevance to `0–100%`.
- [x] Keep MiniMed query expansion behind `DomainQueryPlannerPort`.
- [x] Cover `грудничок свистит при дыхании` with a retrieval regression.
- [x] Use stable hash routes, nested browser history, Back and full-chain Close.
- [x] Add browser E2E for direct links, reload, modal scrolling and close-chain behavior.
- [x] Use one routed-resource registry for package, document, concept, statement and note routes.
- [x] Open the creator as the restorable routed card `#/package/new` from the existing Packages page.
- [x] Add internal PDF assets and exact document/section page anchors.
- [x] Use MiniSearch for small corpora and SQLite/FTS5 in a Dedicated Worker for large corpora.
- [x] Persist the SQLite database and FTS index through an IndexedDB VFS on static hosting.
- [x] Reuse an unchanged FTS index through corpus fingerprints and release it through graceful Worker/connection close.
- [x] Fall back to disk-backed IndexedDB postings when SQLite cannot initialize.
- [x] Cover real FTS5 build, exact search, fuzzy Russian search, close and persisted reopen in headless Chromium.
- [x] Place search suggestions directly below the input as a horizontal touch-scroll rail without a visible scrollbar.
- [ ] Tune the current 5,000-record / approximately 8 MiB threshold on representative mobile devices.
- [x] Import optional prebuilt SQLite search artifacts from large distributable packs.
- [ ] Add broader non-demo and large-corpus ranking regressions.
- [ ] Add an optional OPFS adapter for controlled hosting/native shells with suitable isolation headers.

## Source discrepancies and provenance

- [x] Add optional reviewed `statementRelations` to schema-v1 packages.
- [x] Support `supports`, `contradicts`, `refines`, `supersedes`, `equivalent` and `different_scope`.
- [x] Use pack-qualified runtime statement and document IDs (`pack-id::local-id`) for cross-pack routes.
- [x] Build a symmetric discrepancy index across enabled packs without rewriting source statements.
- [x] Place a centralized Phosphor warning marker after the exact disputed quote.
- [x] Group several comparisons under one marker when the same passage has multiple discrepancies.
- [x] Show every comparison with document title, pack title, date, exact quote and deterministic text diff.
- [x] Open either compared source through the ordinary routed document reader and browser history.
- [x] Keep the browser client neutral: never choose one source, infer obsolescence from date or remove another version.
- [x] Add a non-medical reviewed discrepancy to `lnote.guide` for browser and regression testing.
- [x] Compare a newly prepared pack with one or more existing prepared/exported pack files.
- [x] Detect candidate differences in normalized quantities, negation, linked values, shared subjects and apparent population/age scope.
- [x] Preserve exact quotes, document/pack titles and effective/publication dates in every review candidate.
- [x] Generate editable review JSON and a standalone offline HTML review page.
- [x] Require a human to accept, edit or dismiss every proposed statement relation before it enters the pack.
- [x] Keep unresolved and dismissed candidates outside `statementRelations`.
- [ ] Add date/edition chronology as an explicit candidate signal without inferring that newer automatically wins.
- [ ] Add optional local/server LLM classification into contradiction, refinement, supersession, equivalence, different scope or insufficient context.
- [ ] Allow a reviewed preparation workflow to designate a preferred/current statement while preserving all versions for the client.
- [x] Include relevant confirmed source discrepancies in the evidence envelope supplied to the local answer model.

## Voice search

- [x] Add a domain-neutral `SpeechRecognitionPort`.
- [x] Record browser audio, mix to mono and resample to 16 kHz.
- [x] Run multilingual Whisper Tiny/Base recognition in a Dedicated Worker.
- [x] Support Russian, English and automatic RU/EN selection.
- [x] Persist downloaded speech-model artifacts and allow manual unload.
- [x] Send the transcript through the ordinary text-search pipeline.
- [x] Support cancellation by terminating active speech inference.
- [x] Use compatible ONNX Community Whisper exports with a safe mixed-precision profile and full-precision fallback for session compatibility.
- [x] Show speech-model loading in the sidebar and keep technical runtime errors out of ordinary UI copy.
- [ ] Benchmark accuracy, latency and memory on Snapdragon 7-class devices.
- [ ] Consider VAD/streaming only after the push-to-record path is stable on target devices.

## UI and graph

- [x] Use SCSS, centralized themes, Phosphor and shared Text/Card/Button/Field/Switch/SourceCard primitives.
- [x] Keep Close on the right and `.dialog-body` as the only modal scroller.
- [x] Add package list/graph switching and routed graph nodes.
- [x] Support weighted category gradients and the mixed pediatric/dentistry example.
- [x] Add the one-time `Привет, коллега` note and routed note links.
- [x] Make the desktop sidebar collapsible, persist its state and show tooltips while collapsed.
- [x] Add a primary `Создать свой пакет` action to the existing Packages page.
- [x] Use Phosphor rather than emoji or text glyphs for source-discrepancy warnings.
- [x] Fix expanded sidebar label clipping and remove the sidebar status card.
- [x] Show compact pie progress indicators for language and speech model downloads in the relevant navigation items.
- [x] Keep model-control panels inside the Ask form on narrow devices.
- [x] Add list/graph switching inside concept relation accordions.
- [x] Keep note-form labels directly above their controls.
- [x] Add a compact global operations panel that appears only for active, interrupted, failed or cancelled work.
- [ ] Finish interaction-state, click-target and legacy-glyph auditing.
- [ ] Let the local model propose note links with explicit user review.

## Local models and evidence

- [x] Use built-in WebLLM `Qwen3 1.7B`, `Qwen3 4B` and `Phi-4 Mini` q4f16 profiles.
- [x] Keep Qwen3 1.7B as the 8 GB default and Qwen3 4B as the 12 GB quality profile.
- [x] Retain Phi-4 Mini as a mathematics/formal-reasoning comparison.
- [x] Run inference in a Dedicated Worker.
- [x] Keep exactly one active model; unload and terminate the previous Worker on user-selected model change.
- [x] Do not use an inactivity timer.
- [x] Keep downloaded weights in the WebLLM browser cache.
- [x] Distinguish `not downloaded`, `downloaded/off` and `loaded/on`.
- [x] Add explicit manual unload without deleting cached weights.
- [x] Persist selected model and answer mode through `StoragePort`.
- [x] Allow model download before entering a question.
- [x] Add `Экономный` and `Расширенный` evidence modes.
- [x] Show progress, estimated bytes, speed, errors and retry.
- [x] Check statement support in addition to citation-ID existence, including terms, numbers and negation mismatches.
- [x] Add a model-load cancellation primitive that terminates the loading Worker.
- [x] Expose consistent Cancel/Continue/Retry controls for model and speech-model loading through the shared queue.
- [ ] Benchmark representative Snapdragon 7-class 8 GB and 12 GB devices before selecting a mobile default.
- [ ] Consider a small local entailment verifier after measuring the deterministic lexical verifier.

## Transfers

- [x] Add a persisted transfer-queue service with status, progress, priorities, deduplication and up to four active tasks.
- [x] Add AbortSignal-based cancellation and retry primitives.
- [x] Add a streaming package-download handler with checksum validation.
- [x] Add queue state and concurrency tests.
- [x] Route every package, model and speech-model download through the same queue.
- [x] Finish the user-facing queue panel and restore/resume policy for interrupted heavy downloads.
- [x] Resume package downloads automatically after reload and require explicit continuation for model loads.
- [x] Keep only one active inference model even while several ordinary files may download concurrently.

## Universal pack preparation

- [x] Build reviewed JSON or Markdown/TXT/JSON into portable packs with provenance through the desktop/server CLI.
- [x] Support optional local OpenAI-compatible or Replicate proposal collection in the strong-device workflow.
- [x] Build and validate the deterministic source-preserving pack before requesting any LLM proposal.
- [x] Store proposed concepts, aliases, statements and entity relations in a separate review artifact.
- [x] Generate safe editable JSON and standalone offline HTML review pages for semantic proposals.
- [x] Require exact evidence quotes and block invalid proposed statements from acceptance.
- [x] Apply only eligible semantic candidates explicitly marked `decision: accept`.
- [x] Keep pending and dismissed semantic proposals outside the final pack.
- [x] Preserve proposal provider, reviewer and review-time provenance on accepted records.
- [x] Allow heavy preparation on a stronger desktop/server for weaker offline clients.
- [x] Add a browser-local creator reachable from the existing Packages page.
- [x] Accept multiple Markdown/TXT/JSON files or pasted Markdown text without uploading them.
- [x] Preserve document titles, headings and source text; split large sections and discover common abbreviation patterns.
- [x] Preview package statistics, download the JSON or install it immediately through the existing pack storage path.
- [x] Validate ready-made pack JSON and enforce 32 MiB per file / 64 MiB total browser limits.
- [x] Compare prepared statements with existing pack files and review proposed source discrepancies before export.
- [x] Extract PDF text page-by-page and preserve exact `assetAnchor.page` references.
- [x] OCR only PDF pages without a usable text layer through an optional Tesseract hook.
- [x] Extract DOCX headings and paragraph groups with paragraph start/end provenance.
- [x] Copy original PDF/DOCX files into the prepared assets directory and compile the result through the existing pack builder.
- [x] Bound external-tool runtime and output size and report extraction warnings instead of inventing missing text.
- [x] Require accept/edit/dismiss review for OCR output before publication.
- [x] Add direct SQLite table/view import and relational pack export/restore adapters.
- [ ] Add an optional DuckDB bridge for Parquet/CSV and remote database scanners.
- [x] Add optional prebuilt SQLite/FTS artifacts to large packs.
- [ ] Keep heavy preparation jobs and intermediate corpora on disk rather than in application RAM.

## Documentation

- [x] Keep setup and product use in `README.md`.
- [x] Keep current architecture and invariants in `docs/ARCHITECTURE.md`.
- [x] Document the portable package and preparation-review formats in `docs/PACK_FORMAT.md`.
- [x] Document database import/export and external-system boundaries.
- [x] Document the mandatory OCR review workflow and source-change protection.
- [x] Keep this file as the only implementation backlog.
- [x] Keep development, decomposition and user-facing copy rules in `AGENTS.md`.
- [x] Update docs together with behavior changes.
- [ ] Use LLM Wiki only as an optional generated navigation layer.
