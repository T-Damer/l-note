# Architecture

## Current state

The hosted web prototype currently provides:

- installable, checksummed JSON knowledge packs persisted in IndexedDB;
- MiniSearch full-text, prefix, alias and fuzzy retrieval with a deterministic fallback;
- optional domain query planners isolated from the generic search engine;
- normalized `0–100%` retrieval relevance;
- routed packages, documents, concepts, statements and notes using hash URLs and browser history;
- exact source-linked statements, relations, backlinks and a separate personal-note overlay;
- optional browser-local WebLLM over retrieved evidence only;
- versioned evidence envelopes and deterministic citation-ID validation;
- SCSS source partials and deterministic static-PWA builds;
- shared `Text`, Icon, Card and Button primitives plus centralized routed-dialog close binding.

The active shell composes its search, storage, domain planner and local-model behavior through shared ports. Transitional legacy functions remain in the concatenated prototype files until the page/component split removes them, but they are no longer the active runtime path.

## Product and MiniMed boundary

L-Note is the canonical **domain-neutral knowledge runtime**, not a replacement for MiniMed's medical domain layer.

Reusable L-Note responsibilities:

```text
portable contracts and stable IDs
installed-pack composition
storage and search ports
concepts, statements, relations and backlinks
personal overlay
versioned evidence collection
provider-independent local-model boundary
shared routing and UI primitives
```

MiniMed-owned responsibilities:

```text
medical query parsing and negation
clinical intent and section ranking
medical aliases and taxonomy
dose and regimen validation
clinical abstention and safety gates
medical benchmarks and source policies
```

MiniMed should later consume L-Note through adapters. Medicine must not leak into the universal contracts, and L-Note must not weaken MiniMed into a lowest-common-denominator generic search application.

## Shared core

```text
src/core/contracts.js + .d.ts   versioned pack, resource, note, search and evidence contracts
src/core/ports.js + .d.ts       SearchPort, StoragePort, DomainQueryPlannerPort, LocalModelPort
src/core/runtime.js + .d.ts     installed-pack composition and headless runtime state
src/adapters/runtime-adapters   MiniSearch, IndexedDB/memory and WebLLM browser adapters
src/domain-plugins/minimed.js   optional MiniMed query planner adapter
```

`LNOTE_CONTRACT_VERSION` versions runtime-facing evidence and public contracts. `KNOWLEDGE_PACK_SCHEMA_VERSION` versions portable pack payloads. Runtime guards reject malformed boundary objects; the existing pack validator remains responsible for referential integrity and exact-evidence checks.

The serialized names remain compatible with the current pack format:

```text
concept   ↔ pack.entities[]
statement ↔ pack.claims[]
relation  ↔ pack.relations[]
```

Changing user-facing terminology does not require changing stable serialized IDs.

## Runtime

```text
application shell
  → KnowledgeRuntime
  → StoragePort
  → SearchPort
  → optional DomainQueryPlannerPort(s)
  → versioned EvidenceEnvelope
  → optional LocalModelPort
```

Browser adapters currently resolve to:

```text
StoragePort     → IndexedDB with in-memory fallback
SearchPort      → MiniSearch with Damerau–Levenshtein fallback
Domain planner  → optional MiniMed vocabulary plugin
LocalModelPort  → WebLLM
```

Search, linked reading, notes and deterministic evidence must remain useful when no model is installed.

## Storage and search boundary

JSON is currently the transport and small-corpus prototype artifact. It is not the permanent search abstraction.

```text
MiniSearch + IndexedDB   current small/medium browser adapter
SQLite + FTS5            planned large-pack and MiniMed adapter
optional vector adapter  planned semantic/hybrid retrieval layer
```

A SQLite adapter should be reusable by L-Note and MiniMed, while medical query planning remains a MiniMed plugin.

## Retrieval path

1. Normalize Unicode, Russian `ё`/`е`, punctuation and whitespace.
2. Expand declared concept names and aliases.
3. Apply optional domain planners, such as the isolated MiniMed demo planner.
4. Run MiniSearch with field boosts, prefix search and fuzzy matching.
5. Fall back to the embedded Damerau–Levenshtein scorer when MiniSearch is unavailable.
6. Normalize displayed relevance relative to the current result set; it is not diagnostic probability.
7. Resolve results to pack, document, section, concepts, statements and source metadata.
8. Merge the personal overlay according to the selected ranking policy.
9. Build a bounded, versioned evidence envelope.
10. Only then may a local model synthesize an answer; unknown source IDs are rejected.

Every reported ranking failure should become a regression test. Domain vocabulary belongs in a plugin or pack, never in the generic search implementation.

## Route boundary

Hash URLs are the portable navigation contract:

```text
#/search
#/ask
#/library
#/notes
#/package/:id
#/document/:id
#/concept/:id
#/statement/:id
#/note/:id
```

The URL is the source of truth for opened resources. Browser history owns nested traversal. Back returns through the chain; full Close returns to the recorded base page and removes the forward resource chain.

Routing belongs to the application shell. Stable resource IDs and resolvers belong to the core contract.

## UI and styling boundary

All authored styles live under `styles/`. `styles/main.scss` defines partial order and `tools/build-styles.mjs` generates `styles.css`. Palette, themes, semantic colors, interaction states and graph-category colors remain centralized.

The framework-free shell now has reusable primitives:

```text
src/ui/text.js + .d.ts         predefined typography variants without raw HTML
src/ui/icons.js + .d.ts        centralized Phosphor names, category mapping and placeholder
src/ui/components.js + .d.ts   Button, Card and routed-dialog close binding
```

`@phosphor-icons/web` is pinned and copied into `vendor/phosphor` during local and static builds. The font, CSS and UI modules are part of the offline shell; the application does not depend on an icon CDN.

`Card` now owns keyboard activation for search results, packages and notes. `Button` is used by package actions. Escape and backdrop closing use the shared routed-dialog binding. The migration is not complete: fields, source cards and the three dialog renderers still need shared components, and the transitional app parts still need to become page/services modules.

## Pack preparation boundary

```text
reviewed records or Markdown/TXT/JSON
  → deterministic parsing and provenance
  → optional local/remote extraction proposals
  → exact-quote validation
  → validated portable pack
```

PDF/DOCX parsing, OCR, database exporters and domain ETL belong before the normalized authoring contract. A model may propose structure but never silently replace source text.

## Personal overlay

Reference packs are immutable installed inputs. Notes remain physically separate and may link to a stable statement using `observation`, `supports`, `refines`, `contradicts` or `supersedes`. `supersedes` changes local ranking only; both versions remain visible and traceable.

## Next ordered work

1. Add browser E2E coverage for direct links, refresh, nested Back and full-chain Close.
2. Remove transitional direct imports while splitting the shell into page, service and component modules.
3. Extract shared fields, source cards and one routed-dialog renderer around the current primitives.
4. Add the internal PDF asset path and knowledge graph after the component boundary is stable.
5. Add SQLite/FTS5 without moving MiniMed rules into the shared core.

Android and iOS remain deferred until the hosted web core is stable.
