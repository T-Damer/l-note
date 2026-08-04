import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { shouldUseDiskSearch } from '../src/adapters/adaptive-search.js';
import { sqliteFtsMatchQuery } from '../src/helpers/sqlite-fts.js';
import { flattenKnowledge, validatePack } from '../src/packs.js';
import { buildPackFromBrowserFiles } from '../src/services/browser-pack-builder.js';
import { buildPrebuiltSearchArtifact } from '../tools/build-search-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(
  path.join(root, 'tests', 'fixtures', 'document-library', 'manifest.json'),
  'utf8',
));

function acceptanceCase(id) {
  const value = manifest.cases.find((item) => item.id === id && item.status === 'active');
  assert.ok(value, `Missing active acceptance case ${id}`);
  return value;
}

function longMarkdown(sectionCount) {
  const sections = ['# Long document acceptance'];
  for (let index = 1; index <= sectionCount; index += 1) {
    const serial = String(index).padStart(4, '0');
    sections.push(
      `## Section ${serial}\n\n`
      + `Corpus marker longdoc-${serial}. `
      + `This deterministic paragraph preserves section ${serial} through preparation and FTS reopen.`,
    );
  }
  return `${sections.join('\n\n')}\n`;
}

function browserFile(name, source) {
  const bytes = Buffer.from(source, 'utf8');
  return {
    name,
    size: bytes.byteLength,
    async text() {
      return source;
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function queryDatabase(filename, query) {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const match = sqliteFtsMatchQuery(query);
    return database.prepare(`
      SELECT payload, bm25(records_fts, 0, 0, 2.8, 1.8, 1.35, 1.1, 0.65) * -1 AS score
      FROM records_fts
      WHERE records_fts MATCH ?
      ORDER BY score DESC
      LIMIT 5
    `).all(match).map((row) => JSON.parse(row.payload));
  } finally {
    database.close();
  }
}

test('long prepared document reopens through a portable disk-search artifact', async (t) => {
  const fixture = acceptanceCase('generated-long-document');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-long-document-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = longMarkdown(fixture.expect.sections);
  const pack = await buildPackFromBrowserFiles({
    files: [browserFile('long-document.md', source)],
    id: 'acceptance.generated-long-document',
    title: 'Long document acceptance',
    version: manifest.corpusVersion,
  });
  const validation = validatePack(pack);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.equal(pack.documents.length, 1);
  assert.equal(pack.documents[0].sections.length, fixture.expect.sections);

  const packFile = path.join(directory, 'long.pack.json');
  const databaseFile = path.join(directory, 'long.search.sqlite');
  const updatedPackFile = path.join(directory, 'long.with-search.pack.json');
  await writeFile(packFile, `${JSON.stringify(pack, null, 2)}\n`);
  const reopened = JSON.parse(await readFile(packFile, 'utf8'));
  assert.equal(validatePack(reopened).valid, true);
  assert.equal(reopened.documents[0].sections.at(-1).text.includes(fixture.expect.endMarker), true);

  const records = flattenKnowledge([reopened], []);
  assert.equal(records.length, fixture.expect.sections);
  assert.equal(shouldUseDiskSearch(records), true);
  const built = await buildPrebuiltSearchArtifact({
    inputPath: packFile,
    databasePath: databaseFile,
    packOutputPath: updatedPackFile,
    artifactUrl: './long.search.sqlite',
    builtAt: '2026-08-04T13:30:00.000Z',
  });
  assert.equal(built.artifact.recordCount, fixture.expect.sections);
  assert.ok(built.bytes > 0);

  for (const marker of fixture.expect.searchMarkers) {
    const firstOpen = queryDatabase(databaseFile, marker);
    assert.ok(firstOpen.some((record) => record.body.includes(marker)), marker);
    const secondOpen = queryDatabase(databaseFile, marker);
    assert.ok(secondOpen.some((record) => record.body.includes(marker)), marker);
  }
  const withArtifact = JSON.parse(await readFile(updatedPackFile, 'utf8'));
  assert.equal(validatePack(withArtifact).valid, true);
  assert.equal(withArtifact.searchArtifacts[0].recordCount, fixture.expect.sections);
});
