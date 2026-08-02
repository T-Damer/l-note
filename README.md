# L-Note

L-Note is an offline-first knowledge workspace built around independently installable knowledge packs. Users download only the domains they need, search them locally, follow linked concepts and sources, keep personal notes as a separate overlay, create their own packs, use local voice search and optionally run a local model over retrieved evidence.

The runtime and pack format are domain-neutral. MiniMed-derived packs are the main demonstration corpus, while clinical query parsing, ranking, dose validation, abstention and medical benchmarks remain owned by MiniMed. The active L-Note core is not connected to the MiniMed application in this PR.

## Hosted demo

The current preview is published from `agent/universal-offline-kb` while PR #3 remains active:

https://t-damer.github.io/l-note/

## Current capabilities

- checksummed knowledge packs installed independently into IndexedDB;
- adaptive local retrieval: MiniSearch for small corpora, SQLite/FTS5 for large corpora and IndexedDB postings as a disk fallback;
- exact, prefix, alias and bounded fuzzy matching for Russian and English queries;
- hash-routed packages, documents, concepts, statements, notes and package creation;
- linked statements, relations, backlinks and explicit personal overrides;
- reviewed source discrepancies with inline Phosphor markers, document dates and side-by-side text diffs;
- list and graph views of installed and available knowledge;
- internal PDF viewing with document/section page anchors;
- browser-local creation of installable packs from Markdown, TXT, JSON or pasted text;
- local RU/EN voice search through a dedicated speech-recognition Worker;
- deterministic evidence collection and statement-to-source support verification;
- browser-local WebLLM in a dedicated Worker with one active inference model;
- explicit model states `not downloaded`, `on disk` and `loaded in memory`;
- manual model unload without deleting cached weights;
- two evidence modes: `Экономный` and `Расширенный`;
- CLI preparation from reviewed JSON or Markdown/TXT/JSON;
- optional local OpenAI-compatible or Replicate enrichment with exact-quote validation.

## Search architecture

The application chooses a search implementation without changing the UI or knowledge contracts:

```text
small corpus
  → MiniSearch in JavaScript memory

large corpus
  → SQLite 3.53.x + FTS5
  → Dedicated Web Worker
  → IndexedDB virtual filesystem

SQLite unavailable
  → custom IndexedDB postings Worker

all disk adapters unavailable
  → deterministic in-memory fallback
```

The current automatic large-corpus threshold is either:

```text
5,000 search records
or
approximately 8 MiB of indexable text
```

These thresholds are initial defaults and still need measurement on representative Snapdragon 7-class devices. They can be overridden in adapter tests and future device profiles.

SQLite stores the FTS table, vocabulary and corpus fingerprint outside the page heap. After the first build, an unchanged corpus reopens the existing index. Only query candidates and top results are returned to the application. The FTS path retains:

- Unicode and `ё/е` normalization;
- aliases and optional domain query expansion;
- weighted BM25 fields;
- FTS prefix indexes;
- vocabulary-based typo candidates;
- Damerau-Levenshtein fuzzy correction;
- the common `SearchResult` and `0–100%` relevance contract.

The SQLite connection is owned by one Dedicated Worker and commands are serialized. The Service Worker remains responsible only for the offline shell and runtime-asset caching; it does not own the database connection.

## Run locally

Requires Node.js 20 or newer.

```bash
npm ci
npm run check
npm run serve
```

Open `http://127.0.0.1:4173/`, then install or create the required packs on the **Пакеты** page.

`npm run check` includes a real headless-Chromium SQLite/FTS5 smoke test. It builds an index, performs exact and fuzzy Russian searches, closes the Worker, opens a second Worker and verifies that the persisted index is reused.

## Create a pack in the browser

Open **Пакеты → Создать свой пакет**. The creator opens as the routed card `#/package/new`, so reload, browser Back and full modal Close behave like other package/document cards.

The browser creator can:

- combine multiple `.md`, `.markdown`, `.txt` and `.json` files;
- include Markdown text pasted directly into the form;
- preserve document titles, headings and source text;
- split oversized sections;
- discover definitions such as `Полное название (СОКР)`;
- preview package documents, sections, entities and size;
- download the resulting JSON or install it immediately.

The lightweight creator is deterministic and does not require a local model. Source files stay in the browser. Current limits are 32 MiB per file and 64 MiB total.

## Different facts in installed sources

A prepared pack may contain reviewed relations between source statements. When installed documents disagree, L-Note does not replace either statement or decide which one is correct.

The reader places a Phosphor warning icon directly after the exact disputed quote. Opening it shows every linked comparison for that passage:

- both exact source quotes;
- document and pack titles;
- edition/effective dates when available;
- a deterministic word-level diff;
- the reviewed relation type, such as contradiction, refinement or different scope;
- routed actions for opening either complete document.

Several discrepancies from several documents may be grouped under one marker. Claim and document routes use pack-qualified runtime IDs, so equal local IDs in different packs remain distinct.

Install or update **L-Note: как устроены пакеты знаний**, then open **Ранний вариант хранения поиска → Крупные пакеты** to see the demonstration. Its older in-memory recommendation is compared with the newer disk-backed SQLite/FTS5 recommendation.

