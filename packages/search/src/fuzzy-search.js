import Fuse from 'fuse.js';

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenizeSearchText(value) {
  return normalizeSearchText(value)
    .split(/\s+/u)
    .filter((token) => token.length > 1 || /^\d+$/u.test(token));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function entityTerms(pack, entityIds) {
  const ids = new Set(entityIds);
  const terms = [];
  for (const entity of pack.entities) {
    if (!ids.has(entity.id)) continue;
    terms.push(entity.canonicalName, ...entity.aliases);
  }
  for (const alias of pack.aliases) {
    if (alias.entityId && ids.has(alias.entityId)) {
      terms.push(alias.alias, alias.canonicalTerm);
    }
  }
  return unique(terms);
}

export function buildSearchRecords(packs, notes = []) {
  const records = [];

  for (const pack of packs) {
    for (const document of pack.documents) {
      for (const section of document.sections) {
        for (const chunk of section.chunks) {
          const aliases = entityTerms(pack, chunk.entityIds);
          const title = document.title;
          const sectionTitle = section.title;
          const searchText = normalizeSearchText(
            [title, sectionTitle, chunk.text, aliases.join(' ')].join(' '),
          );

          records.push({
            id: `${pack.manifest.id}:chunk:${document.id}:${chunk.id}`,
            kind: 'source',
            packId: pack.manifest.id,
            packTitle: pack.manifest.title,
            documentId: document.id,
            documentTitle: title,
            sectionId: section.id,
            sectionTitle,
            chunkId: chunk.id,
            anchor: chunk.anchor,
            text: chunk.text,
            aliases,
            entityIds: chunk.entityIds,
            searchText,
          });
        }
      }
    }
  }

  for (const note of notes) {
    const aliases = unique(note.tags);
    records.push({
      id: `note:${note.id}`,
      kind: 'note',
      noteId: note.id,
      packId: null,
      packTitle: 'Личные заметки',
      documentId: null,
      documentTitle: note.title,
      sectionId: null,
      sectionTitle: 'Личная заметка',
      chunkId: null,
      anchor: note.id,
      text: note.body,
      aliases,
      entityIds: note.entityLinks.map((link) => `${link.packId}:${link.itemId}`),
      searchText: normalizeSearchText([note.title, note.body, aliases.join(' ')].join(' ')),
      updatedAt: note.updatedAt,
    });
  }

  return records;
}

export function buildTermRecords(packs) {
  const records = [];
  const seen = new Set();

  const add = (record) => {
    const key = `${record.packId}:${record.entityId}:${normalizeSearchText(record.term)}`;
    if (seen.has(key)) return;
    seen.add(key);
    records.push({ ...record, id: key });
  };

  for (const pack of packs) {
    for (const entity of pack.entities) {
      add({
        packId: pack.manifest.id,
        entityId: entity.id,
        term: entity.canonicalName,
        canonicalName: entity.canonicalName,
        type: entity.type,
      });
      for (const alias of entity.aliases) {
        add({
          packId: pack.manifest.id,
          entityId: entity.id,
          term: alias,
          canonicalName: entity.canonicalName,
          type: entity.type,
        });
      }
    }
    for (const alias of pack.aliases) {
      add({
        packId: pack.manifest.id,
        entityId: alias.entityId,
        term: alias.alias,
        canonicalName: alias.canonicalTerm,
        type: 'alias',
      });
    }
  }

  return records;
}

export class FuzzyKnowledgeSearch {
  constructor(packs = [], notes = []) {
    this.rebuild(packs, notes);
  }

  rebuild(packs, notes = []) {
    this.records = buildSearchRecords(packs, notes);
    this.terms = buildTermRecords(packs);

    this.index = new Fuse(this.records, {
      keys: [
        { name: 'documentTitle', weight: 0.22 },
        { name: 'sectionTitle', weight: 0.13 },
        { name: 'text', weight: 0.42 },
        { name: 'aliases', weight: 0.23 },
      ],
      includeScore: true,
      includeMatches: true,
      ignoreLocation: true,
      threshold: 0.42,
      minMatchCharLength: 2,
      useTokenSearch: true,
      tokenMatch: 'all',
      tokenize: tokenizeSearchText,
    });

    this.termIndex = new Fuse(this.terms, {
      keys: [
        { name: 'term', weight: 0.65 },
        { name: 'canonicalName', weight: 0.35 },
      ],
      includeScore: true,
      ignoreLocation: true,
      threshold: 0.42,
      minMatchCharLength: 1,
    });
  }

  search(query, { limit = 20, kinds = ['source', 'note'] } = {}) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return [];

    const queryTokens = tokenizeSearchText(query);
    const candidateLimit = Math.max(limit * 3, 30);
    const candidates = new Map();

    const collect = (result, { token = null, fullQuery = false } = {}) => {
      const previous = candidates.get(result.item.id);
      const score = 1 - (result.score ?? 1);
      if (!previous) {
        candidates.set(result.item.id, {
          result,
          bestScore: score,
          fullQuery,
          matchedTokens: new Set(token ? [token] : []),
        });
        return;
      }
      previous.bestScore = Math.max(previous.bestScore, score);
      previous.fullQuery ||= fullQuery;
      if (token) previous.matchedTokens.add(token);
      if ((result.matches?.length ?? 0) > (previous.result.matches?.length ?? 0)) {
        previous.result = result;
      }
    };

    for (const result of this.index.search(query, { limit: candidateLimit })) {
      collect(result, { fullQuery: true });
    }

    // Fuse search options cannot switch tokenMatch for one call. Querying each token separately
    // provides a deterministic broad fallback while Fuse still owns typo scoring for every token.
    for (const token of queryTokens) {
      for (const result of this.index.search(token, { limit: candidateLimit })) {
        collect(result, { token });
      }
    }

    const allowedKinds = new Set(kinds);
    return [...candidates.values()]
      .filter(({ result }) => allowedKinds.has(result.item.kind))
      .map(({ result, bestScore, fullQuery, matchedTokens }) => {
        const exact = result.item.searchText.includes(normalizedQuery);
        const coverage = queryTokens.length > 0 ? matchedTokens.size / queryTokens.length : 0;
        const kindBoost = result.item.kind === 'source' ? 0.02 : 0;
        return {
          ...result.item,
          score: Math.min(
            1,
            bestScore + coverage * 0.28 + (fullQuery ? 0.08 : 0) + (exact ? 0.22 : 0) + kindBoost,
          ),
          matches: result.matches ?? [],
          matchedTokenCount: matchedTokens.size,
        };
      })
      .sort(
        (left, right) =>
          right.matchedTokenCount - left.matchedTokenCount ||
          right.score - left.score ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit);
  }

  suggest(query, { limit = 6 } = {}) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return [];

    const seen = new Set();
    const suggestions = [];
    for (const result of this.termIndex.search(query, { limit: limit * 4 })) {
      const key = `${result.item.packId}:${result.item.canonicalName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        packId: result.item.packId,
        entityId: result.item.entityId,
        matchedTerm: result.item.term,
        canonicalName: result.item.canonicalName,
        type: result.item.type,
        score: 1 - (result.score ?? 1),
      });
      if (suggestions.length >= limit) break;
    }
    return suggestions;
  }
}
