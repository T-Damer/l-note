# L-Note knowledge-pack format

## Purpose

A knowledge pack is a portable, immutable JSON object. It contains searchable source text and an optional reviewed semantic layer. The application stores each pack independently, so users may install, disable, update, export, or remove domains without rebuilding the application.

The current schema version is `1`.

## Top-level object

```json
{
  "schemaVersion": 1,
  "id": "example.domain.ru",
  "version": "2026.07.30",
  "title": "Example knowledge pack",
  "description": "What this pack contains and does not contain.",
  "language": "ru",
  "publishedAt": "2026-07-30T00:00:00Z",
  "license": "MIT",
  "tags": ["example"],
  "documents": [],
  "entities": [],
  "claims": [],
  "relations": [],
  "statementRelations": [],
  "searchArtifacts": []
}
```

Required fields are `schemaVersion`, `id`, `version`, `title`, `description`, `language`, `documents`, `entities`, `claims`, and `relations`. `statementRelations` and `searchArtifacts` are optional.

IDs should be stable across rebuilds. Pack versions should change whenever searchable content, semantic records, or reviewed statement relations change.

## Optional prebuilt search artifacts

A large pack may reference one or more reproducible search databases built on a stronger device. These files accelerate installation on weaker devices but do not replace the JSON source text or semantic records.

```json
{
  "id": "search.example.domain.ru.2026.07.30",
  "kind": "sqlite-fts5",
  "formatVersion": 1,
  "runtime": "@subframe7536/sqlite-wasm@1.3.1",
  "url": "./example.domain.search.sqlite",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "bytes": 12582912,
  "corpusFingerprint": "lnote-corpus-v1:example.domain.ru:2026.07.30:12:80:40:20::",
  "recordCount": 5400
}
```

Every descriptor requires:

- a stable `id`;
- `kind: sqlite-fts5`;
- the supported `formatVersion`;
- the exact browser SQLite runtime profile;
- a URL resolved relative to the downloaded pack URL;
- a lowercase SHA-256 digest;
- the exact byte size and record count;
- the corpus fingerprint produced from the pack content.

The package transfer queue downloads optional search files together with the pack and stores verified blobs beside the installed pack record. A descriptor is selected only when exactly one matching pack is enabled, the corpus fingerprint is exact, the runtime is compatible, and personal notes have not changed the searchable corpus.

Before use, the SQLite Worker checks byte size, SHA-256, `PRAGMA quick_check`, required tables, format/runtime metadata, record count, and fingerprint. Any mismatch discards the optimization and triggers ordinary local index construction. The JSON pack remains authoritative in every case.

Build an artifact on Node.js 22 or newer:

```bash
npm run build:search-artifact -- \
  --input ./dist/example.pack.json \
  --database ./dist/example.search.sqlite \
  --pack-output ./dist/example.with-search.pack.json \
  --url ./example.search.sqlite
```

The original input pack is not modified. Publish the output pack and SQLite file together.

## Documents and sections

```json
{
  "id": "guide.search",
  "title": "Hybrid search",
  "summary": "A short description.",
  "authority": "reference",
  "effectiveFrom": "2026-07-30",
  "source": {
    "title": "Original source",
    "url": "https://example.invalid/source",
    "repository": "owner/repository",
    "repositoryPath": "path/to/source.md",
    "repositoryCommit": "immutable-commit-sha",
    "publishedAt": "2026-07-30"
  },
  "tags": ["search"],
  "sections": [
    {
      "id": "fuzzy",
      "title": "Fuzzy matching",
      "text": "The source-preserving searchable paragraph.",
      "entityIds": ["concept:fuzzy-search"],
      "tags": ["retrieval"]
    }
  ]
}
```

`text` is the primary evidence surface. It must remain human-readable. A model summary must not silently replace the original source paragraph; use provenance metadata and a distinct authority/content-mode label when the text is a reviewed derivative.

Use `effectiveFrom` for the date on which the document or edition became applicable. When only a publication date is known, use `source.publishedAt` or `source.date`. L-Note displays these dates when comparing source statements.

## Entities

```json
{
  "id": "concept:fuzzy-search",
  "type": "concept",
  "name": "Fuzzy search",
  "aliases": ["нечёткий поиск", "поиск с опечатками"],
  "description": "Search tolerant to small edit differences."
}
```

