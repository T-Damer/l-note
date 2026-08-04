import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validatePack } from '../src/packs.js';
import { buildPack } from '../tools/build-pack.mjs';
import { prepareUniversalDocumentDirectory } from '../tools/lib/universal-document-preparation.mjs';

test('re-preparation removes documents and assets deleted from the source directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'l-note-universal-refresh-'));
  const input = path.join(root, 'input');
  const output = path.join(root, 'prepared');
  try {
    await mkdir(input, { recursive: true });
    const oldSource = path.join(input, 'old.md');
    const newSource = path.join(input, 'new.md');
    await writeFile(oldSource, '# Old\n\nOld content.');
    await prepareUniversalDocumentDirectory({
      inputPath: input,
      outputPath: output,
      id: 'example.refresh-library',
      anydocMode: 'off',
      generatedAt: '2026-08-04T18:00:00.000Z',
    });

    await rm(oldSource);
    await writeFile(newSource, '# New\n\nNew content.');
    await prepareUniversalDocumentDirectory({
      inputPath: input,
      outputPath: output,
      id: 'example.refresh-library',
      anydocMode: 'off',
      generatedAt: '2026-08-04T18:01:00.000Z',
    });

    const pack = await buildPack(output);
    assert.equal(validatePack(pack).valid, true);
    assert.deepEqual(pack.documents.map((document) => document.source.title), ['new.md']);
    assert.equal((await readdir(path.join(output, 'documents'))).length, 1);
    assert.deepEqual(await readdir(path.join(output, 'assets')), ['new.md']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
