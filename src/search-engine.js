import { create, insertMultiple, search } from '@orama/orama';

import { normalizeText, tokenize, unique } from './utils.js';

export const RELATION_LABELS = Object.freeze({
  related: 'связано с',
  supports: 'подтверждает',
  refines: 'уточняет',
  contradicts: 'противоречит',
  supersedes: 'замещает',
  'recommended-treatment-for': 'рекомендовано для',
  'differential-with': 'дифференцировать с',
  'treated-with': 'лечится с помощью',
  'associated-with': 'связано с',
  'abbreviation-of': 'расшифровывается как'
});

function relationLabel(predicate) {
  return RELATION_LABELS[predicate] ?? predicate.replaceAll('-', ' ');
}

function authorityMultiplier(authority) {
  switch (authority) {
    case 'official':
      return 1.14;
    case 'reference':
      return 1.07;
    case 'personal':
      return 1;
    default:
      return 1.02;
  }
}

function sourceAuthority(record) {
  if (record.kind === 'note') return 'personal';
  return record.source?.authority ?? 'reference';
}

function makeEntityLookup(entities) {
  const lookup = new Map();
  for (const entity of entities) {
    lookup.set(`${entity.packId}::${entity.id}`, entity);
  }
  return lookup;
}

function makeRelationLookup(relations, entityLookup) {
  const lookup = new Map();
  for (const relation of relations) {
    const fromKey = `${relation.packId}::${relation.from}`;
    const toKey = `${relation.packId}::${relation.to}`;
    const fromEntity = entityLookup.get(fromKey);
    const toEntity = entityLookup.get(toKey);
    if (!fromEntity || !toEntity) continue;
    const text = `${fromEntity.name} ${relationLabel(relation.predicate)} ${toEntity.name}${
      relation.description ? `: ${relation.description}` : ''
    }`;
    for (const key of [fromKey, toKey]) {
      const current = lookup.get(key) ?? [];
      current.push({ ...relation, text, fromEntity, toEntity });
      lookup.set(key, current);
    }
  }
  return lookup;
}

function recordEntityData(record, entityLookup, relationLookup) {
  const entities = record.entityIds
    .map((entityId) => entityLookup.get(`${record.packId}::${entityId}`))
    .filter(Boolean);
  const relations = entities.flatMap((entity) => relationLookup.get(entity.key) ?? []);
  return {
    entities,
    entityNames: unique(entities.flatMap((entity) => [entity.name, ...entity.aliases])),
    relationText: unique(relations.map((relation) => relation.text))
  };
}

function noteEntityData(note, entityLookup) {
  const entities = [];
  for (const entityId of note.entityIds ?? []) {
    for (const entity of entityLookup.values()) {
      if (entity.id === entityId) entities.push(entity);
    }
  }
  return {
    entities: unique(entities),
    entityNames: unique(entities.flatMap((entity) => [entity.name, ...entity.aliases]))
  };
}

