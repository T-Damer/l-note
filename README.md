# L-Note

L-Note is an offline-first web knowledge workspace built around **installable knowledge packs**. A user selects only the domains they need, downloads them once, and then searches, follows links, writes notes, and assembles source-grounded answers without a backend.

The current repository is a working browser/PWA prototype. Its runtime and pack format are domain-neutral; the first demonstration catalog uses several independently installable MiniMed-derived packs. The current product phase deliberately focuses on hosted web search and browser-local LLM experiments. Native Android work is deferred until the search and grounded-answer workflow is stable.

## What works

- independent JSON knowledge packs with catalog metadata and SHA-256 verification;
- persistent offline storage in IndexedDB and a Service Worker application shell;
- MiniSearch full-text, prefix, alias, abbreviation, and fuzzy retrieval;
- deterministic Damerau–Levenshtein fallback when MiniSearch is unavailable;
- entities, relations, exact evidence quotes, and backlinks;
- personal notes that can support, refine, contradict, or locally supersede a reference claim;
- deterministic evidence collection before any generation;
- three selectable browser-local Qwen3 profiles through WebLLM, loaded only on explicit request;
- load and generation timing, completion-token throughput when reported, and deterministic citation-ID validation;
- import/export of arbitrary compatible packs and personal notes;
- pack updates without deleting the user's personal layer;
- a zero-dependency CLI for reviewed authoring JSON or direct Markdown/TXT/JSON preparation;
- optional enrichment through a local OpenAI-compatible server or Replicate;
- a static build suitable for GitHub Pages or any file host.

The demo catalog contains a non-medical L-Note guide plus four thematic medical packs: respiratory medicine, infectious diseases, nephrology/urology, and a small medication-registry example. They are navigation examples, not a complete clinical corpus and not prescribing guidance.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm ci
npm run check
npm run serve
```

Open `http://127.0.0.1:4173/`, go to **Packs**, and install only the domains you want. Once installed, pack contents are read from IndexedDB rather than fetched for every query.

`npm ci` installs only the pinned MiniSearch runtime. The static build vendors it into the application shell, so installed search does not depend on a CDN. The built-in fuzzy fallback remains available when developing without dependencies. WebLLM is optional and downloaded only after the user activates it.

## Browser-local model test matrix

The **Ask** page exposes three deliberately comparable WebLLM profiles from the same Qwen3 family and the same `q4f16_1` quantization:

| Profile | WebLLM model ID | Test role | WebLLM VRAM estimate |
| --- | --- | --- | ---: |
| Qwen3 0.6B | `Qwen3-0.6B-q4f16_1-MLC` | fast baseline | about 1.4 GB |
| Qwen3 1.7B | `Qwen3-1.7B-q4f16_1-MLC` | recommended balance and default | about 2.0 GB |
| Qwen3 4B | `Qwen3-4B-q4f16_1-MLC` | quality comparison | about 3.4 GB |

The first load requires network access to fetch the selected model. WebLLM then keeps model assets in the browser cache. Search, evidence collection, source reading, and notes remain usable without loading a model.

For each run the UI records the model, load time, answer time, completion-token count and tokens per second when WebLLM reports usage. Generated answers receive only retrieved evidence, run with model thinking output disabled, and are checked for invented or missing `[S…]` source identifiers. These checks measure contract compliance; they do not establish that any candidate is clinically or generally reliable.

## Build a custom pack

L-Note supports two preparation paths.

### A. Compile reviewed, normalized records

```bash
node tools/build-pack.mjs \
  --input examples/custom-pack \
  --output dist/example.pack.json
```

The directory contains `manifest.json`, optional `entities.json`, `claims.json`, and `relations.json`, plus normalized document JSON under `documents/`. An ETL job, database export, LLM pipeline, or hand-authored workflow can emit this intermediate contract.

### B. Prepare Markdown, TXT, or JSON directly

