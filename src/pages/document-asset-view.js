import { documentAssetUrl, resolveDocumentAsset } from '../helpers/document-assets.js';
import { Button } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { Text } from '../ui/text.js';

function pageLabel(page) {
  return Number.isInteger(page) && page > 0 ? `Страница ${page}` : 'Источник';
}

function createPdfFrame(asset) {
  return element('iframe', {
    className: 'document-asset-frame',
    src: documentAssetUrl(asset),
    title: `${asset.title}, ${pageLabel(asset.page)}`,
    loading: 'lazy',
  });
}

export function createDocumentAssetView({ documentRecord, sectionId = null } = {}) {
  const initialAsset = resolveDocumentAsset(documentRecord, sectionId);
  if (!initialAsset) return null;

  const frame = initialAsset.mimeType === 'application/pdf'
    ? createPdfFrame(initialAsset)
    : null;
  const status = Text({ variant: 'caption', text: pageLabel(initialAsset.page) });
  const details = element('details', { className: 'document-asset-view', open: true });
  const summary = element('summary', {}, [
    element('span', { className: 'document-asset-title' }, [
      Icon({ name: initialAsset.mimeType === 'application/pdf' ? 'pdf' : 'document' }),
      Text({ variant: 'label', as: 'span', text: initialAsset.title }),
    ]),
    status,
  ]);
  const body = element('div', { className: 'document-asset-body' });
  if (frame) {
    body.append(frame);
  } else {
    body.append(Text({
      variant: 'muted',
      text: 'Для этого типа локального документа встроенный просмотр пока недоступен.',
    }));
  }
  details.append(summary, body);

  function openSection(targetSectionId) {
    const asset = resolveDocumentAsset(documentRecord, targetSectionId);
    if (!asset) return false;
    details.open = true;
    status.textContent = pageLabel(asset.page);
    if (frame) {
      frame.src = documentAssetUrl(asset);
      frame.title = `${asset.title}, ${pageLabel(asset.page)}`;
    }
    details.scrollIntoView({ block: 'start' });
    return true;
  }

  function sourceButton(targetSectionId) {
    const asset = resolveDocumentAsset(documentRecord, targetSectionId);
    if (!asset) return null;
    return Button({
      variant: 'secondary',
      className: 'document-section-source',
      icon: asset.mimeType === 'application/pdf' ? 'pdf' : 'document',
      text: `Открыть источник · ${pageLabel(asset.page).toLocaleLowerCase('ru-RU')}`,
      onClick: () => openSection(targetSectionId),
    });
  }

  return Object.freeze({
    element: details,
    openSection,
    sourceButton,
    asset: initialAsset,
  });
}
