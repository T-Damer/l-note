import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validatePack } from '../src/packs.js';
import {
  buildPack,
  canStreamAuthoringCompile,
} from '../tools/build-pack.mjs';
import { compileAuthoringPackToFile } from '../tools/lib/authoring-pack-compiler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function partialPath(filename) {
  return path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.partial`);
}

async function writeJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeAuthoringDirectory(directory, {
  documents = 1,
  claims = [],
} = {}) {
  await Promise.all([
    writeJson(path.join(directory, 'manifest.json'), {
      schemaVersion: 1,
      id: 'acceptance.streaming-compile',
      version: '1.0.0',
      title: 'Streaming authoring compile',
      description: 'Normalized authoring compiler acceptance',
      language: 'ru',
    }),
    writeJson(path.join(directory, 'entities.json'), []),
    writeJson(path.join(directory, 'claims.json'), claims),
    writeJson(path.join(directory, 'relations.json'), []),
  ]);
  for (let index = 0; index < documents; index += 1) {
    const serial = String(index + 1).padStart(4, '0');
    await writeJson(path.join(directory, 'documents', `${serial}.json`), {
      id: `document-${serial}`,
      title: `Document ${serial}`,
      authority: 'reference',
      sections: [{
        id: 'content',
        title: 'Content',
        text: `Streaming source text ${serial}`,
        entityIds: [],
        tags: [],
      }],
    });
  }
}

test('plain normalized authoring builds use the streaming mode only without review options', () => {
  assert.equal(canStreamAuthoringCompile({ aiProvider: 'none', comparePack: [] }), true);
  assert.equal(canStreamAuthoringCompile({ aiProvider: 'none', comparePack: [], id: 'raw.pack' }), false);
  assert.equal(canStreamAuthoringCompile({ aiProvider: 'openai', comparePack: [] }), false);
  assert.equal(canStreamAuthoringCompile({ aiProvider: 'none', comparePack: ['old.json'] }), false);
  assert.equal(canStreamAuthoringCompile({ aiProvider: 'none', comparePack: [], semanticReviewIn: 'review.json' }), false);
  assert.equal(canStreamAuthoringCompile({ aiProvider: 'none', comparePack: [], discrepancyReviewOut: 'review.json' }), false);
});

test('streaming compiler preserves the existing normalized pack result', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-authoring-compile-'));
  try {
    const input = path.join(root, 'examples', 'custom-pack');
    const output = path.join(directory, 'compiled.pack.json');
    const expected = await buildPack(input);
    const result = await compileAuthoringPackToFile({ inputPath: input, outputPath: output });
    const actual = JSON.parse(await readFile(output, 'utf8'));

    assert.deepEqual(actual, expected);
    assert.equal(result.documents, expected.documents.length);
    assert.equal(result.entities, expected.entities.length);
    assert.equal(result.claims, expected.claims.length);
    assert.equal(validatePack(actual).valid, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('reads and writes a large authoring library one document at a time', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-authoring-compile-'));
  try {
    const input = path.join(directory, 'authoring');
    const output = path.join(directory, 'large.pack.json');
    const partial = partialPath(output);
    await writeAuthoringDirectory(input, { documents: 600 });
    let observedMidCompile = false;

    const result = await compileAuthoringPackToFile({
      inputPath: input,
      outputPath: output,
      onProgress(event) {
        if (event.stage === 'document' && event.index === 499) {
          observedMidCompile = true;
          assert.equal(existsSync(output), false);
          assert.equal(existsSync(partial), true);
        }
      },
    });

    assert.equal(observedMidCompile, true);
    assert.equal(result.documents, 600);
    assert.equal(existsSync(output), true);
    assert.equal(existsSync(partial), false);
    const pack = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(pack.documents.length, 600);
    assert.equal(pack.documents[0].id, 'document-0001');
    assert.equal(pack.documents.at(-1).id, 'document-0600');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid exact evidence leaves no final or partial pack', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-authoring-compile-'));
  try {
    const input = path.join(directory, 'authoring');
    const output = path.join(directory, 'invalid.pack.json');
    const partial = partialPath(output);
    await writeAuthoringDirectory(input, {
      claims: [{
        id: 'claim.invalid-quote',
        text: 'Invented claim',
        source: {
          documentId: 'document-0001',
          sectionId: 'content',
          quote: 'This quote is not present.',
        },
      }],
    });

    await assert.rejects(
      compileAuthoringPackToFile({ inputPath: input, outputPath: output }),
      /evidence quote is not an exact substring/u,
    );
    assert.equal(existsSync(output), false);
    assert.equal(existsSync(partial), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
