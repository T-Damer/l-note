import { resolveStatement } from '../helpers/statement-conflicts.js';
import { Button } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

function requireElement(value, label) {
  if (!(value instanceof HTMLElement)) throw new TypeError(`${label} must be an HTML element.`);
  return value;
}

function resolveEntities(knowledge, ids) {
  return [...new Set(ids ?? [])]
    .map((id) => knowledge.entities.get(id))
    .filter(Boolean);
}

function entityPill(entity, navigate) {
  return Button({
    variant: 'ghost',
    className: 'pill entity-pill-button',
    text: entity.name,
    onClick: () => navigate('concept', entity.id),
  });
}

function sourceDocument(knowledge, claim) {
  const pack = knowledge.packs.find((item) => item.id === claim.packId);
  return pack?.documents?.find((item) => item.id === claim.source?.documentId)
    ?? knowledge.documents.get(claim.source?.documentId);
}

export function createNoteResourceView({
  dialogView,
  elements = {},
  navigate,
  getKnowledge,
  getNotes,
  detectRelated,
} = {}) {
  if (!dialogView?.show || !dialogView?.replaceBody) throw new TypeError('A routed dialog controller is required.');
  if (typeof navigate !== 'function') throw new TypeError('navigate must be a function.');
  if (typeof getKnowledge !== 'function' || typeof getNotes !== 'function') {
    throw new TypeError('Knowledge and note accessors are required.');
  }
  if (typeof detectRelated !== 'function') throw new TypeError('detectRelated must be a function.');

  const title = requireElement(elements.title, 'title');
  const body = requireElement(elements.body, 'body');
  const relation = requireElement(elements.relation, 'relation');
  const id = requireElement(elements.id, 'id');
  const targetClaimId = requireElement(elements.targetClaimId, 'targetClaimId');
  const dialogTitle = requireElement(elements.dialogTitle, 'dialogTitle');
  const targetSummary = requireElement(elements.targetSummary, 'targetSummary');
  const relatedPreview = requireElement(elements.relatedPreview, 'relatedPreview');
  const deleteButton = requireElement(elements.deleteButton, 'deleteButton');
  let activeNote = null;

  function renderTarget(claimId) {
    targetSummary.replaceChildren();
    if (!claimId) return;
    const knowledge = getKnowledge();
    const claim = resolveStatement(knowledge.packs, claimId) ?? knowledge.claims.get(claimId);
    if (!claim) {
      targetSummary.append(Text({
        variant: 'muted',
        text: 'Связанное утверждение отсутствует в активных пакетах. Ссылка сохранится как неразрешённая.',
      }));
      return;
    }
    const documentRecord = sourceDocument(knowledge, claim);
    targetSummary.append(
      Text({ variant: 'label', text: 'Связанное утверждение' }),
      Button({
        variant: 'ghost',
        className: 'backlink-button',
        children: [
          Text({ variant: 'body', as: 'strong', text: claim.text }),
          Text({
            variant: 'caption',
            text: `${documentRecord?.title ?? claim.source?.documentId} — ${claim.source?.sectionId ?? 'раздел не указан'}`,
          }),
        ],
        onClick: () => navigate('statement', claim.runtimeId ?? claim.id),
      }),
    );
  }

  function renderPreview(note = activeNote) {
    const knowledge = getKnowledge();
    const detected = detectRelated(`${title.value} ${body.value}`);
    const savedIds = new Set(note?.relatedEntityIds ?? []);
    const savedEntities = resolveEntities(knowledge, savedIds);
    const proposedEntities = detected.filter((entity) => !savedIds.has(entity.id));
    relatedPreview.replaceChildren();

    if (savedEntities.length) {
      relatedPreview.append(
        Text({ variant: 'label', text: 'Связано со справочником' }),
        element('div', { className: 'entity-aliases' }, (
          savedEntities.map((entity) => entityPill(entity, navigate))
        )),
      );
    }
    if (proposedEntities.length) {
      relatedPreview.append(
        Text({
          variant: 'label',
          text: savedEntities.length ? 'Дополнительно будут связаны' : 'Будут связаны понятия',
        }),
        element('div', { className: 'entity-aliases' }, proposedEntities.map((entity) => (
          element('span', { className: 'pill', text: entity.name })
        ))),
      );
    }
    if (!savedEntities.length && !proposedEntities.length) {
      relatedPreview.append(Text({
        variant: 'muted',
        text: 'Связи появятся, когда в заметке встретятся названия или алиасы понятий из активных пакетов.',
      }));
    }
    return { savedEntities, proposedEntities };
  }

  function open(note = null, claimId = null) {
    activeNote = note;
    dialogTitle.textContent = note ? 'Редактировать заметку' : 'Новая заметка';
    id.value = note?.id ?? '';
    targetClaimId.value = note?.targetClaimId ?? claimId ?? '';
    title.value = note?.title ?? '';
    body.value = note?.body ?? '';
    relation.value = note?.relation ?? 'observation';
    deleteButton.classList.toggle('hidden', !note);
    renderTarget(targetClaimId.value);
    renderPreview(note);
    dialogView.show();
    return true;
  }

  function renderRoute(route) {
    if (route.resourceId === 'new') return open(null, route.claimId);
    const note = getNotes().find((item) => item.id === route.resourceId);
    return note ? open(note) : false;
  }

  function readDraft() {
    return Object.freeze({
      id: id.value,
      title: title.value,
      body: body.value,
      relation: relation.value,
      targetClaimId: targetClaimId.value,
    });
  }

  return Object.freeze({
    dialog: dialogView.dialog,
    open,
    readDraft,
    renderPreview,
    renderRoute,
  });
}
