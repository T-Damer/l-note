import { getEntityContext } from './db.js';
import { searchKnowledge } from './search.js';
import { state } from './state.js';
import { $, clear, node, setBusy, toast } from './ui.js';

let onStartNote = () => {};

export function configureSearchUI(options = {}) {
  onStartNote = options.onStartNote ?? onStartNote;
}

export function renderPackFilter() {
  const select = clear($('#search-pack-filter'));
  select.append(node('option', { value: '' }, 'Все установленные знания'));
  for (const pack of state.installed) {
    select.append(node('option', { value: pack.id }, pack.title));
  }
  const hasKnowledge = state.installed.length > 0;
  $('#search-input').disabled = !hasKnowledge;
  $('#search-submit').disabled = !hasKnowledge;
  $('#search-empty-state').toggleAttribute(
    'hidden',
    hasKnowledge || state.searchResults.length > 0,
  );
}

export async function runSearch() {
  const query = $('#search-input').value.trim();
  state.currentQuery = query;
  if (!query) {
    state.searchResults = [];
    renderSearchResults();
    return;
  }
  const selectedPack = $('#search-pack-filter').value;
  const button = $('#search-submit');
  setBusy(button, true, 'Поиск…');
  try {
    const output = await searchKnowledge(query, {
      packIds: selectedPack ? [selectedPack] : [],
      includeNotes: $('#include-notes').checked,
      limit: 50,
    });
    state.searchResults = output.results;
    state.searchExpansion = output.expansion;
    renderSearchResults(output.suggestions);
  } catch (error) {
    console.error(error);
    toast(`Ошибка поиска: ${error.message}`, 'error');
  } finally {
    setBusy(button, false);
  }
}

export function renderSearchResults(suggestions = []) {
  const expansion = clear($('#query-expansion'));
  if (state.searchExpansion?.matches?.length) {
    expansion.append(node('span', { class: 'eyebrow' }, 'Распознано:'));
    for (const match of state.searchExpansion.matches) {
      expansion.append(
        node(
          'button',
          { class: 'chip', type: 'button', title: match.expansion },
          `${match.term} → ${match.expansion}`,
        ),
      );
    }
  }
  for (const suggestion of suggestions) {
    expansion.append(
      node(
        'button',
        {
          class: 'chip chip--muted',
          type: 'button',
          onclick: () => {
            $('#search-input').value = suggestion;
            runSearch();
          },
        },
        suggestion,
      ),
    );
  }

  const list = clear($('#search-results'));
  $('#result-count').textContent = state.currentQuery
    ? `${state.searchResults.length} результатов`
    : '';
  $('#search-empty-state').toggleAttribute(
    'hidden',
    state.installed.length > 0 || state.searchResults.length > 0,
  );

  if (state.currentQuery && !state.searchResults.length) {
    list.append(
      node(
        'div',
        { class: 'empty-card' },
        node('h3', {}, 'Совпадений не найдено'),
        node(
          'p',
          {},
          'Попробуйте более короткую формулировку, термин или установите другой пакет знаний.',
        ),
      ),
    );
    return;
  }

  for (const result of state.searchResults) {
    list.append(
      node(
        'button',
        {
          class: `result-card ${result.kind === 'note' ? 'result-card--note' : ''}`,
          type: 'button',
          onclick: () => openResult(result),
        },
        node(
          'div',
          { class: 'result-card__meta' },
          node(
            'span',
            { class: 'eyebrow' },
            result.kind === 'note' ? 'личная заметка' : result.packTitle,
          ),
          node('span', {}, `score ${result.score.toFixed(2)}`),
        ),
        node('h3', {}, result.documentTitle),
        node('p', { class: 'result-card__section' }, result.sectionTitle),
        node('p', { class: 'result-card__text' }, result.text),
        result.entityNames
          ? node(
              'div',
              { class: 'tag-row' },
              ...result.entityNames
                .split(' ')
                .slice(0, 5)
                .map((name) => node('span', { class: 'tag' }, name)),
            )
          : null,
      ),
    );
  }
}

