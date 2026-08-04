export const BASE_ROUTES = Object.freeze(['search', 'ask', 'library', 'notes']);
export const RESOURCE_ROUTES = Object.freeze(['concept', 'statement', 'package', 'note', 'document']);

const DEFAULT_BASE_BY_RESOURCE = Object.freeze({
  concept: 'search',
  statement: 'search',
  package: 'library',
  note: 'notes',
  document: 'search',
});

export function normalizeBaseRoute(value) {
  return BASE_ROUTES.includes(value) ? value : 'search';
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function positiveDepth(value, fallback = 1) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export function parseHashRoute(hash = '') {
  const source = String(hash || '#/search').replace(/^#/u, '');
  const [pathSource = '', querySource = ''] = source.split('?', 2);
  const segments = pathSource.replace(/^\/+|\/+$/gu, '').split('/').filter(Boolean);
  const first = segments[0] ?? 'search';

  if (BASE_ROUTES.includes(first)) {
    return {
      kind: 'page',
      page: first,
      base: first,
      depth: 0,
      resourceType: null,
      resourceId: null,
      sectionId: null,
      claimId: null,
      documentId: null,
    };
  }

  if (RESOURCE_ROUTES.includes(first) && segments[1]) {
    const params = new URLSearchParams(querySource);
    const base = normalizeBaseRoute(params.get('from') ?? DEFAULT_BASE_BY_RESOURCE[first]);
    return {
      kind: 'resource',
      page: base,
      base,
      depth: positiveDepth(params.get('depth')),
      resourceType: first,
      resourceId: safeDecode(segments.slice(1).join('/')),
      sectionId: params.get('section'),
      claimId: params.get('claim'),
      documentId: params.get('document'),
    };
  }

  return {
    kind: 'page',
    page: 'search',
    base: 'search',
    depth: 0,
    resourceType: null,
    resourceId: null,
    sectionId: null,
    claimId: null,
    documentId: null,
  };
}

export function baseRouteHash(page) {
  return `#/${normalizeBaseRoute(page)}`;
}

export function resourceRouteHash(resourceType, resourceId, options = {}) {
  if (!RESOURCE_ROUTES.includes(resourceType)) throw new Error(`Unknown resource route: ${resourceType}`);
  if (typeof resourceId !== 'string' || !resourceId.trim()) throw new Error('Resource route requires an ID.');

  const params = new URLSearchParams();
  params.set('from', normalizeBaseRoute(options.base ?? DEFAULT_BASE_BY_RESOURCE[resourceType]));
  params.set('depth', String(positiveDepth(options.depth)));
  if (options.sectionId) params.set('section', options.sectionId);
  if (options.claimId) params.set('claim', options.claimId);
  if (options.documentId) params.set('document', options.documentId);
  return `#/${resourceType}/${encodeURIComponent(resourceId)}?${params.toString()}`;
}

export function nextResourceRoute(currentRoute, resourceType, resourceId, options = {}) {
  const current = currentRoute?.kind ? currentRoute : parseHashRoute(String(currentRoute ?? ''));
  const base = current.kind === 'resource' ? current.base : current.page;
  const depth = current.kind === 'resource' ? current.depth + 1 : 1;
  return {
    kind: 'resource',
    page: normalizeBaseRoute(base),
    base: normalizeBaseRoute(base),
    depth,
    resourceType,
    resourceId,
    sectionId: options.sectionId ?? null,
    claimId: options.claimId ?? null,
    documentId: options.documentId ?? null,
    hash: resourceRouteHash(resourceType, resourceId, {
      base,
      depth,
      sectionId: options.sectionId,
      claimId: options.claimId,
      documentId: options.documentId,
    }),
  };
}
