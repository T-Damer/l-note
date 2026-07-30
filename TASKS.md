# L-Note implementation backlog

This is the single project backlog. Keep it synchronized with code changes and avoid creating overlapping status documents.

## Phase 0 — shared-core boundary and correctness

### Architecture

- [x] Define L-Note as a domain-neutral knowledge runtime rather than a medical-only application.
- [x] Record the boundary between reusable L-Note capabilities and MiniMed-owned medical adapters in `AGENTS.md`.
- [ ] Extract versioned contracts for packs, documents, sections, concepts, statements, relations and evidence.
- [ ] Introduce storage, search, domain-query-planner and local-model ports.
- [ ] Keep MiniSearch as the first web search adapter.
- [ ] Add a SQLite/FTS5 adapter suitable for large packs and later MiniMed integration.
- [ ] Keep clinical parsing, medical ranking, dose validation and clinical safeguards outside the generic core.

### Search

- [ ] Remove the “Пакеты знаний” block from the search header.
- [ ] Add a regression fixture for `грудничок свистит при дыхании`.
- [ ] Rank wheezing, bronchiolitis, bronchial obstruction and differential-diagnosis material ahead of unrelated medication registry entries.
- [ ] Add non-demo query regression cases.
- [ ] Normalize displayed relevance to an integer `0–100%`.
- [ ] Ensure relevance is described as retrieval relevance, not diagnostic probability.
- [ ] Keep ordinary search fully functional without a model.
- [ ] Add a generic domain-expansion hook without hard-coding medical synonyms in the search engine.

### Hash routing and resource cards

- [ ] Make the hash route the source of truth for the active page and opened card.
- [ ] Add stable routes for `concept`, `statement`, `package`, `note` and `document` resources.
- [ ] Restore an opened resource after refresh or direct-link navigation.
- [ ] Push nested card transitions into browser history.
- [ ] Add an explicit Back button when a previous card exists in the current chain.
- [ ] Make browser Back traverse nested cards before returning to the base page.
- [ ] Record the base page that opened the first card.
- [ ] Implement one full-chain close operation for Close, cross, Escape, backdrop and programmatic close.
- [ ] Ensure closing a chain does not reopen its cards on the next Back action.

## Phase 1 — maintainable web UI foundation

### SCSS and themes

- [ ] Migrate all project styles to SCSS.
- [ ] Create separate partials for base palette, light theme, dark theme, semantic colors, graph categories and interaction states.
- [ ] Move shared animations and repeated UI patterns into common partials.
- [ ] Preserve the current light theme.
- [ ] Replace the green-heavy dark theme with a neutral dark base and warm Solarized-like accents.
- [ ] Remove duplicated literal colors from component styles.

### Component architecture

- [ ] Introduce a component-based UI layer without coupling the headless core to it.
- [ ] Split large page logic into reusable cards, buttons, switches, fields, dialogs, typography and icon components.
- [ ] Add a `Text` component with predefined typography variants.
- [ ] Move reusable logic into `helpers`, `hooks` and `services`.
- [ ] Keep components and files within the limits described in `AGENTS.md`.
- [ ] Use Phosphor as the only icon family.
- [ ] Add a centrally configured placeholder icon for unknown categories.

### Interaction consistency

- [ ] Add `cursor: pointer` to all clickable controls, cards, links, rows, graph nodes, notes and sources.
- [ ] Add `cursor: not-allowed` to disabled controls.
- [ ] Add consistent hover, focus-visible, active and disabled states.
- [ ] Increase clickable areas for controls and cards.
- [ ] Do not use hover as the only discoverability signal.
- [ ] Normalize spacing, radii, typography, control heights and icon sizing.

## Phase 2 — dialogs, resource navigation and readers

### Dialog behavior

- [ ] Use one reusable routed-dialog component.
- [ ] Add open and close animations.
- [ ] Make dialogs full-width on mobile while respecting safe areas.
- [ ] Keep a bounded desktop width.
- [ ] Use one primary scroll container per dialog.
- [ ] Lock body scrolling while a dialog is open.
- [ ] Fix double scrolling, including the rotavirus document card.
- [ ] Add a sticky header with Back, title and Close controls.

### Internal source reader

- [ ] Open locally available documents in an internal reader instead of an external site.
- [ ] Add a PDF reader path for PDF-backed resources.
- [ ] Preserve exact section/chunk/source navigation.
- [ ] Route every opened source through the shared hash-navigation contract.

### Concepts and relations

