# L-Note agent rules

## Product boundary

L-Note is a domain-neutral knowledge runtime. Medicine is the primary demonstration domain, not a hard-coded product assumption.

The reusable core must remain independent from:

- medical terminology and clinical ranking rules;
- browser DOM and presentation components;
- a particular storage backend;
- a particular local-model runtime;
- Capacitor or another native wrapper.

MiniMed may later consume the generic contracts, pack runtime, graph, personal overlay and grounded-evidence orchestration. Medical query analysis, clinical safety gates, dose validation and medical ranking policies stay in MiniMed-owned adapters.

## Code organization

- Keep UI, domain logic, storage, search and model providers behind explicit boundaries.
- Prefer small reusable components and functions over large page files.
- Extract repeated logic into `helpers`, `hooks` and `services` as the UI stack evolves.
- Avoid files larger than roughly 350 lines. Split earlier when a file contains more than one responsibility.
- Do not add a new framework abstraction for a single use site.
- Keep public data contracts serializable and versioned.
- Generated packs and build output must not be edited by hand.

## Styling

- New and migrated styles use SCSS.
- Keep the base palette, light theme, dark theme, semantic colors, category colors and interaction states in dedicated SCSS partials.
- Do not duplicate literal colors inside components.
- Shared animations and repeated UI patterns belong in common SCSS partials.
- The dark theme uses a neutral dark base with warm Solarized-like accents rather than a strongly green surface.

## UI components

- Reuse shared cards, buttons, fields, switches, dialogs, typography and icon components.
- Use the shared `Text` component for predefined typography variants after the component layer is introduced.
- Use Phosphor as the single icon family.
- Unknown category icons use the centrally configured placeholder icon; do not invent local placeholders.
- Every interactive component must implement visible `hover`, `focus-visible`, `active` and `disabled` states.
- Clickable controls, cards, rows, graph nodes, notes and links use `cursor: pointer`.
- Disabled controls use `cursor: not-allowed`.
- Hover must never be the only indication that an action exists.

## Routing and dialogs

- Application navigation is hash-based so the same route contract works on static hosting and inside Capacitor.
- Opened packages, documents, concepts, statements and notes have stable URLs.
- Card-to-card navigation uses browser history rather than an in-memory stack.
- The route is the source of truth for an opened dialog.
- Back returns to the previous card in the chain.
- Close, Escape, backdrop close and programmatic full close use the same chain-closing operation and return to the recorded base route.
- Direct links and page refreshes must restore the opened resource from the URL.
- A dialog owns one scroll container; the page body must not scroll behind it.

## Search and evidence

- Search remains useful without a model.
- Search adapters implement a common contract; MiniSearch is the current web adapter, while SQLite/FTS5 is an expected large-corpus adapter.
- Domain-specific query planners are optional plugins and must not leak into the generic pack/search contracts.
- Add a regression test for every reported ranking failure.
- Relevance displayed to users is normalized to an integer from 0 to 100 and is not presented as diagnostic probability.
- A generated answer receives only retrieved evidence.
- Source IDs, exact evidence links and unsupported-output rejection remain deterministic.
- Model output may propose structure or links but never replaces source text silently.

## Knowledge and personal notes

- Reference packs are immutable installed inputs.
- Personal notes remain physically and logically separate.
- `supports`, `refines`, `contradicts` and `supersedes` are explicit links; `supersedes` changes local ranking and never deletes the reference claim.
- Every claim and relation must remain traceable to a source, note or review decision.

## Documentation

- Keep documentation short and centralized.
- `README.md` explains setup and product use.
- `docs/ARCHITECTURE.md` records architectural boundaries and invariants.
- `TASKS.md` is the single implementation backlog.
- Update documentation in the same change as the behavior it describes.
- Do not create additional status documents unless an existing document cannot reasonably hold the information.

## Repository workflow

- Use `main` plus at most one or two active working branches.
- Continue the current feature line in the current PR instead of opening overlapping MVP PRs.
- Keep commits scoped and tests green.
- Never commit API tokens, private corpora, patient information, model weights or generated private packs.
