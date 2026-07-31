import { validatePack } from '../packs.js';

export const BROWSER_PACK_FILE_LIMIT = 32 * 1024 * 1024;
export const BROWSER_PACK_TOTAL_LIMIT = 64 * 1024 * 1024;
export const BROWSER_PACK_EXTENSIONS = Object.freeze(['.md', '.markdown', '.txt', '.json']);

const SUPPORTED_EXTENSIONS = new Set(BROWSER_PACK_EXTENSIONS);

export function slugifyPackValue(value, fallback = 'knowledge') {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96);
  return slug || fallback;
}

export function proposedBrowserPackId(title) {
  return `user.${slugifyPackValue(title)}`;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function extensionOf(filename) {
  const match = /\.[^.]+$/u.exec(String(filename ?? '').toLocaleLowerCase('en-US'));
  return match?.[0] ?? '';
}

function titleFromFilename(filename) {
  const name = String(filename ?? 'document').replace(/\.[^.]+$/u, '');
  return name.replace(/[-_]+/gu, ' ').trim() || 'Документ';
}

function splitLongSection(section, maxChars = 5000) {
  if (section.text.length <= maxChars) return [section];
  const paragraphs = section.text.split(/\n{2,}/gu).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  if (chunks.length <= 1) {
    chunks.length = 0;
    for (let offset = 0; offset < section.text.length; offset += maxChars) {
      chunks.push(section.text.slice(offset, offset + maxChars));
    }
  }
  return chunks.map((text, index) => ({
    ...section,
    id: `${section.id}-part-${index + 1}`,
    title: `${section.title} · часть ${index + 1}`,
    text,
  }));
}

export function parseBrowserMarkdown(text, filename = 'document.md') {
  const source = cleanText(text);
  const sections = [];
  let title = titleFromFilename(filename);
  let currentTitle = 'Содержание';
  let currentLines = [];
  let firstHeadingHandled = false;

  const flush = () => {
    const body = cleanText(currentLines.join('\n'));
    currentLines = [];
    if (!body) return;
    sections.push(...splitLongSection({
      id: slugifyPackValue(currentTitle, `section-${sections.length + 1}`),
      title: currentTitle,
      text: body,
      entityIds: [],
      tags: [],
    }));
  };

  for (const line of source.split('\n')) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
    if (!heading) {
      currentLines.push(line);
      continue;
    }
    const headingText = cleanText(heading[2]);
    if (heading[1].length === 1 && !firstHeadingHandled && sections.length === 0 && !cleanText(currentLines.join('\n'))) {
      title = headingText;
      firstHeadingHandled = true;
      continue;
    }
    flush();
    currentTitle = headingText;
    firstHeadingHandled = true;
  }
  flush();
  if (!sections.length && source) {
    sections.push({ id: 'content', title: 'Содержание', text: source, entityIds: [], tags: [] });
  }
  return { title, sections };
}

export function parseBrowserPlainText(text, filename = 'document.txt') {
  const source = cleanText(text);
  const lines = source.split('\n');
  let title = titleFromFilename(filename);
  let body = source;
  if (lines[0] && lines[0].length <= 120 && lines.length > 1) {
    title = lines[0].replace(/^#+\s*/u, '').trim();
    body = cleanText(lines.slice(1).join('\n')) || source;
  }
  return {
    title,
    sections: splitLongSection({ id: 'content', title: 'Содержание', text: body, entityIds: [], tags: [] }),
  };
}

function flattenJson(value, prefix = '$', output = []) {
  if (value === null || typeof value !== 'object') {
    output.push(`${prefix}: ${JSON.stringify(value)}`);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenJson(item, `${prefix}[${index}]`, output));
    return output;
  }
  for (const [key, item] of Object.entries(value)) flattenJson(item, `${prefix}.${key}`, output);
  return output;
}

export function parseBrowserJson(text, filename = 'document.json') {
  const parsed = JSON.parse(text);
  if (parsed?.schemaVersion === 1 && Array.isArray(parsed.documents) && Array.isArray(parsed.entities)) {
    return { existingPack: parsed };
  }
  return {
    title: typeof parsed?.title === 'string' ? parsed.title : titleFromFilename(filename),
    sections: splitLongSection({
      id: 'data',
      title: 'Данные',
      text: flattenJson(parsed).join('\n') || '{}',
      entityIds: [],
      tags: ['json'],
    }),
  };
}

function abbreviationCandidates(text) {
  const output = [];
  const patterns = [
    /([\p{L}][\p{L}\p{N}\s,–—-]{3,100}?)\s*\(([А-ЯA-ZЁ0-9][А-ЯA-ZЁ0-9.-]{1,11})\)/gu,
    /([А-ЯA-ZЁ0-9][А-ЯA-ZЁ0-9.-]{1,11})\s*[—–-]\s*([\p{L}][^.;\n]{3,100})/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const firstIsAlias = /^[А-ЯA-ZЁ0-9.-]{2,12}$/u.test(match[1].trim());
      const alias = (firstIsAlias ? match[1] : match[2]).trim();
      const canonical = cleanText(firstIsAlias ? match[2] : match[1]).replace(/^[,:;\s]+|[,:;\s]+$/gu, '');
      if (alias.length >= 2 && canonical.length >= 4) output.push({ alias, canonical });
    }
  }
  return output;
}