- [ ] Centralize Russian translations for relation predicates.
- [ ] Translate `may present with` as `может проявляться`.
- [ ] Display relation strength as a percentage or weak/medium/strong category.
- [ ] Put relations inside a collapsible accordion.
- [ ] Open related concepts through browser history.
- [ ] Preserve Back and full-chain Close semantics through relation traversal.

## Phase 3 — knowledge packages and graph

### Package page

- [ ] Allow package cards to open and show their contents.
- [x] Preserve JSON package import.
- [ ] Add a “Посмотреть граф” control beside import.
- [ ] Add list/graph view switching.
- [ ] Route opened package cards through hash history.
- [ ] Make the language switch horizontal.

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

- [ ] Ensure the local-model comparison block has exactly one instance.
- [ ] Ensure repeated evidence collection does not duplicate the block.
- [ ] Normalize padding, label/select spacing and typography.
- [ ] Use the shared `Text` component.
- [ ] Keep exactly three test candidates unless a benchmark change justifies another matrix.
- [ ] Keep Qwen as the preferred MiniMed-oriented candidate until tests show otherwise.

### Model installation and downloads

- [ ] Do not expose an uninstalled model as ready to answer.
- [ ] Show a “Скачать модель” action for uninstalled models.
- [ ] Fix the selected-model download button.
- [ ] Display progress, speed, downloaded bytes, total bytes, remaining bytes, queue state and errors.
- [ ] Add retry and cancellation.
- [ ] Support at most four parallel downloads.
- [ ] Prioritize the current query’s model, then the last opened document, then other models/documents.
- [ ] Persist queue and download state across refresh.
- [ ] Resume interrupted downloads when the storage/runtime API supports it.

### Grounded answers and sources

- [ ] Keep deterministic evidence collection before generation.
- [ ] Keep generated answers limited to retrieved evidence.
- [ ] Improve citation validation from ID existence toward statement-to-evidence support checks.
- [ ] Redesign source cards with softer radii, spacing and hover states.
- [ ] Separate source title, type, relevant excerpt and open action visually.
- [ ] Increase source click targets and add `cursor: pointer`.
- [ ] Route sources into the internal document/PDF reader.

## Phase 5 — notes and personal knowledge

- [ ] Make the new-note dialog full-width on mobile.
- [ ] Add dialog open/close animation.
- [ ] Add a default “Привет, коллега” note.
- [ ] Show note creation date.
- [ ] Add pointer and interaction states to note cards.
- [ ] Route notes as `#/note/:id`.
- [ ] Route transitions from notes to reference concepts through history.
- [ ] Use a local model to propose note-to-reference links.
- [ ] Let the user confirm, remove or edit proposed links before saving.
- [ ] Preserve explicit `supports`, `refines`, `contradicts` and `supersedes` semantics.
- [ ] Keep personal experience visibly separate from reference sources.

## Phase 6 — navigation shell

- [ ] Make the desktop sidebar collapsible.
- [ ] Keep logo plus Search, Ask, Packages and Notes icons in collapsed mode.
- [ ] Remove storage record counts from the sidebar.
- [ ] Add tooltips to collapsed navigation icons.
- [ ] Derive the active item from the current route.
- [ ] Keep navigation controls keyboard accessible and visibly focused.

## Phase 7 — universal ingestion

- [ ] Keep the architecture independent of medicine.
- [ ] Keep medicine and pediatrics as the primary demonstration scenario.
- [ ] Support normalized inputs originating from PDF, documents, databases, reference catalogs and notes.
- [ ] Add PDF/DOCX parsing before the normalized pack contract.
- [ ] Add reviewed OCR as an optional preparation stage.
- [ ] Add database export adapters.
- [ ] Keep preparation possible with local scripts and a local/server LLM.
- [ ] Preserve the user-facing names `понятие` and `утверждение` for now.
- [ ] Add explanations for those entity types later.

## Phase 8 — Capacitor after the web core stabilizes

- [ ] Build Android and iOS shells with Capacitor, using MiniMed as a reference.
- [ ] Respect safe areas, status bar, keyboard and mobile navigation.
- [ ] Integrate system Back with hash history.
- [ ] Traverse nested cards before leaving a page or minimizing the app.
- [ ] Restore routes after process restart.
- [ ] Keep mobile dialogs full-width and the overall structure comparable with the web application.

## Documentation discipline

- [x] Keep `TASKS.md` as a Markdown checklist.
- [x] Keep development rules in `AGENTS.md`.
- [ ] Update `README.md`, `docs/ARCHITECTURE.md` and this backlog with every architectural behavior change.
- [ ] Use LLM Wiki as an optional generated navigation layer, not as another competing source of project truth.
- [ ] Avoid creating additional status documents unless strictly necessary.
