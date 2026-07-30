# L-Note

L-Note is an offline-first web knowledge base built around **installable knowledge packs**. A user chooses which packs to keep on a device, searches them with typo tolerance and aliases, follows entity relationships and backlinks, and adds a clearly separated personal layer that can support, refine, contradict, or supersede a reference statement for the user’s own context.

The browser app remains useful without an account, backend, network connection, or language model.

## Working MVP

- install, update, remove, and import versioned JSON knowledge packs;
- checksum verification before catalog packages are installed;
- device-local storage in IndexedDB through Dexie;
- full-text retrieval through Orama with BM25 ranking, fuzzy matching, aliases, abbreviations, entity names, and relation text;
- entity pages with aliases, graph relations, and source backlinks;
- personal notes linked to an exact source fragment with explicit `supports`, `refines`, `contradicts`, or `supersedes` semantics;
- export of personal notes as another portable L-Note pack;
- PWA shell and cached pack artifacts for offline use;
- deterministic source summary that works without a model;
- optional browser-local WebLLM answer generation with `[S1]` citations, a second verification pass, and deterministic rejection of invalid citations.

The included demonstration pack is derived from the public source-linked MiniMed pilot. It contains seven compact pediatric navigation cards, 40 source fragments, 17 entities, aliases such as `ИМП`, `ОАМ`, `ЧДД`, and `SpO2`, and nine evidence-linked relations. It is a product demonstration rather than a complete medical corpus.

## Run locally

Requirements: Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Validation:

```bash
npm test
npm run build
```

The production build is a static PWA in `dist/`.

## Prepare a custom pack

Start from [`examples/custom-pack.source.json`](examples/custom-pack.source.json), then run:

```bash
npm run pack:build -- examples/custom-pack.source.json dist/custom-pack.json
```

The builder:

1. applies the L-Note pack format and schema version;
2. validates records, entities, relations, evidence record references, and duplicate IDs with Zod;
3. sorts portable content deterministically;
4. writes the normalized JSON pack and a sibling SHA-256 file.

The resulting JSON can be imported directly in the **Packs** screen. A private or community catalog only needs to publish a catalog entry containing the artifact URL, version, byte size, and SHA-256 digest.

### Minimal pack shape

```json
{
  "id": "my.reference.pack",
  "version": "1.0.0",
  "title": "My reference pack",
  "description": "A portable local corpus",
  "language": "en",
  "createdAt": "2026-07-30T00:00:00Z",
  "source": {
    "name": "My compiler",
    "url": null,
    "license": "Private",
    "contentMode": "authored"
  },
  "records": [],
  "entities": [],
  "relations": []
}
```

`format: "l-note-pack"` and `schemaVersion: 1` may be supplied by the source file or added by the builder.

## Architecture

```text
catalog / imported JSON
          ↓
     Zod validation
          ↓
 Dexie / IndexedDB
 ├── packs
 ├── records
 ├── entities
 ├── relations
 └── personal notes
          ↓
 Orama local index
 ├── text + BM25
 ├── typo tolerance
 ├── aliases / abbreviations
 └── relation expansion
          ↓
 source reader / entity graph / deterministic summary
          ↓ optional
 WebLLM → cited draft → verifier → deterministic citation gate
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the contracts and the planned SQLite/Android evolution.

## Hosted build

`.github/workflows/pages.yml` builds and publishes the static application to GitHub Pages from `main` and from the initial implementation branch. Once Pages is configured to use GitHub Actions, the expected project URL is:

```text
https://t-damer.github.io/l-note/
```

The app uses relative asset URLs, so the same `dist/` directory can also be hosted by any static server.

## Local AI boundary

The model is optional and is downloaded only after the user requests it. Search, reading, package installation, entity navigation, notes, and deterministic summaries do not depend on the model.

The model never receives the whole corpus. It receives a bounded list of retrieved fragments, must cite them as `[S1]`, and is followed by another source-constrained pass. If citation IDs are invalid or substantive paragraphs lack citations, L-Note discards the generated answer and shows the deterministic extractive summary instead.

Model weights can still be large and browser inference depends on WebGPU support, available memory, and the device/browser implementation.

## Privacy and safety

- installed packs and notes stay in browser storage;
- no telemetry, account, hosted backend, or remote question logging is implemented;
- opening an external source URL leaves the offline application;
- important notes should be exported because a browser may evict non-persistent storage;
- the MiniMed demo is a source-navigation demonstration, not a substitute for current clinical recommendations, medical judgment, or a verified dosing corpus.

## Relationship to MiniMed

MiniMed already proves a more advanced medical-specific direction: installable SQLite modules, exact source anchors, structured knowledge, and optional local inference. L-Note deliberately extracts the **domain-neutral product layer**: portable packages, entity links, note overlays, local retrieval, and grounded local AI. A later compiler can convert MiniMed SQLite modules or any user-prepared corpus into the same portable runtime contract.
