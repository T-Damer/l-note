#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { normalizeText, validatePack } from '../src/core.js';

const args = process.argv.slice(2);
const useAi = args.includes('--ai');
const positional = args.filter((arg) => !arg.startsWith('--'));
if (positional.length < 2) {
  console.error('Usage: node tools/build-pack.mjs <input-directory> <output.json> [--ai]');
  process.exit(2);
}

const inputRoot = resolve(positional[0]);
const outputPath = resolve(positional[1]);

function stableId(prefix, value) {
  return `${prefix}.${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

async function readJsonIfExists(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function walkMarkdown(directory) {
  const found = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') found.push(path);
    }
  }
  await walk(directory);
  return found.sort();
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((part) => part.trim().replace(/^['"]|['"]$/gu, '')).filter(Boolean);
  }
  return trimmed.replace(/^['"]|['"]$/gu, '');
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) return { metadata: {}, body: markdown };
  const end = markdown.indexOf('\n---\n', 4);
  if (end < 0) return { metadata: {}, body: markdown };
  const raw = markdown.slice(4, end);
  const metadata = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/u);
    if (match) metadata[match[1]] = parseScalar(match[2]);
  }
  return { metadata, body: markdown.slice(end + 5) };
}

function splitParagraphs(text, maxChars = 1400) {
  const paragraphs = text
    .split(/\n\s*\n/gu)
    .map((paragraph) => paragraph.replace(/<!--.*?-->/gsu, '').replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }
    if (current.length + paragraph.length + 2 <= maxChars) current += `\n\n${paragraph}`;
    else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function parseMarkdownDocument(path, markdown, root) {
  const { metadata, body } = parseFrontmatter(markdown);
  const lines = body.split('\n');
  let title = metadata.title || null;
  const sections = [];
  let currentTitle = 'Содержание';
  let currentLines = [];
  let firstHeadingConsumed = false;

  function flushSection() {
    const text = currentLines.join('\n').trim();
    if (!text) return;
    const sectionSeed = `${relative(root, path)}:${currentTitle}`;
    const sectionId = stableId('section', sectionSeed);
    const chunks = splitParagraphs(text).map((chunkText, index) => ({
      id: stableId('chunk', `${sectionSeed}:${index}:${chunkText}`),
      text: chunkText,
      entityIds: [],
    }));
    sections.push({ id: sectionId, title: currentTitle, chunks });
    currentLines = [];
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+?)\s*$/u);
    if (!heading) {
      currentLines.push(line);
      continue;
    }
    if (!title && heading[1].length === 1 && !firstHeadingConsumed) {
      title = heading[2].trim();
      firstHeadingConsumed = true;
      continue;
    }
    flushSection();
    currentTitle = heading[2].trim();
    firstHeadingConsumed = true;
  }
  flushSection();
  if (!sections.length) {
    const chunks = splitParagraphs(body).map((chunkText, index) => ({
      id: stableId('chunk', `${relative(root, path)}:${index}:${chunkText}`),
      text: chunkText,
      entityIds: [],
    }));
    sections.push({ id: stableId('section', `${relative(root, path)}:content`), title: 'Содержание', chunks });
  }

  const rel = relative(root, path).replaceAll('\\', '/');
  return {
    id: metadata.id || stableId('document', rel),
    title: title || basename(path, extname(path)),
    summary: metadata.summary || '',
    authority: metadata.authority || 'user-supplied',
    source: metadata.source_url
      ? {
          title: metadata.source_title || metadata.source_url,
          url: metadata.source_url,
          year: metadata.source_year || null,
          contentMode: metadata.content_mode || 'user-supplied',
        }
      : null,
    sections,
  };
}

function detectGlossary(documents) {
  const entries = [];
  const seen = new Set();
  for (const document of documents) {
    for (const section of document.sections) {
      for (const chunk of section.chunks) {
        const patterns = [
          ...chunk.text.matchAll(/([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z -]{4,80}?)\s*\(([А-ЯЁA-Z][А-ЯЁA-Z0-9-]{1,12})\)/gu),
          ...chunk.text.matchAll(/\b([А-ЯЁA-Z][А-ЯЁA-Z0-9-]{1,12})\s*[—-]\s*([А-ЯЁA-ZА-ЯЁа-яёA-Za-z][^.;]{4,100})/gu),
        ];
        for (const match of patterns) {
          const firstLooksAbbreviation = /^[А-ЯЁA-Z0-9-]{2,12}$/u.test(match[1]);
          const term = firstLooksAbbreviation ? match[1] : match[2];
          const expansion = firstLooksAbbreviation ? match[2] : match[1];
          const key = normalizeText(term);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          entries.push({
            id: stableId('glossary', `${term}:${expansion}`),
            term,
            expansion: expansion.trim(),
            category: 'auto-detected',
          });
        }
      }
    }
  }
  return entries;
}

function linkEntities(documents, entities) {
  const searchable = entities.map((entity) => ({
    id: entity.id,
    terms: [entity.name, ...(entity.aliases || [])]
      .map(normalizeText)
      .filter((term) => term.length >= 3),
  }));
  for (const document of documents) {
    for (const section of document.sections) {
      for (const chunk of section.chunks) {
        const text = ` ${normalizeText(chunk.text)} `;
        chunk.entityIds = searchable
          .filter((entity) => entity.terms.some((term) => text.includes(` ${term} `) || text.includes(term)))
          .map((entity) => entity.id);
      }
    }
  }
}

async function enrichWithAi(pack) {
  const baseUrl = (process.env.OPENAI_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/$/u, '');
  const model = process.env.OPENAI_MODEL;
  if (!model) throw new Error('--ai requires OPENAI_MODEL. OPENAI_BASE_URL defaults to http://127.0.0.1:11434/v1');
  const apiKey = process.env.OPENAI_API_KEY || 'local';
  const allChunks = pack.documents.flatMap((document) =>
    document.sections.flatMap((section) =>
      section.chunks.map((chunk) => ({
        chunkId: chunk.id,
        documentTitle: document.title,
        sectionTitle: section.title,
        text: chunk.text,
      })),
    ),
  );

  const proposed = { entities: [], relations: [], claims: [], glossary: [] };
  const batchSize = 8;
  for (let start = 0; start < allChunks.length; start += batchSize) {
    const batch = allChunks.slice(start, start + batchSize);
    const prompt = [
      'Extract proposed knowledge records from the supplied chunks.',
      'Return strict JSON with arrays: entities, relations, claims, glossary.',
      'Every relation and claim must include evidence [{chunkId, quote}], where quote is an exact substring of that chunk.',
      'Use stable readable ids; do not infer medical advice or facts absent from the text.',
      'Entity shape: {id,type,name,aliases,description}.',
      'Relation shape: {id,from,predicate,to,status,confidence,evidence}.',
      'Claim shape: {id,text,subjectEntityIds,authority,status,evidence}.',
      'Glossary shape: {id,term,expansion,entityId?,category}.',
      '',
      JSON.stringify(batch),
    ].join('\n');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a conservative knowledge extraction compiler.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}: ${await response.text()}`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    const data = JSON.parse(content);
    for (const key of Object.keys(proposed)) {
      if (Array.isArray(data[key])) proposed[key].push(...data[key]);
    }
  }

  const chunkById = new Map(allChunks.map((chunk) => [chunk.chunkId, chunk]));
  const evidenceValid = (record) =>
    (record.evidence || []).length > 0 &&
    record.evidence.every((item) => {
      const chunk = chunkById.get(item.chunkId);
      return chunk && typeof item.quote === 'string' && item.quote.length >= 4 && chunk.text.includes(item.quote);
    });

  const existingEntityIds = new Set(pack.entities.map((entity) => entity.id));
  for (const entity of proposed.entities) {
    if (!entity?.id || !entity?.name || existingEntityIds.has(entity.id)) continue;
    pack.entities.push({
      id: entity.id,
      type: entity.type || 'concept',
      name: entity.name,
      aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
      description: entity.description || '',
      reviewStatus: 'proposed-by-ai',
    });
    existingEntityIds.add(entity.id);
  }

  for (const relation of proposed.relations) {
    if (!relation?.id || !existingEntityIds.has(relation.from) || !existingEntityIds.has(relation.to) || !evidenceValid(relation)) continue;
    pack.relations.push({ ...relation, status: 'proposed-by-ai' });
  }
  for (const claim of proposed.claims) {
    if (!claim?.id || !claim?.text || !evidenceValid(claim)) continue;
    pack.claims.push({ ...claim, authority: claim.authority || 'user-source', status: 'proposed-by-ai' });
  }
  for (const entry of proposed.glossary) {
    if (entry?.term && entry?.expansion) pack.glossary.push({ ...entry, id: entry.id || stableId('glossary', `${entry.term}:${entry.expansion}`) });
  }
  linkEntities(pack.documents, pack.entities);
}

