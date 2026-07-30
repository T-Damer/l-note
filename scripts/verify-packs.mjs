import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalogPath = join(root, 'public', 'packs', 'catalog.json');
const write = process.argv.includes('--write');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const errors = [];

function validateEvidence(pack, entry) {
  const documents = new Map(pack.documents.map((document) => [document.id, document]));
  const chunks = new Map();
  for (const document of pack.documents) {
    for (const section of document.sections) {
      for (const chunk of section.chunks) {
        chunks.set(`${document.id}:${chunk.id}`, { section, chunk });
      }
    }
  }

  const entityIds = new Set(pack.entities.map((entity) => entity.id));
  const claimIds = new Set(pack.claims.map((claim) => claim.id));

  for (const claim of pack.claims) {
    if (!entityIds.has(claim.subjectEntityId)) {
      errors.push(`${entry.id}: claim ${claim.id} has unknown subject ${claim.subjectEntityId}`);
    }
    if (claim.objectEntityId && !entityIds.has(claim.objectEntityId)) {
      errors.push(`${entry.id}: claim ${claim.id} has unknown object ${claim.objectEntityId}`);
    }
    for (const evidence of claim.evidence) {
      if (!documents.has(evidence.documentId)) {
        errors.push(`${entry.id}: claim ${claim.id} references unknown document ${evidence.documentId}`);
        continue;
      }
      const resolved = chunks.get(`${evidence.documentId}:${evidence.chunkId}`);
      if (!resolved) {
        errors.push(`${entry.id}: claim ${claim.id} references unknown chunk ${evidence.chunkId}`);
        continue;
      }
      if (!resolved.chunk.text.includes(evidence.quote)) {
        errors.push(`${entry.id}: claim ${claim.id} quote is not an exact chunk substring`);
      }
    }
  }

  for (const relation of pack.relations) {
    if (!entityIds.has(relation.sourceEntityId) || !entityIds.has(relation.targetEntityId)) {
      errors.push(`${entry.id}: relation ${relation.id} references an unknown entity`);
    }
  }

  for (const link of pack.claimLinks) {
    if (!claimIds.has(link.fromClaimId) || !claimIds.has(link.toClaimId)) {
      errors.push(`${entry.id}: claim link references an unknown claim`);
    }
  }
}

for (const entry of catalog.packs) {
  const packPath = join(dirname(catalogPath), entry.url.replace(/^packs\//u, ''));
  const bytes = await readFile(packPath);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const pack = JSON.parse(bytes.toString('utf8'));

  if (pack.manifest.id !== entry.id) errors.push(`${entry.id}: manifest id mismatch`);
  if (pack.manifest.version !== entry.version) errors.push(`${entry.id}: manifest version mismatch`);
  validateEvidence(pack, entry);

  if (write) {
    entry.sha256 = digest;
    entry.sizeBytes = bytes.byteLength;
  } else {
    if (entry.sha256 !== digest) errors.push(`${entry.id}: checksum mismatch`);
    if (entry.sizeBytes !== bytes.byteLength) errors.push(`${entry.id}: size mismatch`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

if (write) {
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log('Catalog checksums updated.');
} else {
  console.log(`Verified ${catalog.packs.length} knowledge packs.`);
}
