export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[–—−]/gu, '-')
    .replace(/[^\p{L}\p{N}+%./-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function tokenize(value) {
  return normalizeText(value).match(/[\p{L}\p{N}]+(?:[+./-][\p{L}\p{N}]+)*/gu) ?? [];
}

export function damerauLevenshtein(left, right, limit = Infinity) {
  const a = [...normalizeText(left)];
  const b = [...normalizeText(right)];
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    let rowMinimum = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + cost);
      }
      rows[i][j] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return limit + 1;
  }
  return rows[a.length][b.length];
}

function fuzzyLimit(token) {
  if (token.length <= 3) return 0;
  if (token.length <= 6) return 1;
  if (token.length <= 11) return 2;
  return 3;
}

function fallbackScore(record, queryTokens, normalizedQuery) {
  const title = normalizeText(`${record.title} ${record.documentTitle}`);
  const aliases = normalizeText(`${record.aliases} ${record.entityNames}`);
  const body = normalizeText(record.body);
  const tags = normalizeText(record.tags);
  const allTokens = new Set(tokenize(`${title} ${aliases} ${body} ${tags}`));
  let score = 0;

  if (normalizedQuery && title.includes(normalizedQuery)) score += 38;
  if (normalizedQuery && aliases.includes(normalizedQuery)) score += 34;
  if (normalizedQuery && body.includes(normalizedQuery)) score += 18;

  for (const token of queryTokens) {
    if (title.split(' ').includes(token)) score += 14;
    else if (title.includes(token)) score += 9;
    if (aliases.split(' ').includes(token)) score += 16;
    else if (aliases.includes(token)) score += 10;
    if (body.split(' ').includes(token)) score += 6;
    else if (body.includes(token)) score += 3;
    if (tags.includes(token)) score += 2;

    if (![...allTokens].some((candidate) => candidate === token || candidate.startsWith(token))) {
      const limit = fuzzyLimit(token);
      if (limit > 0) {
        let best = limit + 1;
        for (const candidate of allTokens) {
          if (Math.abs(candidate.length - token.length) > limit) continue;
          best = Math.min(best, damerauLevenshtein(token, candidate, limit));
          if (best === 1) break;
        }
        if (best <= limit) score += Math.max(1, 7 - best * 2);
      }
    }
  }
  return score;
}

function snippetAround(text, terms, length = 260) {
  const source = String(text ?? '').replace(/\s+/gu, ' ').trim();
  if (source.length <= length) return source;
  const normalized = normalizeText(source);
  let first = -1;
  for (const term of terms) {
    const index = normalized.indexOf(term);
    if (index >= 0 && (first < 0 || index < first)) first = index;
  }
  const start = Math.max(0, first < 0 ? 0 : first - Math.floor(length * 0.32));
  const end = Math.min(source.length, start + length);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
}

function expandQuery(query, entities) {
  const normalized = normalizeText(query);
  const additions = new Set();
  for (const entity of entities ?? []) {
    const names = [entity.name, ...(entity.aliases ?? [])].filter(Boolean);
    if (!names.some((name) => normalized.includes(normalizeText(name)))) continue;
    for (const name of names) additions.add(name);
  }
  return additions.size > 0 ? `${query} ${[...additions].join(' ')}` : query;
}

function getMiniSearchConstructor() {
  const candidate = globalThis.MiniSearch;
  if (typeof candidate === 'function') return candidate;
  if (candidate && typeof candidate.default === 'function') return candidate.default;
  return null;
}

export function createSearchEngine(records, entities = []) {
  const MiniSearchConstructor = getMiniSearchConstructor();
  let miniSearch;
  if (MiniSearchConstructor) {
    miniSearch = new MiniSearchConstructor({
      fields: ['title', 'documentTitle', 'body', 'aliases', 'entityNames', 'tags'],
      storeFields: [
        'kind', 'noteId', 'packId', 'packTitle', 'documentId', 'documentTitle', 'sectionId',
        'title', 'body', 'entityIds', 'authority', 'effectiveFrom', 'sourceTitle', 'claimIds', 'relation',
      ],
      tokenize,
      processTerm: (term) => normalizeText(term),
      searchOptions: {
        prefix: true,
        fuzzy: 0.24,
        boost: { title: 4.5, documentTitle: 3.5, aliases: 5, entityNames: 4.5, tags: 1.4, body: 1 },
        combineWith: 'AND',
      },
    });
    miniSearch.addAll(records);
  }

  function search(query, options = {}) {
    const cleanQuery = String(query ?? '').trim();
    if (!cleanQuery) return [];
    const expanded = expandQuery(cleanQuery, entities);
    const terms = tokenize(cleanQuery);
    let results;

    if (miniSearch) {
      results = miniSearch.search(expanded, {
        prefix: true,
        fuzzy: (term) => {
          if (term.length <= 3) return false;
          if (term.length <= 7) return 0.18;
          return 0.26;
        },
        boost: { title: 4.5, documentTitle: 3.5, aliases: 5, entityNames: 4.5, tags: 1.4, body: 1 },
        combineWith: 'OR',
      });
    } else {
      const normalizedQuery = normalizeText(cleanQuery);
      results = records
        .map((record) => ({ ...record, score: fallbackScore(record, terms, normalizedQuery) }))
        .filter((record) => record.score > 0)
        .sort((left, right) => right.score - left.score);
    }

    const personalPriority = Boolean(options.personalPriority);
    return results
      .map((result) => {
        const record = miniSearch ? { ...result } : result;
        const relationMultiplier = record.kind === 'note'
          ? record.relation === 'supersedes'
            ? 2.6
            : record.relation === 'contradicts'
              ? 1.9
              : record.relation === 'refines'
                ? 1.45
                : 1.15
          : 1;
        const personalMultiplier = personalPriority && record.kind === 'note' ? 2.1 : 1;
        const authorityMultiplier = record.authority === 'reference' ? 1.04 : 1;
        return {
          ...record,
          score: Number(record.score ?? 0) * relationMultiplier * personalMultiplier * authorityMultiplier,
          snippet: snippetAround(record.body, terms),
          queryTerms: terms,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, options.limit ?? 40);
  }

  function suggest(query, limit = 5) {
    if (!query.trim()) return [];
    if (miniSearch && typeof miniSearch.autoSuggest === 'function') {
      return miniSearch.autoSuggest(query, { fuzzy: 0.25, prefix: true }).slice(0, limit).map((item) => item.suggestion);
    }
    const term = tokenize(query).at(-1);
    if (!term) return [];
    const candidates = new Set();
    for (const record of records) {
      for (const token of tokenize(`${record.title} ${record.documentTitle} ${record.aliases}`)) {
        if (token.startsWith(term) || damerauLevenshtein(term, token, fuzzyLimit(term)) <= fuzzyLimit(term)) candidates.add(token);
      }
    }
    return [...candidates].slice(0, limit);
  }

  return {
    kind: miniSearch ? 'MiniSearch' : 'built-in fallback',
    count: records.length,
    search,
    suggest,
  };
}

export function highlightRanges(text, terms) {
  const source = String(text ?? '');
  const normalizedSource = normalizeText(source);
  const ranges = [];
  for (const term of terms ?? []) {
    if (!term) continue;
    let from = 0;
    while (from < normalizedSource.length) {
      const index = normalizedSource.indexOf(normalizeText(term), from);
      if (index < 0) break;
      ranges.push([index, index + term.length]);
      from = index + Math.max(1, term.length);
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}
