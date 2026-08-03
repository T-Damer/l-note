import { createSemanticReview } from './semantic-review.mjs';

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

export function parseSemanticProposal(value) {
  const text = String(value ?? '').trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Model did not return a JSON object.');
  const parsed = JSON.parse(text.slice(start, end + 1));
  return {
    entities: Array.isArray(parsed?.entities) ? parsed.entities : [],
    claims: Array.isArray(parsed?.claims) ? parsed.claims : [],
    relations: Array.isArray(parsed?.relations) ? parsed.relations : [],
  };
}

export async function collectSemanticReview({
  pack,
  provider,
  generatedAt = new Date().toISOString(),
  onProgress = () => {},
} = {}) {
  if (!pack?.id) throw new TypeError('A deterministic target pack is required.');
  if (!provider?.complete) throw new TypeError('An AI proposal provider is required.');
  const total = pack.documents.reduce((sum, document) => sum + document.sections.length, 0);
  const sectionProposals = [];
  let completed = 0;
  for (const document of pack.documents) {
    for (const section of document.sections) {
      onProgress({
        stage: 'ai-proposals',
        completed,
        total,
        document: document.title,
        section: section.title,
        provider: provider.name,
      });
      const raw = await provider.complete(promptForSection(document, section));
      sectionProposals.push({
        documentId: document.id,
        sectionId: section.id,
        proposal: parseSemanticProposal(raw),
      });
      completed += 1;
    }
  }
  onProgress({ stage: 'ai-proposals', completed, total, provider: provider.name });
  return createSemanticReview({
    pack,
    sectionProposals,
    provider: provider.name ?? 'unknown',
    generatedAt,
  });
}
