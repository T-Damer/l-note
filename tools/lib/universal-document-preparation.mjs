import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  extractDocxDocument,
  extractPdfDocument,
  runCommand,
} from './document-extraction.mjs';
import {
  documentSourceKind,
  mimeTypeForFilename,
  sourceExtension,
} from './document-formats.mjs';
import {
  OCR_REVIEW_KIND,
  createOcrReview,
  ocrReviewState,
  sha256File,
} from './ocr-review.mjs';
import { slugify } from './pack-builder.mjs';
import {
  acceptedPdfOcrSections,
  createPdfOcrCandidates,
} from './pdf-ocr-preparation.mjs';
import { extractUniversalDocument } from './universal-document-extractor.mjs';
import {
  copyPrimaryAsset,
  listUniversalSourceFiles,
  saveEmbeddedAssets,
} from './universal-preparation-files.mjs';

const DEFAULT_MAX_PARSER_BYTES = 128 * 1024 * 1024;

async function writeJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function assertReviewInput(review, packId) {
  if (!review) return;
  if (review.kind !== OCR_REVIEW_KIND || review.targetPackId !== packId) {
    throw new Error('The OCR review does not belong to this prepared pack.');
  }
}

function reviewManifest(review) {
  if (!review) return [];
  const state = ocrReviewState(review);
  return [{
    kind: 'ocr',
    reviewKind: OCR_REVIEW_KIND,
    status: state.complete ? 'completed' : 'pending',
    candidates: review.candidates.length,
    accepted: state.accept,
    dismissed: state.dismiss,
    pending: state.pending,
    reviewedAt: review.reviewedAt ?? null,
    reviewedBy: review.reviewedBy ?? null,
  }];
}

function pageOrder(section) {
  return Number(section.assetAnchor?.page ?? Number.MAX_SAFE_INTEGER);
}

function parserTag(parser) {
  return String(parser ?? 'unknown').replace(/[^a-z0-9._-]+/giu, '-').toLowerCase();
}

function increment(stats, key) {
  stats[key] = Number(stats[key] ?? 0) + 1;
}

async function extractFile(filename, options) {
  if (documentSourceKind(filename) === 'pdf') {
    return {
      parser: 'pdf-inspector',
      mimeType: 'application/pdf',
      extracted: await extractPdfDocument(filename, {
        runner: options.runner,
        ocr: options.ocr,
        ocrLanguage: options.ocrLanguage,
        maxSectionChars: options.maxSectionChars,
      }),
    };
  }
  return extractUniversalDocument(filename, {
    relativePath: options.relative,
    fileBytes: options.fileBytes,
    sha256: options.sha256,
    maxParserBytes: options.maxParserBytes,
    maxSectionChars: options.maxSectionChars,
    anydocMode: options.anydocMode,
    anydocModuleLoader: options.anydocModuleLoader,
    readFileFn: options.readFileFn,
    legacyDocxExtractor: (source, values) => extractDocxDocument(source, {
      runner: options.runner,
      maxSectionChars: values.maxSectionChars,
    }),
  });
}

