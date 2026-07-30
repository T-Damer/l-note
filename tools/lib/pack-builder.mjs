import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { validatePack } from '../../src/packs.js';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json']);

export function slugify(value, fallback = 'item') {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96);
  return slug || fallback;
}

export function stableId(...parts) {
  const digest = createHash('sha256').update(parts.join('\u241f')).digest('hex').slice(0, 12);
  return `${slugify(parts[0] ?? 'item')}.${digest}`;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[-_]+/gu, ' ').trim() || 'Документ';
}

function splitLongSection(section, maxChars = 5000) {
  if (section.text.length <= maxChars) return [section];
  const paragraphs = section.text.split(/\n{2,}/gu).filter(Boolean);
  const parts = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      parts.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) parts.push(current);
  if (parts.length <= 1) {
    for (let offset = 0; offset < section.text.length; offset += maxChars) {
      parts.push(section.text.slice(offset, offset + maxChars));
    }
  }
  return parts.filter(Boolean).map((text, index) => ({
    ...section,
    id: `${section.id}-part-${index + 1}`,
    title: `${section.title} · часть ${index + 1}`,
    text,
  }));
}

export function parseMarkdown(text, filename = 'document.md') {
  const source = cleanText(text);
  const lines = source.split('\n');
  let title = titleFromFilename(filename);
  const sections = [];
  let currentTitle = 'Содержание';
  let currentLines = [];
  let firstHeadingHandled = false;

  const flush = () => {
    const body = cleanText(currentLines.join('\n'));
    if (!body) return;
    const base = {
      id: slugify(currentTitle, `section-${sections.length + 1}`),
      title: currentTitle,
      text: body,
      entityIds: [],
      tags: [],
    };
    sections.push(...splitLongSection(base));
    currentLines = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
    if (!heading) {
      currentLines.push(line);
      continue;
    }
    const level = heading[1].length;
    const headingText = cleanText(heading[2]);
    if (level === 1 && !firstHeadingHandled && sections.length === 0 && cleanText(currentLines.join('\n')) === '') {
      title = headingText;
      firstHeadingHandled = true;
      currentLines = [];
      continue;
    }
    flush();
    currentTitle = headingText;
    firstHeadingHandled = true;
  }
  flush();

  if (sections.length === 0 && source) {
    sections.push({ id: 'content', title: 'Содержание', text: source, entityIds: [], tags: [] });
  }
  return { title, sections };
}

export function parsePlainText(text, filename = 'document.txt') {
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

export function parseJsonDocument(text, filename = 'document.json') {
  const parsed = JSON.parse(text);
  if (parsed?.schemaVersion === 1 && Array.isArray(parsed.documents) && Array.isArray(parsed.entities)) {
    return { existingPack: parsed };
  }
  const body = flattenJson(parsed).join('\n');
  return {
    title: parsed?.title && typeof parsed.title === 'string' ? parsed.title : titleFromFilename(filename),
    sections: splitLongSection({ id: 'data', title: 'Данные', text: body || '{}', entityIds: [], tags: ['json'] }),
  };
}

export async function listSourceFiles(inputPath) {
  const absolute = path.resolve(inputPath);
  const inputStat = await stat(absolute);
  if (inputStat.isFile()) return SUPPORTED_EXTENSIONS.has(path.extname(absolute).toLowerCase()) ? [absolute] : [];
  const output = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) output.push(fullPath);
    }
  }
  await walk(absolute);
  return output;
}

function parseFileContent(filename, text) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.md' || extension === '.markdown') return parseMarkdown(text, filename);
  if (extension === '.json') return parseJsonDocument(text, filename);
  return parsePlainText(text, filename);
}

function abbreviationCandidates(text) {
  const matches = [];
  const patterns = [
    /([\p{L}][\p{L}\p{N}\s,–—-]{3,100}?)\s*\(([А-ЯA-ZЁ0-9][А-ЯA-ZЁ0-9.-]{1,11})\)/gu,
    /([А-ЯA-ZЁ0-9][А-ЯA-ZЁ0-9.-]{1,11})\s*[—–-]\s*([\p{L}][^.;\n]{3,100})/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const firstIsAbbreviation = /^[А-ЯA-ZЁ0-9.-]{2,12}$/u.test(match[1].trim());
      const alias = (firstIsAbbreviation ? match[1] : match[2]).trim();
      const canonical = cleanText(firstIsAbbreviation ? match[2] : match[1]).replace(/^[,:;\s]+|[,:;\s]+$/gu, '');
      if (alias.length >= 2 && canonical.length >= 4) matches.push({ alias, canonical });
    }
  }
  return matches;
}

