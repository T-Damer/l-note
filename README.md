# L-Note

L-Note is an offline-first knowledge workspace built around independently installable knowledge packs. Users download only the domains they need, search them locally, follow linked concepts and sources, keep a separate personal-note layer, create their own packs, and optionally run a local model over retrieved evidence.

The runtime and pack format are domain-neutral. MiniMed-derived packs are the main demonstration corpus, while clinical query parsing, ranking, dose validation, abstention and medical benchmarks remain owned by MiniMed. The active L-Note core is not connected to the MiniMed application in this PR.

## Hosted demo

The current preview is published from `agent/universal-offline-kb` while PR #3 remains active:

https://t-damer.github.io/l-note/

## Current capabilities

- checksummed JSON packs installed independently into IndexedDB;
- exact, prefix, alias and fuzzy retrieval through MiniSearch with a deterministic fallback;
- hash-routed packages, documents, concepts, statements, notes and package creation;
- linked statements, relations, backlinks and personal overrides;
- list and graph views of installed/available knowledge;
- browser-local creation of installable packs from Markdown, TXT, JSON or pasted text;
- deterministic evidence collection before generation;
- browser-local WebLLM in a dedicated Web Worker;
- one active inference model at a time;
- explicit states `not downloaded`, `on disk`, and `loaded in memory`;
- manual model unload without deleting cached weights;
- persistent model/answer-mode selection;
- two evidence modes: `Экономный` and `Расширенный`;
- CLI preparation from reviewed JSON or Markdown/TXT/JSON;
- optional local OpenAI-compatible or Replicate enrichment with exact-quote validation.

## Run locally

Requires Node.js 20 or newer.

```bash
npm ci
npm run check
npm run serve
```

Open `http://127.0.0.1:4173/`, then install or create the required packs on the **Пакеты** page.

## Create a pack in the browser

Open **Пакеты → Создать свой пакет**. The creator opens as the routed card `#/package/new`, so reload, browser Back and full modal Close behave like other package/document cards.

The browser creator can:

- combine multiple `.md`, `.markdown`, `.txt` and `.json` files;
- include Markdown text pasted directly into the form;
- preserve document titles, headings and source text;
- split oversized sections;
- discover common definitions such as `Полное название (СОКР)`;
- preview package documents, sections, entities and size;
- download the resulting JSON or install it immediately.

The lightweight creator is deterministic and does not require a local model. Source files stay in the browser. Current limits are 32 MiB per file and 64 MiB total. PDF/DOCX, OCR, database exports and reviewed LLM-assisted enrichment remain part of the heavier preparation roadmap.

## Browser-local models

All current profiles are built into the pinned WebLLM catalog and use `q4f16_1` artifacts. Qwen3 1.7B remains the default because the target class includes mid-range devices with 8 GB of shared memory and no strong discrete GPU.

| Profile | WebLLM model ID | Intended tier | Approx. weights | Approx. active memory |
| --- | --- | --- | ---: | ---: |
| Qwen3 1.7B | `Qwen3-1.7B-q4f16_1-MLC` | default for about 8 GB | 1.0 GB | 2.0 GB |
| Qwen3 4B | `Qwen3-4B-q4f16_1-MLC` | quality profile for about 12 GB | 2.3 GB | 3.4 GB |
| Phi-4 Mini | `Phi-4-mini-instruct-q4f16_1-MLC` | mathematics/formal-reasoning comparison | 2.2 GB | 3.4 GB |

These values are estimates, not hard guarantees. Integrated GPUs and mobile SoCs use shared system memory, and the browser still needs memory for WASM, tokenizers, staging buffers, the search working set and the interface.

### Model lifecycle

```text
first use
  → request persistent origin storage when supported
  → download weights into the WebLLM Cache API
  → load the selected model into one dedicated Web Worker
  → reveal the question workspace
  → retrieve bounded local evidence
  → generate and validate source IDs
```

Only one model may be active. Selecting another model unloads the current engine and terminates its worker. The user can also press **Выгрузить из памяти**. There is no inactivity timer. Cached weights remain on disk and are detected through WebLLM's cache API after reload.

The selected model and answer mode are stored locally. When a user follows the recommended mode for one model, switching models also switches to the new model's recommended mode; a manually chosen mode is preserved.

The built-in `Qwen3-4B-q4f16_1-MLC` is used instead of a custom Qwen3-4B-Instruct-2507 conversion. A 2507 profile can be considered later after a reproducible conversion, integrity pinning and the same retrieval/citation benchmarks.

### Answer modes

`Экономный` uses fewer sources, a smaller character budget and a shorter output. It is the default for Qwen3 1.7B and constrained devices.

`Расширенный` includes more evidence and permits a longer answer. It is intended for Qwen3 4B or Phi-4 Mini on devices with more headroom.

The preparer does not tokenize every candidate section. It applies deterministic source and character limits, while WebLLM enforces final context and generation limits.

## Storage policy

```text
application shell          Service Worker cache
model artifacts            WebLLM Cache API
installed packs and notes  IndexedDB
active search index        JavaScript memory (current MiniSearch adapter)
active model               WebGPU/shared device memory
```

The planned SQLite/FTS5 adapter will keep large corpora and indexes on disk and materialize only the active result/evidence working set. A future MiniMed connection may use the same ports only after separate approval and MiniMed-owned retrieval, dose and safety gates.

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

Preparation may run on a stronger desktop/server. The resulting pack remains usable on a weaker offline client. Model output may propose concepts, aliases, statements and relations, but a proposed statement is accepted only when its evidence quote is an exact source substring.

See `docs/PACK_FORMAT.md` for the portable format and `docs/ARCHITECTURE.md` for the runtime boundary.

## Core boundary

```text
L-Note Core
  contracts + stable IDs
  pack preparation/installation/composition
  storage/search/model ports
  graph, notes, evidence and routing

MiniMed
  clinical query analysis
  medical ranking and source policy
  dose/regimen validation
  abstention and safety benchmarks
```

Any future MiniMed migration requires separate approval and must pass MiniMed's existing retrieval, dose and safety suites through the adapter.

## Limitations

The hosted prototype does not yet provide PDF/DOCX parsing, OCR, SQLite/FTS5, signed publisher catalogs, delta updates, encrypted notes or cross-device sync. Native Android/iOS packaging is deferred until the web core and storage adapters are stable.