Aliases power abbreviations, alternative spellings, transliteration, and query expansion. An abbreviation may be a normal alias or a separate entity connected by an `abbreviation-of` relation when the distinction matters.

Accepted LLM-proposed entities may additionally carry preparation provenance:

```json
{
  "proposedBy": "openai-compatible:qwen3:8b",
  "reviewedBy": "Reviewer",
  "reviewedAt": "2026-08-03T13:00:00Z"
}
```

## Claims and evidence

```json
{
  "id": "claim:fuzzy-purpose",
  "subjectId": "concept:fuzzy-search",
  "predicate": "helps-with",
  "text": "Fuzzy matching helps retrieve terms containing typographical errors.",
  "status": "reviewed",
  "authority": "reviewed",
  "confidence": 1,
  "source": {
    "documentId": "guide.search",
    "sectionId": "fuzzy",
    "quote": "Fuzzy matching helps retrieve terms containing typographical errors."
  },
  "proposedBy": "openai-compatible:qwen3:8b",
  "reviewedBy": "Reviewer",
  "reviewedAt": "2026-08-03T13:00:00Z"
}
```

The compiler and catalog validator require `source.quote` to be an **exact contiguous substring** of the referenced section. This makes evidence resolution deterministic and prevents a generated fact from acquiring an invented citation.

A claim can refer to `objectId` when the object is another entity. Literal values can remain in `text` until a domain-specific schema is introduced.

Claim IDs are local to a pack. Runtime routes and cross-pack references qualify them as:

```text
pack-id::claim-id
```

For example:

```text
example.old-guideline::claim:dose
example.new-guideline::claim:dose
```

This prevents two packages with the same local claim ID from overwriting one another.

## Relations between entities

```json
{
  "sourceId": "concept:fuzzy-search",
  "predicate": "handles",
  "targetId": "concept:typing-error",
  "weight": 1,
  "sourceClaimId": "claim:fuzzy-purpose"
}
```

Both entity endpoints must exist in the same pack in schema version 1. Cross-pack entity linking is achieved by reusing stable entity IDs; the runtime merges matching IDs and aliases while retaining each pack's provenance.

Accepted proposed relations may carry the same `proposedBy`, `reviewedBy`, and `reviewedAt` fields as accepted entities and claims.

## Relations between statements and source discrepancies

`statementRelations` records a reviewed relation between two source claims. It is separate from entity relations and personal notes.

```json
{
  "id": "dose-guideline-discrepancy",
  "sourceClaimId": "claim:dose-old",
  "targetClaimId": "new-guideline::claim:dose-new",
  "type": "contradicts",
  "status": "confirmed",
  "detectedBy": "rule+human-review",
  "confidence": 1,
  "reason": "The two editions specify different values for the same scoped condition.",
  "reviewedAt": "2026-08-03T10:00:00Z",
  "reviewedBy": "Reviewer"
}
```

Allowed relation types:

- `supports` — independently supports the same statement;
- `contradicts` — reports incompatible facts for the reviewed scope;
- `refines` — adds a condition, exception, or narrower scope;
- `supersedes` — the preparation workflow identified a newer replacement;
- `equivalent` — expresses the same fact in different wording;
- `different_scope` — looks inconsistent at first, but applies to different populations, dates, jurisdictions, forms, or other conditions.

Allowed statuses:

- `proposed` — generated or rule-detected and not yet fully reviewed;
- `confirmed` — explicitly accepted during package preparation;
- `dismissed` — retained for audit but hidden from the normal discrepancy UI.

A same-pack reference may use the local claim ID. A cross-pack reference must use `pack-id::claim-id`. The validator verifies local references immediately. External references may remain unresolved until all relevant packs are installed; the client ignores unresolved comparisons rather than inventing missing content.

The browser runtime does **not** decide which source is correct. It:

1. places a Phosphor warning marker after the exact disputed quote;
2. groups all reviewed discrepancies attached to that passage;
3. shows source document titles, pack names, dates, quotes, and a deterministic text diff;
4. allows opening every source through the normal routed reader;
5. preserves every installed version.

