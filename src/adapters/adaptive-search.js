import { defineSearchPort } from '../core/ports.js';
import { expandSearchQuery, tokenize } from '../search.js';
import { createIndexedDbSearchPort } from './indexeddb-search.js';
import { createMiniSearchPort } from './runtime-adapters.js';

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

function createDiskSearchFacade(records, entities, options) {
  const queryExpanders = Array.isArray(options.queryExpanders) ? options.queryExpanders : [];
  const diskPort = (options.diskFactory ?? createIndexedDbSearchPort)(options.diskOptions);
  let sourceRecords = records;
  let fallback = null;
  let backendError = null;
  const ready = diskPort.build(records, { onProgress: options.onProgress })
    .then((stats) => {
      sourceRecords = null;
      return stats;
    })
    .catch((error) => {
      backendError = error;
      fallback = createMiniSearchPort(sourceRecords ?? [], entities, { queryExpanders });
      sourceRecords = null;
      return {
        recordCount: fallback.count,
        tokenCount: 0,
        storage: 'memory-fallback',
        backend: fallback.kind,
        error: error instanceof Error ? error.message : String(error),
      };
    });

  async function search(query, searchOptions = {}) {
    await ready;
    if (fallback) return fallback.search(query, searchOptions);
    const expanded = expandSearchQuery(query, entities, queryExpanders);
    return commonResultMetadata(
      await diskPort.search(expanded, searchOptions),
      query,
      expanded,
    );
  }

  async function suggest(query, limit = 5) {
    await ready;
    if (fallback) return fallback.suggest(query, limit);
    return diskPort.suggest(query, limit);
  }

  return defineSearchPort({
    kind: 'IndexedDB disk search',
    count: records.length,
    async: true,
    retainsRecords: false,
    ready,
    search,
    suggest,
    stats: () => diskPort.stats(),
    close() {
      diskPort.close?.();
    },
    get backendError() {
      return backendError;
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
  return createDiskSearchFacade(records, entities, options);
}
