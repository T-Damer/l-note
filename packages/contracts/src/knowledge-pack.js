import { z } from 'zod';

const IdSchema = z.string().min(1).regex(/^[a-z0-9][a-z0-9._:-]*$/u);
const NullableDateSchema = z.string().datetime({ offset: true }).nullable().default(null);
const MetadataSchema = z.record(z.string(), z.unknown()).default({});

export const EvidenceLocatorSchema = z.object({
  documentId: IdSchema,
  sectionId: IdSchema.nullable().default(null),
  chunkId: IdSchema,
  quote: z.string().min(1),
  anchor: z.string().min(1),
});

export const KnowledgeChunkSchema = z.object({
  id: IdSchema,
  orderIndex: z.number().int().nonnegative(),
  text: z.string().min(1),
  anchor: z.string().min(1),
  pageStart: z.number().int().positive().nullable().default(null),
  pageEnd: z.number().int().positive().nullable().default(null),
  entityIds: z.array(IdSchema).default([]),
  metadata: MetadataSchema,
});

export const KnowledgeSectionSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  anchor: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  parentSectionId: IdSchema.nullable().default(null),
  chunks: z.array(KnowledgeChunkSchema).min(1),
});

export const KnowledgeDocumentSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  sourceType: z.string().min(1),
  sourceUrl: z.string().url().nullable().default(null),
  version: z.object({
    id: IdSchema,
    label: z.string().min(1),
    publishedAt: NullableDateSchema,
    effectiveFrom: NullableDateSchema,
    effectiveTo: NullableDateSchema,
  }),
  metadata: MetadataSchema,
  sections: z.array(KnowledgeSectionSchema).min(1),
});

export const KnowledgeEntitySchema = z.object({
  id: IdSchema,
  type: z.string().min(1),
  canonicalName: z.string().min(1),
  description: z.string().min(1).nullable().default(null),
  aliases: z.array(z.string().min(1)).default([]),
  externalIds: z.record(z.string(), z.string().min(1)).default({}),
  metadata: MetadataSchema,
});

export const KnowledgeAliasSchema = z.object({
  id: IdSchema,
  canonicalTerm: z.string().min(1),
  alias: z.string().min(1),
  entityId: IdSchema.nullable().default(null),
  weight: z.number().positive().default(1),
});

export const KnowledgeClaimSchema = z.object({
  id: IdSchema,
  subjectEntityId: IdSchema,
  predicate: z.string().min(1),
  objectEntityId: IdSchema.nullable().default(null),
  value: z.unknown().nullable().default(null),
  qualifiers: MetadataSchema,
  sourceKind: z.enum(['reference', 'personal', 'computed', 'imported']),
  authority: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(1),
  validFrom: NullableDateSchema,
  validTo: NullableDateSchema,
  evidence: z.array(EvidenceLocatorSchema).min(1),
  metadata: MetadataSchema,
});

export const KnowledgeRelationSchema = z.object({
  id: IdSchema,
  sourceEntityId: IdSchema,
  predicate: z.string().min(1),
  targetEntityId: IdSchema,
  weight: z.number().min(0).max(1).default(1),
  evidence: z.array(EvidenceLocatorSchema).default([]),
  metadata: MetadataSchema,
});

export const KnowledgeClaimLinkSchema = z.object({
  fromClaimId: IdSchema,
  relation: z.enum(['supports', 'contradicts', 'refines', 'supersedes', 'duplicates']),
  toClaimId: IdSchema,
  reason: z.string().min(1).nullable().default(null),
});