Selecting a preferred statement, marking one edition obsolete, or changing `contradicts` to `different_scope` belongs to the stronger desktop/server preparation workflow and human/domain review. A client-side package update may display the reviewed result but must not silently resolve it.

## Preparation-only discrepancy review artifact

The CLI may produce a separate review object before `statementRelations` are written:

```json
{
  "schemaVersion": 1,
  "kind": "lnote.statement-relation-review",
  "generatedAt": "2026-08-03T10:00:00Z",
  "targetPackId": "example.new-guideline",
  "referencePackIds": ["example.old-guideline"],
  "candidates": [
    {
      "id": "statement-review.0123456789abcdef",
      "sourceClaimId": "claim:dose-new",
      "targetClaimId": "example.old-guideline::claim:dose-old",
      "suggestedType": "contradicts",
      "selectedType": "contradicts",
      "decision": "pending",
      "confidence": 0.91,
      "signals": ["numeric_difference"],
      "reason": "различаются значения: 5 ↔ 10 мг",
      "source": {
        "quote": "...",
        "documentTitle": "New edition",
        "packTitle": "New pack",
        "date": "2026-08-03"
      },
      "target": {
        "quote": "...",
        "documentTitle": "Old edition",
        "packTitle": "Old pack",
        "date": "2024-01-01"
      }
    }
  ]
}
```

This object is **not** a knowledge pack and is never installed by the web runtime. It is temporary preparation state.

Every candidate starts as `pending`. A reviewer may:

- set `decision` to `accept` or `dismiss`;
- change `selectedType`;
- edit `reason`;
- leave the candidate unresolved.

Only accepted candidates are converted to confirmed `statementRelations`. Pending and dismissed candidates remain outside the final pack.

The deterministic detector currently considers:

- the same subject or sufficiently similar statement wording;
- different values after compatible-unit normalization;
- negation present in only one statement;
- different linked objects for the same subject;
- population and age-scope differences;
- exact source quotes, document names, pack names, and dates.

Compatible values are canonicalized before comparison. For example, `500 мг` and `0,5 г` are equivalent, while `500 мг` and `1 г` are different. Approximate calendar conversions such as months to years are intentionally not performed.

Dates are context only. A newer date does not automatically create `supersedes` or select a winning source.

## Preparation-only semantic proposal review artifact

LLM-proposed concepts, aliases, claims, and entity relations use a second non-installable review object:

```json
{
  "schemaVersion": 1,
  "kind": "lnote.semantic-proposal-review",
  "generatedAt": "2026-08-03T12:00:00Z",
  "targetPackId": "example.enriched",
  "provider": "openai-compatible:qwen3:8b",
  "candidates": [
    {
      "id": "semantic-review.0123456789abcdef",
      "kind": "claim",
      "decision": "pending",
      "eligible": true,
      "validationError": null,
      "provider": "openai-compatible:qwen3:8b",
      "documentId": "guide.search",
      "documentTitle": "Hybrid search",
      "sectionId": "fuzzy",
      "sectionTitle": "Fuzzy matching",
      "sourceQuote": "Fuzzy matching helps retrieve terms containing typographical errors.",
      "sourceContext": "...",
      "data": {
        "text": "Fuzzy matching helps retrieve terms containing typographical errors.",
        "subject": "Fuzzy search",
        "object": "Typing error",
        "quote": "Fuzzy matching helps retrieve terms containing typographical errors."
      }
    }
  ]
}
```

Allowed candidate kinds are:

- `entity` — a concept plus aliases and description;
- `claim` — a source-linked statement;
- `relation` — a relation between proposed or existing concepts.

The proposal collector builds the deterministic source-preserving pack first and does not mutate it. Every candidate starts as `pending`, except structurally invalid candidates, which start as `dismiss` and `eligible: false`.

A proposed claim is eligible only when:

- `text` is non-empty;
- `quote` is non-empty;
- `quote` is an exact contiguous substring of the referenced source section.

The standalone HTML review page allows a reviewer to edit candidate data and set `decision` to `accept`, `dismiss`, or `pending`. Ineligible candidates cannot be accepted. Only eligible accepted candidates are applied during a later deterministic build.

