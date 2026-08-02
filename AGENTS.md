# L-Note agent rules

## Product and repository boundary

L-Note is a domain-neutral knowledge runtime. Medicine is the primary demonstration domain, not a hard-coded core assumption.

MiniMed may consume generic contracts, pack composition, storage/search/model/speech ports, graph projection, personal overlays, routing and grounded-evidence orchestration. Medical query analysis, clinical ranking, source policy, dose validation, abstention and medical benchmarks remain MiniMed-owned adapters.

Use one canonical development line per active feature slice:

- `main` is the stable released branch;
- create one `agent/{description}` branch from the current `main` for a new slice;
- keep one active pull request for that slice;
- do not open overlapping branches or pull requests for the same work;
- merge only after the complete validation gate passes.

Never commit API tokens, private corpora, patient information, model weights or generated private packs.

## Dependency direction

Dependencies flow inward. A lower layer must not import a higher layer.

```text
pages / application shell
        ↓
services / integrations
        ↓
core contracts and ports
        ↑
adapters / domain plugins
```

Directory responsibilities:

- `src/core/` — serializable contracts, ports and pure domain-neutral runtime logic. No DOM, browser globals, network, IndexedDB, SQL or medical policy.
- `src/adapters/` — implementations of core ports such as MiniSearch, IndexedDB, SQLite, WebLLM or speech recognition. No page rendering.
- `src/services/` — use-case orchestration and I/O workflows. Services must not own page markup.
- `src/pages/` — page composition and page-specific controllers. Pages consume services and reusable UI; they must not implement storage, search or model runtimes.
- `src/ui/` — reusable presentation primitives. UI modules do not fetch data, inspect IndexedDB or contain domain-specific ranking rules.
- `src/helpers/` — small stateless formatting, normalization and mapping functions. Helpers must be deterministic and side-effect free.
- `src/workers/` — isolated SQLite/search/model/speech runtimes. Worker modules may depend on adapters/helpers but never page rendering.
- `src/domain-plugins/` — optional domain query planning or presentation metadata. Medical rules stay here or in MiniMed, never in generic core.
- `src/integrations/` — compatibility boundaries for external products such as MiniMed.
- `src/app-parts/` — temporary composition/wiring only. Do not add new business logic here.

Do not introduce circular imports. Do not reach around a port to call a concrete adapter from a page or core module.

## Decomposition rules

One file has one primary responsibility. Split a file when any of the following becomes true:

- it mixes rendering, persistence and business rules;
- it contains more than one page or use case;
- a section has its own state, lifecycle and tests;
- a function needs comments to explain unrelated phases;
- the same branch or condition appears in multiple places;
- a module cannot be named precisely without using words such as `misc`, `common2`, `part` or `utils-all`.

Hand-written source targets:

- preferred file size: at most 200 lines;
- soft limit: 250 lines;
- hard limit: 300 lines;
- preferred function size: at most 30 lines;
- hard function limit: 50 lines;
- a page/controller may exceed the preferred limit only while being actively split and must have an explicit TODO in `TASKS.md`.

Generated files, vendored libraries, fixtures and declarative data are exempt. Existing oversized `src/app-parts/*` files are transitional debt, not precedent. When touching one of them:

1. do not add a new responsibility;
2. extract at least one responsibility into `pages`, `services`, `helpers` or `ui`;
3. keep the transitional file the same size or smaller;
4. add tests for the extracted public behavior;
5. update `TASKS.md` if migration remains incomplete.

Prefer explicit names such as `model-lifecycle.js`, `pack-installer.js` and `routed-dialog.js`. Avoid generic dumping grounds named only `utils.js`, `helpers.js` or `common.js` when a narrower name is possible.

## Function and state rules

- Prefer pure functions for normalization, scoring, formatting and state transitions.
- Keep side effects at the edge: adapters, services and page controllers.
- A function should either calculate a value, mutate one owned state object, or perform one I/O workflow—not all three.
- Pass dependencies explicitly; do not hide new mutable singletons in module scope.
- Do not duplicate derived state. Route state owns opened resources; storage owns persisted records; the active model/search port owns its runtime.
- Use early returns for invalid states and keep the successful path visually clear.
- Do not swallow errors silently. Convert low-level errors into a useful boundary error or surface them to the caller.
- Public contracts remain serializable, versioned and covered by compatibility tests.

