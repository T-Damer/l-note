import { Button, Card } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

export function sectionAnnotationNotes(knowledge, documentRecord, sectionId) {
  const references = [documentRecord.runtimeId, documentRecord.localId, documentRecord.id].filter(Boolean);
  const notes = [];
  const seen = new Set();
  for (const reference of references) {
    for (const note of knowledge.sectionNotes?.get(`${reference}/${sectionId}`) ?? []) {
      if (seen.has(note.id)) continue;
      seen.add(note.id);
      notes.push(note);
    }
  }
  return notes;
}

export function createSectionAnnotationButton({ documentRecord, section, navigate } = {}) {
  return Button({
    variant: 'secondary',
    className: 'document-section-annotation',
    icon: 'note',
    text: 'Добавить разметку',
    onClick: () => navigate('note', 'new', {
      documentId: documentRecord.runtimeId ?? documentRecord.id,
      sectionId: section.id,
    }),
  });
}

function annotationCard(note, navigate) {
  return Card({
    kind: 'note',
    className: 'document-annotation-card',
    interactive: true,
    ariaLabel: `Открыть разметку ${note.title}`,
    onActivate: () => navigate('note', note.id),
    children: [
      element('span', { className: 'pill accent', text: note.relationLabel ?? 'Личная разметка' }),
      Text({ variant: 'label', as: 'strong', text: note.title }),
      Text({ variant: 'muted', text: note.body }),
    ],
  });
}

export function renderSectionAnnotations({ notes = [], navigate } = {}) {
  if (!notes.length) return null;
  return element('section', { className: 'document-annotations' }, [
    Text({ variant: 'label', text: 'Личная разметка' }),
    element('div', { className: 'document-annotation-list' }, (
      notes.map((note) => annotationCard(note, navigate))
    )),
  ]);
}
