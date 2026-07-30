import { expandQuery, normalizeText, unique } from './core.js';
import { getChunks, getEntities, getGlossary, listNotes } from './db.js';

const MiniSearchConstructor = globalThis.MiniSearch;
if (!MiniSearchConstructor) throw new Error('MiniSearch failed to load.');

let miniSearch = null;
let recordById = new Map();
let generation = 0;

function createIndex() {
  return new MiniSearchConstructor({
    fields: ['title', 'section', 'text', 'aliases', 'entities'],
    storeFields: ['kind', 'packId', 'packTitle', 'documentTitle', 'sectionTitle'],
    searchOptions: {
      boost: { title: 4, section: 2.4, aliases: 2.2, entities: 2 },
      fuzzy: 0.22,
      prefix: true,
      combineWith: 'OR',
    },
  });
}

export async function rebuildSearchIndex() {
  const token = ++generation;
  const [chunks, notes] = await Promise.all([getChunks(), listNotes()]);
  const records = [
    ...chunks.map((chunk) => ({
      id: `chunk:${chunk.pk}`,
      kind: 'chunk',
      title: normalizeText(chunk.documentTitle),
      section: normalizeText(chunk.sectionTitle),
      text: normalizeText(chunk.text),
      aliases: normalizeText(chunk.aliases),
      entities: normalizeText(chunk.entityNames),
      original: chunk,
    })),
    ...notes.map((note) => ({
      id: `note:${note.id}`,
      kind: 'note',
      title: normalizeText(note.title),
      section: normalizeText(note.relationType),
      text: normalizeText(note.body),
      aliases: '',
      entities: normalizeText((note.entityIds ?? []).join(' ')),
      original: {
        ...note,
        pk: String(note.id),
        packId: 'personal',
        packTitle: 'Личные заметки',
        documentTitle: note.title || 'Заметка',
        sectionTitle: note.relationType,
        text: note.body,
        kind: 'note',
      },
    })),
  ];

  const index = createIndex();
  index.addAll(records.map(({ original: _original, ...record }) => record));
  if (token !== generation) return;
  miniSearch = index;
  recordById = new Map(records.map((record) => [record.id, record.original]));
}

export async function searchKnowledge(query, options = {}) {
  if (!miniSearch) await rebuildSearchIndex();
  const packIds = options.packIds?.filter(Boolean) ?? [];
  const [glossary, entities] = await Promise.all([getGlossary(packIds), getEntities(packIds)]);
  const expansion = expandQuery(query, glossary, entities);
  const normalizedQuery = normalizeText(expansion.expanded);
  if (!normalizedQuery) return { results: [], expansion, suggestions: [] };

  const results = miniSearch
    .search(normalizedQuery, {
      filter: (result) => {
        if (result.kind === 'note') return options.includeNotes !== false;
        return !packIds.length || packIds.includes(result.packId);
      },
    })
    .slice(0, options.limit ?? 40)
    .map((result) => ({
      ...recordById.get(result.id),
      kind: result.kind,
      score: result.score,
      matchedTerms: Object.keys(result.match ?? {}),
    }))
    .filter(Boolean);

  const suggestions = miniSearch
    .autoSuggest(normalizedQuery, { fuzzy: 0.25, prefix: true })
    .slice(0, 4)
    .map((item) => item.suggestion);

  return { results, expansion, suggestions: unique(suggestions) };
}

export async function autoLinkEntities(text, packIds = null) {
  const entities = await getEntities(packIds);
  const normalized = ` ${normalizeText(text)} `;
  const matches = [];
  for (const entity of entities) {
    const names = [entity.name, ...(entity.aliases ?? [])];
    if (names.some((name) => {
      const term = normalizeText(name);
      return term.length >= 3 && normalized.includes(` ${term} `);
    })) {
      matches.push(entity.id);
    }
  }
  return unique(matches);
}
