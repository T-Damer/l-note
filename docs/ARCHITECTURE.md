# L-Note architecture

## Product boundary

L-Note separates four layers that are often collapsed into a single RAG index:

1. **source records** — immutable or versioned fragments with provenance;
2. **entities and relations** — names, aliases, abbreviations, backlinks, and evidence-linked graph edges;
3. **personal overlays** — user observations with explicit relation semantics;
4. **generation** — an optional consumer of retrieval results, never the source of truth.

The browser MVP uses JSON packs and IndexedDB. The contracts are intended to survive a later switch to read-only SQLite packs on Android.

## Portable package contract

A pack contains:

- metadata and version;
- source and redistribution information;
- reference records, each with a stable ID and optional source locator;
- entities with canonical names and aliases;
- relations between entities with an optional evidence record;
- optional atomic claims embedded in records.

Installation is transactional. Updating a pack replaces only rows belonging to that pack. Personal notes live in a separate IndexedDB table and are not removed when a reference package is updated or deleted.

### Catalog artifact

A catalog entry includes:

```text
id + version + URL + SHA-256 + byte size
```

The runtime downloads bytes, checks the digest, parses JSON, validates the schema, checks IDs and relation references, and only then writes the new package.

## Retrieval

The initial runtime uses Orama because it runs directly in the browser and supplies BM25-style full-text ranking and typo tolerance. Index documents include:

```text
title
section
body
aliases
entity names
relation text
tags
package title
source type
```

Alias expansion happens before retrieval. For example:

```text
ИМП
  → Инфекция мочевых путей
  → records mentioning that entity
  → related investigation entities and evidence records
```

A small deterministic Damerau–Levenshtein layer provides a visible correction suggestion. It is not the primary retrieval engine and can later be replaced by SymSpell or a precompiled finite-state dictionary for large corpora.

## Personal overlays

A note can be free-standing or linked to one exact reference record. Its relation is one of:

```text
related
supports
refines
contradicts
supersedes
```

The reference row is never overwritten. Search labels personal results and reference results separately. A source reader shows linked notes in a distinct personal section.

This model supports statements such as:

```text
Reference claim: X usually works under conditions A.
Personal note: X did not work in case B.
Relation: refines or contradicts.
Scope: preserved in the note text and metadata.
```

## Local AI pipeline

```text
question
  → deterministic local retrieval
  → bounded evidence list [S1…Sn]
  → local model draft
  → local verifier pass
  → citation/paragraph validation
  → accepted answer or deterministic fallback
```

The model cannot invent a resolvable source ID because IDs are assigned by the runtime after retrieval. The deterministic gate checks that cited numbers exist and that substantive answer paragraphs contain citations. This is a mechanical grounding gate, not proof that a small model understood every passage correctly, so source opening remains part of the product workflow.

## Android direction

The browser MVP already has the required offline semantics, but a production Android build with large corpora should use:

```text
read-only reference SQLite packs
+ writable user SQLite database
+ FTS5 / compact vector index
+ shared package manifest
+ local llama.cpp or LiteRT backend
```

The portable JSON format remains useful as:

- an interchange format for a desktop compiler;
- a reviewable intermediate artifact;
- a simple community-pack format;
- a fixture format for parity tests between web and native runtimes.

The next compatibility milestone should define shared golden fixtures and guarantee identical IDs, source locators, aliases, and relation traversal in web and Android implementations before introducing a native-only pack format.

## Preparing private data

A future desktop compiler can be layered in front of the existing package builder:

```text
PDF / DOCX / Markdown / database export
  → deterministic parser
  → optional local or hosted LLM extraction
  → review queue
  → records / entities / claims / relations
  → Zod validation
  → JSON or SQLite knowledge pack
```

LLM extraction must remain proposal-only. Exact source text, provenance, and checksums should be retained independently so every accepted claim can be traced back to an input fragment.
