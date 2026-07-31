function positivePage(value, fallback = null) {
  const page = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(page) && page > 0 ? page : fallback;
}

function sectionById(documentRecord, sectionId) {
  if (!sectionId) return null;
  return (documentRecord?.sections ?? []).find((section) => section.id === sectionId) ?? null;
}

export function resolveDocumentAsset(documentRecord, sectionId = null) {
  const asset = documentRecord?.source?.asset;
  if (!asset || typeof asset.url !== 'string' || !asset.url.trim()) return null;
  const section = sectionById(documentRecord, sectionId);
  const sectionSource = section?.source ?? {};
  return Object.freeze({
    url: asset.url.trim(),
    mimeType: typeof asset.mimeType === 'string' && asset.mimeType.trim()
      ? asset.mimeType.trim()
      : 'application/octet-stream',
    title: asset.title ?? documentRecord.source?.title ?? documentRecord.title ?? 'Локальный источник',
    page: positivePage(sectionSource.page, positivePage(asset.page, 1)),
    anchor: typeof sectionSource.anchor === 'string' && sectionSource.anchor.trim()
      ? sectionSource.anchor.trim()
      : null,
    sectionId: section?.id ?? null,
  });
}

export function documentAssetUrl(asset, options = {}) {
  if (!asset?.url) return null;
  const page = positivePage(options.page, positivePage(asset.page, 1));
  const anchor = typeof options.anchor === 'string' && options.anchor.trim()
    ? options.anchor.trim()
    : asset.anchor;
  if (asset.mimeType !== 'application/pdf') {
    return anchor ? `${asset.url}#${encodeURIComponent(anchor)}` : asset.url;
  }
  const fragments = [`page=${page}`, 'view=FitH'];
  if (anchor) fragments.push(`nameddest=${encodeURIComponent(anchor)}`);
  return `${asset.url.split('#')[0]}#${fragments.join('&')}`;
}

export function sectionAssetPage(documentRecord, sectionId) {
  return resolveDocumentAsset(documentRecord, sectionId)?.page ?? null;
}
