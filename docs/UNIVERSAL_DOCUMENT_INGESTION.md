# Universal file ingestion

L-Note strong-device preparation accepts every regular file in the selected source directory. A file is either parsed into searchable sections or preserved as an attachment-only document that can still receive notes, relations and reviewed claims.

The pipeline is local by default. No source file is sent to a hosted parsing or OCR service.

## Routing matrix

| Source | Local route | Result |
| --- | --- | --- |
| Text-layer PDF | bundled `pdf-inspector` | page-aware Markdown sections and PDF anchors |
| Mixed or scanned PDF | `pdf-inspector`, optional local Tesseract, mandatory OCR review | reliable text pages plus only accepted OCR pages |
| DOC, DOCX, DOCM | optional `anydoc`; DOCX has the built-in unzip/XML fallback | structured blocks or paragraph-range sections |
| PPT/PPTX variants | optional `anydoc` | slide-ordered blocks, tables and speaker notes when available |
| XLS/XLSX/XLSB/XLSM | optional `anydoc` | sheets and table grids rendered to Markdown |
| ODT/ODS/ODP | optional `anydoc` | shared structured document model |
| RTF, EPUB, CSV | optional `anydoc` | shared structured document model |
| Markdown and text-like files | built-in UTF-8/UTF-16 parser | heading or line-range sections |
| Source code and configuration files | built-in text sniffing | searchable text sections |
| Unknown binary or oversized file | attachment-only fallback | preserved source plus a stable manual-annotation section |

PDF intentionally does not pass through `anydoc`: `anydoc` uses `pdf-inspector` internally but exposes less page/OCR metadata than the direct L-Note integration.

## Installing the optional office parser

The browser application does not bundle native office parsers. Install `anydoc` only on the machine that prepares source packages:

```bash
npm install --no-save @firecrawl/anydoc@0.1.2
```

Then prepare a directory:

```bash
npm run prepare:documents -- ./sources \
  --output ./prepared/my-library \
  --id personal.library \
  --title "Моя библиотека"
```

Parser modes:

- `--anydoc auto` is the default. It uses `anydoc` when installed and otherwise falls back safely.
- `--anydoc require` makes a missing or failed `anydoc` conversion fatal for recognized office formats. Use it for reproducible preparation jobs.
- `--anydoc off` disables the optional parser explicitly.

Unknown binary files are still preserved attachment-only in `require` mode. A valid office container with a misleading extension can be recognized by `anydoc` from its bytes.

The default automatic-parser size limit is 128 MiB per file. Change it with `--max-parser-bytes`. Files above the limit are preserved attachment-only instead of being loaded into parser memory.

## Structured model mapping

For non-PDF formats, L-Note consumes `anydoc.toDocument()` rather than only its Markdown output. The adapter preserves:

- headings and their order;
- paragraphs and inline emphasis;
- external, relative and internal links;
- nested and task lists;
- data and layout tables;
- block quotes and code blocks;
- footnotes and endnotes;
- embedded asset bytes, MIME type and origin package part.

Headings divide the document into L-Note sections. Each generated section records the inclusive `blockStart` and `blockEnd` range from the parsed document model. Notes receive a separate `Сноски и примечания` section.

Embedded files are copied to the package `assets/` directory. Markdown references such as `asset:0` are rewritten to their final package-relative URLs. The document source metadata retains the asset id, MIME type, byte size and original package part.

## Source provenance and reader

Every prepared document records:

- original relative path;
- copied package asset URL;
- detected or inferred format;
- MIME type;
- extractor name and pinned adapter version;
- SHA-256 of the original file;
- original byte size;
- preparation timestamp;
- embedded asset descriptors where present.

The original source file is always copied to `assets/`, including files that were parsed successfully. Every document exposes that original through the normal reader asset contract:

- PDF opens in the embedded page-aware viewer and can also be opened separately;
- other formats show a safe `Открыть или скачать исходный файл` action;
- unsupported inline-preview formats are never converted merely for display;
- section source actions keep using exact PDF page anchors where available.

## Direct manual annotation

Every document section has an `Добавить разметку` action. It opens the ordinary personal-note editor with a stable document and section target instead of requiring an artificial claim.

A source-targeted note stores:

- `targetDocumentId`, preferably qualified as `packId::documentId`;
- optional `targetSectionId`;
- the existing relation type, title, body, entity links and timestamps.

These annotations:

- survive ordinary note export and import;
- are indexed under the source document and section context;
- appear directly below the annotated section;
- can be reopened and edited from the document reader;
- remain unresolved but preserved if the corresponding package is temporarily disabled or removed.

Claim-targeted notes continue to use `targetClaimId`. Legacy notes without document targets retain their previous JSON shape.

## Attachment-only documents

“Accept every file” does not mean pretending that every binary format contains extractable text. When no safe local parser is available, L-Note creates a normal document with a section titled `Файл для ручной разметки`.

That section contains the source path, MIME type, size, SHA-256 and reason automatic extraction was skipped. The original bytes remain in the package. Users can then:

- open or download the preserved source;
- attach a personal note to the document or section;
- describe the file manually;
- link the annotation to known entities;
- add reviewed claims with explicit source provenance;
- replace the attachment-only extraction later when a parser is added.

Attachment-only metadata must not be treated as extracted evidence from inside the file.

## Current provenance limits

The shared `anydoc` model currently exposes block order and embedded-asset origin parts, but not a universal source locator for every block. As a result:

- DOCX sections have stable block ranges but not always original paragraph numbers;
- presentations retain order but do not yet expose a slide number on every generated block;
- spreadsheet tables retain sheet headings but not a cell coordinate for every value;
- PDF remains the only path with exact page anchors.

A future upstream or adapter extension should add source spans such as slide, sheet/cell, paragraph and package part without altering extracted text.

## Safety and reproducibility

- OCR text cannot enter a published package without explicit review.
- Parser failures do not discard the original file.
- `--anydoc require` allows deterministic server-side jobs to reject fallback output for recognized formats.
- Source hashes make parser upgrades and re-import decisions explicit.
- Changing an extractor does not silently rewrite an existing package; prepare a new package version and compare it through the acceptance corpus.
- Native anydoc, browser/static behavior and DuckDB preparation run as independent CI jobs.
