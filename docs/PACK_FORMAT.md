# L-Note Pack format v1

A pack is a portable UTF-8 JSON document. It is transport-neutral: a web client stores it in IndexedDB, while a native client may compile the same records into SQLite.

## Root

```json
{
  "format": "l-note-pack",
  "schemaVersion": 1,
  "manifest": {},
  "documents": [],
  "entities": [],
  "relations": [],
  "claims": [],
  "glossary": []
}
```

All top-level arrays are required, including empty arrays. IDs must be unique within their record type and stable between rebuilds when the source content is unchanged.

## Manifest

Required:

- `id`: globally stable pack ID;
- `title`;
- `version`.

Recommended:

- `description`;
- `language`;
- `domains` and `tags`;
- `license`;
- `createdAt`;
- `source` with repository, source-set digest or publisher metadata.

## Documents, sections and chunks

```json
{
  "id": "document.example",
  "title": "Example",
  "summary": "Optional description",
  "authority": "user-supplied",
  "source": {
    "title": "Original source",
    "url": "https://example.test/source",
    "year": 2026,
    "contentMode": "full-text"
  },
  "sections": [
    {
      "id": "section.example",
      "title": "Introduction",
      "chunks": [
        {
          "id": "chunk.example",
          "text": "Searchable source text.",
          "entityIds": ["entity.example"]
        }
      ]
    }
  ]
}
```

A chunk is the smallest citable unit. Generated answers cite chunk-derived evidence IDs rather than arbitrary URLs. `source.url` remains the route back to the original document.

## Entities and aliases

```json
{
  "id": "entity.example",
  "type": "concept",
  "name": "Canonical term",
  "aliases": ["ABC", "common spelling"],
  "description": "Optional short definition"
}
```

Aliases participate in fuzzy retrieval and query expansion. Two ambiguous abbreviations should be represented by two distinct entities; pack preparation should not collapse them without context.

## Relations

```json
{
  "id": "relation.example",
  "from": "entity.a",
  "predicate": "related-to",
  "to": "entity.b",
  "status": "source-linked",
  "confidence": 0.9,
  "evidence": [
    {
      "chunkId": "chunk.example",
      "quote": "exact substring of the chunk"
    }
  ]
}
```

Every authoritative relation should carry source evidence. AI-generated relations should use a review status such as `proposed-by-ai` until approved.

## Claims

Claims express source-backed statements and are separate from raw chunks:

```json
{
  "id": "claim.example",
  "text": "A source-backed statement.",
  "subjectEntityIds": ["entity.example"],
  "authority": "official-guideline",
  "status": "active",
  "evidence": [
    {
      "chunkId": "chunk.example",
      "quote": "exact substring"
    }
  ]
}
```

Personal observations are not inserted into this array at runtime. They live in the user's local workspace with an explicit relation type such as `refines` or `contradicts`.

## Glossary

```json
{
  "id": "glossary.example",
  "term": "ABC",
  "expansion": "Expanded term",
  "entityId": "entity.example",
  "category": "abbreviation"
}
```

Glossary matches expand the query before MiniSearch performs fuzzy retrieval.

## Validation rules in the MVP

- format and schema version must match;
- required arrays and manifest fields must exist;
- document, chunk and entity IDs must be unique;
- chunk entity references must resolve;
- relation endpoints must resolve;
- relation and claim evidence chunk IDs must resolve.

The optional AI compiler additionally checks that every evidence quote is an exact substring of its cited chunk.
