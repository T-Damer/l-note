export function collectQuestionEvidence({
  query,
  mode,
  searchPort,
  knowledgeState,
  collectEvidence,
} = {}) {
  const cleanQuery = String(query ?? '').trim();
  if (!cleanQuery) throw new TypeError('collectQuestionEvidence requires a non-empty query.');
  if (!mode?.id || !Number.isFinite(mode.sourceLimit)) {
    throw new TypeError('collectQuestionEvidence requires an answer-mode profile.');
  }
  if (!searchPort || typeof searchPort.search !== 'function') {
    throw new TypeError('collectQuestionEvidence requires a SearchPort.');
  }
  if (!knowledgeState || typeof collectEvidence !== 'function') {
    throw new TypeError('collectQuestionEvidence requires knowledge state and an evidence collector.');
  }

  const results = searchPort.search(cleanQuery, {
    limit: Math.max(18, mode.sourceLimit * 4),
    personalPriority: true,
  });
  const evidence = collectEvidence(cleanQuery, results, knowledgeState, {
    sourceLimit: mode.sourceLimit,
  });
  return { evidence, modeId: mode.id, results };
}

export function evidenceMatchesRequest(evidence, query, modeId, currentModeId) {
  return Boolean(
    evidence
      && evidence.query === String(query ?? '').trim()
      && modeId === currentModeId,
  );
}