Pending and dismissed semantic proposals never enter the final pack. Accepted records keep provider and reviewer provenance; accepted claims use `authority: reviewed`. Source section text remains unchanged.

The review artifact is temporary preparation state, is never installed by the web runtime, and may safely be deleted after the final reviewed pack has been built and archived.

## Personal notes

Personal notes are not stored inside reference packs. The device-local note record has a relation such as:

- `observation` — unscoped practical observation;
- `supports` — supports a reference claim;
- `refines` — adds scope or an exception;
- `contradicts` — conflicts with a claim;
- `supersedes` — receives priority in the user's local mode without deleting the original claim.

This separation allows reference packs to update without losing user knowledge and keeps official/reference data visually distinct from experience. A personal relation is not automatically promoted to a reference-level `statementRelation`.

## Catalog

`packs/catalog.json` contains metadata, a relative or absolute download URL, a byte size, and a SHA-256 checksum for each pack. The application verifies the checksum before installation when Web Crypto is available. Optional `searchArtifacts` are resolved relative to that pack URL and are verified separately before storage.

A catalog entry may expose `stats.statementRelations`. The repository validator checks the count when present.

## Local authoring workflows

### Reviewed normalized authoring

The compiler accepts this directory:

```text
my-pack/
  manifest.json
  entities.json             optional; defaults to []
  claims.json               optional; defaults to []
  relations.json            optional; defaults to []
  statement-relations.json  optional
  documents/
    document-a.json
    document-b.json
```

Run:

```bash
node tools/build-pack.mjs --input my-pack --output dist/my-pack.json
```

### Direct source preparation

Markdown, plain text, and JSON may be prepared directly:

```bash
node tools/build-pack.mjs ./source-directory \
  --id com.example.pack \
  --title "Example pack" \
  --output dist/example.pack.json
```

The preparer preserves filenames and section headings, splits very long sections, and discovers common abbreviation patterns.

### Review LLM semantic proposals

Generate the deterministic pack plus separate JSON and optional HTML review artifacts:

```bash
OPENAI_BASE_URL=http://127.0.0.1:11434/v1 \
node tools/build-pack.mjs ./source-directory \
  --id com.example.pack \
  --title "Example pack" \
  --output dist/example.base.pack.json \
  --ai-provider openai \
  --ai-model qwen3:8b \
  --semantic-review-out dist/example.semantic-review.json \
  --semantic-review-html dist/example.semantic-review.html
```

The deterministic pack remains unchanged by the proposal collection step. Review the JSON or HTML artifact, then apply only accepted proposals:

```bash
node tools/build-pack.mjs ./source-directory \
  --id com.example.pack \
  --title "Example pack" \
  --output dist/example.reviewed.pack.json \
  --semantic-review-in downloads/com.example.pack.semantic-review.json \
  --reviewed-by "Reviewer name"
```

### Review possible differences against existing packs

Generate JSON and an optional standalone offline HTML page:

```bash
node tools/build-pack.mjs ./source-directory \
  --id com.example.pack \
  --title "Example pack" \
  --output dist/example.pack.json \
  --compare-pack existing/first.pack.json \
  --compare-pack existing/second.pack.json \
  --discrepancy-review-out dist/example.review.json \
  --discrepancy-review-html dist/example.review.html
```

After review, apply the downloaded JSON:

```bash
node tools/build-pack.mjs ./source-directory \
  --id com.example.pack \
  --title "Example pack" \
  --output dist/example.reviewed.pack.json \
  --discrepancy-review-in downloads/com.example.pack.discrepancy-review.json \
  --reviewed-by "Reviewer name"
```

Neither comparison nor proposal collection mutates the pack by itself.

A larger production pipeline may place Docling, Marker, OCR, database exporters, or domain-specific transformations before either review contract:

```text
source extraction
→ deterministic segmentation and provenance
→ source-preserving base pack
→ optional semantic proposals
→ exact-quote validation
→ human review of concepts, aliases, claims, and relations
→ candidate retrieval against existing claims
→ quantity, negation, date, and scope checks
→ optional discrepancy classification
→ human/domain review of every discrepancy
→ build-pack.mjs
→ optional build-search-artifact.mjs
→ signed/checksummed catalog publication
```

The runtime does not require the preparation system, original LLM, or a server after a pack has been built.
