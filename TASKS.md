# L-Note implementation backlog

Single source of future work. Completed items describe the active branch.

**Current focus:** finish user-facing functionality rather than continue broad refactoring. Next are local PDF/document assets, SQLite/FTS5 for large packs, reviewed LLM-assisted pack enrichment and reliable transfer state. Android/iOS and live MiniMed integration remain deferred.

## Universal core and MiniMed

- [x] Keep L-Note domain-neutral; medicine is a demonstration domain.
- [x] Version contracts for packs, resources, notes, search and evidence.
- [x] Add storage, search, domain-planner, local-model and evidence-verifier ports.
- [x] Run the web shell through `KnowledgeApplicationAdapter`.
- [x] Keep the MiniMed compatibility boundary isolated while clinical parsing, ranking, dose validation, abstention and benchmarks remain MiniMed-owned.
- [x] Define dependency direction, file/function limits and extraction rules in `AGENTS.md`.
- [x] Add automated modular line-limit, dependency-boundary and safe-DOM checks.
- [x] Extract model, Ask, note and routed-resource workflows enough to keep new features modular.
- [ ] Refactor remaining transitional shell only when required by a functional change.
- [ ] Add SQLite/FTS5 for large packs without moving medical policy into L-Note.
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
- [x] Add the restorable `#/create-pack` page route while keeping the Packages nav item active.
- [ ] Add broader non-demo and large-corpus retrieval regressions.
- [ ] Add internal PDF/document assets with exact page/section anchors.

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

## Local models

- [x] Use built-in WebLLM `Qwen3 1.7B`, `Qwen3 4B` and `Phi-4 Mini` q4f16 profiles.
- [x] Keep Qwen3 1.7B as the 8 GB default and Qwen3 4B as the 12 GB quality profile.
- [x] Retain Phi-4 Mini as a mathematics/formal-reasoning comparison.
- [x] Run inference in a dedicated Web Worker.
- [x] Keep exactly one active model; unload and terminate the previous worker on user-selected model change.
- [x] Do not use an inactivity timer.
- [x] Keep downloaded weights in the WebLLM browser cache.
- [x] Distinguish `not downloaded`, `downloaded/off` and `loaded/on`.
- [x] Add explicit manual unload without deleting cached weights.
- [x] Persist selected model and answer mode through `StoragePort`.
- [x] Allow model download before entering a question.
- [x] Add `Экономный` and `Расширенный` evidence modes.
- [x] Show progress, estimated bytes, speed, errors and retry.
- [ ] Add safe cancellation when supported by the runtime.
- [ ] Persist a download queue with up to four model/document transfers; still allow only one active inference model.
- [ ] Improve validation from citation-ID existence to statement-to-evidence support.
- [ ] Benchmark representative Snapdragon 7-class 8 GB and 12 GB devices before selecting a mobile default.

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
- [ ] Add PDF/DOCX parsing, reviewed OCR and database exporters.
- [ ] Add optional prebuilt FTS/search artifacts to large packs.
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
