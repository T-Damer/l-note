import { deleteNote, listNotes, saveNote } from './db.js';
import { autoLinkEntities, rebuildSearchIndex } from './search.js';
import { state } from './state.js';
import { $, clear, formatDate, node, routeTo, toast } from './ui.js';

export function startNoteFromResult(result) {
  routeTo('notes');
  setTimeout(() => {
    state.editingNoteId = null;
    $('#note-title').value = `Наблюдение: ${result.documentTitle}`;
    $('#note-body').value = '';
    $('#note-relation').value = 'refines';
    $('#note-linked-chunk').value = result.pk;
    $('#note-linked-label').textContent = `${result.documentTitle} — ${result.sectionTitle}`;
    $('#note-title').focus();
  }, 0);
}

export async function renderNotes() {
  const notes = await listNotes();
  const list = clear($('#notes-list'));
  $('#notes-count').textContent = `${notes.length} заметок`;
  if (!notes.length) {
    list.append(
      node(
        'div',
        { class: 'empty-card' },
        node('h3', {}, 'Заметок пока нет'),
        node(
          'p',
          {},
          'Личная заметка хранится отдельно от справочника и может уточнять или оспаривать его утверждение.',
        ),
      ),
    );
    return;
  }
  for (const note of notes) {
    list.append(
      node(
        'article',
        { class: 'note-card' },
        node(
          'div',
          { class: 'note-card__top' },
          node('span', { class: 'eyebrow' }, note.relationType),
          node('time', {}, formatDate(note.updatedAt)),
        ),
        node('h3', {}, note.title || 'Без названия'),
        node('p', {}, note.body),
        node(
          'div',
          { class: 'tag-row' },
          ...(note.entityIds ?? [])
            .slice(0, 5)
            .map((id) =>
              node(
                'span',
                { class: 'tag' },
                state.entities.find((entity) => entity.id === id)?.name ?? id,
              ),
            ),
        ),
        node(
          'div',
          { class: 'note-card__actions' },
          node(
            'button',
            { class: 'text-button', type: 'button', onclick: () => editNote(note) },
            'Изменить',
          ),
          node(
            'button',
            {
              class: 'text-button text-button--danger',
              type: 'button',
              onclick: () => removeNote(note.id),
            },
            'Удалить',
          ),
        ),
      ),
    );
  }
}

function editNote(note) {
  state.editingNoteId = note.id;
  $('#note-title').value = note.title;
  $('#note-body').value = note.body;
  $('#note-relation').value = note.relationType;
  $('#note-linked-chunk').value = note.linkedChunkPk ?? '';
  $('#note-linked-label').textContent = note.linkedChunkPk
    ? 'Связанный фрагмент сохранён'
    : 'Без привязки к фрагменту';
  $('#note-title').focus();
}

async function removeNote(id) {
  if (!confirm('Удалить эту заметку?')) return;
  await deleteNote(id);
  await rebuildSearchIndex();
  await renderNotes();
  toast('Заметка удалена.', 'success');
}

export async function submitNote(event) {
  event.preventDefault();
  const title = $('#note-title').value.trim();
  const body = $('#note-body').value.trim();
  if (!title && !body) {
    toast('Введите заголовок или текст заметки.', 'warning');
    return;
  }
  const entityIds = await autoLinkEntities(`${title}\n${body}`);
  await saveNote({
    id: state.editingNoteId,
    title,
    body,
    relationType: $('#note-relation').value,
    linkedChunkPk: $('#note-linked-chunk').value,
    entityIds,
  });
  resetNoteForm(event.currentTarget);
  await rebuildSearchIndex();
  await renderNotes();
  toast('Заметка сохранена и добавлена в локальный поиск.', 'success');
}

export function resetNoteForm(form = $('#note-form')) {
  state.editingNoteId = null;
  form.reset();
  $('#note-linked-chunk').value = '';
  $('#note-linked-label').textContent = 'Без привязки к фрагменту';
}
