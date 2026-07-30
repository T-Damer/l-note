# L-Note

L-Note is an offline-first, domain-neutral knowledge-pack client. A user installs only the subjects they need, searches them with typo tolerance, follows entities and evidence links, adds separate personal observations, and can optionally ask a local model to answer and fact-check itself against the retrieved sources.

This repository contains only reusable knowledge-system components. It does **not** contain MiniMed's medical modes, clinical rules, medical UI, or medical corpus.

## What works now

- install and remove checksummed knowledge packs from a catalog;
- import a user-produced JSON pack from disk;
- keep installed packs and personal notes in IndexedDB;
- fuzzy and token search through Fuse.js, including Russian text and abbreviations;
- open the exact document, section, chunk and evidence quote;
- inspect entities, claims, graph relations and claim-to-claim links;
- add personal notes and explicit personal claims without overwriting reference data;
- build a structured evidence bundle for a complex question;
- call an optional local OpenAI-compatible server twice: draft, then independent source check;
- install the hosted web client as a PWA and reopen cached content offline.

Two small non-medical example packs are included. The first one is installed automatically in a fresh browser so the hosted demo is immediately searchable.

## Run

Requirements: Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by Vite.

## Verify and build

```bash
npm run check
```

The check runs JavaScript syntax validation, verifies every pack checksum and exact evidence quote, runs Vitest, and creates the production site in `dist/`.

## Repository map

```text
apps/web/             hosted PWA client
packages/contracts/   Zod pack, catalog, note and reference contracts
packages/search/      Fuse.js fuzzy/token search adapter
packages/core/        search orchestration, graph navigation, evidence bundles
packages/storage/     IndexedDB and memory storage adapters
packages/ai/          grounded prompts and two-pass local-model verification
public/packs/          catalog and example knowledge packs
tests/                 contract, retrieval, core and storage tests
docs/                  architecture, pack format and roadmap
```

## Local model

The initial web client accepts any local server that exposes OpenAI-compatible `chat/completions`. The default form points to an Ollama-style local URL. The API key is never persisted.

The model is optional. Search, source reading, graph navigation, notes and evidence bundles continue to work without it. Fully browser-local WebGPU inference and native Android llama.cpp adapters are separate roadmap items.

## Knowledge pack authoring

The current import boundary is a validated JSON pack. See [`docs/PACK_FORMAT.md`](docs/PACK_FORMAT.md) and the two examples under [`public/packs`](public/packs).

The planned desktop/server compiler will convert documents and databases into this format, optionally using local models or Replicate to propose entities and claims. Proposed records will still require deterministic source and quote validation before publication.
