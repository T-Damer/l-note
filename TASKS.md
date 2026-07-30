# L-Note implementation backlog

This is the single source of future work. Completed items describe the active branch; unfinished browser/device verification remains explicit.

**Current focus:** replace the remaining resource renderers with the shared routed-dialog layer and split the transitional shell into pages/services. Next are local PDF assets and SQLite/FTS5 behind the same adapter contracts. Android/iOS remain deferred.

## Phase 0 — universal core and MiniMed boundary

- [x] Keep L-Note domain-neutral; medicine is the primary demonstration domain, not a core assumption.
- [x] Add versioned contracts for packs, documents, sections, concepts, statements, relations, notes, search results and evidence.
- [x] Add `SearchPort`, `StoragePort`, `DomainQueryPlannerPort`, `LocalModelPort` and evidence-verification boundaries.
- [x] Add MiniSearch, IndexedDB/memory and WebLLM browser adapters.
- [x] Add a UI-independent runtime composer and route the active web shell through the ports.
- [x] Add a versioned `KnowledgeApplicationAdapter` contract and run the web shell through it.
- [x] Add a MiniMed compatibility adapter that keeps medical query analysis, clinical ranking, dose verification, abstention and benchmark ownership in MiniMed.
- [ ] Remove the remaining transitional direct imports/functions while splitting the shell into pages, services and components.
- [ ] Add a SQLite/FTS5 adapter for large packs and MiniMed without moving medical policy into L-Note.
- [ ] Add an optional neural/vector adapter behind the same search contract.

## Phase 1 — retrieval and routing correctness

- [x] Keep ordinary search fully functional without a model.
- [x] Support exact, prefix, alias and fuzzy retrieval with deterministic fallback.
- [x] Normalize displayed relevance to an integer `0–100%`; never present it as diagnostic probability.
- [x] Isolate MiniMed query expansion behind `DomainQueryPlannerPort`.
- [x] Add the `грудничок свистит при дыхании` regression and rank respiratory/differential material above unrelated medication registry records.
- [ ] Add broader non-demo and large-corpus retrieval regressions.

### Hash routes and cards

- [x] Use stable hash routes for pages, packages, documents, concepts, statements and notes.
- [x] Restore direct links and opened cards after reload.
- [x] Store nested card traversal in browser history.
- [x] Provide Back within a card chain and one full-chain Close operation.
- [x] Prevent closed card routes from reopening on the next browser Back.
- [x] Add browser E2E for direct links, reload, nested Back and full-chain Close.

## Phase 2 — UI foundation

### SCSS, themes and interaction states

- [x] Keep authored styles in SCSS partials and generate `styles.css` deterministically.
- [x] Centralize palette, light/dark themes, semantic states and graph-category colors.
- [x] Use a neutral dark base with warm Solarized-like accents.
- [x] Add pointer/not-allowed cursors and visible keyboard focus to the current interactive surfaces.
- [ ] Finish auditing literal colors, control sizing, hover/active/disabled states and click targets.
- [ ] Add a full Sass compiler only when Sass-only syntax is actually introduced.

### Shared components

- [x] Add framework-neutral `Text`, Icon, Card and Button primitives.
- [x] Pin and vendor Phosphor locally with centralized category mapping and a placeholder icon.
- [x] Use shared cards in search, packages and notes.
- [x] Add a reusable SourceCard with separate ID, title, source type, excerpt and open action.
- [x] Add a generic routed-dialog controller and use it for the existing dialog lifecycle/navigation shell.
- [x] Add shared Field and Switch primitives and use them in model selection and personal-note priority.
- [ ] Replace the three resource-specific body renderers with one reusable routed-dialog renderer.
- [ ] Split remaining large app fragments into page, component, helper and service modules.
- [ ] Remove remaining legacy glyphs and use Phosphor everywhere.

## Phase 3 — dialogs and internal readers

