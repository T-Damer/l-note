import { readFile } from 'node:fs/promises';

import { anydocFormatHint } from './document-formats.mjs';
import { sectionsFromAnydoc } from './anydoc-markup.mjs';

export const ANYDOC_PACKAGE_NAME = '@firecrawl/anydoc';
export const ANYDOC_RECOMMENDED_VERSION = '0.1.2';
export const ANYDOC_MODES = Object.freeze(['auto', 'require', 'off']);

function normalizedMode(value) {
  const mode = String(value ?? 'auto').trim().toLowerCase();
  if (!ANYDOC_MODES.includes(mode)) {
    throw new TypeError(`anydoc mode must be one of: ${ANYDOC_MODES.join(', ')}.`);
  }
  return mode;
}

function missingModule(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.code === 'ERR_MODULE_NOT_FOUND'
    || error?.code === 'MODULE_NOT_FOUND'
    || message.includes(`Cannot find package '${ANYDOC_PACKAGE_NAME}'`)
    || message.includes(`Cannot find module '${ANYDOC_PACKAGE_NAME}'`);
}

async function defaultModuleLoader() {
  return import(ANYDOC_PACKAGE_NAME);
}

export async function loadAnydoc({ mode = 'auto', moduleLoader = defaultModuleLoader } = {}) {
  const selectedMode = normalizedMode(mode);
  if (selectedMode === 'off') return { mode: selectedMode, module: null, warning: null };
  try {
    const module = await moduleLoader(ANYDOC_PACKAGE_NAME);
    if (typeof module?.toDocument !== 'function') {
      throw new TypeError(`${ANYDOC_PACKAGE_NAME} does not expose toDocument().`);
    }
    return { mode: selectedMode, module, warning: null };
  } catch (error) {
    if (selectedMode === 'require' || !missingModule(error)) throw error;
    return {
      mode: selectedMode,
      module: null,
      warning: `${ANYDOC_PACKAGE_NAME} is not installed; office formats will use a fallback or remain attachment-only. Run npm install --no-save ${ANYDOC_PACKAGE_NAME}@${ANYDOC_RECOMMENDED_VERSION} for structured extraction.`,
    };
  }
}

function normalizedAssets(assets = []) {
  return assets.map((asset, index) => ({
    id: Number.isInteger(asset?.id) ? asset.id : index,
    mediaType: String(asset?.mediaType ?? 'application/octet-stream'),
    originPart: String(asset?.originPart ?? ''),
    data: Buffer.from(asset?.data ?? []),
  }));
}

function detectedFormat(anydoc, bytes, filename) {
  return anydoc.formatFromBytes?.(bytes)
    ?? anydoc.formatFromPath?.(filename)
    ?? anydocFormatHint(filename)
    ?? null;
}

export async function tryExtractAnydocDocument(filename, {
  mode = 'auto',
  moduleLoader = defaultModuleLoader,
  readFileFn = readFile,
  maxSectionChars = 5000,
} = {}) {
  const loaded = await loadAnydoc({ mode, moduleLoader });
  if (!loaded.module) {
    return { status: loaded.mode === 'off' ? 'disabled' : 'unavailable', warning: loaded.warning };
  }
  const bytes = await readFileFn(filename);
  const format = detectedFormat(loaded.module, bytes, filename);
  try {
    const model = await loaded.module.toDocument(bytes, format ?? undefined);
    const normalized = sectionsFromAnydoc(model, filename, { maxSectionChars });
    return {
      status: 'extracted',
      extracted: {
        ...normalized,
        ocrPages: [],
        warnings: [],
        extractor: `anydoc@${ANYDOC_RECOMMENDED_VERSION}`,
        detectedFormat: format,
        embeddedAssets: normalizedAssets(model.assets),
      },
    };
  } catch (error) {
    if (normalizedMode(mode) === 'require') throw error;
    return {
      status: 'failed',
      warning: `${filename}: anydoc could not extract the document: ${error instanceof Error ? error.message : String(error)}`,
      error,
    };
  }
}