```bash
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.my-pack \
  --title "My knowledge" \
  --description "Private operational notes" \
  --output ./dist/my-pack.json
```

The deterministic preparer preserves file and section provenance, segments Markdown headings, and detects common `Full term (ABC)` abbreviation patterns.

### Optional local AI enrichment

Any local service exposing an OpenAI-compatible `/v1/chat/completions` endpoint can propose entities, claims, and relations. This works with local runtimes such as Ollama, LM Studio, or vLLM when their compatible API is enabled.

```bash
OPENAI_BASE_URL=http://127.0.0.1:11434/v1 \
node tools/build-pack.mjs ./my-knowledge \
  --id com.example.enriched \
  --title "Enriched pack" \
  --output ./dist/enriched.pack.json \
  --ai-provider openai \
  --ai-model qwen3:8b
```

### Optional Replicate enrichment

Do not commit the token. The CLI accepts either environment name used by common Replicate integrations:

```bash
REPLICATE_API_TOKEN=... node tools/build-pack.mjs ./my-knowledge \
  --id com.example.replicate \
  --title "Replicate-enriched pack" \
  --output ./dist/replicate.pack.json \
  --ai-provider replicate \
  --ai-model owner/model
```

Remote or local model prose never replaces source text. A proposed claim is retained only when its `quote` is an exact contiguous substring of the section being processed. AI-derived claims are labelled `proposed` until reviewed.

See [docs/PACK_FORMAT.md](docs/PACK_FORMAT.md) for the portable format and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the runtime boundary.

## Architecture

```text
catalog.json
    ↓ download + SHA-256 verification
portable pack
    ↓ validation
IndexedDB
    ↓
MiniSearch / deterministic fuzzy fallback
    ↓
sections + entities + claims + backlinks + personal notes
    ↓ optional
WebLLM over retrieved evidence only
```

Reference packs and personal notes remain physically and logically separate. `supersedes` changes local ranking policy; it does not mutate or erase the original claim.

The browser app deliberately uses a small open-source stack:

- MiniSearch for the primary text index;
- IndexedDB and Service Worker browser primitives for persistence and offline operation;
- WebLLM for optional browser-local generation;
- plain ES modules, so the application can be hosted statically.

## Repository map

```text
index.html, styles.css       static application shell
src/                         IndexedDB, search, packs, AI and UI runtime
packs/                       independently downloadable demo packs and catalog
tools/build-pack.mjs         structured compiler + raw-data preparer
tools/lib/pack-builder.mjs   deterministic and optional AI enrichment logic
tools/validate-packs.mjs     catalog, checksum and provenance validator
examples/custom-pack/        minimal reviewed-authoring example
docs/                        pack and architecture contracts
.github/workflows/           CI and GitHub Pages deployment
```

## Demo data and limitations

The four MiniMed-derived domains currently contain source-linked cards for urinary tract infection, acute bronchiolitis, community-acquired pneumonia, measles, rotavirus gastroenteritis, meningococcal infection, and one structured medication-registry record. They retain source metadata used by MiniMed and intentionally omit patient-specific prescribing.

The web prototype does not yet include PDF/DOCX parsing, OCR, vector embeddings, signed publisher catalogs, delta updates, cross-device sync, or encrypted personal notes. Native Android inference is intentionally outside the current phase rather than an immediate release target.

## Privacy and integrity

- Search, notes, installed packs, and deterministic evidence collection stay in the browser.
- Loading WebLLM downloads model assets only after explicit user action.
- Replicate or another remote provider receives source text only when explicitly selected during pack preparation.
- Imported packs and browser notes are not encrypted in this prototype.
- Bundled catalog packs use SHA-256 integrity checks; publisher signatures and trust policies are future work.

## License

Application code and the L-Note guide pack are MIT licensed. Each knowledge pack retains its own license and source metadata; an application license does not grant redistribution rights for third-party source material.