const manifestPath = join(inputRoot, 'manifest.json');
const manifest = await readJsonIfExists(manifestPath, null);
if (!manifest?.id || !manifest?.title || !manifest?.version) {
  throw new Error('input-directory/manifest.json must contain id, title and version.');
}

const documentsRoot = (await stat(join(inputRoot, 'documents')).catch(() => null))?.isDirectory()
  ? join(inputRoot, 'documents')
  : inputRoot;
const markdownPaths = await walkMarkdown(documentsRoot);
if (!markdownPaths.length) throw new Error('No Markdown documents found.');
const documents = await Promise.all(
  markdownPaths.map(async (path) => parseMarkdownDocument(path, await readFile(path, 'utf8'), documentsRoot)),
);

const pack = {
  format: 'l-note-pack',
  schemaVersion: 1,
  manifest: {
    ...manifest,
    createdAt: manifest.createdAt || new Date().toISOString(),
  },
  documents,
  entities: await readJsonIfExists(join(inputRoot, 'entities.json'), []),
  relations: await readJsonIfExists(join(inputRoot, 'relations.json'), []),
  claims: await readJsonIfExists(join(inputRoot, 'claims.json'), []),
  glossary: await readJsonIfExists(join(inputRoot, 'glossary.json'), []),
};

pack.glossary.push(...detectGlossary(documents));
linkEntities(pack.documents, pack.entities);
if (useAi) await enrichWithAi(pack);

const stats = validatePack(pack);
await writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, stats, ai: useAi }, null, 2));