## Pages and UI components

Use shared components for typography, icons, buttons, cards, fields, switches, source cards and routed dialogs. A page module may assemble these components but must not duplicate their keyboard, focus, disabled or pointer behavior.

- Use `Text` variants instead of inventing page-local typography classes.
- Use Phosphor as the only icon family.
- Do not place emoji, Unicode pictograms or text glyphs in the UI as substitutes for icons. Warning and discrepancy markers also use the centralized Phosphor catalog.
- Unknown categories use the centrally configured placeholder icon.
- Never add raw user/source text through `innerHTML`; use `textContent`, text nodes or safe component children.
- Interactive cards must support keyboard activation where a semantic button or link is not possible.
- Prefer semantic `<button>` and `<a>` elements over click handlers on generic containers.
- Keep page-specific selectors and event wiring inside the page/controller that owns them.
- A reusable UI component must not import an application page.

### Product copy

Application text is written for ordinary users, not for maintainers.

- Describe what the user can do, what is happening and what action is available.
- Avoid implementation details such as Web Worker, IndexedDB, WebGPU, FTS5, runtime, inference session, model artifacts, cache backend or internal port names in ordinary labels, hints, progress text and errors.
- Technical detail may appear only in an explicitly advanced diagnostics view, developer documentation or the browser console.
- Convert low-level failures into short, actionable messages. Preserve the original technical error in logging for diagnosis.
- Do not expose filenames, internal download stages or library error strings unless the user explicitly opens diagnostics.
- Keep copy concise enough to fit narrow mobile layouts; remove explanatory hints when the label and state already make the action clear.

Every interactive surface must have visible and consistent states:

- `hover`;
- `focus-visible`;
- `active`;
- `disabled`.

Cursor rules are mandatory:

- clickable buttons, links, cards, rows, graph nodes, notes, labels and switches use `cursor: pointer`;
- disabled controls use `cursor: not-allowed`;
- static informational surfaces keep the default cursor;
- hover must never be the only indication that an action exists.

## Styling

All authored styles live under `styles/` as SCSS partials.

- `styles/main.scss` is the single ordered entrypoint.
- `styles.css` is generated by `npm run build:styles` and must not be edited manually.
- Palette, light theme, dark theme, semantic states and graph-category colors live in dedicated partials.
- Do not duplicate literal colors inside component or page partials.
- Shared animations and repeated patterns belong in common partials.
- Page-only layout belongs in a page-specific partial; reusable component styling belongs in a component partial.
- The dark theme uses a neutral dark base with warm Solarized-like accents rather than a strongly green surface.
- Introduce Sass-only syntax only together with an explicit Sass compiler dependency and lockfile update.

## Routing and dialogs

Application navigation is hash-based so the same route contract works on static hosting and inside Capacitor.

- Packages, documents, concepts, statements and notes have stable URLs.
- The route is the source of truth for an opened dialog.
- Card-to-card navigation uses browser history, not an in-memory stack.
- Back returns to the previous card in the chain.
- Close, Escape, backdrop close and programmatic full close use the same chain-closing operation.
- Direct links and refreshes restore the opened resource.
- A dialog has exactly one vertical scroll container; the page body does not scroll behind it.
- Resource-specific renderers provide content only; the shared routed-dialog layer owns lifecycle, navigation and layout.

## Search and persistent database rules