export const KnowledgePackSchema = z
  .object({
    schemaVersion: z.literal(1),
    manifest: z.object({
      id: IdSchema,
      version: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      language: z.string().min(2),
      license: z.string().min(1).nullable().default(null),
      author: z.string().min(1).nullable().default(null),
      builtAt: z.string().datetime({ offset: true }),
      tags: z.array(z.string().min(1)).default([]),
      capabilities: z
        .array(z.enum(['search', 'documents', 'entities', 'claims', 'relations', 'embeddings']))
        .default(['search', 'documents']),
      metadata: MetadataSchema,
    }),
    documents: z.array(KnowledgeDocumentSchema).min(1),
    aliases: z.array(KnowledgeAliasSchema).default([]),
    entities: z.array(KnowledgeEntitySchema).default([]),
    claims: z.array(KnowledgeClaimSchema).default([]),
    relations: z.array(KnowledgeRelationSchema).default([]),
    claimLinks: z.array(KnowledgeClaimLinkSchema).default([]),
  })
  .superRefine((pack, context) => {
    const addDuplicateIssues = (items, label, path) => {
      const ids = new Set();
      items.forEach((item, index) => {
        if (ids.has(item.id)) {
          context.addIssue({
            code: 'custom',
            path: [path, index, 'id'],
            message: `Duplicate ${label} ID: ${item.id}`,
          });
        }
        ids.add(item.id);
      });
      return ids;
    };

    const entityIds = addDuplicateIssues(pack.entities, 'entity', 'entities');
    const claimIds = addDuplicateIssues(pack.claims, 'claim', 'claims');
    addDuplicateIssues(pack.relations, 'relation', 'relations');
    addDuplicateIssues(pack.aliases, 'alias', 'aliases');

    const documents = new Map();
    const chunks = new Map();
    const sectionIds = new Set();

    pack.documents.forEach((document, documentIndex) => {
      if (documents.has(document.id)) {
        context.addIssue({
          code: 'custom',
          path: ['documents', documentIndex, 'id'],
          message: `Duplicate document ID: ${document.id}`,
        });
      }
      documents.set(document.id, document);

      document.sections.forEach((section, sectionIndex) => {
        const sectionKey = `${document.id}:${section.id}`;
        if (sectionIds.has(sectionKey)) {
          context.addIssue({
            code: 'custom',
            path: ['documents', documentIndex, 'sections', sectionIndex, 'id'],
            message: `Duplicate section ID inside document: ${section.id}`,
          });
        }
        sectionIds.add(sectionKey);

        section.chunks.forEach((chunk, chunkIndex) => {
          const key = `${document.id}:${chunk.id}`;
          if (chunks.has(key)) {
            context.addIssue({
              code: 'custom',
              path: ['documents', documentIndex, 'sections', sectionIndex, 'chunks', chunkIndex, 'id'],
              message: `Duplicate chunk ID inside document: ${chunk.id}`,
            });
          }
          chunks.set(key, { document, section, chunk });

          chunk.entityIds.forEach((entityId) => {
            if (!entityIds.has(entityId)) {
              context.addIssue({
                code: 'custom',
                path: [
                  'documents',
                  documentIndex,
                  'sections',
                  sectionIndex,
                  'chunks',
                  chunkIndex,
                  'entityIds',
                ],
                message: `Chunk references unknown entity: ${entityId}`,
              });
            }
          });
        });
      });
    });

    const validateEvidence = (evidence, path) => {
      const resolved = chunks.get(`${evidence.documentId}:${evidence.chunkId}`);
      if (!resolved) {
        context.addIssue({
          code: 'custom',
          path,
          message: `Evidence references unknown chunk: ${evidence.documentId}/${evidence.chunkId}`,
        });
        return;
      }
      if (evidence.sectionId && evidence.sectionId !== resolved.section.id) {
        context.addIssue({
          code: 'custom',
          path,
          message: `Evidence section does not own chunk ${evidence.chunkId}`,
        });
      }
      if (!resolved.chunk.text.includes(evidence.quote)) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'quote'],
          message: 'Evidence quote must be an exact substring of the referenced chunk.',
        });
      }
    };

    pack.aliases.forEach((alias, index) => {
      if (alias.entityId && !entityIds.has(alias.entityId)) {
        context.addIssue({
          code: 'custom',
          path: ['aliases', index, 'entityId'],
          message: `Alias references unknown entity: ${alias.entityId}`,
        });
      }
    });

    pack.claims.forEach((claim, claimIndex) => {
      if (!entityIds.has(claim.subjectEntityId)) {
        context.addIssue({
          code: 'custom',
          path: ['claims', claimIndex, 'subjectEntityId'],
          message: `Claim references unknown subject entity: ${claim.subjectEntityId}`,
        });
      }
      if (claim.objectEntityId && !entityIds.has(claim.objectEntityId)) {
        context.addIssue({
          code: 'custom',
          path: ['claims', claimIndex, 'objectEntityId'],
          message: `Claim references unknown object entity: ${claim.objectEntityId}`,
        });
      }
      claim.evidence.forEach((evidence, evidenceIndex) =>
        validateEvidence(evidence, ['claims', claimIndex, 'evidence', evidenceIndex]),
      );
    });

    pack.relations.forEach((relation, relationIndex) => {
      if (!entityIds.has(relation.sourceEntityId) || !entityIds.has(relation.targetEntityId)) {
        context.addIssue({
          code: 'custom',
          path: ['relations', relationIndex],
          message: `Relation ${relation.id} references an unknown entity.`,
        });
      }
      relation.evidence.forEach((evidence, evidenceIndex) =>
        validateEvidence(evidence, ['relations', relationIndex, 'evidence', evidenceIndex]),
      );
    });

    pack.claimLinks.forEach((link, linkIndex) => {
      if (!claimIds.has(link.fromClaimId) || !claimIds.has(link.toClaimId)) {
        context.addIssue({
          code: 'custom',
          path: ['claimLinks', linkIndex],
          message: 'Claim link references an unknown claim.',
        });
      }
    });
  });

export const KnowledgePackCatalogSchema = z.object({
  catalogVersion: z.string().min(1),
  publishedAt: z.string().datetime({ offset: true }),
  packs: z.array(
    z.object({
      id: IdSchema,
      version: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      language: z.string().min(2),
      license: z.string().min(1).nullable().default(null),
      tags: z.array(z.string().min(1)).default([]),
      featured: z.boolean().default(false),
      url: z.string().min(1),
      sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
      sizeBytes: z.number().int().nonnegative(),
    }),
  ),
});

export const KnowledgeReferenceSchema = z.object({
  packId: IdSchema,
  itemId: IdSchema,
});

export const LocalNoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  entityLinks: z.array(KnowledgeReferenceSchema).default([]),
  personalClaim: z
    .object({
      subject: KnowledgeReferenceSchema,
      predicate: z.string().min(1),
      value: z.unknown().nullable().default(null),
      relationTo: z
        .object({
          claim: KnowledgeReferenceSchema,
          relation: z.enum(['supports', 'contradicts', 'refines', 'supersedes']),
        })
        .nullable()
        .default(null),
    })
    .nullable()
    .default(null),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export function parseKnowledgePack(input) {
  return KnowledgePackSchema.parse(input);
}

export function parseKnowledgePackCatalog(input) {
  return KnowledgePackCatalogSchema.parse(input);
}

export function parseLocalNote(input) {
  return LocalNoteSchema.parse(input);
}

export function makeKnowledgeReference(packId, itemId) {
  return KnowledgeReferenceSchema.parse({ packId, itemId });
}

export function referenceKey(reference) {
  return `${reference.packId}:${reference.itemId}`;
}
