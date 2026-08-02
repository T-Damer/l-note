export function entityTerms(entity) {
  return [entity?.name, ...(entity?.aliases ?? [])]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

export function detectEntitiesInText({ entities = [], text = '', normalizeText, limit = 16 } = {}) {
  if (typeof normalizeText !== 'function') {
    throw new TypeError('detectEntitiesInText requires a normalization function.');
  }
  const normalized = normalizeText(text);
  return [...entities]
    .filter((entity) => (
      entityTerms(entity).some((term) => normalized.includes(normalizeText(term)))
    ))
    .slice(0, Math.max(0, Math.floor(limit)));
}
