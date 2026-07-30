# L-Note

L-Note is an offline-first, domain-neutral knowledge workspace for downloadable reference packs, typo-tolerant search, linked concepts, personal observations and optional on-device generation.

The first working slice is a static web/PWA application. It is designed so that the same pack contract and IndexedDB data model can later be wrapped with Capacitor or replaced by native SQLite on Android without changing the content format.

## What works

- install or remove independent knowledge packs;
- import a locally built `.json` pack;
- IndexedDB persistence through Dexie;
- MiniSearch full-text ranking with prefix and fuzzy matching;
- abbreviation and alias expansion before retrieval;
- entity pages, relations and backlinks to every mentioning source fragment;
- personal notes kept separately from reference packs;
- notes labelled as observations, refinements, support, contradictions or local supersessions;
- deterministic evidence briefing for complex questions;
- optional browser-local WebLLM generation with citation validation;
- PWA shell caching and offline use after the first load;
- a no-dependency pack compiler for Markdown sources;
- an optional OpenAI-compatible enrichment pass for a local model or private server.

The bundled demo catalog is derived from the public, source-linked MiniMed pilot and contains four independently installable pediatric navigation-card packs. It is intentionally incomplete and is not a clinical decision or prescribing system.

## Run locally

No build step is required.

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`.

Run structural tests:

```bash
node --test
```

## Hosted version

The repository includes a GitHub Pages workflow. Once Pages is enabled for the repository, the expected URL is:

```text
https://t-damer.github.io/l-note/
```

The workflow also deploys pushes from `agent/universal-knowledge-mvp`, so the prototype can be inspected before merging if the repository's Pages environment allows non-default-branch deployments.

## Build a private pack

Create a directory:

```text
my-knowledge/
├── manifest.json
├── documents/
│   ├── handbook.md
│   └── procedures.md
├── entities.json      # optional
├── relations.json     # optional
├── claims.json        # optional
└── glossary.json      # optional
```

Minimal `manifest.json`:

```json
{
  "id": "com.example.my-knowledge",
  "title": "My knowledge",
  "version": "2026.07.30",
  "language": "en",
  "domains": ["internal"]
}
```

Compile it:

```bash
node tools/build-pack.mjs ./my-knowledge ./my-knowledge.json
```

The deterministic compiler splits Markdown by headings, creates stable content-addressed IDs, chunks paragraphs, detects common abbreviation patterns and validates every reference.

### Optional local-AI enrichment

Any OpenAI-compatible endpoint can propose entities, aliases, claims and relations. The compiler accepts only records whose quoted evidence is an exact substring of an input chunk.

```bash
OPENAI_BASE_URL=http://127.0.0.1:11434/v1 \
OPENAI_MODEL=qwen3:8b \
node tools/build-pack.mjs ./my-knowledge ./my-knowledge.json --ai
```

`OPENAI_API_KEY` is optional for local servers and required when the chosen provider needs it. AI-produced records remain labelled `proposed-by-ai`; a later review UI should approve them before a pack is published as authoritative.

## Data model

```text
catalog
  └── knowledge pack
      ├── manifest and version
      ├── documents
      │   └── sections
      │       └── source-linked chunks
      ├── entities and aliases
      ├── relations with evidence
      ├── claims with evidence
      └── glossary / abbreviations

local workspace
  ├── installed pack records
  ├── fuzzy search index rebuilt in memory
  └── personal notes stored separately
```

Reference packs can be updated or removed without deleting personal notes. A note never silently edits an official chunk; it creates another, explicitly labelled layer.

## Open-source building blocks

- [MiniSearch](https://github.com/lucaong/minisearch) for local full-text, prefix and fuzzy retrieval;
- [Dexie](https://github.com/dexie/Dexie.js) for browser IndexedDB;
- [WebLLM](https://github.com/mlc-ai/web-llm) for the optional WebGPU model;
- standard PWA APIs for shell caching and installation.

The core pack compiler and evidence validator have no runtime dependencies.

## Android and 8 GB RAM

The baseline search, packs, links and notes do not load an LLM and should remain modest in memory. The optional WebLLM path selects a compact 0.5–1B Qwen-family model from the WebLLM catalog, downloads it only on request and keeps reference retrieval independent from generation.

For a later native Android build, the intended migration is:

```text
PWA IndexedDB → SQLite/FTS5 adapter
WebLLM        → MLC-LLM or llama.cpp adapter
same pack contract, same evidence IDs, same UI behavior
```

## Repository boundaries

Do not commit private corpora, credentials, patient data or model weights. Generated private packs should be distributed through a private channel rather than the public catalog.

See [`docs/PACK_FORMAT.md`](docs/PACK_FORMAT.md) for the current pack contract.
