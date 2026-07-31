# L-Note agent rules

## Product and repository boundary

L-Note is a domain-neutral knowledge runtime. Medicine is the primary demonstration domain, not a hard-coded core assumption.

MiniMed may consume generic contracts, pack composition, storage/search/model ports, graph projection, personal overlays, routing and grounded-evidence orchestration. Medical query analysis, clinical ranking, source policy, dose validation, abstention and medical benchmarks remain MiniMed-owned adapters.

Use only the canonical development line while this feature is active:

- `main` is stable;
- `agent/universal-offline-kb` is the working branch;
- PR #3 is the single active implementation PR;
- do not open overlapping branches or PRs for the same work.

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

- `src/core/` — serializable contracts, ports and pure domain-neutral runtime logic. No DOM, browser globals, network, IndexedDB or medical policy.
- `src/adapters/` — implementations of core ports such as MiniSearch, IndexedDB, SQLite or WebLLM. No page rendering.
- `src/services/` — use-case orchestration and I/O workflows. Services must not own page markup.
- `src/pages/` — page composition and page-specific controllers. Pages consume services and reusable UI; they must not implement storage, search or model runtimes.
- `src/ui/` — reusable presentation primitives. UI modules do not fetch data, inspect IndexedDB or contain domain-specific ranking rules.
- `src/helpers/` — small stateless formatting, normalization and mapping functions. Helpers must be deterministic and side-effect free.
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
- Do not duplicate derived state. Route state owns opened resources; storage owns persisted records; the active model port owns its engine.
- Use early returns for invalid states and keep the successful path visually clear.
- Do not swallow errors silently. Convert low-level errors into a useful boundary error or surface them to the caller.
- Public contracts remain serializable, versioned and covered by compatibility tests.

## Pages and UI components

Use shared components for typography, icons, buttons, cards, fields, switches, source cards and routed dialogs. A page module may assemble these components but must not duplicate their keyboard, focus, disabled or pointer behavior.

- Use `Text` variants instead of inventing page-local typography classes.
- Use Phosphor as the only icon family.
- Unknown categories use the centrally configured placeholder icon.
- Never add raw user/source text through `innerHTML`; use `textContent`, text nodes or safe component children.
- Interactive cards must support keyboard activation where a semantic button or link is not possible.
- Prefer semantic `<button>` and `<a>` elements over click handlers on generic containers.
- Keep page-specific selectors and event wiring inside the page/controller that owns them.
- A reusable UI component must not import an application page.

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

## Search, evidence and models

- Search remains useful without a model.
- Search adapters implement a common contract; MiniSearch is the current small-corpus adapter and SQLite/FTS5 is the expected large-corpus adapter.
- Domain query planners are optional plugins and do not leak into generic pack/search contracts.
- Add a regression test for every reported ranking failure.
- Displayed relevance is an integer from 0 to 100 and is never diagnostic probability.
- A generated answer receives only retrieved evidence.
- Source identifiers and exact evidence links are deterministic.
- Model output may propose structure or links but never silently replace source text.
- Only one inference model may be active. Model weights remain in persistent browser storage; changing models must explicitly unload the previous engine.
- The local-model port must remain replaceable so MiniMed or a native shell can provide a different runtime.

## Knowledge and personal notes

- Reference packs are immutable installed inputs.
- Personal notes remain physically and logically separate.
- `supports`, `refines`, `contradicts` and `supersedes` are explicit links.
- `supersedes` changes local ranking and never deletes a reference statement.
- Every statement and relation remains traceable to a source, note or review decision.

## Tests and validation

Behavior changes require tests at the narrowest useful layer:

- pure helper/state transition — unit test;
- port or integration boundary — contract test;
- route, modal or user workflow — browser E2E;
- pack/search regression — deterministic fixture test.

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
