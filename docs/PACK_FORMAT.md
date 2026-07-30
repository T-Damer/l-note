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
  "relations": []
}
```

Required fields are `schemaVersion`, `id`, `version`, `title`, `description`, `language`, and the four arrays.

IDs should be stable across rebuilds. Pack versions should change whenever searchable content or semantic records change.

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
    "repositoryCommit": "immutable-commit-sha"
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

## Claims and evidence

```json
{
  "id": "claim:fuzzy-purpose",
  "subjectId": "concept:fuzzy-search",
  "predicate": "helps-with",
  "text": "Fuzzy matching helps retrieve terms containing typographical errors.",
  "status": "reviewed",
  "confidence": 1,
  "source": {
    "documentId": "guide.search",
    "sectionId": "fuzzy",
    "quote": "Fuzzy matching helps retrieve terms containing typographical errors."
  }
}
```

The compiler and catalog validator require `source.quote` to be an **exact contiguous substring** of the referenced section. This makes evidence resolution deterministic and prevents a generated fact from acquiring an invented citation.

A claim can refer to `objectId` when the object is another entity. Literal values can remain in `text` until a domain-specific schema is introduced.

## Relations

```json
{
  "sourceId": "concept:fuzzy-search",
  "predicate": "handles",
  "targetId": "concept:typing-error",
  "weight": 1,
  "sourceClaimId": "claim:fuzzy-purpose"
}
```

Both endpoints must exist in the same pack in schema version 1. Cross-pack linking is achieved by reusing stable entity IDs; the runtime merges matching IDs and aliases while retaining each pack's provenance.

## Personal notes

Personal notes are not stored inside reference packs. The device-local note record has a relation such as:

- `observation` — unscoped practical observation;
- `supports` — supports a reference claim;
- `refines` — adds scope or an exception;
- `contradicts` — conflicts with a claim;
- `supersedes` — receives priority in the user's local mode without deleting the original claim.

This separation allows reference packs to update without losing user knowledge and keeps official/reference data visually distinct from experience.

## Catalog

`packs/catalog.json` contains metadata, a relative or absolute download URL, a byte size, and a SHA-256 checksum for each artifact. The application verifies the checksum before installation when Web Crypto is available.

## Local authoring workflows

### Reviewed normalized authoring

The compiler accepts this directory:

```text
my-pack/
  manifest.json
  entities.json       optional; defaults to []
  claims.json         optional; defaults to []
  relations.json      optional; defaults to []
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

The preparer preserves filenames and section headings, splits very long sections, and discovers common abbreviation patterns. Optional `--ai-provider openai` and `--ai-provider replicate` modes can propose entities, claims, and relations. Proposed claims survive only when their evidence quote is an exact source substring.

A larger production pipeline may place Docling, Marker, OCR, database exporters, or domain-specific transformations before either contract:

```text
source extraction
→ deterministic segmentation and provenance
→ proposed entities/claims/relations
→ exact-quote and reference validation
→ human/domain review where required
→ build-pack.mjs
→ signed/checksummed catalog publication
```

The runtime does not require the preparation system, original LLM, or a server after a pack has been built.
