# Disk-backed preparation

## Goal

Strong-device preparation should use durable files as the boundary between expensive stages. Large source collections must not be retained twice in application memory when an ordinary authoring file or SQLite artifact can carry the same information.

This document describes the implemented boundary and the remaining limits. It does not claim that every parser is fully streaming.

## Current SQLite and DuckDB path

DuckDB sources are first staged into one SQLite database. The ordinary SQLite importer then creates the authoring directory used by the existing pack builder.

SQLite preparation now proceeds in this order:

1. validate the output directory and open the source database read-only;
2. inspect and select tables or views;
3. write the package manifest and empty semantic metadata files;
4. import one selected table or view into one L-Note document;
5. write that document JSON immediately to `documents/`;
6. release the previous document reference and continue with the next object;
7. return only aggregate counts and warnings.

The importer no longer keeps every generated document and section from every selected object in one array before writing them. Cross-object peak memory is therefore bounded by the largest document currently being prepared rather than the sum of all selected tables and views.

A `written` progress event is emitted after each document file is durable. The next object starts only after that write completes.

## Failure and interruption boundary

The authoring directory is treated as one incomplete preparation transaction.

- If the source database cannot be opened, the newly created output directory is removed.
- If schema mapping, row conversion or document writing fails, all partial metadata and document files are removed.
- The input SQLite connection is closed through one common `finally` boundary.
- DuckDB staging already removes its partial SQLite output after process, schema-verification or target-verification failure.

A successful authoring directory remains an explicit preparation snapshot. It is not silently rewritten when extraction rules change.

## Current memory limit

One table or view is still converted into a complete document object before its JSON file is written. A single very large selected object can therefore retain all of its generated sections in memory.

The next preparation-memory optimization is row/section streaming inside one document. That work requires a versioned or safely assembled document-file format so that:

- output remains ordinary valid authoring JSON;
- deterministic row order and section IDs remain unchanged;
- warnings and extraction metadata are finalized correctly;
- a failed write never leaves a file that the pack builder can mistake for complete input.

Until that boundary is implemented and measured, row limits remain the safety control for unusually large individual tables.

## Regression contract

Automated tests verify that:

- the first document file exists before the second selected object begins;
- a document file is not visible before its own write completes;
- `written` events follow selected-object order;
- aggregate document and section counts remain unchanged;
- import failures remove the complete partial output directory;
- input-open failures also leave no output directory;
- the real pinned DuckDB smoke still stages CSV, Parquet and SQLite, imports the results, builds a valid pack and searches it.
