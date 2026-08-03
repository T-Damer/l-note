# L-Note

L-Note is an offline-first knowledge workspace built around independently installable packs. Users can search local sources, follow concepts and relations, keep personal notes, create their own packs, compare conflicting source statements, use local voice search and optionally run a local language model over retrieved evidence.

The runtime and pack format are domain-neutral. MiniMed-derived packs remain a demonstration corpus; the active L-Note core is not connected to the MiniMed application.

## Hosted app

https://t-damer.github.io/l-note/

The released site is built from `main` after the complete validation gate passes.

## Current capabilities

- checksummed knowledge packs installed independently;
- adaptive MiniSearch / SQLite-FTS5 / IndexedDB-postings search;
- optional distributable SQLite/FTS5 indexes for large packs;
- exact, prefix, alias and bounded fuzzy matching;
- routed packages, documents, concepts, statements and notes;
- list and graph representations of knowledge;
- internal PDF viewing with exact page anchors;
- reviewed source discrepancies with document dates and text diffs;
- confirmed discrepancies included as two ordinary citable answer sources;
- preparation-time comparison against existing pack files;
- strong-device PDF/DOCX extraction with page or paragraph provenance;
- SQLite table/view import into the standard authoring layout;
- relational SQLite pack export, FTS5 access and exact restoration;
- mandatory human review for LLM-proposed concepts, aliases, statements and relations;
- browser-local pack creation from Markdown, TXT, JSON or pasted text;
- local Russian/English voice search;
- optional local WebLLM answers over bounded evidence;
- citation, number, negation and statement-support checks;
- one active language model at a time;
- persisted package/model/speech downloads with cancel, continue and retry;
- a separate personal-note overlay that never rewrites source packs.

## Run locally

Requires Node.js 20 or newer. Building prebuilt SQLite search artifacts and using database adapters require Node.js 22 or newer because they use the built-in `node:sqlite` module.

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

large pack with a matching installed artifact
  → verified prebuilt SQLite/FTS5 database
  → Dedicated Worker
  → IndexedDB virtual filesystem

large corpus without a matching artifact
  → SQLite + FTS5 built locally
  → Dedicated Worker
  → IndexedDB virtual filesystem

SQLite unavailable
  → IndexedDB postings Worker

all disk adapters unavailable
  → deterministic in-memory fallback
```

The current large-corpus threshold is 5,000 search records or approximately 8 MiB of indexable text. These are initial defaults that still require representative mobile benchmarks.

The disk index stores weighted fields and a corpus fingerprint. An unchanged corpus reopens without rebuilding. A packaged artifact is used only when its format, runtime, checksum, record count and corpus fingerprint match the enabled pack exactly and there are no personal notes changing the corpus. Otherwise the client builds the index normally. The page keeps only bounded result/evidence working sets.

## Downloads and recovery

Package files, their optional prebuilt search indexes, local language models and speech-recognition models use one persisted transfer queue.

The global operations panel appears only while work is active or needs attention. It supports:

- progress and downloaded bytes;
- cancellation;
- continuation after an interrupted reload;
- retry after failure;
- removal of dismissed tasks;
- deduplication of repeated clicks.

Package downloads restart automatically after a reload. Model loads require explicit **Продолжить**, so the app does not unexpectedly reserve memory after reopening. Up to four ordinary file operations may run concurrently, while the model runtime still permits only one active inference model.

An invalid or unavailable optional search artifact does not prevent the pack itself from being installed. The client records the warning and falls back to local index construction.

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

Relevant confirmed discrepancies are also added to local-answer evidence. The counterpart becomes an ordinary `[S…]` source, and the model receives both exact quotes and a neutral reviewed relation. Proposed and dismissed relations are excluded.

Detection and review belong to the strong-device preparation workflow. The hosted browser only displays confirmed relations and never chooses a winning document.

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
verified packaged search files      IndexedDB with installed pack records
transfer state                      StoragePort / IndexedDB
small search index                  JavaScript memory
large FTS database                  SQLite over IndexedDB VFS
large-search fallback               IndexedDB postings
model data                          browser model caches
active results and evidence         bounded JavaScript working set
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

### SQLite tables and views

Inspect a source database:

```bash
npm run database:pack -- inspect --input ./reference.sqlite
```

Prepare selected tables as ordinary source documents:

```bash
npm run database:pack -- import \
  --input ./reference.sqlite \
  --output ./prepared/reference \
  --id com.example.reference \
  --title "Reference database" \
  --table articles \
  --table glossary
```

Rows retain table, identity-column, column and row-number provenance. BLOBs are represented by size and SHA-256 rather than copied into searchable text. Optional mappings choose identity, title, text and tag columns without accepting raw SQL.

Compile the authoring directory through the ordinary validator and review pipeline:

```bash
npm run build:pack -- \
  --input ./prepared/reference \
  --output ./dist/reference.pack.json
```

Export a validated pack for SQL tools and restore it exactly:

```bash
npm run database:pack -- export \
  --input ./dist/reference.pack.json \
  --output ./dist/reference.pack.sqlite

npm run database:pack -- restore \
  --input ./dist/reference.pack.sqlite \
  --output ./dist/reference.restored.pack.json
