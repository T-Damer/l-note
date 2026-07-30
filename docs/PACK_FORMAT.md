# Knowledge pack format v1

A pack is a UTF-8 JSON document validated by `KnowledgePackSchema`.

## Layers

1. `manifest`: identity, version, language, license and capabilities.
2. `documents`: versioned sources, sections and addressable chunks.
3. `aliases`: abbreviations and alternate spellings.
4. `entities`: canonical concepts with pack-local stable IDs.
5. `claims`: atomic assertions with qualifiers, authority, confidence and exact evidence.
6. `relations`: graph edges between entities.
7. `claimLinks`: `supports`, `contradicts`, `refines`, `supersedes` or `duplicates`.

## Evidence invariant

Every claim contains at least one evidence locator:

```json
{
  "documentId": "document-id",
  "sectionId": "section-id",
  "chunkId": "chunk-id",
  "quote": "Exact substring from the chunk",
  "anchor": "section:chunk"
}
```

The schema verifies that the document and chunk exist and that `quote` is an exact substring. A model may propose records during compilation, but it must not publish a pack without deterministic validation and review.

## IDs and cross-pack links

IDs are stable within one pack. Runtime references use `{ "packId": "...", "itemId": "..." }`. A later schema may add shared URIs for cross-pack entity resolution without breaking pack-local IDs.

## User-produced packs

The web client accepts a local JSON file through the Packages page. A future compiler will generate the same format from Markdown, PDF, DOCX, CSV, JSON and databases on a desktop or server.
