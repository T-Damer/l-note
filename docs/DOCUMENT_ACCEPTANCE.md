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
  "corpusVersion": "2026.08.04.1",
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

## Initial active cases

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

### PDF

The bundled PDF is processed through the actual pinned `@firecrawl/pdf-inspector-wasm` package. The test verifies:

- parser version;
- page count and structured Markdown output;
- one-based page normalization;
- every page reported by `pagesNeedingOcr` remaining outside searchable sections.

It does not claim that this one file covers mixed, scanned, multi-column, image-heavy or unusual-font PDFs.

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

The initial manifest intentionally leaves these categories pending:

- mixed PDF with both reliable text and scan pages;
- scanned PDF with accepted, edited and dismissed OCR pages;
- multi-column PDF;
- image-heavy PDF;
- unusual embedded fonts and encoding failures;
- long documents and large-corpus reopen behavior.

A category becomes active only after the repository contains a reproducible fixture and assertions for the relevant integrity risks.
