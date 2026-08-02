import {
  cleanPackText,
  packSourceExtension,
  parseBrowserSource,
  proposedBrowserPackId,
  slugifyPackValue,
} from '../helpers/pack-source-parser.js';
import { validatePack } from '../packs.js';

export const BROWSER_PACK_FILE_LIMIT = 32 * 1024 * 1024;
export const BROWSER_PACK_TOTAL_LIMIT = 64 * 1024 * 1024;
export const BROWSER_PACK_EXTENSIONS = Object.freeze(['.md', '.markdown', '.txt', '.json']);

const SUPPORTED_EXTENSIONS = new Set(BROWSER_PACK_EXTENSIONS);

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
      const canonical = cleanPackText(firstIsAlias ? match[2] : match[1])
        .replace(/^[,:;\s]+|[,:;\s]+$/gu, '');
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
        .filter((entity) => [entity.name, ...entity.aliases]
          .some((name) => normalized.includes(name.toLocaleLowerCase('ru-RU'))))
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
    const extension = packSourceExtension(file?.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new TypeError(`Формат ${extension || file?.name || 'файла'} пока не поддерживается.`);
    }
    const size = Number(file?.size ?? 0);
    if (size > BROWSER_PACK_FILE_LIMIT) throw new RangeError(`Файл «${file.name}» превышает лимит 32 МБ.`);
    total += size;
  }
  if (total > BROWSER_PACK_TOTAL_LIMIT) {
    throw new RangeError('Общий размер выбранных файлов превышает лимит 64 МБ.');
  }
  return list;
}

function createDocument(file, parsed, usedDocumentIds) {
  const documentId = uniqueId(`doc.${slugifyPackValue(file.name)}`, usedDocumentIds);
  return {
    id: documentId,
    title: parsed.title,
    summary: `Локально импортировано из ${file.name}`,
    authority: 'reference',
    effectiveFrom: null,
    source: { title: file.name },
    tags: [packSourceExtension(file.name).slice(1)],
    sections: parsed.sections.map((section, index) => ({
      ...section,
      id: `${slugifyPackValue(section.id || section.title, `section-${index + 1}`)}-${index + 1}`,
    })),
  };
}

export function browserPackStats(pack) {
  const sections = (pack.documents ?? []).reduce(
    (sum, document) => sum + (document.sections?.length ?? 0),
    0,
  );
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
  const packTitle = cleanPackText(title);
  if (!packTitle) throw new TypeError('Укажите название пакета.');
  const documents = [];
  const usedDocumentIds = new Set();

  for (const [index, file] of sourceFiles.entries()) {
    onProgress({ stage: 'reading', completed: index, total: sourceFiles.length, filename: file.name });
    const text = await file.text();
    if (new TextEncoder().encode(text).byteLength > BROWSER_PACK_FILE_LIMIT) {
      throw new RangeError(`Файл «${file.name}» превышает лимит 32 МБ после чтения.`);
    }
    const parsed = parseBrowserSource(file.name, text);
    if (parsed.existingPack) {
      if (sourceFiles.length !== 1) {
        throw new TypeError('Готовый пакет JSON нужно выбирать отдельно от исходных документов.');
      }
      const validation = validatePack(parsed.existingPack);
      if (!validation.valid) throw new TypeError(`Готовый пакет повреждён: ${validation.errors.join('; ')}`);
      onProgress({ stage: 'ready', completed: 1, total: 1, filename: file.name });
      return parsed.existingPack;
    }
    documents.push(createDocument(file, parsed, usedDocumentIds));
  }

  onProgress({ stage: 'indexing', completed: sourceFiles.length, total: sourceFiles.length });
  const pack = {
    schemaVersion: 1,
    id: cleanPackText(id) || proposedBrowserPackId(packTitle),
    version: cleanPackText(version) || '1.0.0',
    title: packTitle,
    description: cleanPackText(description) || 'Пользовательский пакет знаний',
    language: cleanPackText(language) || 'ru',
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

export { proposedBrowserPackId };
