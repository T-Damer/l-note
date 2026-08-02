import { Button } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

function relationRecords(knowledge, entityId) {
  return knowledge.relations.filter((relation) => (
    relation.sourceId === entityId || relation.targetId === entityId
  ));
}

function renderRelations({ entityId, knowledge, predicateLabel, strengthLabel, navigate }) {
  const relations = relationRecords(knowledge, entityId);
  if (!relations.length) return null;

  const list = element('div', { className: 'relation-list' });
  for (const relation of relations) {
    const otherId = relation.sourceId === entityId ? relation.targetId : relation.sourceId;
    const other = knowledge.entities.get(otherId);
    list.append(Button({
      variant: 'ghost',
      className: 'backlink-button',
      disabled: !other,
      children: [
        Text({
          variant: 'body',
          as: 'strong',
          text: `${predicateLabel(relation.predicate ?? relation.type)} → ${other?.name ?? otherId}`,
        }),
        Text({
          variant: 'caption',
          as: 'small',
          text: relation.description ?? 'Связь из пакета знаний',
        }),
        element('span', {
          className: 'relation-strength',
          text: strengthLabel(relation),
        }),
      ],
      onClick: other ? () => navigate('concept', other.id) : undefined,
    }));
  }

  return element('details', { className: 'relation-accordion' }, [
    element('summary', { text: `Связи · ${relations.length}` }),
    list,
  ]);
}

function renderMentions({ entityId, knowledge, navigate }) {
  const mentions = knowledge.entityMentions.get(entityId) ?? [];
  if (!mentions.length) return [];

  const list = element('div', { className: 'backlink-list' });
  for (const mention of mentions) {
    const documentRecord = knowledge.documents.get(mention.documentId);
    const section = knowledge.sections.get(`${mention.documentId}/${mention.sectionId}`);
    list.append(Button({
      variant: 'ghost',
      className: 'backlink-button',
      children: [
        Text({
          variant: 'body',
          as: 'strong',
          text: `${documentRecord?.title ?? mention.documentId} — ${section?.title ?? mention.sectionId}`,
        }),
        Text({
          variant: 'caption',
          as: 'small',
          text: section?.text?.slice(0, 150) ?? '',
        }),
      ],
      onClick: () => navigate('document', mention.documentId, { sectionId: mention.sectionId }),
    }));
  }
  return [Text({ variant: 'heading', as: 'h3', text: 'Где встречается' }), list];
}

function renderNotes({ entityId, notes, relationLabel, navigate }) {
  const related = notes.filter((note) => (note.relatedEntityIds ?? []).includes(entityId));
  if (!related.length) return [];

  const list = element('div', { className: 'backlink-list' });
  for (const note of related) {
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
  return [Text({ variant: 'heading', as: 'h3', text: 'Личные заметки' }), list];
}

export function renderConceptResource({
  entityId,
  knowledge,
  notes,
  dialogView,
  navigate,
  predicateLabel,
  strengthLabel,
  relationLabel,
} = {}) {
  const entity = knowledge.entities.get(entityId);
  if (!entity) return false;

  dialogView.replaceHeading([
    Text({ variant: 'eyebrow', text: entity.type ?? 'Понятие' }),
    Text({ variant: 'title', as: 'h2', text: entity.name }),
  ]);
  const body = [];
  if (entity.description) {
    body.push(Text({ variant: 'body', className: 'entity-description', text: entity.description }));
  }
  if (entity.aliases?.length) {
    body.push(element('div', { className: 'entity-aliases' }, (
      entity.aliases.map((alias) => element('span', { className: 'pill', text: alias }))
    )));
  }
  body.push(renderRelations({ entityId, knowledge, predicateLabel, strengthLabel, navigate }));
  body.push(...renderMentions({ entityId, knowledge, navigate }));
  body.push(...renderNotes({ entityId, notes, relationLabel, navigate }));
  dialogView.replaceBody(body.filter(Boolean));
  dialogView.show();
  return true;
}
