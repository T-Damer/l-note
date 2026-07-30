import { readFile } from 'node:fs/promises';

const path = process.argv[2] ?? 'packs/minimed-demo.json';
const pack = JSON.parse(await readFile(path, 'utf8'));
const errors = [];
if (pack.schemaVersion !== 1) errors.push('schemaVersion must be 1');
for (const key of ['id', 'version', 'title']) if (!pack[key]) errors.push(`missing ${key}`);
if (!Array.isArray(pack.documents) || pack.documents.length === 0) errors.push('documents must be non-empty');
const ids = new Set();
for (const [index, document] of (pack.documents ?? []).entries()) {
  if (!document.id || ids.has(document.id)) errors.push(`invalid or duplicate document id at ${index}`);
  ids.add(document.id);
  if (!document.title || !document.text || !document.source?.label) errors.push(`document ${document.id ?? index} lacks title, text or source`);
}
for (const relation of pack.relations ?? []) {
  if (!relation.sourceId || !relation.predicate || !relation.evidenceDocumentId) errors.push('invalid relation');
  if (!ids.has(relation.evidenceDocumentId)) errors.push(`relation cites unknown document ${relation.evidenceDocumentId}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${pack.id}@${pack.version}: ${pack.documents.length} documents, ${(pack.entities ?? []).length} entities, ${(pack.relations ?? []).length} relations`);
