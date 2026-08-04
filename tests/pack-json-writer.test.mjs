import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writePackJson } from '../tools/lib/pack-json-writer.mjs';

function largePack(documents = 600) {
  return {
    schemaVersion: 1,
    id: 'acceptance.pack-writer',
    version: '1.0.0',
    title: 'Chunked pack writer',
    description: 'Atomic output acceptance',
    language: 'ru',
    documents: Array.from({ length: documents }, (_, index) => ({
      id: `document-${String(index + 1).padStart(4, '0')}`,
      title: `Document ${index + 1}`,
      authority: 'reference',
      sections: [{
        id: 'content',
        title: 'Content',
        text: `Chunked pack document ${index + 1}`,
        entityIds: [],
        tags: [],
      }],
    })),
    entities: [],
    claims: [],
    relations: [],
  };
}

function partialPath(filename) {
  return path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.partial`);
}

test('writes large pack arrays without publishing an incomplete output file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-pack-writer-'));
  try {
    const output = path.join(directory, 'large.pack.json');
    const partial = partialPath(output);
    const pack = largePack();
    let observedMidWrite = false;

    const result = await writePackJson(output, pack, {
      onProgress(event) {
        if (event.stage === 'item' && event.key === 'documents' && event.index === 499) {
          observedMidWrite = true;
          assert.equal(existsSync(output), false);
          assert.equal(existsSync(partial), true);
        }
      },
    });

    assert.equal(observedMidWrite, true);
    assert.equal(existsSync(output), true);
    assert.equal(existsSync(partial), false);
    assert.equal(result.bytes, (await stat(output)).size);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), pack);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('removes partial output after a serialization failure', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-pack-writer-'));
  try {
    const output = path.join(directory, 'invalid.pack.json');
    const partial = partialPath(output);
    const circular = { id: 'broken' };
    circular.self = circular;
    const pack = largePack(0);
    pack.documents = [circular];

    await assert.rejects(writePackJson(output, pack), /circular|JSON/iu);
    assert.equal(existsSync(output), false);
    assert.equal(existsSync(partial), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