Detection and resolution belong to the stronger desktop/server preparation workflow. That workflow may retrieve similar existing statements, compare numbers, units, negation, dates and scope, ask a local/server model for a classification, and require human review. The browser client only displays the reviewed result and preserves every installed version.

## Local voice search

The search page can download a lightweight multilingual Whisper profile, record a short query and transcribe it locally. Russian, English and automatic RU/EN selection are available. Audio is decoded, mixed to mono, resampled to 16 kHz and processed in a dedicated Worker. The transcript is sent through the same text-search pipeline.

The first model download requires a network connection. Model artifacts remain in browser storage, and the user may unload the active speech model without deleting downloaded weights.

## Browser-local language models

All current profiles are built into the pinned WebLLM catalog and use `q4f16_1` artifacts. Qwen3 1.7B remains the default because the target class includes mid-range devices with 8 GB of shared memory and no strong discrete GPU.

| Profile | WebLLM model ID | Intended tier | Approx. weights | Approx. active memory |
| --- | --- | --- | ---: | ---: |
| Qwen3 1.7B | `Qwen3-1.7B-q4f16_1-MLC` | default for about 8 GB | 1.0 GB | 2.0 GB |
| Qwen3 4B | `Qwen3-4B-q4f16_1-MLC` | quality profile for about 12 GB | 2.3 GB | 3.4 GB |
| Phi-4 Mini | `Phi-4-mini-instruct-q4f16_1-MLC` | mathematics/formal-reasoning comparison | 2.2 GB | 3.4 GB |

These values are estimates, not hard guarantees. Integrated GPUs and mobile SoCs use shared system memory, and the browser still needs memory for WASM, tokenizers, staging buffers, the search working set and the interface.

```text
first use
  → request persistent origin storage when supported
  → download weights into the WebLLM Cache API
  → load one selected model in a Dedicated Worker
  → retrieve bounded local evidence
  → generate with source IDs
  → verify citation IDs, terms, numbers and negation support
```

Only one language model may be active. Selecting another model unloads the current engine and terminates its Worker. The user can also press **Выгрузить из памяти**. There is no inactivity timer. Cached weights remain on disk.

`Экономный` uses fewer sources, a smaller character budget and a shorter output. `Расширенный` includes more evidence and permits a longer answer. The preparer does not tokenize every candidate section; deterministic source and character limits bound the prompt, while WebLLM applies final context and output limits.

## Storage policy

```text
application shell and local assets  Service Worker caches
model artifacts                     WebLLM / Transformers.js browser caches
installed packs and notes           IndexedDB
small search index                  JavaScript memory
large FTS database and index         SQLite over IndexedDB VFS
large-search fallback                IndexedDB postings
active results and evidence          bounded JavaScript working set
active models                        WebGPU/WASM/shared device memory
```

The official SQLite OPFS path requires response headers that GitHub Pages does not provide. The hosted prototype therefore uses an IndexedDB VFS. An OPFS adapter remains appropriate for controlled hosting or a future native/Capacitor shell with the required isolation headers.

## Build a custom pack on a stronger device

### Reviewed normalized records

```bash
node tools/build-pack.mjs \
  --input examples/custom-pack \
  --output dist/example.pack.json
```

### Markdown, TXT or JSON

```bash
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.my-pack \
  --title "My knowledge" \
  --description "Private reference data" \
  --output ./dist/my-pack.json
```

### Optional local LLM preparation

```bash
OPENAI_BASE_URL=http://127.0.0.1:11434/v1 \
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.enriched \
  --title "Enriched pack" \
  --output ./dist/enriched.pack.json \
  --ai-provider openai \
  --ai-model qwen3:8b
```

### Optional Replicate preparation

```bash
REPLICATE_API_TOKEN=... node tools/build-pack.mjs ./my-knowledge \
  --id com.example.replicate \
  --title "Replicate-enriched pack" \
  --output ./dist/replicate.pack.json \
  --ai-provider replicate \
  --ai-model owner/model
```

Preparation may run on a stronger desktop or server. The resulting pack remains usable on a weaker offline client. Model output may propose concepts, aliases, statements, relations and discrepancy candidates, but a proposed statement is accepted only when its evidence quote is an exact source substring. Source discrepancies must be reviewed before export.

See `docs/PACK_FORMAT.md` for the portable format and `docs/ARCHITECTURE.md` for the runtime boundary.

## Core boundary

```text
L-Note Core
  contracts + stable IDs
  pack preparation/installation/composition
  storage/search/model/speech ports
  graph, source discrepancies, notes, evidence and routing

MiniMed
  clinical query analysis
  medical ranking and source policy
  dose/regimen validation
  abstention and safety benchmarks
```

Any future MiniMed migration requires separate approval and must pass MiniMed's existing retrieval, dose and safety suites through the adapter.

## Remaining work

- strong-device candidate detection and human review for source discrepancies;
- reviewed LLM-assisted enrichment in the browser/desktop pack workflow;
- PDF/DOCX extraction, OCR and database exporters on a stronger device;
- optional prebuilt SQLite artifacts inside distributable large packs;
- complete transfer-queue wiring and mobile threshold benchmarks;
- optional OPFS and vector-search adapters;
- signed publisher catalogs, delta updates, encrypted notes and cross-device sync;
- native Android/iOS packaging after the web core and storage adapters stabilize.
