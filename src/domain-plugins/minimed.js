import { normalizeText, tokenize } from '../search.js';

const QUERY_EXPANSIONS = Object.freeze([
  Object.freeze({
    id: 'infant-wheeze',
    phrases: Object.freeze([
      'грудничок свистит при дыхании',
      'грудничок свистит',
      'свистит при дыхании',
      'свистящее дыхание у грудничка',
    ]),
    terms: Object.freeze([
      'свистящие хрипы',
      'бронхиолит',
      'бронхообструкция',
      'дифференциальная диагностика',
    ]),
  }),
]);

function phraseMatches(normalizedQuery, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  if (normalizedQuery.includes(normalizedPhrase)) return true;
  const queryTokens = new Set(tokenize(normalizedQuery));
  const phraseTokens = tokenize(normalizedPhrase).filter((token) => token.length > 3);
  return phraseTokens.length > 0 && phraseTokens.every((token) => queryTokens.has(token));
}

/**
 * MiniMed's domain vocabulary is optional and isolated from the generic search engine.
 * Additional medical expansions should be backed by retrieval regressions.
 */
export function expandMiniMedQuery(query) {
  const normalizedQuery = normalizeText(query);
  const additions = new Set();
  for (const expansion of QUERY_EXPANSIONS) {
    if (!expansion.phrases.some((phrase) => phraseMatches(normalizedQuery, phrase))) continue;
    for (const term of expansion.terms) additions.add(term);
  }
  return [...additions];
}

export const minimedQueryExpansions = QUERY_EXPANSIONS;
