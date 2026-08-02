import {
  damerauLevenshtein,
  normalizeRelevance,
  normalizeText,
  tokenize,
} from '../search.js';

export const SQLITE_FTS_BACKEND_ID = 'sqlite-fts5-idb-v1';
export const SQLITE_FTS_STORAGE_ID = 'indexeddb-vfs';
export const SQLITE_FTS_RUNTIME_VERSION = '@subframe7536/sqlite-wasm@1.3.1';

function quoteFtsToken(token) {
  return `"${String(token).replaceAll('"', '""')}"*`;
}

export function sqliteFtsMatchQuery(query, additionalTerms = []) {
  const terms = [...new Set(tokenize(`${query} ${additionalTerms.join(' ')}`))];
  return terms.map(quoteFtsToken).join(' OR ');
}

export function sqliteFtsRecordValues(record) {
  return [
    String(record.id),
    JSON.stringify(record),
    normalizeText(record.title),
    normalizeText(record.documentTitle),
    normalizeText(record.body),
    normalizeText(record.aliases),
    normalizeText(record.entityNames),
    normalizeText(record.tags),
  ];
}

function relationMultiplier(record) {
  if (record.kind !== 'note') return 1;
  if (record.relation === 'supersedes') return 2.6;
  if (record.relation === 'contradicts') return 1.9;
  if (record.relation === 'refines') return 1.45;
  return 1.15;
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
  const start = Math.max(0, first < 0 ? 0 : first - Math.floor(length * .32));
  const end = Math.min(source.length, start + length);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
}

function parsePayload(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

export function rankSqliteFtsRows(rows, query, options = {}) {
  const terms = tokenize(query);
  const personalPriority = Boolean(options.personalPriority);
  const limit = Math.max(1, Math.floor(Number(options.limit ?? 40)));
  const ranked = rows
    .map((row) => {
      const record = parsePayload(row.payload ?? row[0]);
      if (!record) return null;
      const lexicalScore = Math.max(0, Number(row.score ?? row[1] ?? 0));
      const personalMultiplier = personalPriority && record.kind === 'note' ? 2.1 : 1;
      const authorityMultiplier = record.authority === 'reference' ? 1.04 : 1;
      return {
        ...record,
        score: lexicalScore * relationMultiplier(record) * personalMultiplier * authorityMultiplier,
        snippet: snippetAround(record.body, terms),
        queryTerms: terms,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
  const maximumScore = Math.max(0, ...ranked.map((result) => result.score));
  return ranked.map((result) => ({
    ...result,
    relevance: normalizeRelevance(result.score, maximumScore),
  }));
}

export function sqliteFuzzyDistanceLimit(token) {
  const length = String(token ?? '').length;
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  if (length <= 11) return 2;
  return 3;
}

export function sqliteVocabularyRange(token, prefixLength = 2) {
  const normalized = normalizeText(token);
  const prefix = normalized.slice(0, Math.max(1, prefixLength));
  return prefix ? { lower: prefix, upper: `${prefix}\uffff` } : null;
}

export function selectSqliteFuzzyTerms(queryToken, vocabularyRows, limit = 3) {
  const token = normalizeText(queryToken);
  const distanceLimit = sqliteFuzzyDistanceLimit(token);
  if (!distanceLimit) return [];
  return (vocabularyRows ?? [])
    .map((row) => {
      const term = normalizeText(row.term ?? row[0]);
      const frequency = Number(row.documents ?? row.doc ?? row[1] ?? 0);
      const distance = damerauLevenshtein(token, term, distanceLimit);
      return { term, distance, frequency };
    })
    .filter((candidate) => candidate.term && candidate.distance <= distanceLimit)
    .sort((left, right) => left.distance - right.distance || right.frequency - left.frequency)
    .slice(0, Math.max(1, limit))
    .map((candidate) => candidate.term);
}
