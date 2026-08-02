import { Card } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

function formatDate(value, locale = 'ru-RU') {
  if (!value) return 'дата не указана';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'дата не указана' : date.toLocaleString(locale);
}

function noteExcerpt(body, limit = 420) {
  const text = String(body ?? '');
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function noteCard({ note, navigate, relationLabel, locale }) {
  const createdAt = formatDate(note.createdAt ?? note.updatedAt, locale);
  const updatedAt = note.updatedAt && note.createdAt && note.updatedAt !== note.createdAt
    ? ` · изменено ${formatDate(note.updatedAt, locale)}`
    : '';
  return Card({
    kind: 'note',
    className: 'note-card',
    interactive: true,
    ariaLabel: `Открыть заметку ${note.title}`,
    onActivate: () => navigate('note', note.id),
    children: [
      element('span', { className: 'pill accent', text: relationLabel(note.relation) }),
      Text({ variant: 'title', as: 'h2', text: note.title }),
      Text({ variant: 'muted', text: noteExcerpt(note.body) }),
      Text({
        variant: 'caption',
        as: 'footer',
        text: `создано ${createdAt}${updatedAt} · ${note.relatedEntityIds?.length ?? 0} связей`,
      }),
    ],
  });
}

export function renderNotesList({
  notes = [],
  container,
  navigate,
  relationLabel = (relation) => relation,
  locale = 'ru-RU',
} = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('container must be an HTML element.');
  if (typeof navigate !== 'function') throw new TypeError('navigate must be a function.');
  container.replaceChildren();

  if (!notes.length) {
    container.append(element('section', { className: 'empty-state' }, [
      Text({ variant: 'title', text: 'Заметок пока нет' }),
      Text({
        variant: 'muted',
        text: 'Добавьте наблюдение самостоятельно или свяжите его с утверждением из установленного пакета.',
      }),
    ]));
    return 0;
  }

  for (const note of notes) {
    container.append(noteCard({ note, navigate, relationLabel, locale }));
  }
  return notes.length;
}
