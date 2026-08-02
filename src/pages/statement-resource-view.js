import {
  buildStatementConflictIndex,
  qualifyDocumentId,
  resolveStatement,
} from '../helpers/statement-conflicts.js';
import { Button } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';
import { createStatementConflictDisclosure } from './statement-conflict-view.js';

function linkedEntities(claim, knowledge) {
  return [claim.subjectId, claim.objectId]
    .filter(Boolean)
    .map((id) => knowledge.entities.get(id))
    .filter(Boolean);
}

function renderEntities(claim, knowledge, navigate) {
  const entities = linkedEntities(claim, knowledge);
  if (!entities.length) return null;
  return element('div', { className: 'entity-aliases' }, entities.map((entity) => (
    Button({
      variant: 'ghost',
      className: 'pill entity-pill-button',
      text: entity.name,
      onClick: () => navigate('concept', entity.id),
    })
  )));
}

function sourceDocument(claim, packs) {
  const pack = (packs ?? []).find((item) => item.id === claim.packId);
  const documentRecord = pack?.documents?.find((item) => item.id === claim.source?.documentId);
  return documentRecord ? { ...documentRecord, packId: pack.id, packTitle: pack.title } : null;
}

function renderSource(claim, knowledge, navigate) {
  if (!claim.source?.documentId) return [];
  const documentRecord = sourceDocument(claim, knowledge.packs)
    ?? knowledge.documents.get(claim.source.documentId);
  const date = documentRecord?.effectiveFrom ?? documentRecord?.source?.publishedAt;
  const button = Button({
    variant: 'ghost',
    className: 'backlink-button',
    children: [
      Text({
        variant: 'body',
        as: 'strong',
        text: documentRecord?.title ?? claim.source.documentId,
      }),
      Text({
        variant: 'caption',
        as: 'small',
        text: [date, claim.source.quote ?? `Раздел: ${claim.source.sectionId ?? 'не указан'}`]
          .filter(Boolean)
          .join(' · '),
      }),
    ],
    onClick: () => navigate(
      'document',
      qualifyDocumentId(claim.packId, claim.source.documentId),
      { sectionId: claim.source.sectionId },
    ),
  });
  return [Text({ variant: 'heading', as: 'h3', text: 'Источник' }), button];
}

function renderNotes(claim, knowledge, relationLabel, navigate) {
  const ids = new Set([claim.runtimeId, claim.localId, claim.id].filter(Boolean));
  const notes = [...ids].flatMap((id) => knowledge.claimNotes.get(id) ?? []);
  const unique = [...new Map(notes.map((note) => [note.id, note])).values()];
  if (!unique.length) return [];
  const list = element('div', { className: 'backlink-list' });
  for (const note of unique) {
    list.append(Button({
      variant: 'ghost',
      className: 'backlink-button',
      children: [
        Text({ variant: 'body', as: 'strong', text: note.title }),
        Text({ variant: 'caption', as: 'small', text: relationLabel(note.relation) }),
      ],
      onClick: () => navigate('note', note.id),
    }));
  }
  return [Text({ variant: 'heading', as: 'h3', text: 'Личный слой' }), list];
}

function renderConflicts(claim, knowledge, navigate) {
  const index = buildStatementConflictIndex(knowledge.packs);
  const conflicts = index.byClaim.get(claim.runtimeId) ?? [];
  if (!conflicts.length) return null;
  return createStatementConflictDisclosure({
    id: `statement-conflicts-${claim.runtimeId.replaceAll(/[^a-z0-9_-]/giu, '-')}`,
    conflicts,
    currentClaimRefs: [claim.runtimeId],
    navigate,
    expanded: true,
  }).panel;
}

export function renderStatementResource({
  claimId,
  knowledge,
  dialogView,
  navigate,
  predicateLabel,
  relationLabel,
} = {}) {
  const claim = resolveStatement(knowledge.packs, claimId) ?? knowledge.claims.get(claimId);
  if (!claim) return false;
  const runtimeId = claim.runtimeId ?? claim.id;

  dialogView.replaceHeading([
    Text({ variant: 'eyebrow', text: 'Утверждение' }),
    Text({
      variant: 'title',
      as: 'h2',
      text: claim.predicate ? predicateLabel(claim.predicate) : 'Утверждение источника',
    }),
  ]);
  const body = [
    Text({ variant: 'body', className: 'statement-text', text: claim.text }),
    renderConflicts(claim, knowledge, navigate),
    renderEntities(claim, knowledge, navigate),
    ...renderSource(claim, knowledge, navigate),
    ...renderNotes(claim, knowledge, relationLabel, navigate),
    Button({
      variant: 'primary',
      className: 'statement-note-button',
      text: 'Добавить наблюдение',
      onClick: () => navigate('note', 'new', { claimId: runtimeId }),
    }),
  ];
  dialogView.replaceBody(body.filter(Boolean));
  dialogView.show();
  return true;
}
