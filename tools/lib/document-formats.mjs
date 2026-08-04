import path from 'node:path';

export const ANYDOC_EXTENSIONS = Object.freeze([
  '.doc', '.docx', '.docm',
  '.ppt', '.pps', '.pot', '.pptx', '.pptm', '.ppsx', '.ppsm',
  '.xls', '.xlsx', '.xlsm', '.xlsb',
  '.odt', '.ods', '.odp',
  '.rtf', '.epub', '.csv',
]);

export const TEXT_DOCUMENT_EXTENSIONS = Object.freeze([
  '.txt', '.text', '.md', '.markdown', '.mdx',
  '.json', '.jsonl', '.ndjson', '.xml', '.html', '.htm',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.log',
  '.sql', '.graphql', '.gql',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx',
  '.py', '.rs', '.go', '.java', '.kt', '.kts', '.swift',
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.cs',
  '.rb', '.php', '.lua', '.r', '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
]);

const ANYDOC_SET = new Set(ANYDOC_EXTENSIONS);
const TEXT_SET = new Set(TEXT_DOCUMENT_EXTENSIONS);

const MIME_BY_EXTENSION = Object.freeze({
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.docm': 'application/vnd.ms-word.document.macroEnabled.12',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pps': 'application/vnd.ms-powerpoint',
  '.pot': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pptm': 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  '.ppsx': 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  '.ppsm': 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xlsb': 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.rtf': 'application/rtf',
  '.epub': 'application/epub+zip',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.text': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.mdx': 'text/markdown',
  '.json': 'application/json',
  '.jsonl': 'application/x-ndjson',
  '.ndjson': 'application/x-ndjson',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.toml': 'application/toml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.zip': 'application/zip',
  '.sqlite': 'application/vnd.sqlite3',
  '.db': 'application/octet-stream',
});

const FORMAT_HINTS = Object.freeze({
  '.doc': 'doc', '.docx': 'docx', '.docm': 'docx',
  '.ppt': 'ppt', '.pps': 'ppt', '.pot': 'ppt',
  '.pptx': 'pptx', '.pptm': 'pptx', '.ppsx': 'pptx', '.ppsm': 'pptx',
  '.xls': 'xlsx', '.xlsx': 'xlsx', '.xlsm': 'xlsx', '.xlsb': 'xlsx',
  '.odt': 'odt', '.ods': 'ods', '.odp': 'odp',
  '.rtf': 'rtf', '.epub': 'epub', '.csv': 'csv',
});

const EXTENSION_BY_MIME = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/octet-stream': '.bin',
});

export function sourceExtension(filename) {
  return path.extname(String(filename ?? '')).toLowerCase();
}

export function documentSourceKind(filename) {
  const extension = sourceExtension(filename);
  if (extension === '.pdf') return 'pdf';
  if (ANYDOC_SET.has(extension)) return 'anydoc';
  if (TEXT_SET.has(extension)) return 'text';
  return 'attachment';
}

export function anydocFormatHint(filename) {
  return FORMAT_HINTS[sourceExtension(filename)] ?? null;
}

export function mimeTypeForFilename(filename) {
  const extension = sourceExtension(filename);
  if (MIME_BY_EXTENSION[extension]) return MIME_BY_EXTENSION[extension];
  if (TEXT_SET.has(extension)) return 'text/plain';
  return 'application/octet-stream';
}

export function embeddedAssetExtension(mediaType) {
  return EXTENSION_BY_MIME[String(mediaType ?? '').toLowerCase()] ?? '.bin';
}

export function decodeLikelyText(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  let view = bytes;
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    view = bytes.subarray(2);
    encoding = 'utf-16le';
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.alloc(Math.max(0, bytes.length - 2));
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    view = swapped;
    encoding = 'utf-16le';
  }
  let text;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(view);
  } catch {
    return null;
  }
  if (!text.trim()) return '';
  const sample = text.slice(0, 32_768);
  let controls = 0;
  for (const character of sample) {
    const code = character.codePointAt(0);
    if (code === 0 || (code < 32 && !['\n', '\r', '\t', '\f'].includes(character))) controls += 1;
  }
  return controls / Math.max(1, sample.length) > 0.02 ? null : text;
}
