import assert from 'node:assert/strict';
import test from 'node:test';

import {
  documentAssetPage,
  documentAssetUrl,
  resolveDocumentAsset,
} from '../src/helpers/document-assets.js';

test('resolves a document asset and exact section page anchors', () => {
  const documentRecord = {
    asset: {
      url: './assets/source.pdf',
      mimeType: 'application/pdf',
      title: 'Local source',
      page: 2,
    },
  };
  assert.deepEqual(resolveDocumentAsset(documentRecord), {
    url: './assets/source.pdf',
    mimeType: 'application/pdf',
    title: 'Local source',
    defaultPage: 2,
  });
  assert.equal(documentAssetPage(documentRecord, null), 2);
  assert.equal(documentAssetPage(documentRecord, { assetAnchor: { page: 7 } }), 7);
});

test('builds PDF fragments without changing the stored asset URL', () => {
  const asset = resolveDocumentAsset({
    title: 'Document',
    asset: { url: './assets/source.pdf', mimeType: 'application/pdf' },
  });
  assert.equal(documentAssetUrl(asset, 4), './assets/source.pdf#page=4&zoom=page-width');
  assert.equal(asset.url, './assets/source.pdf');
});

test('normalizes invalid page values and ignores incomplete assets', () => {
  assert.equal(resolveDocumentAsset({ asset: { mimeType: 'application/pdf' } }), null);
  assert.equal(documentAssetPage({ asset: { page: 0 } }, { assetAnchor: { page: -3 } }), 1);
  assert.equal(documentAssetUrl({ url: './asset.bin', mimeType: 'application/octet-stream' }, 3), './asset.bin');
});
