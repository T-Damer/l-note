import { defineSearchPort } from '../core/ports.js';
import { expandSearchQuery, tokenize } from '../search.js';
import { createIndexedDbSearchPort } from './indexeddb-search.js';
import { createMiniSearchPort } from './runtime-adapters.js';
import { createSqliteFtsSearchPort } from './sqlite-fts-search.js';

export const DISK_SEARCH_RECORD_THRESHOLD = 5_000;
export const DISK_SEARCH_BYTE_THRESHOLD = 8 * 1024 * 1024;

export function estimateSearchCorpusBytes(records) {
  let characters = 0;
  for (const record of records ?? []) {
    characters += String(record.title ?? '').length;
    characters += String(record.documentTitle ?? '').length;
    characters += String(record.body ?? '').length;
    characters += String(record.aliases ?? '').length;
    characters += String(record.entityNames ?? '').length;
    characters += String(record.tags ?? '').length;
  }
  return characters * 2;
}

export function shouldUseDiskSearch(records, options = {}) {
  if (options.forceDisk === true) return true;
  if (options.forceDisk === false) return false;
  const recordThreshold = Number(options.recordThreshold ?? DISK_SEARCH_RECORD_THRESHOLD);
  const byteThreshold = Number(options.byteThreshold ?? DISK_SEARCH_BYTE_THRESHOLD);
  return (records?.length ?? 0) >= recordThreshold
    || estimateSearchCorpusBytes(records) >= byteThreshold;
}

function commonResultMetadata(results, query, expanded) {
  const terms = tokenize(query);
  return results.map((result) => ({
    ...result,
    queryTerms: terms,
    expandedQuery: expanded,
  }));
}

function backendCandidates(options) {
  return [
    {
      id: 'sqlite-fts5',
      factory: options.sqliteFactory ?? createSqliteFtsSearchPort,
      options: options.sqliteOptions,
    },
    {
      id: 'indexeddb-postings',
      factory: options.diskFactory ?? createIndexedDbSearchPort,
      options: options.diskOptions,
    },
  ];
}

function memoryFallback(records, entities, queryExpanders, errors) {
  const search = createMiniSearchPort(records, entities, { queryExpanders });
  return {
    search,
    stats: {
      recordCount: search.count,
      tokenCount: 0,
      storage: 'memory-fallback',
      backend: search.kind,
      errors,
    },
  };
}

function createPersistentSearchFacade(records, entities, options) {
  const queryExpanders = Array.isArray(options.queryExpanders) ? options.queryExpanders : [];
  const backendErrors = [];
  let sourceRecords = records;
  let activePort = null;
  let fallback = null;

  const ready = (async () => {
    for (const candidate of backendCandidates(options)) {
      const port = candidate.factory(candidate.options);
      try {
        if (port.available === false) throw new Error(`${port.kind ?? candidate.id} недоступен.`);
        const stats = await port.build(sourceRecords, {
          fingerprint: options.corpusFingerprint ?? '',
          onProgress: options.onProgress,
        });
        activePort = port;
        sourceRecords = null;
        return stats;
      } catch (error) {
        port.close?.();
        backendErrors.push({
          backend: candidate.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    fallback = memoryFallback(sourceRecords ?? [], entities, queryExpanders, backendErrors);
    sourceRecords = null;
    return fallback.stats;
  })();

  async function search(query, searchOptions = {}) {
    await ready;
    if (fallback) return fallback.search.search(query, searchOptions);
    const expanded = expandSearchQuery(query, entities, queryExpanders);
    return commonResultMetadata(
      await activePort.search(expanded, searchOptions),
      query,
      expanded,
    );
  }

  async function suggest(query, limit = 5) {
    await ready;
    if (fallback) return fallback.search.suggest(query, limit);
    return activePort.suggest(query, limit);
  }

  return defineSearchPort({
    get kind() {
      return fallback?.search.kind ?? activePort?.kind ?? 'SQLite/FTS5';
    },
    count: records.length,
    async: true,
    retainsRecords: false,
    ready,
    search,
    suggest,
    async stats() {
      await ready;
      return fallback?.stats ?? activePort.stats();
    },
    close() {
      activePort?.close?.();
    },
    get backendErrors() {
      return [...backendErrors];
    },
  });
}

export function createAdaptiveSearchPort(records, entities = [], options = {}) {
  if (!shouldUseDiskSearch(records, options)) {
    const search = createMiniSearchPort(records, entities, options);
    return Object.assign(search, {
      async: false,
      retainsRecords: true,
      ready: Promise.resolve({
        recordCount: records.length,
        tokenCount: null,
        storage: 'memory',
        backend: search.kind,
      }),
    });
  }
  return createPersistentSearchFacade(records, entities, options);
}
