# L-Note

L-Note is a small offline-first reference engine built around downloadable, domain-independent knowledge packs.

## Prototype capabilities

- install or remove selected packs;
- PWA caching and offline use after the first load;
- exact and typo-tolerant fuzzy search without a server;
- aliases and abbreviations;
- entities, relations and evidence-document links;
- exact source/provenance display;
- device-local notes with links to existing concepts;
- deterministic fallback when no local language model is installed.

The included `MiniMed demo` pack is derived from public source-linked material in `T-Damer/MiniMed`. It intentionally contains no dosing guidance: the source card only confirms registry identity and dosage form.

## Run locally

```bash
npm test
npm run serve
```

Open `http://localhost:4173`. A web server is required because service workers and pack downloads do not work from `file://`.

## Knowledge-pack contract

A v1 pack is portable JSON containing:

```text
metadata
├── id, version, title, license
├── documents[]  — text plus exact provenance
├── entities[]   — canonical names and aliases
└── relations[]  — typed edges with evidenceDocumentId
```

Validate a pack:

```bash
node scripts/validate-pack.mjs path/to/pack.json
```

The next storage adapter should compile the same logical contract into SQLite/FTS5 for large packs and Android. The JSON implementation is deliberately small so product behaviour can be tested first.

## Planned next slice

1. IndexedDB instead of localStorage for downloaded packs.
2. SQLite/FTS5 pack artifact compatible with MiniMed content modules.
3. Graph/backlink panel and claim conflicts (`SUPPORTS`, `CONTRADICTS`, `SUPERSEDES`).
4. Optional WebLLM/llama.cpp adapter constrained to retrieved evidence.
5. Desktop pack builder for local files and optional Replicate/local-LLM enrichment.

## Hosting

The repository contains a GitHub Pages workflow. Pages must be enabled for the repository with **GitHub Actions** as the source. Private-repository Pages availability depends on the GitHub account plan.