function uniqueId(base, used) {
  let id = base;
  let index = 2;
  while (used.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  used.add(id);
  return id;
}

function discoverEntities(documents) {
  const byCanonical = new Map();
  const usedIds = new Set();
  for (const document of documents) {
    for (const section of document.sections) {
      for (const candidate of abbreviationCandidates(section.text)) {
        const key = candidate.canonical.toLocaleLowerCase('ru-RU');
        const current = byCanonical.get(key) ?? {
          id: uniqueId(`term.${slugifyPackValue(candidate.canonical)}`, usedIds),
          name: candidate.canonical,
          type: 'term',
          aliases: [],
          description: 'Термин, автоматически найденный при локальной подготовке пакета.',
        };
        current.aliases = [...new Set([...current.aliases, candidate.alias])];
        byCanonical.set(key, current);
      }
    }
  }
  const entities = [...byCanonical.values()];
  for (const document of documents) {
    for (const section of document.sections) {
      const normalized = section.text.toLocaleLowerCase('ru-RU');
      section.entityIds = entities
        .filter((entity) => [entity.name, ...entity.aliases].some((name) => normalized.includes(name.toLocaleLowerCase('ru-RU'))))
        .map((entity) => entity.id)
        .sort();
    }
  }
  return entities.sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}

function validateSourceFiles(files) {
  const list = [...(files ?? [])];
  if (!list.length) throw new TypeError('Выберите хотя бы один .md, .txt или .json файл.');
  let total = 0;
  for (const file of list) {
    const extension = extensionOf(file?.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new TypeError(`Формат ${extension || file?.name || 'файла'} пока не поддерживается.`);
    const size = Number(file?.size ?? 0);
    if (size > BROWSER_PACK_FILE_LIMIT) throw new RangeError(`Файл «${file.name}» превышает лимит 32 МБ.`);
    total += size;
  }
  if (total > BROWSER_PACK_TOTAL_LIMIT) throw new RangeError('Общий размер выбранных файлов превышает лимит 64 МБ.');
  return list;
}

function parseSource(filename, text) {
  const extension = extensionOf(filename);
  if (extension === '.md' || extension === '.markdown') return parseBrowserMarkdown(text, filename);
  if (extension === '.json') return parseBrowserJson(text, filename);
  return parseBrowserPlainText(text, filename);
}

export function browserPackStats(pack) {
  const sections = (pack.documents ?? []).reduce((sum, document) => sum + (document.sections?.length ?? 0), 0);
  return Object.freeze({
    documents: pack.documents?.length ?? 0,
    sections,
    entities: pack.entities?.length ?? 0,
    claims: pack.claims?.length ?? 0,
    relations: pack.relations?.length ?? 0,
    bytes: new TextEncoder().encode(JSON.stringify(pack)).byteLength,
  });
}

export async function buildPackFromBrowserFiles({
  files,
  id,
  version = '1.0.0',
  title,
  description = 'Пользовательский пакет знаний',
  language = 'ru',
  onProgress = () => {},
} = {}) {
  const sourceFiles = validateSourceFiles(files);
  const packTitle = cleanText(title);
  if (!packTitle) throw new TypeError('Укажите название пакета.');
  const packId = cleanText(id) || proposedBrowserPackId(packTitle);
  const documents = [];
  const usedDocumentIds = new Set();

  for (const [fileIndex, file] of sourceFiles.entries()) {
    onProgress({ stage: 'reading', completed: fileIndex, total: sourceFiles.length, filename: file.name });
    const text = await file.text();
    if (new TextEncoder().encode(text).byteLength > BROWSER_PACK_FILE_LIMIT) {
      throw new RangeError(`Файл «${file.name}» превышает лимит 32 МБ после чтения.`);
    }
    const parsed = parseSource(file.name, text);
    if (parsed.existingPack) {
      if (sourceFiles.length !== 1) throw new TypeError('Готовый пакет JSON нужно выбирать отдельно от исходных документов.');
      const validation = validatePack(parsed.existingPack);
      if (!validation.valid) throw new TypeError(`Готовый пакет повреждён: ${validation.errors.join('; ')}`);
      onProgress({ stage: 'ready', completed: 1, total: 1, filename: file.name });
      return parsed.existingPack;
    }
    const documentId = uniqueId(`doc.${slugifyPackValue(file.name)}`, usedDocumentIds);
    documents.push({
      id: documentId,
      title: parsed.title,
      summary: `Локально импортировано из ${file.name}`,
      authority: 'reference',
      effectiveFrom: null,
      source: { title: file.name },
      tags: [extensionOf(file.name).slice(1)],
      sections: parsed.sections.map((section, index) => ({
        ...section,
        id: `${slugifyPackValue(section.id || section.title, `section-${index + 1}`)}-${index + 1}`,
      })),
    });
  }

  onProgress({ stage: 'indexing', completed: sourceFiles.length, total: sourceFiles.length });
  const pack = {
    schemaVersion: 1,
    id: packId,
    version: cleanText(version) || '1.0.0',
    title: packTitle,
    description: cleanText(description) || 'Пользовательский пакет знаний',
    language: cleanText(language) || 'ru',
    publishedAt: new Date().toISOString(),
    license: 'user-supplied',
    tags: ['user-pack'],
    documents,
    entities: discoverEntities(documents),
    claims: [],
    relations: [],
  };
  const validation = validatePack(pack);
  if (!validation.valid) throw new TypeError(`Не удалось собрать пакет: ${validation.errors.join('; ')}`);
  onProgress({ stage: 'ready', completed: sourceFiles.length, total: sourceFiles.length });
  return pack;
}
