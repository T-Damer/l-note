import assert from 'node:assert/strict';
import test from 'node:test';

import {
  documentAssetUrl,
  resolveDocumentAsset,
  sectionAssetPage,
} from '../src/helpers/document-assets.js';

const documentRecord = {
  id: 'doc.example',
  title: 'Document',
  asset: {
    url: './assets/source.pdf',
    mimeType: 'application/pdf',
    title: 'Local source',
    page: 2,
  },
  source: {
    title: 'Local source',
  },
  sections: [
    {
      id: 'details',
      title: 'Details',
      text: 'Text',
      assetAnchor: { page: 7, anchor: 'details' },
    },
  ],
};

test('resolves a validated document asset and exact section page anchors', () => {
  assert.deepEqual(resolveDocumentAsset(documentRecord), {
    url: './assets/source.pdf',
    mimeType: 'application/pdf',
    title: 'Local source',
    page: 2,
    anchor: null,
    sectionId: null,
  });
  assert.equal(sectionAssetPage(documentRecord, null), 2);
  assert.equal(sectionAssetPage(documentRecord, 'details'), 7);
});

test('builds PDF fragments without changing the stored asset URL', () => {
  const asset = resolveDocumentAsset(documentRecord, 'details');
  assert.equal(
    documentAssetUrl(asset),
    './assets/source.pdf#page=7&view=FitH&nameddest=details',
  );
  assert.equal(asset.url, './assets/source.pdf');
});

test('keeps legacy source assets and non-PDF downloads compatible', () => {
  assert.deepEqual(resolveDocumentAsset({
    title: 'Legacy',
    source: {
      title: 'Legacy source',
      asset: { url: './legacy.bin', mimeType: 'application/octet-stream' },
    },
    sections: [{ id: 'content', title: 'Content', text: 'Text' }],
  }), {
    url: './legacy.bin',
    mimeType: 'application/octet-stream',
    title: 'Legacy source',
    page: 1,
    anchor: null,
    sectionId: null,
  });
  assert.equal(
    documentAssetUrl({ url: './asset.bin', mimeType: 'application/octet-stream', page: 1 }),
    './asset.bin',
  );
});

test('normalizes invalid page values and ignores incomplete assets', () => {
  assert.equal(resolveDocumentAsset({ asset: { mimeType: 'application/pdf' } }), null);
  assert.equal(
    resolveDocumentAsset({
      title: 'Invalid pages',
      asset: { url: './source.pdf', mimeType: 'application/pdf', page: 0 },
      sections: [{ id: 'a', title: 'A', text: 'A', assetAnchor: { page: -3 } }],
    }, 'a')?.page,
    1,
  );
});
