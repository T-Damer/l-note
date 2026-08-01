import {
  damerauLevenshtein,
  normalizeRelevance,
  normalizeText,
  tokenize,
} from '../search.js';

const FIELD_WEIGHTS = Object.freeze({
  title: 4.5,
  documentTitle: 3.5,
  aliases: 5,
  entityNames: 4.5,
  tags: 1.4,
  body: 1,
});

function fuzzyLimit(token) {
  if (token.length <= 3) return 0;
  if (token.length <= 6) return 1;
  if (token.length <= 11) return 2;
  return 3;
}

export function diskRecordTokenScores(record) {
  const scores = new Map();
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const unique = new Set(tokenize(record?.[field]));
    for (const token of unique) scores.set(token, (scores.get(token) ?? 0) + weight);
  }
  return scores;
}

export function buildDiskPostingEntries(records) {
  const postings = new Map();
  for (const record of records ?? []) {
    for (const [token, score] of diskRecordTokenScores(record)) {
      const entry = postings.get(token) ?? [];
      entry.push({ id: record.id, score });
      postings.set(token, entry);
    }
  }
  return [...postings.entries()].map(([token, items]) => ({
    token,
    documentFrequency: items.length,
    items: items.sort((left, right) => right.score - left.score),
  }));
}

export function diskTokenMatch(queryToken, candidateToken) {
  if (!queryToken || !candidateToken) return 0;
  if (queryToken === candidateToken) return 1;
  if (candidateToken.startsWith(queryToken)) return .76;
  const limit = fuzzyLimit(queryToken);
  if (!limit || Math.abs(candidateToken.length - queryToken.length) > limit) return 0;
  const distance = damerauLevenshtein(queryToken, candidateToken, limit);
  if (distance > limit) return 0;
  return Math.max(.28, .62 - distance * .12);
}

export function diskQueryTokens(query) {
  return [...new Set(tokenize(query))];
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

export function diskResultScore(record, score, personalPriority = false) {
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
  return score * relationMultiplier * personalMultiplier * authorityMultiplier;
}

export function hydrateDiskResults(records, scores, query, limit = 40, personalPriority = false) {
  const terms = diskQueryTokens(query);
  const ranked = records
    .map((record) => ({
      ...record,
      score: diskResultScore(record, scores.get(record.id) ?? 0, personalPriority),
      snippet: snippetAround(record.body, terms),
      queryTerms: terms,
      expandedQuery: query,
    }))
    .filter((record) => record.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
  const maximumScore = Math.max(0, ...ranked.map((record) => record.score));
  return ranked.map((record) => ({
    ...record,
    relevance: normalizeRelevance(record.score, maximumScore),
  }));
}

export const diskSearchFieldWeights = FIELD_WEIGHTS;