```

The relational export contains normalized tables, exact JSON payloads and an FTS5 table. It is separate from the browser prebuilt-search artifact. See `docs/DATABASE_ADAPTERS.md` for mappings, limits and schema details.

### Prebuilt SQLite/FTS5 search for a large pack

After producing a validated pack, create a portable search database and a copy of the pack containing its manifest entry:

```bash
npm run build:search-artifact -- \
  --input ./dist/my-pack.json \
  --database ./dist/my-pack.search.sqlite \
  --pack-output ./dist/my-pack.with-search.json \
  --url ./my-pack.search.sqlite
```

Publish the updated pack and the `.sqlite` file at the relative URL recorded by `--url`. The builder writes an optimized FTS5 database, its SHA-256 digest, byte size, runtime profile, record count and corpus fingerprint. It does not modify the original pack.

The packaged database is an optimization rather than a second source of truth. Source documents, statements and relations remain in the JSON pack. The client verifies the downloaded database before importing it, and discards it in favor of ordinary local indexing whenever compatibility or integrity checks fail.

### PDF and DOCX

The document preparer turns a file or directory into a normalized authoring directory. Original files are copied into `assets/`.

Required local tools:

- PDF text: `pdftotext` from Poppler;
- DOCX: `unzip`;
- optional scanned-PDF OCR: `pdftoppm` from Poppler and `tesseract` with the selected language data.

Prepare ordinary PDF and DOCX files:

```bash
npm run prepare:documents -- ./documents \
  --output ./prepared/my-documents \
  --id com.example.documents \
  --title "My documents"
```

For scanned PDF pages that have no text layer:

```bash
npm run prepare:documents -- ./documents \
  --output ./prepared/my-documents \
  --id com.example.documents \
  --title "My documents" \
  --ocr \
  --ocr-language rus+eng
```

Then compile the prepared directory:

```bash
node tools/build-pack.mjs \
  --input ./prepared/my-documents \
  --output ./dist/my-documents.pack.json
```

The preparer preserves:

- one-based PDF page numbers through `assetAnchor.page`;
- the original PDF for the internal reader;
- DOCX heading groups;
- DOCX paragraph start/end ranges;
- extractor name, preparation time and source path;
- warnings for pages with no usable text.

OCR runs only for PDF pages whose text layer is empty. OCR output remains ordinary extracted source text and should be reviewed before publication; the CLI does not silently certify its accuracy.

### Compare with existing prepared packs

Create the new pack and a separate review file. Repeat `--compare-pack` for every existing pack that should be checked.

```bash
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.my-pack \
  --title "My knowledge" \
  --output ./dist/my-pack.json \
  --compare-pack ./existing/first.pack.json \
  --compare-pack ./existing/second.pack.json \
  --discrepancy-review-out ./dist/my-pack.review.json \
  --discrepancy-review-html ./dist/my-pack.review.html
```

Open the generated HTML file. For every proposed comparison:

- inspect both exact quotes, document titles and dates;
- leave it unresolved, accept it or dismiss it;
- change the proposed relation type when the difference is caused by scope rather than a direct contradiction;
- edit the explanation;
- download the reviewed JSON.

Apply only accepted decisions during the final build:

```bash
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.my-pack \
  --title "My knowledge" \
  --output ./dist/my-pack.reviewed.json \
  --discrepancy-review-in ./downloads/com.example.my-pack.discrepancy-review.json \
  --reviewed-by "Reviewer name"
```

The deterministic check currently proposes candidates for:

- different numbers and compatible units;
- negation present in only one statement;
- different linked values for the same subject;
- different populations and age ranges;
- similar source statements across several packs.

No candidate is added to a pack before explicit acceptance. A newer date is shown for context but does not automatically make one source preferred or obsolete.

### Optional LLM-assisted semantic proposals

LLM enrichment is also a two-step workflow. The first command builds the deterministic pack unchanged and writes proposals into separate JSON/HTML review files:

```bash
OPENAI_BASE_URL=http://127.0.0.1:11434/v1 \
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.enriched \
  --title "Enriched pack" \
  --output ./dist/enriched.base.pack.json \
  --ai-provider openai \
  --ai-model qwen3:8b \
  --semantic-review-out ./dist/enriched.semantic-review.json \
  --semantic-review-html ./dist/enriched.semantic-review.html
```

The same review workflow works with `--ai-provider replicate` and its provider options.

Open the generated HTML page and inspect each proposed:

- concept and aliases;
- source-linked statement;
- relation between concepts.

Every candidate starts unresolved. It can be edited, accepted or dismissed. A statement cannot be accepted when its quote is absent from the original source section.

Apply the downloaded review file in a second deterministic build:

```bash
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.enriched \
  --title "Enriched pack" \
  --output ./dist/enriched.reviewed.pack.json \
  --semantic-review-in ./downloads/com.example.enriched.semantic-review.json \
  --reviewed-by "Reviewer name"
```

Only eligible records marked `decision: accept` enter the final pack. Pending and dismissed candidates stay outside it. Accepted records preserve proposal-provider, reviewer and review-time provenance. The source text is never replaced by model output.

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

- review workflow for OCR output;
- optional DuckDB bridge for Parquet/CSV and remote database scanners;
- optional LLM classification of deterministic source-discrepancy candidates;
- representative mobile benchmarks;
- optional OPFS and vector-search adapters;
- signed catalogs, delta updates, encrypted notes and synchronization;
- native Android/iOS packaging after the web core is stable.

See `docs/PACK_FORMAT.md` for the portable format, `docs/DATABASE_ADAPTERS.md` for database interchange, `docs/RETRIEVAL_ARCHITECTURE_RESEARCH.md` for external-system research and `docs/ARCHITECTURE.md` for runtime invariants.