export async function prepareUniversalDocumentDirectory({
  inputPath,
  outputPath,
  id,
  version = '1.0.0',
  title = id,
  description = 'Пакет, подготовленный из пользовательских файлов',
  language = 'ru',
  ocr = false,
  ocrLanguage = 'rus+eng',
  ocrReview = null,
  anydocMode = 'auto',
  maxParserBytes = DEFAULT_MAX_PARSER_BYTES,
  maxSectionChars = 5000,
  runner = runCommand,
  anydocModuleLoader,
  readFileFn,
  generatedAt = new Date().toISOString(),
  onProgress = () => {},
} = {}) {
  if (!inputPath || !outputPath || !id) throw new TypeError('inputPath, outputPath and id are required.');
  assertReviewInput(ocrReview, id);
  const outputRoot = path.resolve(outputPath);
  const files = await listUniversalSourceFiles(inputPath, { excludePath: outputRoot });
  if (!files.length) throw new Error('No source files found.');
  const inputAbsolute = path.resolve(inputPath);
  const inputRoot = (await stat(inputAbsolute)).isDirectory() ? inputAbsolute : path.dirname(inputAbsolute);
  const documentRoot = path.join(outputRoot, 'documents');
  const assetRoot = path.join(outputRoot, 'assets');
  await mkdir(documentRoot, { recursive: true });
  await mkdir(assetRoot, { recursive: true });
  const usedAssets = new Set();
  const warnings = [];
  const drafts = [];
  const candidates = [];
  const parserStats = {};

  for (const [index, filename] of files.entries()) {
    const relative = path.relative(inputRoot, filename).split(path.sep).join('/');
    onProgress({ index, total: files.length, file: relative, stage: 'extract' });
    const info = await stat(filename);
    const sourceSha256 = await sha256File(filename);
    const routed = await extractFile(filename, {
      relative,
      fileBytes: info.size,
      sha256: sourceSha256,
      maxParserBytes,
      maxSectionChars,
      anydocMode,
      anydocModuleLoader,
      readFileFn,
      runner,
      ocr,
      ocrLanguage,
    });
    const extracted = routed.extracted;
    increment(parserStats, routed.parser);
    const primaryAsset = await copyPrimaryAsset(filename, relative, assetRoot, usedAssets);
    const embedded = await saveEmbeddedAssets({
      embeddedAssets: extracted.embeddedAssets,
      relative,
      assetRoot,
      usedAssets,
      sections: extracted.sections,
    });
    extracted.sections = embedded.sections;
    const documentId = `doc.${slugify(relative)}`;
    const documentCandidates = sourceExtension(filename) === '.pdf' && extracted.ocrPages.length
      ? createPdfOcrCandidates({
        targetPackId: id,
        sourcePath: relative,
        sourceSha256,
        assetUrl: primaryAsset.url,
        documentId,
        documentTitle: extracted.title,
        language: ocrLanguage,
        ocrPages: extracted.ocrPages,
      })
      : [];
    candidates.push(...documentCandidates);
    const format = extracted.detectedFormat ?? (sourceExtension(filename).slice(1) || 'unknown');
    const mimeType = routed.mimeType ?? mimeTypeForFilename(filename);
    drafts.push({
      relative,
      primaryAsset,
      extracted,
      documentCandidates,
      isPdf: sourceExtension(filename) === '.pdf',
      document: {
        id: documentId,
        title: extracted.title,
        summary: `Извлечено или сохранено из ${relative}`,
        authority: 'reference',
        effectiveFrom: null,
        source: {
          title: relative,
          path: primaryAsset.url,
          mimeType,
          extractor: extracted.extractor,
          format,
          sha256: sourceSha256,
          bytes: info.size,
          preparedAt: generatedAt,
          ...(embedded.descriptors.length ? { embeddedAssets: embedded.descriptors } : {}),
        },
        tags: [...new Set([
          format,
          parserTag(routed.parser),
          ...(routed.parser === 'attachment' ? ['attachment-only'] : []),
        ])],
        sections: [...extracted.sections],
        ...(extracted.warnings.length ? { extractionWarnings: extracted.warnings } : {}),
      },
    });
  }

  const review = candidates.length
    ? createOcrReview({ targetPackId: id, candidates, previousReview: ocrReview, generatedAt })
    : null;
  const reviewState = review ? ocrReviewState(review) : null;
  let writtenDocuments = 0;
  let sections = 0;
  for (const draft of drafts) {
    const document = draft.document;
    if (review && draft.documentCandidates.length) {
      document.sections.push(...acceptedPdfOcrSections(review, draft.documentCandidates, {
        maxChars: maxSectionChars,
      }));
      document.sections.sort((left, right) => pageOrder(left) - pageOrder(right) || left.id.localeCompare(right.id));
    }
    if (!document.sections.length && reviewState?.complete) {
      warnings.push(`${draft.relative}: все OCR-страницы отклонены; документ не включён.`);
      continue;
    }
    if (draft.isPdf) {
      document.asset = {
        url: draft.primaryAsset.url,
        mimeType: 'application/pdf',
        title: draft.extracted.title,
        page: 1,
      };
    }
    await writeJson(path.join(documentRoot, `${slugify(draft.relative)}.json`), document);
    warnings.push(...draft.extracted.warnings.map((warning) => `${draft.relative}: ${warning}`));
    sections += document.sections.length;
    writtenDocuments += 1;
  }

  await Promise.all([
    writeJson(path.join(outputRoot, 'manifest.json'), {
      schemaVersion: 1,
      id,
      version,
      title,
      description,
      language,
      publishedAt: generatedAt,
      license: 'user-supplied',
      tags: ['user-pack', 'prepared-documents', 'universal-ingestion'],
      ...(review ? { preparationReviews: reviewManifest(review) } : {}),
    }),
    writeJson(path.join(outputRoot, 'entities.json'), []),
    writeJson(path.join(outputRoot, 'claims.json'), []),
    writeJson(path.join(outputRoot, 'relations.json'), []),
  ]);
  onProgress({ index: files.length, total: files.length, stage: 'done' });
  return {
    outputPath: outputRoot,
    files: files.length,
    documents: writtenDocuments,
    sections,
    warnings: [...new Set(warnings)],
    parserStats,
    ocrReview: review,
    ocrReviewState: reviewState,
  };
}
