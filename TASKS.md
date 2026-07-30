# L-Note implementation backlog

Single source of future work. Completed items reflect code in the active branch; browser/device verification remains explicit where it is still needed.

**Current focus:** typed core ports and browser routing E2E, followed by the reusable component/typography/icon layer. Android/iOS remain deferred.

## Phase 0 — shared-core boundary and correctness

### Architecture

- [x] Define L-Note as a domain-neutral knowledge runtime rather than a medical-only application.
- [x] Record the boundary between reusable L-Note capabilities and MiniMed-owned medical adapters.
- [ ] Extract typed, versioned contracts for packs, documents, sections, concepts, statements, relations and evidence.
- [ ] Introduce explicit storage, search, domain-query-planner and local-model ports.
- [x] Keep MiniSearch as the first web search adapter.
- [ ] Add a SQLite/FTS5 adapter suitable for large packs and later MiniMed integration.
- [x] Keep clinical parsing, medical ranking, dose validation and clinical safeguards outside the generic core.

### Search

- [x] Remove the “Пакеты знаний” control from the search header.
- [x] Add a regression fixture for `грудничок свистит при дыхании`.
- [x] Rank wheezing, bronchiolitis, bronchial obstruction and differential-diagnosis material ahead of unrelated medication registry entries.
- [ ] Add broader non-demo query regression cases.
- [x] Normalize displayed relevance to an integer `0–100%`.
- [x] Describe relevance as retrieval relevance, not diagnostic probability.
- [x] Keep ordinary search fully functional without a model.
- [x] Add a generic domain-expansion hook without hard-coding medical synonyms in the search engine.

### Hash routing and resource cards

- [x] Make the hash route the source of truth for the active page and opened card.
- [x] Add stable routes for `concept`, `statement`, `package`, `note` and `document` resources.
- [x] Restore an opened resource after refresh or direct-link navigation.
- [x] Push nested card transitions into browser history.
- [x] Add an explicit Back button when a previous card exists in the current chain.
- [x] Make browser Back traverse nested cards before returning to the base page.
- [x] Record the base page that opened the first card.
- [x] Use one full-chain close operation for Close, cross, Escape, backdrop and programmatic close.
- [x] Truncate the forward card chain after full close so the next Back action does not reopen it.
- [x] Add unit tests for parsing, direct links, base routes and nested depth.
- [ ] Add browser E2E coverage for Back, full close, refresh and direct links.

## Phase 1 — maintainable web UI foundation

### SCSS and themes

- [x] Move all authored project styles to SCSS partials.
- [x] Create partials for base palette, light theme, dark theme, semantic colors, graph categories and interaction states.
- [x] Move shared animations and repeated UI patterns into common partials.
- [x] Preserve the current light theme direction.
- [x] Replace the green-heavy dark theme with a neutral dark base and warm Solarized-like accents.
- [x] Generate `styles.css` deterministically before local and production builds.
- [ ] Finish auditing remaining non-palette literal colors in component styles.
- [ ] Replace the transitional CSS-compatible SCSS builder with a full Sass compiler only when Sass-only syntax is needed.

### Component architecture

- [ ] Introduce a component-based UI layer without coupling the headless core to it.
- [ ] Split large page logic into reusable cards, buttons, switches, fields, dialogs, typography and icon components.
- [ ] Add a `Text` component with predefined typography variants.
- [ ] Move reusable logic into `helpers`, `hooks` and `services`.
- [ ] Keep components and files within the limits described in `AGENTS.md`.
- [ ] Use Phosphor as the only icon family.
- [ ] Add a centrally configured placeholder icon for unknown categories.

### Interaction consistency

- [x] Add pointer cursors to the current clickable cards, notes, sources, relations and resource links.
- [x] Add `cursor: not-allowed` to disabled controls.
- [ ] Audit all controls for consistent hover, focus-visible, active and disabled states.
- [ ] Increase clickable areas where controls remain too small.
- [ ] Ensure hover is never the only discoverability signal.
- [ ] Normalize spacing, radii, typography, control heights and icon sizing through shared components.

## Phase 2 — dialogs, resource navigation and readers

### Dialog behavior

- [ ] Replace the three native dialog renderers with one reusable routed-dialog component.
- [ ] Add open and close animations through the future component layer.
- [x] Make current dialogs full-width on mobile while respecting safe-area insets.
- [x] Keep bounded desktop widths.
- [x] Use one primary scroll container per current dialog.
- [x] Lock body scrolling while a dialog is open.
- [ ] Add browser regression coverage for double scrolling, including the rotavirus document card.
- [x] Use a sticky header with Back, title and Close controls.

### Internal source reader

- [x] Open installed text documents in an internal routed reader.
- [ ] Add a PDF reader path for PDF-backed resources.
- [x] Preserve document and section navigation for current JSON packs.
- [x] Route search results and Ask-page sources through the shared hash-navigation contract.
- [ ] Prefer the internal PDF/document reader whenever a local source asset exists.

### Concepts and relations

- [x] Centralize Russian translations for relation predicates.
- [x] Translate `may present with` as `может проявляться`.
- [x] Display relation strength as a percentage plus weak/medium/strong category.
- [x] Put relations inside a collapsible accordion.
- [x] Open related concepts through browser history.
- [x] Preserve Back and full-chain Close semantics through relation traversal.