export async function openResult(result) {
  state.selectedResult = result;
  const panel = $('#result-detail');
  clear(panel);
  panel.removeAttribute('hidden');
  panel.append(
    node(
      'div',
      { class: 'detail-panel__header' },
      node(
        'div',
        {},
        node('span', { class: 'eyebrow' }, result.packTitle),
        node('h2', {}, result.documentTitle),
      ),
      node(
        'button',
        {
          class: 'icon-button',
          type: 'button',
          'aria-label': 'Закрыть',
          onclick: () => panel.setAttribute('hidden', ''),
        },
        '×',
      ),
    ),
    node('h3', {}, result.sectionTitle),
    node('p', { class: 'source-text' }, result.text),
  );

  if (result.kind === 'note') return;

  const entityMap = new Map(state.entities.map((entity) => [entity.id, entity]));
  const entityRow = node('div', { class: 'entity-row' });
  for (const entityId of result.entityIds ?? []) {
    const entity = entityMap.get(entityId);
    if (!entity) continue;
    entityRow.append(
      node(
        'button',
        { class: 'chip', type: 'button', onclick: () => openEntity(entity.id) },
        entity.name,
      ),
    );
  }
  if (entityRow.childElementCount) {
    panel.append(node('h3', {}, 'Связанные понятия'), entityRow);
  }

  const actions = node(
    'div',
    { class: 'detail-actions' },
    node(
      'button',
      { class: 'button button--secondary', type: 'button', onclick: () => onStartNote(result) },
      'Добавить наблюдение',
    ),
  );
  if (result.source?.url) {
    actions.append(
      node(
        'a',
        {
          class: 'button button--ghost',
          href: result.source.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        'Открыть первоисточник',
      ),
    );
  }
  panel.append(actions);
}

export async function openEntity(entityId) {
  const context = await getEntityContext(entityId);
  const dialog = $('#entity-dialog');
  const body = clear($('#entity-dialog-body'));
  if (!context.entity) return;
  const entityNames = new Map(state.entities.map((entity) => [entity.id, entity.name]));
  body.append(
    node('span', { class: 'eyebrow' }, context.entity.type ?? 'entity'),
    node('h2', {}, context.entity.name),
    context.entity.description ? node('p', {}, context.entity.description) : null,
    node(
      'div',
      { class: 'tag-row' },
      ...(context.entity.aliases ?? []).map((alias) => node('span', { class: 'tag' }, alias)),
    ),
  );

  if (context.relations.length) {
    body.append(node('h3', {}, 'Связи'));
    const list = node('ul', { class: 'plain-list' });
    for (const relation of context.relations) {
      const outgoing = relation.from === entityId;
      const otherId = outgoing ? relation.to : relation.from;
      list.append(
        node(
          'li',
          {},
          node('strong', {}, outgoing ? relation.predicate : `← ${relation.predicate}`),
          ' ',
          node(
            'button',
            { class: 'text-button', type: 'button', onclick: () => openEntity(otherId) },
            entityNames.get(otherId) ?? otherId,
          ),
        ),
      );
    }
    body.append(list);
  }

  if (context.chunks.length) {
    body.append(node('h3', {}, `Упоминания (${context.chunks.length})`));
    const list = node('div', { class: 'backlink-list' });
    for (const chunk of context.chunks.slice(0, 12)) {
      list.append(
        node(
          'button',
          { class: 'backlink', type: 'button', onclick: () => openResult(chunk) },
          node('strong', {}, chunk.documentTitle),
          node('span', {}, chunk.sectionTitle),
        ),
      );
    }
    body.append(list);
  }

  if (context.notes.length) {
    body.append(node('h3', {}, 'Личные заметки'));
    for (const note of context.notes) {
      body.append(node('p', { class: 'note-preview' }, `${note.title}: ${note.body}`));
    }
  }
  dialog.showModal();
}
