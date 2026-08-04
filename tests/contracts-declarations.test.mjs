import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('public declarations retain evidence APIs and expose note source targets', async () => {
  const source = await readFile(path.join(root, 'src/core/contracts.d.ts'), 'utf8');
  for (const pattern of [
    /targetDocumentId\?: string \| null/u,
    /targetSectionId\?: string \| null/u,
    /export interface EvidenceDiscrepancySide/u,
    /export interface EvidenceDiscrepancy/u,
    /contractVersion: '0\.1\.0'/u,
    /validateKnowledgePackContract/u,
    /validateSearchResultContract/u,
    /createEvidenceEnvelope/u,
  ]) assert.match(source, pattern);
});