- [x] Make route state the source of truth for opened dialogs.
- [x] Use one handler for cross, Close, Escape, backdrop and programmatic full close.
- [x] Keep the Close icon in the rightmost header column even when Back is hidden.
- [x] Keep Back on the left and the title in the center column.
- [x] Make current dialogs full-width on mobile with safe-area handling and bounded on desktop.
- [x] Lock both the document root and body while a modal is open.
- [x] Keep `.dialog-body` as the only vertical scroll container.
- [x] Add browser regression coverage for the Rotavirus card, single-scroll behavior and close-chain navigation.
- [ ] Add open/close animations through the reusable dialog layer.
- [x] Open installed text sources in the internal routed reader.
- [ ] Add an internal PDF asset path and preserve exact page/section anchors.
- [ ] Prefer local document/PDF assets over external URLs whenever available.

## Phase 4 — Ask page and local models

- [x] Keep exactly one model-comparison block.
- [x] Keep Gemma 3 1B, preferred Qwen3 1.7B and Phi-4 Mini as the current test matrix.
- [x] Keep deterministic retrieval before generation and pass a versioned evidence envelope to the model.
- [x] Allow the selected model to download with an empty question field and no collected evidence.
- [x] Require a question/evidence only when a loaded model is asked to generate an answer.
- [x] Keep the question workspace hidden until the selected model is loaded.
- [x] Keep selected-model UI compact: name, parameter count, approximate size and on/off indicator.
- [x] Display estimated percent, loaded/total/remaining size and speed from WebLLM progress events.
- [x] Show a structured error state with an explicit retry action.
- [ ] Add explicit cancellation.
- [ ] Support a persisted priority queue with at most four concurrent model/document downloads.
- [ ] Resume interrupted downloads where the browser/runtime API supports it.
- [ ] Improve verification from citation-ID validity to statement-to-evidence support.
- [x] Use reusable source cards and route them into the internal reader.

## Phase 5 — packages and knowledge graph

- [x] Install, disable, update, remove, import and inspect independent knowledge packs.
- [x] Preserve personal notes when a reference pack is removed or updated.
- [x] Add a graph/list switch beside JSON import.
- [x] Show available and installed packages plus documents, sections, concepts and relations.
- [x] Open package/document/concept nodes through the same hash-history contract; an uninstalled package opens its routed install card.
- [x] Use centralized category colors: pediatrics pink, dentistry blue and proportional mixed-node gradients.
- [x] Infer common package categories without hard-coding medicine into the graph contract.
- [x] Add regression coverage for a 50/50 pediatric/dentistry tooth-eruption concept.
- [x] Add a visible downloadable demo pack containing the tooth-eruption mixed node.
- [x] Add browser E2E for graph/list switching, mixed-gradient rendering, routed node navigation and package installation.

## Phase 6 — notes and personal knowledge

- [x] Keep notes physically separate from immutable reference packs.
- [x] Support `observation`, `supports`, `refines`, `contradicts` and local `supersedes` links.
- [x] Route notes and show creation/modification dates.
- [ ] Add the default “Привет, коллега” note.
- [ ] Expose routed links from notes to related concepts/statements.
- [ ] Let a local model propose note links, then require user confirmation/edit/removal before saving.

## Phase 7 — navigation shell

- [x] Use local Phosphor icons and derive the active item from the hash route.
- [x] Remove search-record counts from the sidebar status.
- [ ] Make the desktop sidebar collapsible while retaining logo and four primary icons.
- [ ] Add tooltips and complete keyboard/focus auditing for collapsed navigation.

## Phase 8 — universal preparation

- [x] Compile reviewed JSON or Markdown/TXT/JSON into portable packs with provenance.
- [x] Allow optional local OpenAI-compatible or Replicate extraction proposals.
- [x] Require exact evidence quotes before proposed statements enter a pack.
- [ ] Add PDF/DOCX preparation before the normalized contract.
- [ ] Add reviewed OCR and database export adapters.
- [ ] Add user-facing explanations for “concept” and “statement”.

## Phase 9 — mobile after web stabilization

- [ ] Add Capacitor shells using MiniMed as the reference implementation.
- [ ] Integrate safe areas, status bar, keyboard and system Back with hash history.
- [ ] Restore routes after process restart and keep mobile dialogs full-width.

## Documentation discipline

- [x] Keep setup/product use in `README.md`.
- [x] Keep current architecture and invariants in `docs/ARCHITECTURE.md`.
- [x] Keep this file as the only implementation backlog.
- [x] Update docs in the same development line as behavior changes.
- [ ] Use LLM Wiki only as an optional generated navigation layer, not a competing source of truth.
