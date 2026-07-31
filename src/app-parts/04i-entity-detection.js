detectRelatedEntities = function detectRelatedEntitiesFromKnowledge(text) {
  return detectEntitiesInText({
    entities: state.knowledge.entities.values(),
    text,
    normalizeText,
    limit: 16,
  });
};
