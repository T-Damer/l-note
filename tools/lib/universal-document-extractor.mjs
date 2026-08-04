import path from 'node:path';

import { tryExtractAnydocDocument } from './anydoc-extraction.mjs';
import { documentSourceKind, mimeTypeForFilename } from './document-formats.mjs';
import {
  attachmentOnlyExtraction,
  tryExtractTextDocument,
} from './generic-file-extraction.mjs';

function fallbackReason(filename, warnings, tooLarge) {
  if (tooLarge) return `Файл превышает лимит автоматического разбора и сохранён без извлечения текста.`;
  if (warnings.length) return `Автоматическое извлечение не выполнено: ${warnings.join(' ')}`;
  return `Для ${path.extname(filename) || 'этого формата'} нет локального автоматического парсера.`;
}

function anydocProbeMode(kind, requestedMode) {
  if (requestedMode === 'off') return 'off';
  return kind === 'anydoc' ? requestedMode : 'auto';
}

export async function extractUniversalDocument(filename, {
  relativePath = path.basename(filename),
  fileBytes = 0,
  sha256 = '',
  maxParserBytes = 128 * 1024 * 1024,
  maxSectionChars = 5000,
  anydocMode = 'auto',
  anydocModuleLoader,
  readFileFn,
  legacyDocxExtractor,
} = {}) {
  const kind = documentSourceKind(filename);
  const mimeType = mimeTypeForFilename(filename);
  const warnings = [];
  const tooLarge = fileBytes > Math.max(1, Number(maxParserBytes) || 1);

  if (!tooLarge && kind !== 'text') {
    const anydoc = await tryExtractAnydocDocument(filename, {
      mode: anydocProbeMode(kind, anydocMode),
      moduleLoader: anydocModuleLoader,
      readFileFn,
      maxSectionChars,
    });
    if (anydoc.status === 'extracted') {
      return { extracted: anydoc.extracted, parser: 'anydoc', mimeType };
    }
    if (kind === 'anydoc' && anydoc.warning) warnings.push(anydoc.warning);
  }

  if (!tooLarge && path.extname(filename).toLowerCase() === '.docx' && legacyDocxExtractor) {
    try {
      const extracted = await legacyDocxExtractor(filename, { maxSectionChars });
      return {
        extracted: {
          ...extracted,
          detectedFormat: 'docx',
          embeddedAssets: [],
          warnings: [...(extracted.warnings ?? []), ...warnings],
        },
        parser: 'docx-legacy',
        mimeType,
      };
    } catch (error) {
      warnings.push(`Legacy DOCX parser failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!tooLarge) {
    try {
      const extracted = await tryExtractTextDocument(filename, {
        readFileFn,
        maxSectionChars,
      });
      if (extracted) {
        return {
          extracted: {
            ...extracted,
            warnings: [...(extracted.warnings ?? []), ...warnings],
          },
          parser: 'text',
          mimeType,
        };
      }
    } catch (error) {
      warnings.push(`Text parser failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    extracted: attachmentOnlyExtraction(filename, {
      relativePath,
      bytes: fileBytes,
      sha256,
      mimeType,
      reason: fallbackReason(filename, warnings, tooLarge),
    }),
    parser: 'attachment',
    mimeType,
  };
}