export async function createKnowledgeIndex(snapshot) {
  const entityLookup = makeEntityLookup(snapshot.entities);
  const relationLookup = makeRelationLookup(snapshot.relations, entityLookup);
  const packLookup = new Map(snapshot.packs.map((pack) => [pack.id, pack]));
  const registry = new Map();
  const aliasPhrases = [];
  const dictionary = new Set();

  const documents = [];
  for (const record of snapshot.records) {
    const entityData = recordEntityData(record, entityLookup, relationLookup);
    const authority = sourceAuthority(record);
    const document = {
      id: `record:${record.key}`,
      key: record.key,
      type: 'reference',
      title: record.title,
      section: record.section ?? '',
      body: record.body,
      aliases: unique([...record.aliases, ...entityData.entityNames]),
      tags: record.tags,
      entityNames: entityData.entityNames,
      relationText: entityData.relationText,
      packTitle: record.packTitle,
      authority,
      linkedRecordKey: '',
      relationType: ''
    };
    documents.push(document);
    registry.set(document.id, {
      ...document,
      record,
      pack: packLookup.get(record.packId) ?? null,
      entities: entityData.entities,
      relations: entityData.entities.flatMap((entity) => relationLookup.get(entity.key) ?? [])
    });
    for (const alias of document.aliases) {
      aliasPhrases.push({ alias: normalizeText(alias), canonical: record.title });
    }
  }

  for (const entity of snapshot.entities) {
    const relations = relationLookup.get(entity.key) ?? [];
    const aliases = unique(entity.aliases);
    const document = {
      id: `entity:${entity.key}`,
      key: entity.key,
      type: 'entity',
      title: entity.name,
      section: entity.type,
      body: entity.description ?? `${entity.name}: сущность из пакета «${entity.packTitle}».`,
      aliases,
      tags: entity.tags,
      entityNames: [entity.name, ...aliases],
      relationText: relations.map((relation) => relation.text),
      packTitle: entity.packTitle,
      authority: 'reference',
      linkedRecordKey: '',
      relationType: ''
    };
    documents.push(document);
    registry.set(document.id, {
      ...document,
      entity,
      pack: packLookup.get(entity.packId) ?? null,
      relations,
      records: snapshot.records.filter(
        (record) => record.packId === entity.packId && record.entityIds.includes(entity.id)
      )
    });
    for (const alias of aliases) {
      aliasPhrases.push({ alias: normalizeText(alias), canonical: entity.name });
    }
  }

  for (const note of snapshot.notes) {
    const entityData = noteEntityData(note, entityLookup);
    const document = {
      id: `note:${note.id}`,
      key: note.id,
      type: 'personal',
      title: note.title,
      section: relationLabel(note.relationType),
      body: note.body,
      aliases: [],
      tags: note.tags,
      entityNames: entityData.entityNames,
      relationText: note.linkedRecordKey ? [relationLabel(note.relationType)] : [],
      packTitle: 'Личные заметки',
      authority: 'personal',
      linkedRecordKey: note.linkedRecordKey ?? '',
      relationType: note.relationType
    };
    documents.push(document);
    registry.set(document.id, { ...document, note, entities: entityData.entities });
  }

  for (const document of documents) {
    for (const token of tokenize(
      [
        document.title,
        document.section,
        document.body,
        ...document.aliases,
        ...document.tags,
        ...document.entityNames,
        ...document.relationText
      ].join(' ')
    )) {
      if (token.length >= 3) dictionary.add(token);
    }
  }

  const database = await create({
    language: 'russian',
    schema: {
      id: 'string',
      key: 'string',
      type: 'string',
      title: 'string',
      section: 'string',
      body: 'string',
      aliases: 'string[]',
      tags: 'string[]',
      entityNames: 'string[]',
      relationText: 'string[]',
      packTitle: 'string',
      authority: 'string',
      linkedRecordKey: 'string',
      relationType: 'string'
    }
  });

  if (documents.length > 0) await insertMultiple(database, documents, 250);

  return {
    database,
    registry,
    aliasPhrases,
    dictionary: [...dictionary],
    counts: {
      packs: snapshot.packs.length,
      records: snapshot.records.length,
      entities: snapshot.entities.length,
      relations: snapshot.relations.length,
      notes: snapshot.notes.length
    }
  };
}

export function expandQuery(query, aliasPhrases) {
  const normalized = normalizeText(query);
  if (!normalized) return '';
  const additions = [];
  for (const entry of aliasPhrases) {
    if (entry.alias.length >= 2 && normalized.includes(entry.alias)) additions.push(entry.canonical);
  }
  return unique([query, ...additions]).join(' ');
}

function fallbackLexicalScore(item, query) {
  const queryTokens = unique(tokenize(query)).filter((token) => token.length >= 2);
  if (queryTokens.length === 0) return 0;

  const searchableText = normalizeText(
    [
      item.title,
      item.section,
      item.body,
      ...(item.aliases ?? []),
      ...(item.tags ?? []),
      ...(item.entityNames ?? []),
      ...(item.relationText ?? [])
    ].join(' ')
  );
  const documentTokens = new Set(tokenize(searchableText));
  let exactMatches = 0;
  let partialMatches = 0;

  for (const token of queryTokens) {
    if (documentTokens.has(token)) {
      exactMatches += 1;
    } else if (token.length >= 5 && searchableText.includes(token)) {
      partialMatches += 1;
    }
  }

  const requiredMatches = queryTokens.length <= 2 ? 1 : 2;
  if (exactMatches + partialMatches < requiredMatches) return 0;

  const coverage = (exactMatches + partialMatches * 0.5) / queryTokens.length;
  const phraseBonus = searchableText.includes(normalizeText(query)) ? 0.35 : 0;
  return coverage + phraseBonus;
}