## Phase 3 — knowledge packages and graph

### Package page

- [x] Allow package cards to open and show package contents.
- [x] Preserve JSON package import.
- [ ] Add a “Посмотреть граф” control beside import.
- [ ] Add list/graph view switching.
- [x] Route opened package cards through hash history.
- [ ] Make the language switch horizontal when localization controls are introduced.

### Knowledge graph

- [ ] Show packages, categories, documents, sections, concepts and their relations.
- [ ] Open packages, documents and concepts from graph nodes.
- [ ] Allow installation of a package from its graph node.
- [ ] Color nodes by category using centralized SCSS variables.
- [ ] Start with pediatrics = pink and dentistry = blue.
- [ ] Render proportional mixed-category nodes, including tooth-eruption timing as approximately 50/50 pediatrics/dentistry.
- [ ] Keep graph navigation on the same hash-history contract as the rest of the app.

## Phase 4 — Ask page and local models

### Model comparison block

- [x] Ensure the local-model comparison block has exactly one instance.
- [x] Ensure repeated evidence collection does not duplicate the block.
- [x] Add consistent padding and label/select spacing to the current block.
- [ ] Migrate model typography to the shared `Text` component.
- [x] Keep exactly three test candidates unless benchmark results justify another matrix.
- [x] Keep Qwen3 1.7B as the preferred MiniMed-oriented candidate until tests show otherwise.

### Model installation and downloads

- [x] Do not present a model as ready until the WebLLM engine is loaded.
- [x] Use the current action as “Загрузить выбранную модель” before the model is ready.
- [x] Make the selected-model load action invoke WebLLM and report basic progress.
- [ ] Display speed, downloaded bytes, total bytes, remaining bytes, queue state and structured errors.
- [ ] Add retry and cancellation.
- [ ] Support at most four parallel model/document downloads.
- [ ] Prioritize the current query’s model, then the last opened document, then other models/documents.
- [ ] Persist queue and download state across refresh.
- [ ] Resume interrupted downloads when the storage/runtime API supports it.

### Grounded answers and sources

- [x] Keep deterministic evidence collection before generation.
- [x] Limit generated answers to retrieved evidence.
- [ ] Improve citation validation from ID existence toward statement-to-evidence support checks.
- [ ] Redesign source cards with clearer title/type/excerpt/action hierarchy.
- [x] Add softer source-card radii, larger click targets, hover and pointer behavior.
- [x] Route current sources into the internal document reader.

## Phase 5 — notes and personal knowledge

- [x] Make the current new-note dialog full-width on mobile.
- [ ] Add dialog open/close animation through the component layer.
- [ ] Add a default “Привет, коллега” note.
- [x] Show note creation date and optional modification date.
- [x] Add pointer and keyboard interaction to note cards.
- [x] Route notes as `#/note/:id` and new notes as `#/note/new`.
- [ ] Expose routed links from a note to its related reference concepts.
- [ ] Use a local model to propose note-to-reference links.
- [ ] Let the user confirm, remove or edit proposed links before saving.
- [x] Preserve explicit `supports`, `refines`, `contradicts` and `supersedes` semantics.
- [x] Keep personal experience visibly separate from reference sources.

## Phase 6 — navigation shell

- [ ] Make the desktop sidebar collapsible.
- [ ] Keep logo plus Search, Ask, Packages and Notes icons in collapsed mode.
- [x] Remove the search-record count from the sidebar status.
- [ ] Add tooltips to collapsed navigation icons.
- [x] Derive the active item from the current hash route.
- [ ] Complete keyboard and focus-state audit of navigation controls.

## Phase 7 — universal ingestion

- [x] Keep the architecture independent of medicine.
- [x] Keep medicine and pediatrics as the primary demonstration scenario.
- [x] Accept normalized packs created from documents, reference catalogs and notes.
- [ ] Add PDF/DOCX parsing before the normalized pack contract.
- [ ] Add reviewed OCR as an optional preparation stage.
- [ ] Add database export adapters.
- [x] Keep preparation possible with local scripts and a local/server LLM.
- [x] Preserve the user-facing names `понятие` and `утверждение` for now.
- [ ] Add user-facing explanations for those entity types later.

## Phase 8 — Capacitor after the web core stabilizes

- [ ] Build Android and iOS shells with Capacitor, using MiniMed as a reference.
- [ ] Respect safe areas, status bar, keyboard and mobile navigation.
- [ ] Integrate system Back with hash history.
- [ ] Traverse nested cards before leaving a page or minimizing the app.
- [ ] Restore routes after process restart.
- [ ] Keep mobile dialogs full-width and the overall structure comparable with the web application.

## Documentation discipline

- [x] Keep `TASKS.md` as the single Markdown backlog.
- [x] Keep development rules in `AGENTS.md`.
- [x] Keep current architecture and implementation state in `docs/ARCHITECTURE.md`.
- [x] Update documentation in the same development line as behavior changes.
- [ ] Use LLM Wiki as an optional generated navigation layer, not as another competing source of project truth.
- [x] Avoid creating additional status documents unless strictly necessary.
