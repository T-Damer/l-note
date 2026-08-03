# L-Note

L-Note is an offline-first knowledge workspace built around independently installable packs. Users can search local sources, follow concepts and relations, keep personal notes, create their own packs, compare conflicting source statements, use local voice search and optionally run a local language model over retrieved evidence.

The runtime and pack format are domain-neutral. MiniMed-derived packs remain a demonstration corpus; the active L-Note core is not connected to the MiniMed application.

## Hosted app

https://t-damer.github.io/l-note/

The released site is built from `main` after the complete validation gate passes.

## Current capabilities

- checksummed knowledge packs installed independently;
- adaptive MiniSearch / SQLite-FTS5 / IndexedDB-postings search;
- exact, prefix, alias and bounded fuzzy matching;
- routed packages, documents, concepts, statements and notes;
- list and graph representations of knowledge;
- internal PDF viewing with exact page anchors;
- reviewed source discrepancies with document dates and text diffs;
- browser-local pack creation from Markdown, TXT, JSON or pasted text;
- local Russian/English voice search;
- optional local WebLLM answers over bounded evidence;
- citation, number, negation and statement-support checks;
- one active language model at a time;
- persisted package/model/speech downloads with cancel, continue and retry;
- a separate personal-note overlay that never rewrites source packs.

## Run locally

Requires Node.js 20 or newer.

```bash
npm ci
npm run check
npm run serve
```

Open `http://127.0.0.1:4173/`.

`npm run check` includes pack validation, structure checks, unit/static tests, a real Chromium SQLite/FTS5 lifecycle test and browser routing/modal/graph E2E.

## Search architecture

```text
small corpus
  → MiniSearch in JavaScript memory

large corpus
  → SQLite + FTS5
  → Dedicated Worker
  → IndexedDB virtual filesystem

SQLite unavailable
  → IndexedDB postings Worker

all disk adapters unavailable
  → deterministic in-memory fallback
```

The current large-corpus threshold is 5,000 search records or approximately 8 MiB of indexable text. These are initial defaults that still require representative mobile benchmarks.

The disk index stores weighted fields and a corpus fingerprint. An unchanged corpus reopens without rebuilding, and the page keeps only bounded result/evidence working sets.

## Downloads and recovery

Package files, local language models and speech-recognition models use one persisted transfer queue.

The global operations panel appears only while work is active or needs attention. It supports:

- progress and downloaded bytes;
- cancellation;
- continuation after an interrupted reload;
- retry after failure;
- removal of dismissed tasks;
- deduplication of repeated clicks.

Package downloads restart automatically after a reload. Model loads require explicit **Продолжить**, so the app does not unexpectedly reserve memory after reopening. Up to four ordinary file operations may run concurrently, while the model runtime still permits only one active inference model.

## Create a pack in the browser

Open **Пакеты → Создать свой пакет**.

The creator can:

- combine multiple `.md`, `.markdown`, `.txt` and `.json` files;
- include pasted Markdown text;
- preserve document titles, headings and source text;
- split oversized sections;
- discover common abbreviation definitions;
- preview documents, sections, concepts and package size;
- download the JSON or install it immediately.

Files remain in the browser. Current limits are 32 MiB per file and 64 MiB total.

## Different facts in installed sources

Prepared packs may contain reviewed relations between source statements. When documents disagree, L-Note preserves both versions and does not decide which one is correct.

A Phosphor warning marker appears after the disputed passage. Opening it shows:

- exact quotes from every linked source;
- document and pack titles;
- edition/effective dates when available;
- deterministic text differences;
- the reviewed relation type and reason;
- actions for opening either full document.

Detection and resolution belong to the strong-device preparation workflow. The browser only displays reviewed relations.

## Local voice search

The search page can download multilingual Whisper Tiny or Base, record a short Russian or English query and transcribe it locally. The transcript enters the ordinary text-search pipeline.

The first download requires a network connection. Downloaded data remains available for later offline use and can be unloaded from memory without deleting it.

## Browser-local language models

| Profile | Model ID | Intended tier | Approx. weights | Approx. active memory |
| --- | --- | --- | ---: | ---: |
| Qwen3 1.7B | `Qwen3-1.7B-q4f16_1-MLC` | default around 8 GB | 1.0 GB | 2.0 GB |
| Qwen3 4B | `Qwen3-4B-q4f16_1-MLC` | quality around 12 GB | 2.3 GB | 3.4 GB |
| Phi-4 Mini | `Phi-4-mini-instruct-q4f16_1-MLC` | formal reasoning comparison | 2.2 GB | 3.4 GB |

Only one language model may be active. Selecting another model unloads the previous engine while keeping downloaded data on disk.

`Экономный` uses fewer sources and a shorter answer budget. `Расширенный` includes more evidence and permits a longer response.

## Storage policy

```text
application shell and local assets  Service Worker caches
installed packs and notes           IndexedDB
transfer state                      StoragePort / IndexedDB
small search index                  JavaScript memory
large FTS database                  SQLite over IndexedDB VFS
large-search fallback               IndexedDB postings
model data                           browser model caches
active results and evidence          bounded JavaScript working set
```

The Service Worker delivers offline files only. It does not own the database, search state or transfer queue.

## Prepare a pack on a stronger device

### Markdown, TXT or JSON

```bash
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.my-pack \
  --title "My knowledge" \
  --description "Private reference data" \
  --output ./dist/my-pack.json
```

### Optional local OpenAI-compatible enrichment

```bash
OPENAI_BASE_URL=http://127.0.0.1:11434/v1 \
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.enriched \
  --title "Enriched pack" \
  --output ./dist/enriched.pack.json \
  --ai-provider openai \
  --ai-model qwen3:8b
```

Preparation may run on a stronger computer or server. Proposed statements require exact source quotes, and proposed source discrepancies must be reviewed before export.

## Product boundary

```text
L-Note
  generic contracts and stable IDs
  pack preparation and installation
  storage/search/model/speech ports
  graph, notes, discrepancies, evidence and routing

MiniMed
  clinical query analysis and ranking
  source policy and dose validation
  abstention and medical safety benchmarks
```

Future MiniMed integration requires separate approval and MiniMed-owned retrieval, dose and safety gates.

## Remaining work

- deterministic candidate detection against existing prepared statements;
- review of proposed concepts, statements and relations;
- optional local/server LLM classification after deterministic retrieval;
- PDF/DOCX extraction, OCR and database exporters;
- optional prebuilt SQLite/FTS artifacts in large packs;
- representative mobile benchmarks;
- optional OPFS and vector-search adapters;
- signed catalogs, delta updates, encrypted notes and synchronization;
- native Android/iOS packaging after the web core is stable.

See `docs/PACK_FORMAT.md` for the portable format and `docs/ARCHITECTURE.md` for runtime invariants.
