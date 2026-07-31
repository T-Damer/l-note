# L-Note

L-Note is an offline-first knowledge workspace built around independently installable packs. Users download only the domains they need, search them locally, follow linked concepts and sources, maintain a separate personal-note layer, and optionally run a browser-local model over retrieved evidence.

The runtime and pack format are domain-neutral. MiniMed-derived packs are the main demonstration corpus, while MiniMed-specific clinical parsing, ranking, dose validation and safety policy remain outside L-Note Core.

## Hosted demo

The current GitHub Pages preview is published from `agent/universal-offline-kb` while PR #3 remains active:

https://t-damer.github.io/l-note/

## Current capabilities

- checksummed JSON packs installed independently into IndexedDB;
- MiniSearch exact, prefix, alias and fuzzy retrieval with deterministic fallback;
- hash-routed packages, documents, concepts, statements and notes;
- linked statements, relations, backlinks and personal overrides;
- list/graph package views;
- deterministic evidence collection before generation;
- browser-local WebLLM in a dedicated Web Worker;
- one active inference model at a time, with downloaded weights retained in browser storage;
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

Open `http://127.0.0.1:4173/`, then install the required packs on the **Пакеты** page.

## Browser-local model matrix

All current profiles are built into the pinned WebLLM catalog and use `q4f16_1` artifacts. Qwen3 1.7B remains the default because the target class includes mid-range 8 GB devices without a strong discrete GPU.

| Profile | WebLLM model ID | Intended tier | Approx. weights | Approx. active memory |
| --- | --- | --- | ---: | ---: |
| Qwen3 1.7B | `Qwen3-1.7B-q4f16_1-MLC` | default for about 8 GB | 1.0 GB | 2.0 GB |
| Qwen3 4B | `Qwen3-4B-q4f16_1-MLC` | quality profile for about 12 GB | 2.3 GB | 3.4 GB |
| Phi-4 Mini | `Phi-4-mini-instruct-q4f16_1-MLC` | mathematics/formal-reasoning comparison | 2.2 GB | 3.4 GB |

These figures are UI estimates, not hard guarantees. Integrated GPUs and mobile SoCs normally use shared system memory, and the browser/runtime also needs memory for WASM, tokenizer state, staging buffers and the active evidence set.

### Model lifecycle

```text
first use
  → download weights into WebLLM browser cache
  → load the selected model into one dedicated Web Worker
  → reveal the question workspace
  → retrieve bounded local evidence
  → generate and validate source IDs
```

Only one model may be active. Selecting another model explicitly unloads the current engine and terminates its worker before loading the replacement. There is no inactivity timer; the model remains active until the user changes it or the page/runtime ends. Cached weights remain on disk.

The built-in `Qwen3-4B-q4f16_1-MLC` is used instead of a custom Qwen3-4B-Instruct-2507 conversion. A 2507 profile can be considered later after a reproducible MLC conversion, integrity pinning and the same retrieval/citation benchmarks.

### Two answer modes

`Экономный` uses fewer retrieved sources, a smaller character budget and a shorter output. It is the default for Qwen3 1.7B and constrained devices.

`Расширенный` includes more evidence and permits a longer answer. It is intended for Qwen3 4B or Phi-4 Mini on devices with more headroom.

The preparer does not tokenize every candidate section just to select a mode. It applies deterministic source and character limits, while WebLLM enforces the final context and generation limits.

## Storage policy

Current browser storage:

```text
application shell          Service Worker cache
model artifacts            WebLLM Cache API
installed packs and notes  IndexedDB
active search index        JavaScript memory
active model               WebGPU/shared device memory
```

The current MiniSearch adapter still builds an in-memory index from enabled packs. The planned SQLite/FTS5 adapter will keep large corpora and indexes on disk and materialize only the current result/evidence working set. MiniMed should consume that adapter through the same L-Note ports while retaining its own medical query planner and safeguards.

## Build a custom pack

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
REPLICATE_API_TOKEN=... \
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.replicate \
  --title "Replicate pack" \
  --output ./dist/replicate.pack.json \
  --ai-provider replicate \
  --ai-model owner/model
```

Heavy parsing, chunking and LLM-assisted linking may run on a stronger desktop or server. The resulting pack is then installed and used on a weaker offline client. Proposed statements are retained only when their evidence quote exactly matches the source section; model output never silently replaces source text.

A future user-facing preparer will expose this pipeline in the application: select local files, choose deterministic-only or LLM-assisted processing, review proposed concepts/statements/relations, and export an installable pack.

## Architecture boundary

```text
raw sources
  → reviewed preparation and provenance
  → portable knowledge pack
  → StoragePort
  → SearchPort + optional DomainQueryPlannerPort
  → versioned evidence envelope
  → optional LocalModelPort
```

L-Note owns generic storage, retrieval, graph, notes, evidence and model orchestration. MiniMed owns clinical parsing, medical ranking, dose/regimen verification, abstention and medical benchmarks.

See `docs/ARCHITECTURE.md` for current invariants, `docs/PACK_FORMAT.md` for the portable format, and `TASKS.md` for the single implementation backlog.

## Limitations

The current web prototype does not yet include PDF/DOCX ingestion, OCR review, SQLite/FTS5, vector retrieval, signed publisher catalogs, encrypted notes or cross-device sync. Browser-local inference is experimental and must not be treated as clinically validated merely because citation IDs are syntactically valid.

## License

Application code and the L-Note guide pack are MIT licensed. Each knowledge pack retains its own source and license metadata.