function discoverEntities(documents) {
  const byKey = new Map();
  for (const document of documents) {
    for (const section of document.sections) {
      for (const candidate of abbreviationCandidates(section.text)) {
        const key = candidate.canonical.toLocaleLowerCase('ru-RU');
        const current = byKey.get(key) ?? {
          id: `term.${slugify(candidate.canonical)}`,
          name: candidate.canonical,
          type: 'term',
          aliases: [],
          description: `Термин, автоматически найденный при подготовке пакета.`,
        };
        current.aliases = [...new Set([...current.aliases, candidate.alias])];
        byKey.set(key, current);
      }
    }
  }
  const entities = [...byKey.values()];
  for (const document of documents) {
    for (const section of document.sections) {
      const normalized = section.text.toLocaleLowerCase('ru-RU');
      section.entityIds = entities
        .filter((entity) => [entity.name, ...entity.aliases].some((name) => normalized.includes(name.toLocaleLowerCase('ru-RU'))))
        .map((entity) => entity.id);
    }
  }
  return entities;
}

function promptForSection(document, section) {
  return [
    'Извлеки структуру знаний только из текста ниже.',
    'Верни один JSON-объект без markdown со схемой:',
    '{"entities":[{"name":"...","type":"term","aliases":["..."],"description":"..."}],',
    '"claims":[{"text":"...","subject":"...","object":"... или null","quote":"точная подстрока исходного текста"}],',
    '"relations":[{"source":"...","type":"RELATED_TO","target":"...","description":"..."}]}.',
    'Не добавляй знания из памяти. quote обязан быть точной непрерывной подстрокой.',
    `Документ: ${document.title}`,
    `Раздел: ${section.title}`,
    `Текст:\n${section.text}`,
  ].join('\n');
}

