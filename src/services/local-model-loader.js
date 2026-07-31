export async function loadSelectedLocalModel({
  modelPort,
  modelId,
  onProgress,
  requestPersistence,
} = {}) {
  if (!modelPort || typeof modelPort.load !== 'function') {
    throw new TypeError('loadSelectedLocalModel requires a LocalModelPort.');
  }
  if (typeof modelId !== 'string' || modelId.length === 0) {
    throw new TypeError('loadSelectedLocalModel requires a model ID.');
  }
  const persistence = typeof requestPersistence === 'function'
    ? await requestPersistence()
    : null;
  const loaded = await modelPort.load({ modelId, onProgress });
  return { loaded, persistence };
}

export function createModelRunRecord(answer, lastLoad, now = new Date().toISOString()) {
  if (!answer?.modelId) throw new TypeError('createModelRunRecord requires a model answer.');
  return {
    modelId: answer.modelId,
    modeId: answer.modeId,
    loadMs: lastLoad?.modelId === answer.modelId ? lastLoad.loadMs : null,
    durationMs: answer.durationMs,
    tokensPerSecond: answer.tokensPerSecond,
    completionTokens: answer.completionTokens,
    grounded: answer.grounded,
    createdAt: now,
  };
}

export function prependModelRun(runs, record, limit = 6) {
  const safeRuns = Array.isArray(runs) ? runs : [];
  return [record, ...safeRuns].slice(0, Math.max(1, Math.floor(limit)));
}
