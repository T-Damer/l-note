import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildPack } from '../tools/build-pack.mjs';
import { validatePack } from '../src/packs.js';

const catalog = JSON.parse(await readFile(new URL('../packs/catalog.json', import.meta.url), 'utf8'));

for (const entry of catalog.packs) {
  test(`valid pack: ${entry.id}`, async () => {
    const path = new URL(`../${entry.url.replace(/^\.\//u, '')}`, import.meta.url);
    const pack = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(validatePack(pack), { valid: true, errors: [] });
  });
}

test('rejects an invented evidence quote', async () => {
  const pack = await buildPack(new URL('../examples/custom-pack', import.meta.url));
  pack.claims[0].source.quote = 'This sentence is not present.';
  const validation = validatePack(pack);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /exact substring/u);
});

test('builds the custom example deterministically', async () => {
  const pack = await buildPack(new URL('../examples/custom-pack', import.meta.url));
  assert.equal(pack.id, 'example.offline-basics.ru');
  assert.equal(pack.documents.length, 1);
  assert.equal(validatePack(pack).valid, true);
});
