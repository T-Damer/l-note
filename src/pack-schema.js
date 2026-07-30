import { z } from 'zod';

const NullableUrlSchema = z.string().url().nullable().default(null);
const IdentifierSchema = z.string().min(1).max(240).regex(/^[a-zA-Z0-9._:@/-]+$/u);

export const SourceReferenceSchema = z.object({
  label: z.string().min(1),
  url: NullableUrlSchema,
  locator: z.string().min(1).nullable().default(null),
  authority: z.enum(['official', 'reference', 'community', 'personal', 'other']).default('other'),
  retrievedAt: z.string().min(1).nullable().default(null)
});

export const ClaimSchema = z.object({
  id: IdentifierSchema,
  statement: z.string().min(1),
  status: z.enum(['asserted', 'proposed', 'observed']).default('asserted'),
  authority: z.enum(['official', 'reference', 'personal', 'other']).default('reference'),
  confidence: z.number().min(0).max(1).default(1),
  validFrom: z.string().min(1).nullable().default(null),
  validTo: z.string().min(1).nullable().default(null)
});

export const KnowledgeRecordSchema = z.object({
  id: IdentifierSchema,
  documentId: IdentifierSchema,
  kind: z.enum(['reference', 'claim', 'note', 'entity']).default('reference'),
  title: z.string().min(1),
  section: z.string().min(1).nullable().default(null),
  body: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  entityIds: z.array(IdentifierSchema).default([]),
  claims: z.array(ClaimSchema).default([]),
  source: SourceReferenceSchema.nullable().default(null),
  updatedAt: z.string().min(1).nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const KnowledgeEntitySchema = z.object({
  id: IdentifierSchema,
  type: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  description: z.string().min(1).nullable().default(null),
  tags: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const KnowledgeRelationSchema = z.object({
  id: IdentifierSchema,
  from: IdentifierSchema,
  predicate: z.string().min(1),
  to: IdentifierSchema,
  recordId: IdentifierSchema.nullable().default(null),
  description: z.string().min(1).nullable().default(null),
  weight: z.number().min(0).max(1).default(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const KnowledgePackSchema = z
  .object({
    format: z.literal('l-note-pack'),
    schemaVersion: z.literal(1),
    id: IdentifierSchema,
    version: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    language: z.string().min(2).default('ru'),
    createdAt: z.string().min(1),
    source: z.object({
      name: z.string().min(1),
      url: NullableUrlSchema,
      license: z.string().min(1).nullable().default(null),
      contentMode: z.string().min(1).nullable().default(null)
    }),
    disclaimer: z.string().min(1).nullable().default(null),
    tags: z.array(z.string().min(1)).default([]),
    records: z.array(KnowledgeRecordSchema).min(1),
    entities: z.array(KnowledgeEntitySchema).default([]),
    relations: z.array(KnowledgeRelationSchema).default([]),
    metadata: z.record(z.string(), z.unknown()).default({})
  })
  .superRefine((pack, context) => {
    const recordIds = new Set();
    for (const [index, record] of pack.records.entries()) {
      if (recordIds.has(record.id)) {
        context.addIssue({
          code: 'custom',
          path: ['records', index, 'id'],
          message: `Duplicate record id: ${record.id}`
        });
      }
      recordIds.add(record.id);
    }

    const entityIds = new Set();
    for (const [index, entity] of pack.entities.entries()) {
      if (entityIds.has(entity.id)) {
        context.addIssue({
          code: 'custom',
          path: ['entities', index, 'id'],
          message: `Duplicate entity id: ${entity.id}`
        });
      }
      entityIds.add(entity.id);
    }

    for (const [index, relation] of pack.relations.entries()) {
      if (!entityIds.has(relation.from)) {
        context.addIssue({
          code: 'custom',
          path: ['relations', index, 'from'],
          message: `Unknown relation source entity: ${relation.from}`
        });
      }
      if (!entityIds.has(relation.to)) {
        context.addIssue({
          code: 'custom',
          path: ['relations', index, 'to'],
          message: `Unknown relation target entity: ${relation.to}`
        });
      }
      if (relation.recordId && !recordIds.has(relation.recordId)) {
        context.addIssue({
          code: 'custom',
          path: ['relations', index, 'recordId'],
          message: `Unknown evidence record: ${relation.recordId}`
        });
      }
    }
  });

export const CatalogEntrySchema = z.object({
  id: IdentifierSchema,
  version: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  language: z.string().min(2),
  tags: z.array(z.string().min(1)).default([]),
  featured: z.boolean().default(false),
  artifact: z.object({
    url: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable().default(null),
    sizeBytes: z.number().int().nonnegative().nullable().default(null)
  }),
  source: z.object({
    name: z.string().min(1),
    url: NullableUrlSchema
  }),
  disclaimer: z.string().min(1).nullable().default(null)
});

export const KnowledgeCatalogSchema = z.object({
  format: z.literal('l-note-catalog'),
  schemaVersion: z.literal(1),
  updatedAt: z.string().min(1),
  packs: z.array(CatalogEntrySchema)
});

export const UserNoteSchema = z.object({
  id: IdentifierSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  entityIds: z.array(IdentifierSchema).default([]),
  relationType: z.enum(['related', 'supports', 'refines', 'contradicts', 'supersedes']).default('related'),
  linkedRecordKey: z.string().min(1).nullable().default(null),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export function parseKnowledgePack(value) {
  return KnowledgePackSchema.parse(value);
}

export function parseKnowledgeCatalog(value) {
  return KnowledgeCatalogSchema.parse(value);
}
