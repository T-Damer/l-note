# L-Note implementation backlog

Single source of future work. Completed items describe the active branch.

**Current focus:** finish product functionality. Adaptive SQLite/FTS5 search is now implemented; next are reviewed LLM-assisted pack enrichment, stronger-device PDF/DOCX preparation, distributable prebuilt database artifacts and complete transfer-queue wiring. Android/iOS and live MiniMed integration remain deferred.

## Universal core and MiniMed

- [x] Keep L-Note domain-neutral; medicine is a demonstration domain.
- [x] Version contracts for packs, resources, notes, search and evidence.
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
- [ ] Tune the current 5,000-record / approximately 8 MiB threshold on representative mobile devices.
- [ ] Import optional prebuilt SQLite search artifacts from large distributable packs.
- [ ] Add broader non-demo and large-corpus ranking regressions.
- [ ] Add an optional OPFS adapter for controlled hosting/native shells with suitable isolation headers.

## Voice search

- [x] Add a domain-neutral `SpeechRecognitionPort`.
- [x] Record browser audio, mix to mono and resample to 16 kHz.
- [x] Run multilingual Whisper Tiny/Base recognition in a Dedicated Worker.
- [x] Support Russian, English and automatic RU/EN selection.
- [x] Persist downloaded speech-model artifacts and allow manual unload.
- [x] Send the transcript through the ordinary text-search pipeline.
- [x] Support cancellation by terminating active speech inference.
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
- [ ] Expose consistent Cancel/Resume controls for every long-running model operation.
- [ ] Benchmark representative Snapdragon 7-class 8 GB and 12 GB devices before selecting a mobile default.
- [ ] Consider a small local entailment verifier after measuring the deterministic lexical verifier.

## Transfers

- [x] Add a persisted transfer-queue service with status, progress, priorities, deduplication and up to four active tasks.
- [x] Add AbortSignal-based cancellation and retry primitives.
- [x] Add a streaming package-download handler with checksum validation.
- [x] Add queue state and concurrency tests.
- [ ] Route every package, model and speech-model download through the same queue.
- [ ] Finish the user-facing queue panel and restore/resume policy for interrupted heavy downloads.
- [ ] Keep only one active inference model even while multiple files may download concurrently.

## Universal pack preparation

- [x] Build reviewed JSON or Markdown/TXT/JSON into portable packs with provenance through the desktop/server CLI.
- [x] Allow optional local OpenAI-compatible or Replicate extraction proposals in the heavy preparation workflow.
- [x] Require exact evidence quotes before proposed statements enter a pack.
- [x] Allow heavy preparation on a stronger desktop/server for weaker offline clients.
- [x] Add a browser-local creator reachable from the existing Packages page.
- [x] Accept multiple Markdown/TXT/JSON files or pasted Markdown text without uploading them.
- [x] Preserve document titles, headings and source text; split large sections and discover common abbreviation patterns.
- [x] Preview package statistics, download the JSON or install it immediately through the existing pack storage path.
- [x] Validate ready-made pack JSON and enforce 32 MiB per file / 64 MiB total browser limits.
- [ ] Add PDF/DOCX parsing, reviewed OCR and database exporters on a stronger device/server.
- [ ] Add optional prebuilt SQLite/FTS artifacts to large packs.
- [ ] Let the user choose deterministic-only or LLM-assisted enrichment in the creator.
- [ ] Review, accept, edit or remove proposed concepts, statements, aliases and relations before export.
- [ ] Keep heavy preparation jobs and intermediate corpora on disk rather than in application RAM.

## Documentation

- [x] Keep setup and product use in `README.md`.
- [x] Keep current architecture and invariants in `docs/ARCHITECTURE.md`.
- [x] Keep this file as the only implementation backlog.
- [x] Keep development and decomposition rules in `AGENTS.md`.
- [x] Update docs together with behavior changes.
- [ ] Use LLM Wiki only as an optional generated navigation layer.
