# L-Note implementation backlog

Single source of future work. Completed items describe the active branch.

**Current focus:** continue shrinking transitional `app-parts`. Next are package/note page extraction, local PDF assets, SQLite/FTS5 and a user-facing pack preparer. Android/iOS remain deferred.

## Universal core and MiniMed

- [x] Keep L-Note domain-neutral; medicine is a demonstration domain.
- [x] Version contracts for packs, resources, notes, search and evidence.
- [x] Add storage, search, domain-planner, local-model and evidence-verifier ports.
- [x] Run the web shell through `KnowledgeApplicationAdapter`.
- [x] Add a MiniMed compatibility adapter while keeping clinical parsing, ranking, dose validation, abstention and benchmarks in MiniMed.
- [x] Define dependency direction, file/function limits and extraction rules in `AGENTS.md`.
- [x] Add automated modular line-limit, dependency-boundary and safe-DOM checks.
- [x] Extract model formatting, lifecycle and preferences into `helpers` and `services`.
- [x] Extract model-page construction and rendering into `src/pages/`.
- [x] Extract persistent-storage/model-load orchestration into a service.
- [x] Extract evidence retrieval, evidence rendering and generated-answer rendering.
- [x] Remove the shell-local DOM builder in favor of `src/ui/dom.js`.
- [ ] Extract package, note and remaining Ask coordination from transitional app parts.
- [ ] Split the remaining transitional shell into pages, services, helpers and components.
- [ ] Add SQLite/FTS5 for large packs without moving medical policy into L-Note.
- [ ] Add an optional vector adapter behind the same search boundary.
- [ ] Require MiniMed retrieval, dose and safety benchmarks before migration.

## Search, routes and readers

- [x] Support exact, prefix, alias and fuzzy retrieval with deterministic fallback.
- [x] Keep search usable without an LLM and normalize relevance to `0–100%`.
- [x] Keep MiniMed query expansion behind `DomainQueryPlannerPort`.
- [x] Cover `грудничок свистит при дыхании` with a retrieval regression.
- [x] Use stable hash routes, nested browser history, Back and full-chain Close.
- [x] Add browser E2E for direct links, reload, modal scrolling and close-chain behavior.
- [x] Use one routed-resource registry for package, document, concept, statement and note routes.
- [x] Extract document, concept and statement content into separate page renderers.
- [x] Remove the legacy resource-type switch and obsolete `02b.js` renderer fragment.
- [ ] Add broader non-demo and large-corpus retrieval regressions.
- [ ] Extract package and note renderers fully into the routed-resource layer.
- [ ] Add internal PDF assets with exact page/section anchors.

## UI and graph

- [x] Use SCSS, centralized themes, Phosphor and shared Text/Card/Button/Field/Switch/SourceCard primitives.
- [x] Keep Close on the right and `.dialog-body` as the only modal scroller.
- [x] Add package list/graph switching and routed graph nodes.
- [x] Support weighted category gradients and the mixed pediatric/dentistry example.
- [x] Add the one-time `Привет, коллега` note and routed note links.
- [x] Add a safe reusable DOM element helper without raw HTML insertion.
- [x] Centralize the external-source Phosphor icon.
- [ ] Finish interaction-state, click-target and legacy-glyph auditing.
- [ ] Make the desktop sidebar collapsible with tooltips.
- [ ] Let the local model propose note links with explicit user review.

## Local models

- [x] Use built-in WebLLM `Qwen3 1.7B`, `Qwen3 4B` and `Phi-4 Mini` q4f16 profiles.
- [x] Keep Qwen3 1.7B as the 8 GB default and Qwen3 4B as the 12 GB quality profile.
- [x] Retain Phi-4 Mini as a mathematics/formal-reasoning comparison.
- [x] Run inference in a dedicated Web Worker.
- [x] Keep exactly one active model; unload and terminate the previous worker on user-selected model change.
- [x] Do not use an inactivity timer.
- [x] Keep downloaded weights in the WebLLM browser cache.
- [x] Request persistent origin storage before a large model download without blocking on denial.
- [x] Distinguish `not downloaded`, `downloaded/off` and `loaded/on` through WebLLM cache inspection.
- [x] Add explicit manual unload without deleting cached weights.
- [x] Persist selected model and answer mode through `StoragePort`.
- [x] Display persistent weight size separately from active runtime memory.
- [x] Allow model download before entering a question.
- [x] Add `Экономный` and `Расширенный` modes using deterministic source/character limits.
- [x] Show progress, estimated bytes, speed, errors and retry.
- [ ] Add safe cancellation when supported by the runtime.
- [ ] Persist a download queue with up to four model/document transfers; still allow only one active inference model.
- [ ] Improve validation from citation-ID existence to statement-to-evidence support.
- [ ] Benchmark representative Snapdragon 7-class 8 GB and 12 GB devices before selecting a mobile default.

## Universal pack preparation

- [x] Build reviewed JSON or Markdown/TXT/JSON into portable packs with provenance.
- [x] Allow optional local OpenAI-compatible or Replicate extraction proposals.
- [x] Require exact evidence quotes before proposed statements enter a pack.
- [x] Allow heavy preparation on a stronger desktop/server for weaker offline clients.
- [ ] Add PDF/DOCX parsing, reviewed OCR and database exporters.
- [ ] Add optional prebuilt FTS/search artifacts to large packs.
- [ ] Add a user-facing local preparation page for selecting files and exporting an installable pack.
- [ ] Let the user choose deterministic-only or LLM-assisted preparation.
- [ ] Review proposed concepts, statements, aliases and relations before export.
- [ ] Keep preparation jobs and intermediate corpora on disk rather than in application RAM.

## Documentation

- [x] Keep setup and product use in `README.md`.
- [x] Keep current architecture and invariants in `docs/ARCHITECTURE.md`.
- [x] Keep this file as the only implementation backlog.
- [x] Keep development and decomposition rules in `AGENTS.md`.
- [x] Update docs together with behavior changes.
- [ ] Use LLM Wiki only as an optional generated navigation layer.
