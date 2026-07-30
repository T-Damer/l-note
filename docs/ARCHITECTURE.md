# Architecture

## Runtime

```text
static PWA shell
  ├─ pack catalog (network-first, cached)
  ├─ selected JSON packs → checksum verification → IndexedDB
  ├─ flattened sections/notes → MiniSearch or built-in fuzzy fallback
  ├─ entities + relations + exact claims → linked readers/backlinks
  ├─ personal notes → separate IndexedDB store
  └─ optional WebLLM → retrieved evidence only
```

The browser runtime is serverless and static-host friendly. It can later be wrapped in an Android WebView or Capacitor shell without changing the pack contract. On an 8 GB device, search, linked reading, notes, and deterministic evidence remain the baseline; model installation stays optional and user-controlled.

## Why JSON first

SQLite/FTS remains a sensible production target for very large packs, but JSON makes the first contract inspectable and portable across browsers, desktop tools, Android, scripts, GitHub Releases, and private file servers. The runtime already isolates pack validation, storage, indexing, and UI orchestration so a SQLite adapter can coexist with JSON packs later.

## Retrieval path

1. Normalize Unicode, Russian `ё`/`е`, dashes, punctuation, and whitespace.
2. Expand recognized entities to canonical names and aliases.
3. Run MiniSearch with title/alias boosts, prefix search, and fuzzy matching.
4. Fall back to an embedded Damerau–Levenshtein scorer when MiniSearch is unavailable.
5. Resolve a result to its pack, document, section, entities, claims, and source metadata.
6. Merge the separately stored personal layer according to the selected ranking policy.
7. For complex questions, select a bounded evidence set and list linked personal conflicts.
8. Only then may an optional local model synthesize an answer. Unknown source IDs are flagged.

## Pack preparation boundary

There are two supported preparation paths:

```text
reviewed manifest/documents/entities/claims/relations
  → deterministic compiler
  → validated pack
```

or:

```text
Markdown / TXT / JSON
  → deterministic parsing + provenance + abbreviation discovery
  → optional local OpenAI-compatible or Replicate extraction
  → exact-quote validation
  → validated pack
```

The current preparer deliberately does not parse arbitrary PDFs or DOCX. Docling, Marker, OCR, database exporters, or domain-specific ETL can be placed before the normalized authoring contract without coupling the app to one ingestion vendor.

The central invariant is provenance-first: a structured claim is publishable only when its exact quote resolves inside a supplied section. Model output is a proposal, never a replacement for source text.

## Personal overlay

Reference packs are immutable inputs. Notes live in another object store and can point to a stable claim ID with one of five relations: observation, supports, refines, contradicts, or supersedes. Even `supersedes` is a local ranking choice; both versions remain visible and traceable.

## Next compatible layers

The current schema can be extended with capability declarations for:

- SQLite/FTS and vector-index artifacts;
- signed catalogs and publisher trust;
- pack dependencies and compatibility ranges;
- delta updates and retained rollback versions;
- temporal claim validity and explicit applicability conditions;
- native Android llama.cpp/LiteRT inference;
- optional sync of the personal overlay.
