/**
 * Adapt MiniMed's domain-owned MedicalCore API to L-Note's generic asynchronous
 * search boundary. The adapter deliberately knows only the public result shape;
 * clinical parsing, ranking and safety rules remain inside MiniMed.
 */

const DEFAULT_OPTIONS = Object.freeze({
  packId: 'minimed',
  packTitle: 'MiniMed',
  sourceTitle: 'MiniMed local corpus',
  mode: 'hybrid',
});

function asMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string') return error.message;
    if (typeof error.code === 'string') return error.code;
  }
  return String(error ?? 'Unknown MiniMed error');
}

function unwrapResult(result, operation) {
  if (result && typeof result === 'object' && typeof result.ok === 'boolean') {
    if (!result.ok) throw new Error(`MiniMed ${operation} failed: ${asMessage(result.error)}`);
    return result.value;
  }
  return result;
}

function finiteScore(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function leafSectionTitle(result) {
  const path = Array.isArray(result?.sectionPath) ? result.sectionPath.filter(Boolean) : [];
  return path.at(-1) ?? result?.sectionTitle ?? result?.category ?? 'Фрагмент источника';
}

function flattenResponseResults(response) {
  if (Array.isArray(response?.results)) return response.results;
  if (Array.isArray(response?.groups)) {
    return response.groups.flatMap((group) => (Array.isArray(group?.results) ? group.results : []));
  }
  return [];
}

function normalizeScores(records) {
  const maximum = Math.max(0, ...records.map((record) => Math.max(0, record.score)));
  return records.map((record) => ({
    ...record,
    relevance: maximum > 0 ? Math.max(0, Math.min(100, Math.round((Math.max(0, record.score) / maximum) * 100))) : 0,
  }));
}

export function mapMiniMedSearchResponse(response, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const records = flattenResponseResults(response).map((result, index) => {
    const documentId = String(result?.documentId ?? `document-${index + 1}`);
    const sectionId = String(result?.sectionId ?? result?.chunkId ?? `section-${index + 1}`);
    const documentTitle = String(result?.title ?? result?.documentTitle ?? documentId);
    const body = String(result?.snippet ?? result?.body ?? result?.text ?? '');
    const matchedTerms = Array.isArray(result?.matchedTerms) ? result.matchedTerms.filter((term) => typeof term === 'string') : [];
    const matchedBranches = Array.isArray(result?.matchedBranches)
      ? result.matchedBranches.filter((branch) => typeof branch === 'string')
      : [];
    const score = finiteScore(result?.finalScore, result?.lexicalScore, result?.semanticScore, result?.score);

    return {
      id: `minimed:${String(result?.chunkId ?? `${documentId}:${sectionId}`)}`,
      kind: 'section',
      packId: config.packId,
      packTitle: config.packTitle,
      documentId,
      documentTitle,
      sectionId,
      title: leafSectionTitle(result),
      body,
      snippet: body,
      aliases: '',
      entityNames: '',
      entityIds: [],
      tags: [result?.category, ...matchedTerms].filter(Boolean).join(' '),
      authority: 'reference',
      effectiveFrom: null,
      sourceTitle: config.sourceTitle,
      claimIds: [],
      score,
      lexicalScore: Number.isFinite(Number(result?.lexicalScore)) ? Number(result.lexicalScore) : null,
      semanticScore: Number.isFinite(Number(result?.semanticScore)) ? Number(result.semanticScore) : null,
      queryTerms: matchedTerms,
      matchedBranches,
      adapter: 'minimed-medical-core',
      originalResult: result,
    };
  });

  return normalizeScores(records).sort((left, right) => right.score - left.score);
}

function normalizeSuggestions(analysis, limit) {
  const source = Array.isArray(analysis?.suggestions) ? analysis.suggestions : [];
  const values = source
    .map((suggestion) => {
      if (typeof suggestion === 'string') return suggestion;
      if (!suggestion || typeof suggestion !== 'object') return null;
      return suggestion.label ?? suggestion.message ?? suggestion.detail ?? suggestion.field ?? null;
    })
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());
  return [...new Set(values)].slice(0, limit);
}

/**
 * @param {{ search(request: object): Promise<unknown>, analyzeQuery?(request: object): Promise<unknown>, getCapabilities?(): Promise<unknown> }} medicalCore
 * @param {{ packId?: string, packTitle?: string, sourceTitle?: string, mode?: string, includeSuggestions?: boolean }} options
 */
export function createMiniMedMedicalCoreAdapter(medicalCore, options = {}) {
  if (!medicalCore || typeof medicalCore.search !== 'function') {
    throw new TypeError('MiniMed adapter requires a MedicalCore-compatible search(request) function.');
  }
  const config = { ...DEFAULT_OPTIONS, includeSuggestions: true, ...options };

  return Object.freeze({
    id: 'minimed-medical-core',
    kind: 'MiniMed MedicalCore adapter',
    asynchronous: true,

    async search(query, searchOptions = {}) {
      const cleanQuery = String(query ?? '').trim();
      if (!cleanQuery) return [];
      const response = unwrapResult(
        await medicalCore.search({
          query: cleanQuery,
          mode: searchOptions.mode ?? config.mode,
          limit: searchOptions.limit ?? 40,
          includeSuggestions: searchOptions.includeSuggestions ?? config.includeSuggestions,
          filters: searchOptions.filters ?? {},
        }),
        'search',
      );
      return mapMiniMedSearchResponse(response, config).slice(0, searchOptions.limit ?? 40);
    },

    async suggest(query, limit = 5) {
      const cleanQuery = String(query ?? '').trim();
      if (!cleanQuery || typeof medicalCore.analyzeQuery !== 'function') return [];
      const analysis = unwrapResult(
        await medicalCore.analyzeQuery({ query: cleanQuery, includeSuggestions: true }),
        'query analysis',
      );
      return normalizeSuggestions(analysis, limit);
    },

    async capabilities() {
      if (typeof medicalCore.getCapabilities !== 'function') {
        return { adapter: 'minimed-medical-core', lexicalSearch: true, semanticSearch: null };
      }
      const capabilities = unwrapResult(await medicalCore.getCapabilities(), 'capability lookup');
      return { adapter: 'minimed-medical-core', ...capabilities };
    },
  });
}
