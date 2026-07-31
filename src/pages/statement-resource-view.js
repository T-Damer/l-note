import { Button } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

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

function renderSource(claim, knowledge, navigate) {
  if (!claim.source?.documentId) return [];
  const documentRecord = knowledge.documents.get(claim.source.documentId);
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
        text: claim.source.quote ?? `Раздел: ${claim.source.sectionId ?? 'не указан'}`,
      }),
    ],
    onClick: () => navigate('document', claim.source.documentId, {
      sectionId: claim.source.sectionId,
    }),
  });
  return [Text({ variant: 'heading', as: 'h3', text: 'Источник' }), button];
}

function renderNotes(claimId, knowledge, relationLabel, navigate) {
  const notes = knowledge.claimNotes.get(claimId) ?? [];
  if (!notes.length) return [];
  const list = element('div', { className: 'backlink-list' });
  for (const note of notes) {
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

export function renderStatementResource({
  claimId,
  knowledge,
  dialogView,
  navigate,
  predicateLabel,
  relationLabel,
} = {}) {
  const claim = knowledge.claims.get(claimId);
  if (!claim) return false;

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
    renderEntities(claim, knowledge, navigate),
    ...renderSource(claim, knowledge, navigate),
    ...renderNotes(claimId, knowledge, relationLabel, navigate),
    Button({
      variant: 'primary',
      className: 'statement-note-button',
      text: 'Добавить наблюдение',
      onClick: () => navigate('note', 'new', { claimId }),
    }),
  ];
  dialogView.replaceBody(body.filter(Boolean));
  dialogView.show();
  return true;
}