- Search remains useful without a model.
- Search adapters implement a common contract: MiniSearch for small corpora, SQLite/FTS5 for large corpora and IndexedDB postings as fallback.
- Domain query planners are optional plugins and do not leak into generic pack/search contracts.
- Add a regression test for every reported ranking failure.
- Displayed relevance is an integer from 0 to 100 and is never diagnostic probability.
- Do not keep a large flattened corpus in page state after a disk adapter has built its index.
- SQL schema and VFS details belong in adapters/workers, never `src/core/` or pages.
- A Service Worker is an offline/cache delivery layer only. Never keep a SQLite connection, mutable search index or transaction queue in a Service Worker.
- Persistent SQLite runs in a Dedicated Worker. Commands sharing one async SQLite connection must be serialized; do not use `Promise.all` for SQL calls on that connection.
- Await database/Worker close before opening a replacement backend or moving to a fallback.
- A corpus fingerprint must decide whether an existing disk index can be reused.
- SQLite failure must degrade to the next declared adapter rather than disable text search.
- Changes to SQLite schema, VFS, locking, transactions or lifecycle require the real Chromium smoke test in addition to unit tests.

## Evidence, source discrepancies and model rules

- A generated answer receives only retrieved evidence.
- Source identifiers and exact evidence links are deterministic.
- Citation-ID existence is necessary but not sufficient: the evidence verifier must report unsupported statements, numbers and negation mismatches.
- Model output may propose structure or links but never silently replace source text.
- The client must never automatically choose a winning source when installed documents disagree.
- A reviewed source discrepancy keeps both statement references, exact quotes, document titles, dates, relation type, review status and provenance.
- Cross-pack statement references use `pack-id::claim-id`; local claim IDs alone are insufficient outside their owning pack.
- One disputed passage may have multiple relations. Group them under one inline Phosphor marker and show every comparison.
- `different_scope` must remain distinct from `contradicts`; population, jurisdiction, date, formulation and other scope differences are not silently collapsed.
- `supersedes` may be assigned only by an explicit preparation/review decision. The browser display does not infer obsolescence from date alone.
- Only one language-model inference runtime may be active. Model weights remain in persistent browser storage; changing models must explicitly unload the previous engine.
- Speech recognition uses its own replaceable port and Worker; its transcript enters the normal search path.
- The local-model and speech ports must remain replaceable so MiniMed or a native shell can provide different runtimes.

## Knowledge and personal notes

- Reference packs are immutable installed inputs.
- Personal notes remain physically and logically separate.
- `supports`, `refines`, `contradicts` and `supersedes` are explicit links.
- A personal-note relation is not promoted to a reference-level statement relation without preparation and review.
- `supersedes` changes local ranking and never deletes a reference statement.
- Every statement and relation remains traceable to a source, note or review decision.
- Client rendering preserves every installed source version; source selection and conflict resolution belong to the strong-device preparation workflow.

## Transfers

- Long downloads and preparation tasks use the shared transfer-queue contract rather than page-local ad hoc state.
- At most four files may transfer concurrently, but only one inference model may be loaded.
- Task state, progress and interruption policy must be serializable through `StoragePort`.
- Cancellation uses `AbortSignal` or explicit Worker termination and must not delete already completed cached artifacts.
- A failed or cancelled task must be retryable without creating duplicate active resource tasks.

## Tests and validation

Behavior changes require tests at the narrowest useful layer:

- pure helper/state transition — unit test;
- port or integration boundary — contract test;
- route, modal or user workflow — browser E2E;
- pack/search regression — deterministic fixture test;
- source discrepancy — qualified-ID, multi-conflict grouping, exact quote-position and diff tests;
- SQLite/VFS/lifecycle change — real headless-browser smoke test.

Do not make asynchronous tests depend on a fixed number of event-loop turns. Wait for an observable state with a bounded timeout.

Before considering a slice complete:

```bash
npm run check
```

The static build must include every imported offline module, and the Service Worker shell must be updated when a new runtime module is required offline.

## Documentation

Keep documentation short and centralized:

- `README.md` — setup and product use;
- `docs/ARCHITECTURE.md` — current architecture, boundaries and invariants;
- `TASKS.md` — the single implementation backlog;
- `AGENTS.md` — development rules.

Update documentation in the same change as behavior. Do not create additional status documents unless an existing document cannot reasonably hold the information. LLM Wiki may be generated later as navigation, but it is not a competing source of truth.
