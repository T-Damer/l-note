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
  "corpusVersion": "2026.08.04.2",
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

### Markdown

The structured Markdown fixture verifies:

- document-title extraction;
- heading-based sections;
- table preservation;
- abbreviation/source text preservation;
- an external URL remaining in the source text;
- valid pack creation and JSON reopen.

### UTF-8 TXT

The TXT fixture verifies:

- Cyrillic preservation;
- line breaks;
- quantities and dates;
- valid pack creation and JSON reopen.

### DOCX

The test builds a real ZIP container containing `word/document.xml`, writes a `.docx` file and invokes the installed `unzip` executable through the production preparer. It verifies:

- title and Heading 1 recognition;
- section grouping;
- exact paragraph start/end provenance;
- original source asset retention;
- final pack compilation.

The generated fixture avoids committing an opaque binary while still testing the external executable and real ZIP/XML path.

### Bundled PDF

The bundled PDF is processed through the actual pinned `@firecrawl/pdf-inspector-wasm` package. The test verifies:

- parser version;
- page count and structured Markdown output;
- one-based page normalization;
- every page reported by `pagesNeedingOcr` remaining outside searchable sections.

### Mixed PDF

A deterministic two-page PDF contains a substantial searchable text layer on page 1 and an image-only page 2. The real WASM parser must:

- keep page 1 outside OCR routing;
- route page 2 to OCR;
- produce searchable sections only for page 1 before review;
- preserve page anchors, inspection metadata, warnings and the original PDF asset.

### Reviewed scanned PDF

A deterministic image-only PDF is classified by the real WASM parser. The production preparation workflow then invokes the OCR boundary.

The CI test uses a deterministic Tesseract TSV response rather than machine-dependent OCR output. This keeps recognition confidence and word boxes reproducible while still testing:

- real PDF classification;
- `pdftoppm` and Tesseract command routing;
- the pending-review compilation block;
- explicit reviewer accept/edit;
- accepted OCR provenance and final pack compilation.

The recognized text never enters a pack before review.

### Multi-column PDF

A deterministic PDF contains two physical columns with aligned rows. The real parser recognizes this layout as a two-column Markdown table rather than flattening the text into an ambiguous stream. The acceptance test verifies:

- the page is not unnecessarily routed to OCR;
- both column headers and every row remain paired;
- Markdown table structure is retained;
- row order matches the physical vertical order of the source.

This structured representation is preferred to forcing the whole left column before the whole right column because the source visually expresses paired rows.

## Deterministic PDF generator

`tests/fixtures/document-library/pdf-fixtures.mjs` writes valid PDF bytes directly, including xref offsets, standard Type 1 font resources and image XObjects. It has no runtime dependency on a PDF library or office application.

This keeps the fixtures:

- small and reviewable;
- reproducible across CI runs;
- independent from opaque binary-editor metadata;
- easy to extend for focused layout failures.

## Adding a case

1. Confirm that the source may legally be stored in the repository. Prefer small synthetic or permissively licensed fixtures.
2. Add the file under `tests/fixtures/document-library/`, or add a deterministic generator when a binary container is simple to reproduce.
3. Add one `cases` entry and connect it to a `coverage` entry.
4. Assert source preservation, provenance and pack validation—not only that the parser returned non-empty text.
5. Run:

```bash
npm run test:document-acceptance
npm run check
```

6. Increment `corpusVersion` when the expected source interpretation changes.

## Re-import and migration

Prepared pack text is derived data. When a parser, normalization rule or OCR decision changes, existing installed packs are not silently rewritten.

The migration procedure is:

1. keep the original source files and any reviewed OCR JSON;
2. update the corpus expectations and increment `corpusVersion` when required;
3. run the complete acceptance gate;
4. repeat source preparation into a new output directory;
5. review new OCR/discrepancy candidates;
6. build a new pack version;
7. install the new pack alongside or instead of the old version through an explicit user action.

Historical packs remain valid snapshots of their preparation version. Their source and review provenance must stay available for comparison.

## Pending coverage

The manifest still leaves these categories pending:

- image-heavy PDF with reliable text and several embedded images;
- unusual embedded fonts and encoding failures;
- long documents and large-corpus reopen behavior.

A category becomes active only after the repository contains a reproducible fixture and assertions for the relevant integrity risks.
