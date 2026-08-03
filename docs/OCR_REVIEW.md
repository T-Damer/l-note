# OCR review workflow

## Decision

OCR output is a proposal, not evidence. A scanned PDF page enters an L-Note pack only after a reviewer explicitly accepts its text. The reviewer may edit the text before acceptance or dismiss the page entirely.

`pdf-inspector` is the default PDF parser and OCR router in both the browser creator and the strong-device CLI. It classifies the document, converts reliable text-layer pages into structured Markdown, preserves tables and reading order, and identifies pages that still need OCR. It does not perform OCR and therefore cannot bypass the review gate described below.

The shared routing model is:

```text
PDF bytes
  → pdf-inspector WASM
  → structured Markdown, tables and one-based page markers
  → reliable text-layer pages become pack sections
  → pagesNeedingOcr remain outside searchable evidence
  → optional Tesseract TSV and mandatory human review
```

A mixed PDF can be prepared from its reliable pages in the browser while retaining a warning about omitted scan pages. A scanned-only PDF is rejected by the browser creator and must use the strong-device OCR workflow. The current WASM result exposes image placeholders inside Markdown, not extracted binary image assets; original-image extraction may be added later as a separate reviewed asset adapter.

The strong-device OCR continuation is local and dependency-light:

```text
page flagged by pdf-inspector
  → pdftoppm page image
  → Tesseract TSV
  → text + word confidence + coordinates
  → lnote.ocr-review JSON
  → standalone offline HTML review
  → accept / edit / dismiss every page
  → repeat preparation with reviewed JSON
  → ordinary source sections
  → normal pack validation
```

`build-pack.mjs` rejects an authoring directory while any `preparationReviews` entry is not `completed`.

## Browser preparation

Open **Пакеты → Создать свой пакет** and select one or more PDF, Markdown, TXT or JSON files. PDF parsing runs inside a module Worker through the pinned `@firecrawl/pdf-inspector-wasm` package; file bytes are not uploaded.

For each PDF, L-Note preserves:

- structured Markdown generated from the text layer;
- Markdown tables, headings, lists and reading order;
- one-based `assetAnchor.page` values;
- parser version, PDF classification, confidence and layout diagnostics;
- the exact page list and reasons reported by `pagesNeedingOcr`.

URI annotations that resolve back to the current PDF are normalized before sectioning and indexing. Fragment links, the current PDF filename and an exact known source URL lose their self-referential destination while their meaningful visible label remains. A standalone duplicate URL to the current PDF is removed. Links to other documents and Markdown image syntax are preserved.

Pages marked as needing OCR are not converted into searchable sections. This is conservative by design: a broken or empty text layer must not become evidence merely because neighboring pages parsed successfully.

## Strong-device preparation

`npm run prepare:documents` uses the same WASM parser and page routing. Poppler `pdftotext` is no longer required. The CLI retains the original PDF asset and can continue flagged pages through `pdftoppm`, Tesseract TSV and the mandatory review file.

For ordinary text-layer PDFs no external PDF executable is required. DOCX preparation still requires `unzip`; OCR requires `pdftoppm` and `tesseract` with the selected language data.

## First OCR pass

```bash
npm run prepare:documents -- ./documents \
  --output ./prepared/pending \
  --id com.example.documents \
  --title "My documents" \
  --ocr \
  --ocr-language rus+eng
```

The output directory contains:

```text
prepared/pending/
  manifest.json
  ocr-review.json
  ocr-review.html
  assets/
    source.pdf
  documents/
    source.json
```

Text-layer PDF pages and DOCX paragraphs are prepared normally. OCR pages remain outside searchable source sections until review.

Opening `ocr-review.html` shows the PDF page and editable OCR text side by side. It also reports average/minimum confidence and lists words below the confidence threshold with their bounding boxes.

The review page requires a decision for every page before downloading reviewed JSON:

- `accept` — use the edited text;
- `dismiss` — exclude the OCR page;
- `pending` — unresolved; downloading is blocked.

## Reviewed pass

```bash
npm run prepare:documents -- ./documents \
  --output ./prepared/reviewed \
  --id com.example.documents \
  --title "My documents" \
  --ocr \
  --ocr-language rus+eng \
  --ocr-review-in ./downloads/com.example.documents.ocr-review.json
```

Then compile the ordinary authoring directory:

```bash
npm run build:pack -- \
  --input ./prepared/reviewed \
  --output ./dist/documents.pack.json
```

Accepted OCR sections retain:

- source PDF SHA-256;
- page number and review candidate ID;
- OCR language;
- average/minimum confidence and low-confidence word count;
- reviewer identity and time;
- exact edited text used as evidence.

Dismissed pages do not enter the pack. If every page of a scanned document is dismissed and it has no text-layer sections, the document is omitted with a visible warning.

## Source-change protection

The stable OCR candidate ID includes:

- target pack ID;
- relative source path;
- source file SHA-256;
- page number;
- OCR language set.

Changing the PDF or OCR language produces a new candidate ID. An older review therefore cannot silently apply to a different source version. The new page returns to `pending` and blocks compilation.

## Review contract

```json
{
  "schemaVersion": 1,
  "kind": "lnote.ocr-review",
  "targetPackId": "com.example.documents",
  "generatedAt": "2026-08-03T16:00:00.000Z",
  "reviewedAt": "2026-08-03T17:00:00.000Z",
  "reviewedBy": "Reviewer",
  "candidates": [
    {
      "id": "ocr-review.0123456789abcdef",
      "decision": "accept",
      "sourcePath": "scan.pdf",
      "sourceSha256": "...",
      "assetUrl": "./assets/scan.pdf",
      "page": 2,
      "language": "rus+eng",
      "originalText": "Raw OCR text",
      "text": "Reviewed OCR text",
      "averageConfidence": 88.4,
      "minimumConfidence": 51.2,
      "lowConfidenceWords": 3,
      "words": []
    }
  ]
}
```

Word records contain text, confidence and pixel coordinates. They are review diagnostics and do not become searchable pack text.

## External review systems

Tesseract can also emit hOCR, ALTO-like outputs through converters and searchable PDF, while OCR-D commonly uses PAGE XML for structured text regions and coordinates. Label Studio provides an open-source image OCR template with editable region transcription and preannotations; its native PDF OCR template is an Enterprise feature.

These systems may become optional import/export adapters. They must preserve the same invariants:

1. OCR is never accepted automatically.
2. The original PDF and page remain identifiable.
3. Source version/hash mismatches invalidate old decisions.
4. Only explicitly accepted edited text becomes evidence.
5. Pack compilation remains blocked while review is incomplete.
