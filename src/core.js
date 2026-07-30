export const PACK_FORMAT = 'l-note-pack';
export const PACK_SCHEMA_VERSION = 1;

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[‐‑‒–—−]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validatePack(pack) {
  assert(pack && typeof pack === 'object', 'Knowledge pack must be an object.');
  assert(pack.format === PACK_FORMAT, `Unsupported pack format: ${String(pack.format)}`);
  assert(pack.schemaVersion === PACK_SCHEMA_VERSION, `Unsupported schema version: ${String(pack.schemaVersion)}`);
  assert(pack.manifest?.id, 'manifest.id is required.');
  assert(pack.manifest?.title, 'manifest.title is required.');
  assert(Array.isArray(pack.documents), 'documents must be an array.');
  assert(Array.isArray(pack.entities), 'entities must be an array.');
  assert(Array.isArray(pack.relations), 'relations must be an array.');
  assert(Array.isArray(pack.claims), 'claims must be an array.');
  assert(Array.isArray(pack.glossary), 'glossary must be an array.');

  const ids = new Set();
  const chunkIds = new Set();
  const entityIds = new Set();

  for (const entity of pack.entities) {
    assert(entity.id && entity.name, 'Every entity requires id and name.');
    assert(!entityIds.has(entity.id), `Duplicate entity ID: ${entity.id}`);
    entityIds.add(entity.id);
  }

  for (const document of pack.documents) {
    assert(document.id && document.title, 'Every document requires id and title.');
    assert(!ids.has(document.id), `Duplicate document ID: ${document.id}`);
    ids.add(document.id);
    assert(Array.isArray(document.sections), `Document ${document.id} must contain sections.`);
    for (const section of document.sections) {
      assert(section.id && section.title, `Document ${document.id} has an invalid section.`);
      assert(Array.isArray(section.chunks), `Section ${section.id} must contain chunks.`);
      for (const chunk of section.chunks) {
        assert(chunk.id && chunk.text, `Section ${section.id} has an invalid chunk.`);
        assert(!chunkIds.has(chunk.id), `Duplicate chunk ID: ${chunk.id}`);
        chunkIds.add(chunk.id);
        for (const entityId of chunk.entityIds ?? []) {
          assert(entityIds.has(entityId), `Chunk ${chunk.id} references unknown entity ${entityId}.`);
        }
      }
    }
  }

  for (const relation of pack.relations) {
    assert(entityIds.has(relation.from), `Relation ${relation.id} has unknown source entity.`);
    assert(entityIds.has(relation.to), `Relation ${relation.id} has unknown target entity.`);
    for (const evidence of relation.evidence ?? []) {
      assert(chunkIds.has(evidence.chunkId), `Relation ${relation.id} cites unknown chunk ${evidence.chunkId}.`);
    }
  }

  for (const claim of pack.claims) {
    assert(claim.id && claim.text, 'Every claim requires id and text.');
    for (const evidence of claim.evidence ?? []) {
      assert(chunkIds.has(evidence.chunkId), `Claim ${claim.id} cites unknown chunk ${evidence.chunkId}.`);
    }
  }

  return {
    documents: pack.documents.length,
    chunks: chunkIds.size,
    entities: entityIds.size,
    relations: pack.relations.length,
    claims: pack.claims.length,
  };
}

export function flattenPack(pack) {
  const entityById = new Map(pack.entities.map((entity) => [entity.id, entity]));
  const chunks = [];
  for (const document of pack.documents) {
    for (const section of document.sections) {
      for (const chunk of section.chunks) {
        const entities = (chunk.entityIds ?? []).map((id) => entityById.get(id)).filter(Boolean);
        chunks.push({
          pk: `${pack.manifest.id}:${chunk.id}`,
          packId: pack.manifest.id,
          packTitle: pack.manifest.title,
          documentId: document.id,
          documentTitle: document.title,
          documentSummary: document.summary ?? '',
          sectionId: section.id,
          sectionTitle: section.title,
          chunkId: chunk.id,
          text: chunk.text,
          entityIds: chunk.entityIds ?? [],
          entityNames: entities.map((entity) => entity.name).join(' '),
          aliases: entities.flatMap((entity) => entity.aliases ?? []).join(' '),
          source: document.source ?? null,
          authority: document.authority ?? 'unknown',
        });
      }
    }
  }
  return chunks;
}

export function expandQuery(query, glossary = [], entities = []) {
  const normalized = normalizeText(query);
  const additions = [];
  const matches = [];

  for (const entry of glossary) {
    const term = normalizeText(entry.term);
    if (term && new RegExp(`(^|\\s|[()«»,.;:])${escapeRegExp(term)}($|\\s|[()«»,.;:])`, 'u').test(` ${normalized} `)) {
      additions.push(entry.expansion);
      matches.push({ term: entry.term, expansion: entry.expansion, entityId: entry.entityId ?? null });
    }
  }

  for (const entity of entities) {
    for (const alias of entity.aliases ?? []) {
      const term = normalizeText(alias);
      if (term.length >= 3 && normalized.includes(term)) {
        additions.push(entity.name);
        matches.push({ term: alias, expansion: entity.name, entityId: entity.id });
      }
    }
  }

  return {
    original: query.trim(),
    expanded: unique([query.trim(), ...additions]).join(' '),
    matches: dedupeMatches(matches),
  };
}

function dedupeMatches(matches) {
  const seen = new Set();
  return matches.filter((match) => {
    const key = `${normalizeText(match.term)}:${match.entityId ?? normalizeText(match.expansion)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function buildDeterministicBriefing(question, evidence, notes = []) {
  const official = evidence.filter((item) => item.kind !== 'note');
  const personal = notes.filter((note) => note.body || note.title);
  const conflicts = personal.filter((note) => ['contradicts', 'supersedes'].includes(note.relationType));
  const refinements = personal.filter((note) => ['refines', 'observation'].includes(note.relationType));

  return {
    question,
    summary: official.length
      ? `Найдено ${official.length} фрагмент(ов) в установленных пакетах. Выводы ниже являются навигационной сводкой, а не заменой первоисточников.`
      : 'В установленных пакетах не найдено достаточных фрагментов для сводки.',
    findings: official.map((item, index) => ({
      id: `E${index + 1}`,
      title: `${item.documentTitle} — ${item.sectionTitle}`,
      text: item.text,
      source: item.source,
    })),
    refinements,
    conflicts,
    gaps: official.length < 2
      ? ['Найдено меньше двух независимых фрагментов: сопоставление источников ограничено.']
      : [],
  };
}

export function extractCitations(text) {
  return unique([...String(text).matchAll(/\[(E\d+)\]/gu)].map((match) => match[1]));
}

export function validateGroundedAnswer(answer, allowedCitationIds) {
  const allowed = new Set(allowedCitationIds);
  const cited = extractCitations(answer);
  const unknown = cited.filter((id) => !allowed.has(id));
  const uncitedParagraphs = String(answer)
    .split(/\n\s*\n/gu)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !/^#{1,6}\s/u.test(paragraph) && !extractCitations(paragraph).length);

  return {
    valid: unknown.length === 0 && uncitedParagraphs.length === 0 && cited.length > 0,
    cited,
    unknown,
    uncitedParagraphs,
  };
}
