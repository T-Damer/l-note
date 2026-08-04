# Disk-backed preparation

## Goal

Strong-device preparation should use durable files as the boundary between expensive stages. Large source collections must not be retained twice in application memory when an ordinary authoring file or SQLite artifact can carry the same information.

This document describes the implemented boundary and the remaining limits. It does not claim that every parser or every review workflow is fully streaming.

## Current SQLite and DuckDB path

DuckDB sources are first staged into one SQLite database. The ordinary SQLite importer then creates the authoring directory used by the existing pack builder.

SQLite preparation now proceeds in this order:

1. validate the output directory and open the source database read-only;
2. inspect and select tables or views;
3. write the package manifest and empty semantic metadata files;
4. begin one selected table/view document in a non-JSON `.partial` file;
5. iterate source rows in deterministic order;
6. generate the current row's section group and append it immediately;
7. finalize extraction warnings, flush and `fsync` the file;
8. atomically rename the complete file to `documents/*.json`;
9. continue with the next selected object and retain only aggregate counts.

The importer no longer keeps all generated documents or all sections from one large table in memory. Section text/object memory is bounded by the current row's generated section group plus document metadata.

A `written` progress event is emitted only after atomic publication. The next object starts only after that durable write completes.

## Atomic document boundary

Incomplete documents use a hidden filename with a `.partial` suffix. Because the temporary filename does not end in `.json`, the ordinary pack builder cannot discover it as an authoring document.

The writer:

- awaits every file write, providing ordinary filesystem backpressure;
- serializes each section independently through the same JSON-safe conversion rules;
- finalizes row-limit warnings only after the section iterator is exhausted;
- calls `fsync` before closing and renaming;
- removes the partial file after generator, serialization or write failure.

The final `documents/*.json` path becomes visible only after the complete JSON object is durable and valid.

## Document-by-document authoring compilation

A plain build of an already normalized authoring directory now uses a streaming compile-only path.

The compiler:

- loads the manifest and semantic arrays once;
- validates entities, claims, relations, search-artifact descriptors and reviewed statement overlays;
- reads document JSON files in deterministic filename order;
- validates one document and its sections at a time;
- checks duplicate document/section IDs, entity references, assets, anchors and exact claim quotes while that document is present;
- retains compact document/section ID indexes for final claim cross-reference checks;
- yields each validated document directly to the atomic portable-pack writer;
- publishes the final pack only after every document and final cross-reference check succeeds.

The previous `buildPack()` API remains available for direct callers and workflows that need the complete object graph.

Streaming compilation is deliberately disabled when a command:

- prepares raw sources through `--id`;
- collects or applies semantic proposals;
- compares packs or creates/applies discrepancy reviews;
- otherwise mutates or reviews the complete pack.

Those workflows continue to use the established full-pack validator and review code. The optimization does not change their semantics or silently skip validation.

## Portable pack output

After validation and optional review application, the CLI writes the final portable pack through an atomic chunked writer.

The pack writer:

- writes top-level scalar/object properties sequentially;
- accepts ordinary arrays or streamed iterable arrays;
- writes documents, entities, claims and relations one item at a time;
- awaits every chunk write;
- calculates the exact output byte count from the written UTF-8 chunks;
- writes to a process-specific non-JSON partial file;
- calls `fsync`, closes and atomically renames to the requested pack filename;
- removes partial output after validation, serialization or write failure.

This eliminates the previous second full-pack string created for `writeFile` and the additional repeated serialization used only to calculate bytes. The final pack remains ordinary formatted schema-v1 JSON.

## Failure and interruption boundary

The authoring directory is treated as one incomplete preparation transaction.

- If the source database cannot be opened, the newly created output directory is removed.
- If schema mapping, row conversion or document writing fails, all partial metadata and document files are removed.
- The input SQLite connection is closed through one common `finally` boundary.
- DuckDB staging removes its partial SQLite output after process, schema-verification or target-verification failure.
- Portable pack output remains hidden until the final atomic rename.
- A late document or cross-reference validation failure removes the incomplete portable-pack file.

A successful authoring directory and compiled pack remain explicit preparation snapshots. They are not silently rewritten when extraction rules change.

## Remaining memory limits

Streaming removes the dominant section-text, multi-document and serialized-output duplication, but several structures remain proportional to source size:

- a Set of generated row IDs is retained per SQLite table to detect duplicate identities safely;
- unique extraction warnings remain available until preparation returns;
- SQLite owns statement and page-cache memory;
- semantic arrays such as claims and relations are loaded for cross-reference validation;
- compact document and section ID indexes remain resident during compile-only validation;
- one individual authoring document is parsed as one JSON object.

A single unusually large document can therefore still define peak JSON parsing memory. Raw-source preparation and review workflows also retain their complete pack object because they need whole-pack mutation or comparison.

For libraries where even one authoring document is too large, the relational SQLite interchange/search-artifact path remains the safer disk-oriented representation until a section-streaming JSON parser or a different versioned authoring container is introduced.

## Compatibility boundary

`importSqliteObject` remains available for direct callers and unit tests. It collects the section iterator into the historical complete-document return shape.

Production `prepareSqliteDirectory` uses the streaming operation and atomic writer instead. Deterministic row order, IDs, provenance, tags, truncation behavior and progress events remain shared between both paths.

`buildPack()` and all semantic/discrepancy review workflows retain the historical complete-pack behavior. Plain normalized CLI compilation uses the document-by-document compiler.

The portable pack writer changes only serialization and publication. It does not bypass schema, evidence or review validation.

## Regression contract

Automated tests verify that:

- the first document file exists before the second selected SQLite object begins;
- a final document is absent while row 500 of a large table is being processed;
- the non-JSON partial document exists during streaming and disappears after publication;
- a 1,200-row source produces a valid 1,200-section document including the final row;
- row-limit warnings are finalized after the streamed section array;
- import and source-open failures remove the complete partial output directory;
- plain compile-only mode is not selected for AI or review commands;
- streaming compilation exactly matches the historical normalized-pack result;
- a 600-document authoring directory remains unpublished during document 500 and preserves deterministic order;
- an invalid exact evidence quote leaves neither final nor partial portable output;
- a 600-document portable pack stays unpublished during chunked output;
- written pack bytes equal the final file size and parsed output equals the validated source object;
- serialization failure leaves neither final nor partial pack output;
- the real pinned DuckDB smoke still stages CSV, Parquet and SQLite, imports the results, builds a valid pack and searches it.