export async function searchKnowledge(index, query, options = {}) {
  const normalized = normalizeText(query);
  if (!normalized) return { hits: [], correctedQuery: null, expandedQuery: '' };
  const expandedQuery = expandQuery(query, index.aliasPhrases);
  const tolerance = options.tolerance ?? (normalized.length <= 4 ? 1 : 2);
  let response;
  try {
    response = await search(index.database, {
      term: expandedQuery,
      properties: ['title', 'aliases', 'entityNames', 'section', 'body', 'relationText', 'tags'],
      boost: {
        title: 4.2,
        aliases: 3.8,
        entityNames: 3.3,
        section: 2.4,
        relationText: 2.1,
        tags: 1.7,
        body: 1
      },
      tolerance,
      threshold: 0,
      limit: options.candidateLimit ?? 80
    });
  } catch (error) {
    console.warn('Fuzzy search failed, retrying exact search.', error);
    response = await search(index.database, {
      term: expandedQuery,
      properties: ['title', 'aliases', 'entityNames', 'section', 'body', 'relationText', 'tags'],
      limit: options.candidateLimit ?? 80
    });
  }

  const scope = options.scope ?? 'all';
  const typeAllowed = (type) => {
    if (scope === 'all') return true;
    if (scope === 'reference') return type === 'reference' || type === 'entity';
    if (scope === 'personal') return type === 'personal';
    if (scope === 'entity') return type === 'entity';
    return true;
  };

  const seen = new Set();
  const hits = [];
  for (const rawHit of response.hits) {
    const item = index.registry.get(rawHit.id);
    if (!item || !typeAllowed(item.type) || seen.has(rawHit.id)) continue;
    seen.add(rawHit.id);
    hits.push({
      ...item,
      score: rawHit.score * authorityMultiplier(item.authority),
      rawScore: rawHit.score
    });
  }

  // Orama remains the primary fuzzy engine. This deterministic lexical pass
  // fills gaps that can occur for mixed Cyrillic queries and abbreviations,
  // while preserving scope isolation and the same source registry.
  const candidateLimit = options.candidateLimit ?? 80;
  if (hits.length < candidateLimit) {
    for (const item of index.registry.values()) {
      if (!typeAllowed(item.type) || seen.has(item.id)) continue;
      const rawScore = fallbackLexicalScore(item, expandedQuery);
      if (rawScore <= 0) continue;
      seen.add(item.id);
      hits.push({
        ...item,
        score: rawScore * authorityMultiplier(item.authority),
        rawScore
      });
    }
  }
  hits.sort((left, right) => right.score - left.score);

  const correctedQuery = suggestQuery(query, index.dictionary);
  return {
    hits: hits.slice(0, options.limit ?? 30),
    correctedQuery: correctedQuery && normalizeText(correctedQuery) !== normalized ? correctedQuery : null,
    expandedQuery
  };
}

export function damerauLevenshtein(leftValue, rightValue, maxDistance = Number.POSITIVE_INFINITY) {
  const left = [...normalizeText(leftValue)];
  const right = [...normalizeText(rightValue)];
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    let rowMinimum = maxDistance + 1;
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      let distance = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        distance = Math.min(distance, matrix[row - 2][column - 2] + substitutionCost);
      }
      matrix[row][column] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
  }
  return matrix[left.length][right.length];
}

export function suggestQuery(query, dictionary) {
  const tokens = tokenize(query);
  if (tokens.length === 0 || dictionary.length === 0) return null;
  let changed = false;
  const corrected = tokens.map((token) => {
    if (token.length < 4 || dictionary.includes(token)) return token;
    const maxDistance = token.length >= 8 ? 2 : 1;
    let best = token;
    let bestDistance = maxDistance + 1;
    for (const candidate of dictionary) {
      if (Math.abs(candidate.length - token.length) > maxDistance) continue;
      const distance = damerauLevenshtein(token, candidate, maxDistance);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
        if (distance === 1) break;
      }
    }
    if (best !== token) changed = true;
    return best;
  });
  return changed ? corrected.join(' ') : null;
}

export function collectEvidence(hits, limit = 8) {
  return hits
    .filter((hit) => hit.type === 'reference')
    .slice(0, limit)
    .map((hit, index) => ({
      id: `S${index + 1}`,
      title: hit.title,
      section: hit.section,
      body: hit.body,
      source: hit.record?.source ?? null,
      recordKey: hit.key,
      authority: hit.authority,
      score: hit.score
    }));
}
