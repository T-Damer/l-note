# Architecture

L-Note is a domain-neutral extraction of the reusable ideas proven in MiniMed. It does not import medical modes, medical terminology, clinical restrictions, or MiniMed data.

```text
catalog
  -> selected JSON knowledge pack
  -> SHA-256 and schema validation
  -> IndexedDB installation
  -> Fuse.js fuzzy/token search
  -> exact source, entity, claim and relation navigation
  -> personal notes in a separate store
  -> evidence bundle
  -> optional local OpenAI-compatible model
  -> second-pass fact check
```

## Packages

- `packages/contracts`: Zod schemas and cross-layer records.
- `packages/search`: Fuse.js adapter, normalization, fuzzy/token search and suggestions.
- `packages/core`: UI-independent orchestration, graph navigation and evidence bundles.
- `packages/storage`: `idb`-based browser storage plus a memory adapter for tests and future clients.
- `packages/ai`: provider-neutral grounded prompts and two-pass OpenAI-compatible inference.
- `apps/web`: installable PWA and demonstration UI.

## Boundaries

Reference packs are immutable artifacts. Personal notes never alter a pack. A personal claim points to a reference claim with an explicit relation such as `refines` or `contradicts`.

The current web MVP stores complete JSON packs in IndexedDB and constructs an in-memory Fuse.js index. The Android target can preserve the contracts and core while replacing storage/search with SQLite/FTS5 and replacing the model adapter with llama.cpp or LiteRT-LM.

## Security and privacy

Search, pack parsing and notes are local. The optional AI path sends only the generated evidence bundle to the URL entered by the user. API keys are held in the form for one request and are not persisted.
