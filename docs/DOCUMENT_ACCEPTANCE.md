# Document-library acceptance corpus

## Purpose

The acceptance corpus verifies the complete source-preserving preparation boundary rather than isolated parser functions. Every active case must have a versioned source, deterministic expectations and a test that produces or validates an installable L-Note pack.

Run only the corpus:

```bash
npm run test:document-acceptance
```

It also runs inside the complete `npm run check` gate.

## Manifest

`tests/fixtures/document-library/manifest.json` is the source of truth.

```json
{
  "schemaVersion": 1,
  "kind": "lnote.document-acceptance",
  "corpusVersion": "2026.08.04.3",
  "cases": [],
  "coverage": []
}
```

`corpusVersion` changes whenever a fixture or its expected interpretation changes. A preparation implementation change that does not alter any accepted output does not require a corpus-version change.

Every case has:

- a stable `id`;
- a source format and path or deterministic generator;
- `status: active` only when CI executes its expectations;
- an explicit `expect` object.

Every intended category remains in `coverage`. Categories without a redistributable, reproducible fixture use `status: pending`; they must not be silently treated as covered.

## Active cases

### Markdown and UTF-8 TXT

The text fixtures verify title/heading extraction, source text, tables, Cyrillic, quantities, dates, external links, valid pack creation and JSON reopen.

### DOCX

The test builds a real ZIP container containing `word/document.xml`, writes a `.docx` file and invokes the installed `unzip` executable through the production preparer. It verifies title and Heading 1 recognition, exact paragraph provenance, source asset retention and final pack compilation.

### Bundled PDF

The bundled PDF is processed through the actual pinned `@firecrawl/pdf-inspector-wasm` package. The test verifies parser version, page count, structured Markdown, one-based page normalization and exclusion of every page reported by `pagesNeedingOcr`.

### Mixed PDF

A deterministic two-page PDF contains a substantial searchable text layer on page 1 and an image-only page 2. The real WASM parser must keep page 1 searchable, route page 2 to OCR and preserve anchors, inspection metadata, warnings and the original PDF asset.

### Reviewed scanned PDF

A deterministic image-only PDF is classified by the real WASM parser. The production preparation workflow invokes the OCR boundary. CI uses deterministic Tesseract TSV so confidence and word boxes stay reproducible while testing command routing, the pending-review compilation block, explicit reviewer accept/edit and final OCR provenance.

### Multi-column PDF

A deterministic PDF contains two aligned physical columns. The parser recognizes them as a two-column Markdown table. The acceptance test verifies paired rows, Markdown table structure, physical vertical order and absence of unnecessary OCR routing.

### Image-heavy PDF

A generated searchable page contains four independent image XObjects around a reliable text layer. The test verifies:

- all four images are physically present in the PDF bytes;
- embedded images do not force the page through OCR;
- reliable text remains searchable and page-anchored;
- the original PDF remains available for visual content;
- the prepared pack records no false OCR pages.

The current portable contract does not claim binary extraction of embedded images. `pdf-inspector` currently provides Markdown-level image representation, while the original PDF remains the authoritative visual asset.

### Long document and disk reopen

A deterministic Markdown source creates 5,200 sections in one document. The acceptance workflow verifies:

- browser-local preparation and pack validation;
- JSON serialization and reopen without losing the final section;
- automatic eligibility for disk-backed search;
- portable SQLite/FTS5 artifact construction;
- artifact metadata and record count;
- close and independent reopen of the SQLite file;
- exact search hits near the beginning, middle and end on repeated opens.

This test validates portability and reopen behavior, not final mobile performance thresholds.

## Deterministic PDF generator

`tests/fixtures/document-library/pdf-fixtures.mjs` writes valid PDF bytes directly, including xref offsets, standard Type 1 font resources and image XObjects. It has no runtime dependency on a PDF library or office application.

## Adding a case

1. Confirm that the source may legally be stored in the repository.
2. Prefer small synthetic or permissively licensed fixtures.
3. Add one `cases` entry and connect it to a `coverage` entry.
4. Assert source preservation, provenance and pack validation—not only non-empty parser output.
5. Run:

```bash
npm run test:document-acceptance
npm run check
```

6. Increment `corpusVersion` when expected source interpretation changes.

## Re-import and migration

Prepared pack text is derived data. When a parser, normalization rule or OCR decision changes, existing installed packs are not silently rewritten.

The migration procedure is:

1. keep the original source files and reviewed OCR JSON;
2. update expectations and increment `corpusVersion` when required;
3. run the complete acceptance gate;
4. repeat preparation into a new output directory;
5. review new OCR/discrepancy candidates;
6. build a new pack version;
7. install it through explicit user action.

Historical packs remain valid preparation snapshots with source and review provenance.

## Pending coverage

The remaining explicit PDF fixture gap is:

- unusual embedded fonts and encoding failures.

Broader ranking and answer-quality regressions remain separate Phase 3 tasks even though long-document disk reopen is now covered.