function parseModelJson(value) {
  const text = String(value ?? '').trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI provider did not return a JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

function normalizeProviderOutput(output) {
  if (Array.isArray(output)) return output.join('');
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object') return JSON.stringify(output);
  return String(output ?? '');
}

export function createOpenAiCompatibleProvider({ baseUrl, apiKey, model }) {
  if (!model) throw new Error('--ai-model is required for the OpenAI-compatible provider');
  const root = (baseUrl || process.env.OPENAI_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/u, '');
  const token = apiKey || process.env.OPENAI_API_KEY || 'local';
  return {
    name: 'openai-compatible',
    async complete(prompt) {
      const response = await fetch(`${root}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Return source-grounded JSON only.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI-compatible provider returned HTTP ${response.status}: ${await response.text()}`);
      const payload = await response.json();
      return payload.choices?.[0]?.message?.content ?? '';
    },
  };
}

export function createReplicateProvider({ token, model, input = {} }) {
  const apiToken = token || process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API;
  if (!apiToken) throw new Error('REPLICATE_API_TOKEN or REPLICATE_API is required');
  if (!model) throw new Error('--ai-model owner/model or owner/model:version is required for Replicate');
  const [modelName, version] = model.split(':');
  const createUrl = version
    ? 'https://api.replicate.com/v1/predictions'
    : `https://api.replicate.com/v1/models/${modelName}/predictions`;
  const headers = { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json', prefer: 'wait=60' };
  return {
    name: 'replicate',
    async complete(prompt) {
      const body = { input: { ...input, prompt, temperature: input.temperature ?? 0, max_new_tokens: input.max_new_tokens ?? 1400 } };
      if (version) body.version = version;
      let response = await fetch(createUrl, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Replicate returned HTTP ${response.status}: ${await response.text()}`);
      let prediction = await response.json();
      for (let attempt = 0; !['succeeded', 'failed', 'canceled'].includes(prediction.status) && attempt < 180; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        response = await fetch(prediction.urls.get, { headers: { authorization: `Bearer ${apiToken}` } });
        if (!response.ok) throw new Error(`Replicate polling returned HTTP ${response.status}`);
        prediction = await response.json();
      }
      if (prediction.status !== 'succeeded') throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? 'unknown error'}`);
      return normalizeProviderOutput(prediction.output);
    },
  };
}

function resolveEntity(pack, name, proposal = {}) {
  if (!name || typeof name !== 'string') return null;
  const normalized = name.trim().toLocaleLowerCase('ru-RU');
  let entity = pack.entities.find((item) => [item.name, ...(item.aliases ?? [])].some((candidate) => candidate.toLocaleLowerCase('ru-RU') === normalized));
  if (!entity) {
    let id = `entity.${slugify(name)}`;
    if (pack.entities.some((item) => item.id === id)) id = stableId(id, name);
    entity = {
      id,
      name: name.trim(),
      type: typeof proposal.type === 'string' ? proposal.type : 'term',
      aliases: Array.isArray(proposal.aliases) ? proposal.aliases.filter((item) => typeof item === 'string' && item.trim()) : [],
      ...(typeof proposal.description === 'string' && proposal.description.trim() ? { description: proposal.description.trim() } : {}),
    };
    pack.entities.push(entity);
  } else if (Array.isArray(proposal.aliases)) {
    entity.aliases = [...new Set([...(entity.aliases ?? []), ...proposal.aliases.filter((item) => typeof item === 'string')])];
  }
  return entity;
}

export function mergeAiSection(pack, document, section, proposal) {
  for (const item of Array.isArray(proposal?.entities) ? proposal.entities : []) {
    const entity = resolveEntity(pack, item?.name, item);
    if (entity && !section.entityIds.includes(entity.id)) section.entityIds.push(entity.id);
  }
  for (const item of Array.isArray(proposal?.claims) ? proposal.claims : []) {
    if (typeof item?.text !== 'string' || typeof item?.quote !== 'string' || !section.text.includes(item.quote)) continue;
    const subject = resolveEntity(pack, item.subject);
    const object = resolveEntity(pack, item.object);
    if (subject && !section.entityIds.includes(subject.id)) section.entityIds.push(subject.id);
    if (object && !section.entityIds.includes(object.id)) section.entityIds.push(object.id);
    const id = stableId('claim', document.id, section.id, item.text);
    if (pack.claims.some((claim) => claim.id === id)) continue;
    pack.claims.push({
      id,
      text: item.text.trim(),
      authority: 'proposed',
      ...(subject ? { subjectId: subject.id } : {}),
      ...(object ? { objectId: object.id } : {}),
      source: { documentId: document.id, sectionId: section.id, quote: item.quote },
    });
  }
  for (const item of Array.isArray(proposal?.relations) ? proposal.relations : []) {
    const source = resolveEntity(pack, item?.source);
    const target = resolveEntity(pack, item?.target);
    if (!source || !target || typeof item?.type !== 'string') continue;
    const id = stableId('relation', source.id, item.type, target.id);
    if (pack.relations.some((relation) => relation.id === id)) continue;
    pack.relations.push({
      id,
      sourceId: source.id,
      targetId: target.id,
      predicate: item.type.trim().toLowerCase().replace(/[^a-z0-9_]+/gu, '_') || 'related_to',
      ...(typeof item.description === 'string' && item.description.trim() ? { description: item.description.trim() } : {}),
    });
  }
}

export async function buildPackFromPath({
  inputPath,
  id,
  version = '1.0.0',
  title,
  description = 'Пользовательский пакет знаний',
  language = 'ru',
  sourceUrl = null,
  aiProvider = null,
  onProgress = () => {},
}) {
  if (!inputPath) throw new Error('inputPath is required');
  if (!id) throw new Error('pack id is required');
  const files = await listSourceFiles(inputPath);
  if (files.length === 0) throw new Error('No supported .md, .txt, or .json files found');
  const root = (await stat(path.resolve(inputPath))).isDirectory() ? path.resolve(inputPath) : path.dirname(path.resolve(inputPath));
  const documents = [];

  for (const filename of files) {
    const text = await readFile(filename, 'utf8');
    const parsed = parseFileContent(filename, text);
    if (parsed.existingPack) {
      const validation = validatePack(parsed.existingPack);
      if (!validation.valid) throw new Error(`Existing pack is invalid: ${validation.errors.join('; ')}`);
      return parsed.existingPack;
    }
    const relative = path.relative(root, filename).split(path.sep).join('/');
    const documentId = `doc.${slugify(relative)}`;
    documents.push({
      id: documentId,
      title: parsed.title,
      summary: `Импортировано из ${relative}`,
      authority: 'reference',
      effectiveFrom: null,
      source: { title: relative, ...(sourceUrl ? { url: sourceUrl } : {}) },
      tags: [path.extname(filename).slice(1)],
      sections: parsed.sections.map((section, index) => ({
        ...section,
        id: `${slugify(section.id || section.title, `section-${index + 1}`)}-${index + 1}`,
      })),
    });
  }

  const pack = {
    schemaVersion: 1,
    id,
    version,
    title: title || id,
    description,
    language,
    publishedAt: new Date().toISOString(),
    license: 'user-supplied',
    tags: ['user-pack'],
    documents,
    entities: discoverEntities(documents),
    claims: [],
    relations: [],
  };

  if (aiProvider) {
    let completed = 0;
    const total = documents.reduce((sum, document) => sum + document.sections.length, 0);
    for (const document of documents) {
      for (const section of document.sections) {
        onProgress({ stage: 'ai', completed, total, document: document.title, section: section.title, provider: aiProvider.name });
        const raw = await aiProvider.complete(promptForSection(document, section));
        mergeAiSection(pack, document, section, parseModelJson(raw));
        completed += 1;
      }
    }
    onProgress({ stage: 'ai', completed, total, provider: aiProvider.name });
  }

  for (const document of documents) {
    for (const section of document.sections) section.entityIds = [...new Set(section.entityIds)].sort();
  }
  pack.entities.sort((left, right) => left.name.localeCompare(right.name, language));
  pack.claims.sort((left, right) => left.id.localeCompare(right.id));
  pack.relations.sort((left, right) => left.id.localeCompare(right.id));

  const validation = validatePack(pack);
  if (!validation.valid) throw new Error(`Built pack is invalid: ${validation.errors.join('; ')}`);
  return pack;
}
