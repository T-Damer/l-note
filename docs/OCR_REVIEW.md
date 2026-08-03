# OCR review workflow

## Decision

OCR output is a proposal, not evidence. A scanned PDF page enters an L-Note pack only after a reviewer explicitly accepts its text. The reviewer may edit the text before acceptance or dismiss the page entirely.

The workflow is local and dependency-light:

```text
PDF without a usable text layer
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

## First pass

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
