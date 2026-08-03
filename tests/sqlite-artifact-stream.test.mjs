import assert from 'node:assert/strict';
import test from 'node:test';

import { sqliteImportStream } from '../src/workers/sqlite-artifact-runtime.js';

function sqliteFixture({ pageSize = 4096, pageCount = 2 } = {}) {
  const bytes = new Uint8Array(pageSize * pageCount);
  bytes.set(new TextEncoder().encode('SQLite format 3\0'));
  const view = new DataView(bytes.buffer);
  view.setUint16(16, pageSize === 65_536 ? 1 : pageSize);
  view.setUint32(28, pageCount);
  for (let index = 32; index < bytes.length; index += 1) bytes[index] = index % 251;
  return bytes;
}

async function chunks(stream) {
  const output = [];
  for await (const chunk of stream) output.push(chunk);
  return output;
}

test('duplicates the verified header before complete SQLite pages', async () => {
  const bytes = sqliteFixture();
  const output = await chunks(sqliteImportStream(bytes.buffer));
  assert.equal(output.length, 3);
  assert.equal(output[0].byteLength, 32);
  assert.equal(output[1].byteLength, 4096);
  assert.equal(output[2].byteLength, 4096);
  assert.deepEqual(output[0], bytes.slice(0, 32));
  assert.deepEqual(output[1], bytes.slice(0, 4096));
  assert.deepEqual(output[2], bytes.slice(4096));
});

test('rejects non-SQLite and incomplete page layouts before import', () => {
  assert.throws(() => sqliteImportStream(new Uint8Array(31).buffer), /truncated/u);
  assert.throws(() => sqliteImportStream(new Uint8Array(4096).buffer), /not SQLite/u);
  const invalid = sqliteFixture();
  new DataView(invalid.buffer).setUint32(28, 3);
  assert.throws(() => sqliteImportStream(invalid.buffer), /page layout/u);
});
