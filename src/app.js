import { registerSW } from 'virtual:pwa-register';

import {
  buildExtractiveAnswer,
  DEFAULT_MODEL_ID,
  LOCAL_MODEL_OPTIONS,
  LocalAiSession
} from './ai.js';
import { UserNoteSchema } from './pack-schema.js';
import {
  collectEvidence,
  createKnowledgeIndex,
  RELATION_LABELS,
  searchKnowledge
} from './search-engine.js';
import {
  clearAllLocalData,
  deleteNote,
  fetchCatalog,
  getLinkedNotes,
  getSetting,
  getStorageEstimate,
  importKnowledgePackFile,
  installPackFromCatalogEntry,
  listInstalledPacks,
  listNotes,
  loadKnowledgeSnapshot,
  removeKnowledgePack,
  requestPersistentStorage,
  saveNote,
  setSetting
} from './storage.js';
import {
  createId,
  debounce,
  downloadJson,
  formatBytes,
  formatDate,
  normalizeText,
  truncate,
  unique
} from './utils.js';
import './styles.css';

const root = document.querySelector('#app');

root.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <button class="brand" type="button" data-view="search" aria-label="Открыть поиск">
        <img src="./icon.svg" alt="" width="36" height="36" />
        <span><strong>L-Note</strong><small>локальная база знаний</small></span>
      </button>
      <div class="topbar-status">
        <span id="network-status" class="status-pill"></span>
        <button id="install-app-button" class="quiet-button" type="button" hidden>Установить приложение</button>
      </div>
    </header>

    <main class="main-content">
      <section class="view" data-page="search">
        <div class="search-hero">
          <p class="eyebrow">Поиск работает на устройстве</p>
          <h1>Спросите свою базу, а не интернет</h1>
          <p class="lede">Пакеты знаний, сокращения, связи и личные наблюдения остаются доступны без сети.</p>
          <form id="search-form" class="search-form">
            <label class="search-box">
              <span class="sr-only">Поисковый запрос</span>
              <textarea id="search-input" rows="2" placeholder="Например: амоксицилин при пневмонии или что значит ИМП"></textarea>
              <button class="primary-button" type="submit">Найти</button>
            </label>
            <div class="search-controls">
              <label>Режим
                <select id="search-scope">
                  <option value="all">Справочник + заметки</option>
                  <option value="reference">Только справочник</option>
                  <option value="personal">Только мои заметки</option>
                  <option value="entity">Термины и связи</option>
                </select>
              </label>
              <span id="index-stats" class="muted"></span>
            </div>
          </form>
          <div id="search-examples" class="chip-row" aria-label="Примеры запросов"></div>
        </div>

        <div id="empty-library" class="empty-state" hidden>
          <h2>Пока нет установленных знаний</h2>
          <p>Установите демонстрационный пакет MiniMed или импортируйте собственный JSON-пакет.</p>
          <button class="primary-button" type="button" data-view="packs">Открыть каталог</button>
        </div>

        <div id="search-feedback" class="search-feedback" aria-live="polite"></div>
        <div id="answer-panel" class="answer-panel" hidden></div>
        <div id="search-results" class="result-list"></div>
      </section>

      <section class="view" data-page="packs" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Модульная библиотека</p>
            <h1>Пакеты знаний</h1>
            <p>Выбирайте только нужные наборы. После установки поиск и чтение работают офлайн.</p>
          </div>
          <div class="heading-actions">
            <label class="quiet-button file-button">Импортировать .json
              <input id="pack-file-input" type="file" accept="application/json,.json" hidden />
            </label>
            <button id="persist-storage-button" class="quiet-button" type="button">Закрепить хранилище</button>
          </div>
        </div>
        <div id="storage-status" class="storage-status"></div>
        <div id="installed-packs" class="card-grid"></div>
        <h2 class="subheading">Каталог</h2>
        <div id="catalog-packs" class="card-grid"></div>
        <details class="danger-zone">
          <summary>Локальные данные</summary>
          <p>Удаляет установленные пакеты, заметки и настройки только на этом устройстве.</p>
          <button id="clear-data-button" class="danger-button" type="button">Очистить всё</button>
        </details>
      </section>

      <section class="view" data-page="notes" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Личный слой</p>
            <h1>Заметки и уточнения</h1>
            <p>Наблюдения не переписывают справочник: они явно связываются с источником.</p>
          </div>
          <button id="export-notes-button" class="quiet-button" type="button">Экспортировать пакет</button>
        </div>

        <form id="note-form" class="note-editor">
          <input id="note-id" type="hidden" />
          <div class="note-link-preview" id="note-link-preview">Заметка без привязки к источнику</div>
          <div class="two-column-form">
            <label>Тип связи
              <select id="note-relation">
                <option value="related">Связано с</option>
                <option value="supports">Подтверждает</option>
                <option value="refines">Уточняет</option>
                <option value="contradicts">Противоречит</option>
                <option value="supersedes">Замещает для моего контекста</option>
              </select>
            </label>
            <label>Метки
              <input id="note-tags" type="text" placeholder="практика, личное, проверить" />
            </label>
          </div>
          <label>Заголовок
            <input id="note-title" type="text" required maxlength="180" placeholder="Что вы заметили" />
          </label>
          <label>Текст
            <textarea id="note-body" rows="7" required placeholder="Опишите наблюдение, условия применимости и степень уверенности"></textarea>
          </label>
          <div class="form-actions">
            <button class="primary-button" type="submit">Сохранить заметку</button>
            <button id="reset-note-button" class="quiet-button" type="button">Сбросить</button>
          </div>
        </form>
        <div id="notes-list" class="note-list"></div>
      </section>

      <section class="view" data-page="model" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Необязательный слой</p>
            <h1>Локальный ИИ</h1>
            <p>Модель получает только найденные фрагменты, пишет ссылки [S1] и проходит второй проверочный проход.</p>
          </div>
        </div>
        <div class="model-layout">
          <section class="panel">
            <h2>Модель</h2>
            <label>Выбор модели
              <select id="model-select"></select>
            </label>
            <p id="model-note" class="muted"></p>
            <div id="model-progress" class="progress-block" hidden>
              <progress max="1"></progress>
              <span></span>
            </div>
            <div class="form-actions">
              <button id="load-model-button" class="primary-button" type="button">Загрузить на устройство</button>
              <button id="unload-model-button" class="quiet-button" type="button" disabled>Выгрузить из памяти</button>
            </div>
            <p id="model-status" class="status-line"></p>
          </section>
          <section class="panel">
            <h2>Контракт ответа</h2>
            <ol class="contract-list">
              <li>Детерминированный поиск выбирает источники.</li>
              <li>Модель отвечает только по фрагментам [S1…Sn].</li>
              <li>Второй проход ищет неподтвержденные утверждения.</li>
              <li>Некорректные ссылки отклоняют генерацию и возвращают извлекающую сводку.</li>
            </ol>
            <button id="answer-current-query-button" class="quiet-button" type="button">Ответить на текущий запрос</button>
          </section>
        </div>
      </section>
    </main>

    <nav class="bottom-nav" aria-label="Основная навигация">
      <button type="button" data-view="search" aria-current="page"><span>Поиск</span></button>
      <button type="button" data-view="packs"><span>Пакеты</span></button>
      <button type="button" data-view="notes"><span>Заметки</span><b id="notes-badge" hidden></b></button>
      <button type="button" data-view="model"><span>ИИ</span></button>
    </nav>
  </div>

  <dialog id="detail-dialog" class="detail-dialog">
    <button class="dialog-close" type="button" aria-label="Закрыть">×</button>
    <div id="detail-content"></div>
  </dialog>
  <div id="toast-region" class="toast-region" aria-live="polite"></div>
`;

const elements = Object.fromEntries(
  [
    'network-status',
    'install-app-button',
    'search-form',
    'search-input',
    'search-scope',
    'index-stats',
    'search-examples',
    'empty-library',
    'search-feedback',
    'answer-panel',
    'search-results',
    'pack-file-input',
    'persist-storage-button',
    'storage-status',
    'installed-packs',
    'catalog-packs',
    'clear-data-button',
    'export-notes-button',
    'note-form',
    'note-id',
    'note-link-preview',
    'note-relation',
    'note-tags',
    'note-title',
    'note-body',
    'reset-note-button',
    'notes-list',
    'model-select',
    'model-note',
    'model-progress',
    'load-model-button',
    'unload-model-button',
    'model-status',
    'answer-current-query-button',
    'notes-badge',
    'detail-dialog',
    'detail-content',
    'toast-region'
  ].map((id) => [id, document.querySelector(`#${id}`)])
);

const state = {
  view: 'search',
  snapshot: { packs: [], records: [], entities: [], relations: [], notes: [] },
  index: null,
  catalog: null,
  catalogUrl: null,
  installed: [],
  query: '',
  scope: 'all',
  searchResult: { hits: [], correctedQuery: null, expandedQuery: '' },
  selectedItemId: null,
  noteLink: null,
  answer: null,
  installProgress: new Map(),
  deferredInstallPrompt: null,
  modelId: DEFAULT_MODEL_ID,
  ai: new LocalAiSession()
};

const examples = [
  'амоксицилин при пневмонии',
  'что означает ИМП',
  'сыпь не исчезает под стаканом',
  'чем поить при ротавирусе',
  'сатурация 89 у ребенка',
  'грудничок свистит при дыхании'
];

function clear(node) {
  node.replaceChildren();
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'attrs') {
      for (const [attribute, attributeValue] of Object.entries(value)) {
        node.setAttribute(attribute, String(attributeValue));
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLocaleLowerCase('en-US'), value);
    } else if (key in node) node[key] = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function toast(message, tone = 'default', duration = 4200) {
  const node = el('div', { class: `toast toast-${tone}`, text: message });
  elements['toast-region'].append(node);
  requestAnimationFrame(() => node.classList.add('visible'));
  setTimeout(() => {
    node.classList.remove('visible');
    setTimeout(() => node.remove(), 220);
  }, duration);
}

function relationLabel(value) {
  return RELATION_LABELS[value] ?? value?.replaceAll('-', ' ') ?? 'связано с';
}

function typeLabel(item) {
  if (item.type === 'personal') return `Личная заметка · ${relationLabel(item.relationType)}`;
  if (item.type === 'entity') return `Термин · ${item.section}`;
  return item.record?.source?.authority === 'official' ? 'Справочник · официальный источник' : 'Справочник';
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  elements['network-status'].textContent = online ? 'Сеть доступна' : 'Офлайн';
  elements['network-status'].classList.toggle('offline', !online);
  elements['network-status'].title = online
    ? 'Каталог и внешние источники доступны. Поиск всё равно выполняется локально.'
    : 'Поиск, установленные пакеты и заметки продолжают работать без сети.';
}

function setView(view, { focus = true } = {}) {
  state.view = view;
  for (const section of document.querySelectorAll('[data-page]')) {
    section.hidden = section.dataset.page !== view;
  }
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.closest('.bottom-nav')) {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }
  if (focus && view === 'search') elements['search-input'].focus({ preventScroll: true });
  if (view === 'packs') void renderPacks();
  if (view === 'notes') void renderNotes();
  if (view === 'model') renderModelPanel();
  void setSetting('lastView', view);
}

function setButtonBusy(button, busy, busyText = 'Выполняется…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

function renderExamples() {
  clear(elements['search-examples']);
  for (const example of examples) {
    elements['search-examples'].append(
      el('button', {
        class: 'chip',
        type: 'button',
        text: example,
        onclick: () => {
          elements['search-input'].value = example;
          state.query = example;
          void runSearch();
        }
      })
    );
  }
}

function renderIndexStats() {
  const counts = state.index?.counts ?? {
    packs: 0,
    records: 0,
    entities: 0,
    relations: 0,
    notes: 0
  };
  elements['index-stats'].textContent = `${counts.packs} пак. · ${counts.records} фрагм. · ${counts.entities} термин. · ${counts.notes} замет.`;
  elements['empty-library'].hidden = counts.packs > 0 || counts.notes > 0;
}

async function rebuildIndex() {
  state.snapshot = await loadKnowledgeSnapshot();
  state.installed = state.snapshot.packs;
  state.index = await createKnowledgeIndex(state.snapshot);
  renderIndexStats();
  elements['notes-badge'].hidden = state.snapshot.notes.length === 0;
  elements['notes-badge'].textContent = String(Math.min(99, state.snapshot.notes.length));
  if (state.query) await runSearch({ preserveAnswer: false });
}

function renderSearchFeedback() {
  clear(elements['search-feedback']);
  if (!state.query) return;
  const { hits, correctedQuery } = state.searchResult;
  const row = el('div', { class: 'feedback-row' });
  row.append(
    el('span', {
      class: 'muted',
      text: hits.length > 0 ? `Найдено: ${hits.length}` : 'Совпадений не найдено'
    })
  );
  if (correctedQuery) {
    row.append(
      el('button', {
        class: 'text-button',
        type: 'button',
        text: `Возможно, имелось в виду: ${correctedQuery}`,
        onclick: () => {
          elements['search-input'].value = correctedQuery;
          state.query = correctedQuery;
          void runSearch();
        }
      })
    );
  }
  if (hits.length > 0) {
    row.append(
      el('button', {
        class: 'quiet-button compact',
        type: 'button',
        text: state.ai.ready ? 'Ответ с локальным ИИ' : 'Сводка по источникам',
        onclick: () => void composeAnswer()
      })
    );
  }
  elements['search-feedback'].append(row);
}

function createTagList(values, className = 'tag-row') {
  const container = el('div', { class: className });
  for (const value of unique(values).slice(0, 6)) {
    container.append(el('span', { class: 'mini-tag', text: value }));
  }
  return container;
}

function renderSearchResults() {
  clear(elements['search-results']);
  const hits = state.searchResult.hits;
  if (!state.query) {
    elements['search-results'].append(
      el('div', { class: 'search-placeholder' }, [
        el('h2', { text: 'Попробуйте запрос с опечаткой или сокращением' }),
        el('p', {
          text: 'Поиск объединяет полнотекстовое совпадение, допуск опечаток, алиасы сущностей и связи внутри установленных пакетов.'
        })
      ])
    );
    return;
  }
  if (hits.length === 0) {
    elements['search-results'].append(
      el('div', { class: 'empty-result' }, [
        el('h2', { text: 'Ничего подходящего' }),
        el('p', {
          text: 'Проверьте установленные пакеты, переключите режим или добавьте нужный термин как алиас при подготовке собственного пакета.'
        })
      ])
    );
    return;
  }

  hits.forEach((hit, index) => {
    const card = el('article', {
      class: `result-card result-${hit.type}`,
      dataset: { itemId: hit.id }
    });
    const header = el('div', { class: 'result-header' });
    header.append(
      el('span', { class: 'result-rank', text: String(index + 1) }),
      el('span', { class: `source-badge source-${hit.type}`, text: typeLabel(hit) })
    );
    card.append(header);
    card.append(
      el('button', {
        class: 'result-open',
        type: 'button',
        onclick: () => void openItem(hit.id)
      }, [
        el('h2', { text: hit.title }),
        el('p', {
          class: 'result-meta',
          text: [hit.section, hit.packTitle].filter(Boolean).join(' · ')
        }),
        el('p', { class: 'result-snippet', text: truncate(hit.body, 420) })
      ])
    );
    const tags = [
      ...(hit.tags ?? []),
      ...(hit.entityNames ?? []).slice(0, 3),
      ...(hit.relationText ?? []).slice(0, 1)
    ];
    if (tags.length) card.append(createTagList(tags));
    const footer = el('div', { class: 'result-footer' });
    footer.append(el('span', { class: 'score', text: `релевантность ${hit.score.toFixed(2)}` }));
    if (hit.type === 'reference') {
      footer.append(
        el('button', {
          class: 'text-button',
          type: 'button',
          text: 'Добавить наблюдение',
          onclick: () => startNoteForItem(hit)
        })
      );
    }
    card.append(footer);
    elements['search-results'].append(card);
  });
}

async function runSearch({ preserveAnswer = false } = {}) {
  const query = elements['search-input'].value.trim();
  state.query = query;
  state.scope = elements['search-scope'].value;
  if (!preserveAnswer) {
    state.answer = null;
    elements['answer-panel'].hidden = true;
  }
  if (!query || !state.index) {
    state.searchResult = { hits: [], correctedQuery: null, expandedQuery: '' };
    renderSearchFeedback();
    renderSearchResults();
    return;
  }
  const submit = elements['search-form'].querySelector('button[type="submit"]');
  setButtonBusy(submit, true, 'Ищу…');
  try {
    state.searchResult = await searchKnowledge(state.index, query, {
      scope: state.scope,
      limit: 30
    });
    renderSearchFeedback();
    renderSearchResults();
    await setSetting('lastQuery', query);
    await setSetting('lastScope', state.scope);
  } catch (error) {
    console.error(error);
    toast(`Ошибка поиска: ${error.message}`, 'error');
  } finally {
    setButtonBusy(submit, false);
  }
}

function appendAnswerText(container, text, evidence) {
  const pattern = /\[S(\d+)\]/gu;
  const parts = String(text).split(pattern);
  const block = el('div', { class: 'answer-text' });
  for (let index = 0; index < parts.length; index += 1) {
    if (index % 2 === 0) {
      block.append(document.createTextNode(parts[index]));
      continue;
    }
    const sourceNumber = Number(parts[index]);
    const source = evidence[sourceNumber - 1];
    block.append(
      el('button', {
        class: 'citation-button',
        type: 'button',
        text: `[S${sourceNumber}]`,
        disabled: !source,
        onclick: () => source && void openItem(`record:${source.recordKey}`)
      })
    );
  }
  container.append(block);
}

function renderAnswer() {
  const panel = elements['answer-panel'];
  clear(panel);
  if (!state.answer) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const { result, evidence } = state.answer;
  const modeText =
    result.mode === 'local-ai-verified'
      ? 'Локальный ИИ · проверено по ссылкам'
      : result.mode === 'rejected-local-ai'
        ? 'ИИ отклонен · показана извлекающая сводка'
        : 'Извлекающая сводка';
  const header = el('div', { class: 'answer-header' }, [
    el('div', {}, [el('p', { class: 'eyebrow', text: modeText }), el('h2', { text: 'Ответ по локальной базе' })]),
    el('button', {
      class: 'dialog-close inline-close',
      type: 'button',
      text: '×',
      attrs: { 'aria-label': 'Скрыть ответ' },
      onclick: () => {
        state.answer = null;
        panel.hidden = true;
      }
    })
  ]);
  panel.append(header);
  appendAnswerText(panel, result.text, evidence);
  if (result.warnings?.length) {
    const warnings = el('div', { class: 'warning-box' });
    warnings.append(el('strong', { text: 'Проверка:' }));
    const list = el('ul');
    for (const warning of result.warnings) list.append(el('li', { text: warning }));
    warnings.append(list);
    panel.append(warnings);
  }
  if (evidence.length > 0) {
    const list = el('ol', { class: 'evidence-list' });
    evidence.forEach((source) => {
      list.append(
        el('li', {}, [
          el('button', {
            class: 'evidence-link',
            type: 'button',
            onclick: () => void openItem(`record:${source.recordKey}`)
          }, [
            el('strong', { text: `[${source.id}] ${source.title}` }),
            el('span', { text: source.section || 'Фрагмент' })
          ])
        ])
      );
    });
    panel.append(list);
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function composeAnswer() {
  if (!state.query || state.searchResult.hits.length === 0) {
    toast('Сначала выполните поиск.', 'error');
    return;
  }
  const evidence = collectEvidence(state.searchResult.hits, 8);
  const personalHits = state.searchResult.hits.filter((hit) => hit.type === 'personal').slice(0, 6);
  const panel = elements['answer-panel'];
  panel.hidden = false;
  panel.replaceChildren(
    el('div', { class: 'answer-loading' }, [
      el('span', { class: 'spinner', attrs: { 'aria-hidden': 'true' } }),
      el('span', { text: state.ai.ready ? 'Локальная модель формирует и проверяет ответ…' : 'Собираю сводку из найденных фрагментов…' })
    ])
  );

  try {
    let result;
    if (state.ai.ready) {
      result = await state.ai.answer({
        query: state.query,
        evidence,
        personalHits,
        onToken: (draft) => {
          panel.replaceChildren(
            el('div', { class: 'answer-loading streaming' }, [
              el('p', { class: 'eyebrow', text: 'Черновик локальной модели' }),
              el('div', { class: 'answer-text', text: draft })
            ])
          );
        }
      });
    } else {
      result = buildExtractiveAnswer(state.query, evidence, personalHits);
    }
    state.answer = { result, evidence, createdAt: new Date().toISOString() };
    renderAnswer();
  } catch (error) {
    console.error(error);
    state.answer = {
      result: {
        ...buildExtractiveAnswer(state.query, evidence, personalHits),
        warnings: [`Локальная модель недоступна: ${error.message}`]
      },
      evidence,
      createdAt: new Date().toISOString()
    };
    renderAnswer();
  }
}

function detailHeader(item) {
  return el('header', { class: 'detail-header' }, [
    el('span', { class: `source-badge source-${item.type}`, text: typeLabel(item) }),
    el('h1', { text: item.title }),
    el('p', { class: 'detail-meta', text: [item.section, item.packTitle].filter(Boolean).join(' · ') })
  ]);
}

function entityButton(entity) {
  return el('button', {
    class: 'entity-chip',
    type: 'button',
    text: entity.name,
    onclick: () => void openItem(`entity:${entity.key}`)
  });
}

function relationCard(relation, currentEntityId = null) {
  const outgoing = relation.fromEntity.id === currentEntityId;
  const other = outgoing ? relation.toEntity : relation.fromEntity;
  const phrase = outgoing
    ? `${relationLabel(relation.predicate)} → ${other.name}`
    : `${other.name} → ${relationLabel(relation.predicate)}`;
  const card = el('div', { class: 'relation-card' }, [
    el('button', {
      class: 'relation-main',
      type: 'button',
      text: phrase,
      onclick: () => void openItem(`entity:${other.key}`)
    })
  ]);
  if (relation.description) card.append(el('p', { text: relation.description }));
  if (relation.recordId) {
    const record = state.snapshot.records.find(
      (candidate) => candidate.packId === relation.packId && candidate.id === relation.recordId
    );
    if (record) {
      card.append(
        el('button', {
          class: 'text-button',
          type: 'button',
          text: 'Открыть доказательный фрагмент',
          onclick: () => void openItem(`record:${record.key}`)
        })
      );
    }
  }
  return card;
}

async function renderRecordDetail(item) {
  const container = el('div', { class: 'detail-stack' });
  container.append(detailHeader(item));
  if (item.record.source) {
    const source = el('section', { class: 'source-card' }, [
      el('div', {}, [
        el('span', { class: 'eyebrow', text: 'Происхождение' }),
        el('strong', { text: item.record.source.label }),
        item.record.source.locator ? el('span', { text: item.record.source.locator }) : null
      ])
    ]);
    if (item.record.source.url) {
      source.append(
        el('a', {
          class: 'quiet-button compact',
          text: 'Открыть первоисточник',
          href: item.record.source.url,
          target: '_blank',
          rel: 'noreferrer'
        })
      );
    }
    container.append(source);
  }
  container.append(el('section', { class: 'detail-body', text: item.body }));

  if (item.entities?.length) {
    const section = el('section', { class: 'detail-section' }, [el('h2', { text: 'Термины' })]);
    const row = el('div', { class: 'chip-row' });
    item.entities.forEach((entity) => row.append(entityButton(entity)));
    section.append(row);
    container.append(section);
  }

  if (item.relations?.length) {
    const section = el('section', { class: 'detail-section' }, [el('h2', { text: 'Связи' })]);
    const list = el('div', { class: 'relation-list' });
    const seen = new Set();
    for (const relation of item.relations) {
      if (seen.has(relation.key)) continue;
      seen.add(relation.key);
      list.append(relationCard(relation));
    }
    section.append(list);
    container.append(section);
  }

  if (item.record.claims?.length) {
    const section = el('details', { class: 'claim-details' }, [
      el('summary', { text: `Структурированные утверждения: ${item.record.claims.length}` })
    ]);
    const list = el('ul');
    for (const claim of item.record.claims) {
      list.append(
        el('li', {}, [
          el('p', { text: claim.statement }),
          el('small', {
            class: 'muted',
            text: `${claim.authority} · уверенность ${Math.round(claim.confidence * 100)}%`
          })
        ])
      );
    }
    section.append(list);
    container.append(section);
  }

  const notes = await getLinkedNotes(item.key);
  if (notes.length > 0) {
    const section = el('section', { class: 'detail-section personal-layer' }, [
      el('h2', { text: 'Личные уточнения' })
    ]);
    for (const note of notes) {
      section.append(
        el('button', {
          class: `linked-note relation-${note.relationType}`,
          type: 'button',
          onclick: () => void openItem(`note:${note.id}`)
        }, [
          el('strong', { text: `${relationLabel(note.relationType)}: ${note.title}` }),
          el('span', { text: truncate(note.body, 180) })
        ])
      );
    }
    container.append(section);
  }

  const actions = el('div', { class: 'detail-actions' }, [
    el('button', {
      class: 'primary-button',
      type: 'button',
      text: 'Добавить наблюдение',
      onclick: () => {
        elements['detail-dialog'].close();
        startNoteForItem(item);
      }
    })
  ]);
  container.append(actions);
  if (item.pack?.disclaimer) container.append(el('p', { class: 'disclaimer', text: item.pack.disclaimer }));
  return container;
}

function renderEntityDetail(item) {
  const container = el('div', { class: 'detail-stack' });
  container.append(detailHeader(item));
  container.append(el('section', { class: 'detail-body', text: item.entity.description ?? item.body }));
  if (item.entity.aliases.length) {
    const section = el('section', { class: 'detail-section' }, [el('h2', { text: 'Названия и сокращения' })]);
    section.append(createTagList([item.entity.name, ...item.entity.aliases], 'chip-row'));
    container.append(section);
  }
  if (item.relations.length) {
    const section = el('section', { class: 'detail-section' }, [el('h2', { text: 'Связи с другими терминами' })]);
    const list = el('div', { class: 'relation-list' });
    item.relations.forEach((relation) => list.append(relationCard(relation, item.entity.id)));
    section.append(list);
    container.append(section);
  }
  if (item.records.length) {
    const section = el('section', { class: 'detail-section' }, [
      el('h2', { text: `Упоминания в справочнике: ${item.records.length}` })
    ]);
    const list = el('div', { class: 'backlink-list' });
    item.records.slice(0, 20).forEach((record) => {
      list.append(
        el('button', {
          class: 'backlink',
          type: 'button',
          onclick: () => void openItem(`record:${record.key}`)
        }, [el('strong', { text: record.title }), el('span', { text: record.section || 'Фрагмент' })])
      );
    });
    section.append(list);
    container.append(section);
  }
  return container;
}

function renderNoteDetail(item) {
  const container = el('div', { class: 'detail-stack' });
  container.append(detailHeader(item));
  container.append(el('section', { class: 'detail-body personal-layer', text: item.note.body }));
  if (item.note.tags.length) container.append(createTagList(item.note.tags));
  if (item.note.linkedRecordKey) {
    const linked = state.index.registry.get(`record:${item.note.linkedRecordKey}`);
    container.append(
      el('section', { class: 'source-card' }, [
        el('div', {}, [
          el('span', { class: 'eyebrow', text: relationLabel(item.note.relationType) }),
          el('strong', { text: linked?.title ?? 'Связанный фрагмент' }),
          linked?.section ? el('span', { text: linked.section }) : null
        ]),
        linked
          ? el('button', {
              class: 'quiet-button compact',
              type: 'button',
              text: 'Открыть',
              onclick: () => void openItem(linked.id)
            })
          : null
      ])
    );
  }
  container.append(
    el('div', { class: 'detail-actions' }, [
      el('button', {
        class: 'primary-button',
        type: 'button',
        text: 'Редактировать',
        onclick: () => {
          elements['detail-dialog'].close();
          editNote(item.note);
        }
      }),
      el('button', {
        class: 'danger-button',
        type: 'button',
        text: 'Удалить',
        onclick: async () => {
          if (!confirm(`Удалить заметку «${item.note.title}»?`)) return;
          await deleteNote(item.note.id);
          elements['detail-dialog'].close();
          await rebuildIndex();
          await renderNotes();
          toast('Заметка удалена.');
        }
      })
    ])
  );
  return container;
}

async function openItem(itemId) {
  const item = state.index?.registry.get(itemId);
  if (!item) {
    toast('Элемент больше не доступен в локальном индексе.', 'error');
    return;
  }
  state.selectedItemId = itemId;
  clear(elements['detail-content']);
  elements['detail-content'].append(el('div', { class: 'answer-loading', text: 'Открываю…' }));
  if (!elements['detail-dialog'].open) elements['detail-dialog'].showModal();
  let content;
  if (item.type === 'reference') content = await renderRecordDetail(item);
  else if (item.type === 'entity') content = renderEntityDetail(item);
  else content = renderNoteDetail(item);
  elements['detail-content'].replaceChildren(content);
}

function updateNoteLinkPreview() {
  const preview = elements['note-link-preview'];
  if (!state.noteLink) {
    preview.textContent = 'Заметка без привязки к источнику';
    preview.classList.remove('linked');
    return;
  }
  preview.textContent = `${relationLabel(elements['note-relation'].value)}: ${state.noteLink.title}${
    state.noteLink.section ? ` — ${state.noteLink.section}` : ''
  }`;
  preview.classList.add('linked');
}

function resetNoteEditor() {
  elements['note-form'].reset();
  elements['note-id'].value = '';
  state.noteLink = null;
  elements['note-relation'].value = 'related';
  updateNoteLinkPreview();
}

function startNoteForItem(item) {
  const record = item.record ?? state.snapshot.records.find((candidate) => candidate.key === item.key);
  state.noteLink = {
    recordKey: item.key,
    title: item.title,
    section: item.section,
    entityIds: record?.entityIds ?? []
  };
  elements['note-id'].value = '';
  elements['note-title'].value = `Наблюдение: ${item.title}`;
  elements['note-body'].value = '';
  elements['note-tags'].value = '';
  elements['note-relation'].value = 'refines';
  updateNoteLinkPreview();
  setView('notes');
  elements['note-body'].focus();
}

function editNote(note) {
  elements['note-id'].value = note.id;
  elements['note-title'].value = note.title;
  elements['note-body'].value = note.body;
  elements['note-tags'].value = note.tags.join(', ');
  elements['note-relation'].value = note.relationType;
  const linked = note.linkedRecordKey ? state.index.registry.get(`record:${note.linkedRecordKey}`) : null;
  state.noteLink = linked
    ? {
        recordKey: linked.key,
        title: linked.title,
        section: linked.section,
        entityIds: linked.record?.entityIds ?? []
      }
    : null;
  updateNoteLinkPreview();
  setView('notes');
  elements['note-title'].focus();
}

function createNoteCard(note) {
  const linked = note.linkedRecordKey ? state.index.registry.get(`record:${note.linkedRecordKey}`) : null;
  return el('article', { class: `note-card relation-${note.relationType}` }, [
    el('div', { class: 'note-card-header' }, [
      el('span', { class: 'source-badge source-personal', text: relationLabel(note.relationType) }),
      el('span', { class: 'muted', text: formatDate(note.updatedAt) })
    ]),
    el('button', {
      class: 'note-open',
      type: 'button',
      onclick: () => void openItem(`note:${note.id}`)
    }, [
      el('h2', { text: note.title }),
      el('p', { text: truncate(note.body, 320) }),
      linked ? el('small', { text: `Связано: ${linked.title} · ${linked.section}` }) : null
    ]),
    createTagList(note.tags),
    el('div', { class: 'result-footer' }, [
      el('button', { class: 'text-button', type: 'button', text: 'Редактировать', onclick: () => editNote(note) }),
      el('button', {
        class: 'text-button destructive-text',
        type: 'button',
        text: 'Удалить',
        onclick: async () => {
          if (!confirm(`Удалить заметку «${note.title}»?`)) return;
          await deleteNote(note.id);
          await rebuildIndex();
          await renderNotes();
          toast('Заметка удалена.');
        }
      })
    ])
  ]);
}

async function renderNotes() {
  const notes = await listNotes();
  clear(elements['notes-list']);
  if (notes.length === 0) {
    elements['notes-list'].append(
      el('div', { class: 'empty-state compact-empty' }, [
        el('h2', { text: 'Заметок пока нет' }),
        el('p', { text: 'Откройте справочный фрагмент и выберите «Добавить наблюдение» либо создайте свободную заметку выше.' })
      ])
    );
    return;
  }
  for (const note of notes) elements['notes-list'].append(createNoteCard(note));
}

async function exportNotesPack() {
  const notes = await listNotes();
  if (notes.length === 0) {
    toast('Нет заметок для экспорта.', 'error');
    return;
  }
  const entityIds = unique(notes.flatMap((note) => note.entityIds));
  const entities = [];
  for (const entityId of entityIds) {
    const entity = state.snapshot.entities.find((candidate) => candidate.id === entityId);
    if (!entity || entities.some((candidate) => candidate.id === entity.id)) continue;
    const { key: _key, packId: _packId, packVersion: _packVersion, packTitle: _packTitle, ...portable } = entity;
    entities.push(portable);
  }
  const timestamp = new Date().toISOString();
  const dateId = timestamp.slice(0, 10).replaceAll('-', '');
  const pack = {
    format: 'l-note-pack',
    schemaVersion: 1,
    id: `user.notes.export.${dateId}`,
    version: timestamp,
    title: 'Экспорт личных заметок L-Note',
    description: `Личный пакет из ${notes.length} заметок.`,
    language: 'ru',
    createdAt: timestamp,
    source: {
      name: 'L-Note user export',
      url: null,
      license: 'Private user data',
      contentMode: 'personal-notes'
    },
    disclaimer: 'Личные наблюдения не являются справочными данными и должны интерпретироваться в исходном контексте.',
    tags: ['личное', 'заметки'],
    records: notes.map((note) => ({
      id: `record.${note.id}`,
      documentId: 'user.notes',
      kind: 'note',
      title: note.title,
      section: relationLabel(note.relationType),
      body: note.body,
      aliases: [],
      tags: note.tags,
      entityIds: note.entityIds,
      claims: [],
      source: {
        label: 'Личная заметка пользователя',
        url: null,
        locator: note.linkedRecordKey,
        authority: 'personal',
        retrievedAt: note.updatedAt
      },
      updatedAt: note.updatedAt,
      metadata: {
        relationType: note.relationType,
        linkedRecordKey: note.linkedRecordKey,
        originalNoteId: note.id
      }
    })),
    entities,
    relations: [],
    metadata: { exportedBy: 'l-note', noteCount: notes.length }
  };
  downloadJson(`l-note-notes-${dateId}.json`, pack);
  toast('Пакет заметок подготовлен.');
}

function createInstalledPackCard(pack) {
  const card = el('article', { class: 'module-card installed-module' });
  card.append(
    el('div', { class: 'module-card-header' }, [
      el('span', { class: 'source-badge', text: 'Установлен' }),
      el('span', { class: 'muted', text: `v${pack.version}` })
    ]),
    el('h2', { text: pack.title }),
    el('p', { text: pack.description }),
    createTagList(pack.tags ?? [])
  );
  card.append(
    el('dl', { class: 'module-stats' }, [
      el('div', {}, [el('dt', { text: 'Фрагменты' }), el('dd', { text: String(pack.recordCount ?? 0) })]),
      el('div', {}, [el('dt', { text: 'Термины' }), el('dd', { text: String(pack.entityCount ?? 0) })]),
      el('div', {}, [el('dt', { text: 'Связи' }), el('dd', { text: String(pack.relationCount ?? 0) })]),
      el('div', {}, [
        el('dt', { text: 'Размер' }),
        el('dd', { text: formatBytes(pack.artifact?.sizeBytes) })
      ])
    ])
  );
  const actions = el('div', { class: 'module-actions' });
  if (pack.source?.url) {
    actions.append(
      el('a', {
        class: 'text-button as-link',
        text: 'Источник',
        href: pack.source.url,
        target: '_blank',
        rel: 'noreferrer'
      })
    );
  }
  actions.append(
    el('button', {
      class: 'danger-button compact',
      type: 'button',
      text: 'Удалить с устройства',
      onclick: async () => {
        if (!confirm(`Удалить пакет «${pack.title}»? Личные заметки останутся.`)) return;
        await removeKnowledgePack(pack.id);
        await rebuildIndex();
        await renderPacks();
        toast('Пакет удален с устройства.');
      }
    })
  );
  card.append(actions);
  if (pack.disclaimer) card.append(el('p', { class: 'disclaimer', text: pack.disclaimer }));
  return card;
}

function createCatalogPackCard(entry) {
  const installed = state.installed.find((pack) => pack.id === entry.id);
  const progress = state.installProgress.get(entry.id);
  const isCurrent = installed?.version === entry.version;
  const card = el('article', { class: `module-card ${entry.featured ? 'featured-module' : ''}` });
  card.append(
    el('div', { class: 'module-card-header' }, [
      el('span', {
        class: 'source-badge',
        text: entry.featured ? 'Демо-пакет' : 'Каталог'
      }),
      el('span', { class: 'muted', text: `${formatBytes(entry.artifact.sizeBytes)} · ${entry.language}` })
    ]),
    el('h2', { text: entry.title }),
    el('p', { text: entry.description }),
    createTagList(entry.tags)
  );

  if (progress) {
    const block = el('div', { class: 'progress-block module-progress' }, [
      el('progress', {
        max: 1,
        value: Number.isFinite(progress.progress) ? progress.progress : 0
      }),
      el('span', { text: progress.message })
    ]);
    card.append(block);
  }

  const actions = el('div', { class: 'module-actions' });
  const installButton = el('button', {
    class: isCurrent ? 'quiet-button' : 'primary-button',
    type: 'button',
    text: isCurrent ? 'Установлено' : installed ? 'Обновить' : 'Установить',
    disabled: isCurrent || Boolean(progress),
    onclick: () => void installCatalogEntry(entry)
  });
  actions.append(installButton);
  if (entry.source.url) {
    actions.append(
      el('a', {
        class: 'text-button as-link',
        text: 'О происхождении',
        href: entry.source.url,
        target: '_blank',
        rel: 'noreferrer'
      })
    );
  }
  const artifactUrl = state.catalogUrl ? new URL(entry.artifact.url, state.catalogUrl).href : null;
  if (artifactUrl) {
    actions.append(
      el('a', {
        class: 'text-button as-link',
        text: 'Скачать JSON',
        href: artifactUrl,
        download: ''
      })
    );
  }
  card.append(actions);
  if (entry.disclaimer) card.append(el('p', { class: 'disclaimer', text: entry.disclaimer }));
  return card;
}

async function installCatalogEntry(entry) {
  state.installProgress.set(entry.id, {
    phase: 'prepare',
    message: 'Подготовка…',
    progress: 0
  });
  await renderPacks();
  try {
    await installPackFromCatalogEntry(entry, state.catalogUrl, (progress) => {
      state.installProgress.set(entry.id, progress);
      void renderPacks();
    });
    state.installProgress.delete(entry.id);
    await rebuildIndex();
    await renderPacks();
    toast(`Пакет «${entry.title}» установлен и готов офлайн.`, 'success');
    if (!state.query && entry.featured) {
      elements['search-input'].value = 'что означает ИМП';
      state.query = elements['search-input'].value;
      await runSearch();
    }
  } catch (error) {
    console.error(error);
    state.installProgress.delete(entry.id);
    await renderPacks();
    toast(`Установка не завершена: ${error.message}`, 'error', 7000);
  }
}

async function renderStorageStatus() {
  clear(elements['storage-status']);
  const estimate = await getStorageEstimate();
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const parts = [persisted ? 'Хранилище закреплено' : 'Браузер может удалить данные при нехватке места'];
  if (estimate?.usage !== undefined && estimate?.quota !== undefined) {
    parts.push(`занято ${formatBytes(estimate.usage)} из ${formatBytes(estimate.quota)}`);
  }
  elements['storage-status'].append(
    el('span', { class: persisted ? 'status-pill' : 'status-pill warning', text: parts.join(' · ') })
  );
  elements['persist-storage-button'].textContent = persisted ? 'Хранилище закреплено' : 'Закрепить хранилище';
  elements['persist-storage-button'].disabled = persisted;
}

async function renderPacks() {
  state.installed = await listInstalledPacks();
  clear(elements['installed-packs']);
  if (state.installed.length === 0) {
    elements['installed-packs'].append(
      el('div', { class: 'empty-state compact-empty' }, [
        el('h2', { text: 'Нет установленных пакетов' }),
        el('p', { text: 'Выберите пакет из каталога ниже. Его содержимое будет записано в IndexedDB этого устройства.' })
      ])
    );
  } else {
    for (const pack of state.installed) elements['installed-packs'].append(createInstalledPackCard(pack));
  }

  clear(elements['catalog-packs']);
  if (!state.catalog) {
    elements['catalog-packs'].append(
      el('div', { class: 'empty-state compact-empty' }, [
        el('h2', { text: 'Каталог недоступен' }),
        el('p', { text: 'Установленные пакеты продолжают работать. Подключитесь к сети для обновления каталога либо импортируйте JSON вручную.' })
      ])
    );
  } else {
    for (const entry of state.catalog.packs) elements['catalog-packs'].append(createCatalogPackCard(entry));
  }
  await renderStorageStatus();
}

function renderModelOptions() {
  clear(elements['model-select']);
  for (const option of LOCAL_MODEL_OPTIONS) {
    elements['model-select'].append(
      el('option', { value: option.id, text: option.title, selected: option.id === state.modelId })
    );
  }
}

function renderModelPanel() {
  const selected = LOCAL_MODEL_OPTIONS.find((option) => option.id === state.modelId) ?? LOCAL_MODEL_OPTIONS[1];
  elements['model-select'].value = selected.id;
  elements['model-note'].textContent = selected.note;
  const hasWebGpu = Boolean(navigator.gpu);
  if (state.ai.ready) {
    elements['model-status'].textContent = `Загружена: ${state.ai.modelId}. Вывод выполняется локально.`;
    elements['model-status'].className = 'status-line success';
  } else if (!hasWebGpu) {
    elements['model-status'].textContent = 'WebGPU не обнаружен. Поиск и извлекающая сводка доступны, но WebLLM может не запуститься.';
    elements['model-status'].className = 'status-line warning-text';
  } else {
    elements['model-status'].textContent = 'Модель не загружена. Пакеты знаний и поиск уже работают офлайн без нее.';
    elements['model-status'].className = 'status-line';
  }
  elements['load-model-button'].disabled = state.ai.ready;
  elements['unload-model-button'].disabled = !state.ai.ready;
  elements['answer-current-query-button'].disabled = !state.query || state.searchResult.hits.length === 0;
}

async function loadSelectedModel() {
  const button = elements['load-model-button'];
  const progressBlock = elements['model-progress'];
  const progressBar = progressBlock.querySelector('progress');
  const progressText = progressBlock.querySelector('span');
  progressBlock.hidden = false;
  progressBar.removeAttribute('value');
  progressText.textContent = 'Подготовка WebLLM…';
  setButtonBusy(button, true, 'Загрузка…');
  try {
    await state.ai.load(state.modelId, (report) => {
      if (report.progress === null) progressBar.removeAttribute('value');
      else progressBar.value = report.progress;
      progressText.textContent = report.text;
    });
    progressBar.value = 1;
    progressText.textContent = 'Модель готова.';
    toast('Локальная модель загружена.', 'success');
  } catch (error) {
    console.error(error);
    progressText.textContent = `Ошибка: ${error.message}`;
    toast(`Не удалось загрузить модель: ${error.message}`, 'error', 8000);
  } finally {
    setButtonBusy(button, false);
    renderModelPanel();
  }
}

async function loadCatalogSafe() {
  try {
    const result = await fetchCatalog();
    state.catalog = result.catalog;
    state.catalogUrl = result.catalogUrl;
  } catch (error) {
    console.warn('Catalog is unavailable.', error);
    state.catalog = null;
    state.catalogUrl = null;
  }
}

function registerPwa() {
  registerSW({
    immediate: true,
    onOfflineReady() {
      toast('Приложение готово к работе офлайн.', 'success');
    },
    onNeedRefresh() {
      const update = el('div', { class: 'toast toast-default visible' }, [
        el('span', { text: 'Доступна новая версия приложения.' }),
        el('button', {
          class: 'text-button',
          type: 'button',
          text: 'Обновить',
          onclick: () => window.location.reload()
        })
      ]);
      elements['toast-region'].append(update);
    },
    onRegisterError(error) {
      console.warn('Service worker registration failed.', error);
    }
  });
}

async function handleNoteSubmit(event) {
  event.preventDefault();
  const id = elements['note-id'].value || createId('note');
  const existing = state.snapshot.notes.find((note) => note.id === id);
  const now = new Date().toISOString();
  const note = UserNoteSchema.parse({
    id,
    title: elements['note-title'].value.trim(),
    body: elements['note-body'].value.trim(),
    tags: unique(
      elements['note-tags'].value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
    entityIds: state.noteLink?.entityIds ?? existing?.entityIds ?? [],
    relationType: elements['note-relation'].value,
    linkedRecordKey: state.noteLink?.recordKey ?? existing?.linkedRecordKey ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  await saveNote(note);
  resetNoteEditor();
  await rebuildIndex();
  await renderNotes();
  toast(existing ? 'Заметка обновлена.' : 'Заметка сохранена.', 'success');
}

async function initialize() {
  updateNetworkStatus();
  renderExamples();
  registerPwa();

  const [lastScope, lastQuery, lastView, savedModelId] = await Promise.all([
    getSetting('lastScope', 'all'),
    getSetting('lastQuery', ''),
    getSetting('lastView', 'search'),
    getSetting('modelId', DEFAULT_MODEL_ID)
  ]);
  state.scope = lastScope;
  state.query = lastQuery;
  state.modelId = LOCAL_MODEL_OPTIONS.some((option) => option.id === savedModelId)
    ? savedModelId
    : DEFAULT_MODEL_ID;
  elements['search-scope'].value = state.scope;
  elements['search-input'].value = state.query;
  renderModelOptions();

  await Promise.all([loadCatalogSafe(), rebuildIndex()]);
  await Promise.all([renderPacks(), renderNotes()]);
  renderModelPanel();
  setView(['search', 'packs', 'notes', 'model'].includes(lastView) ? lastView : 'search', { focus: false });
  if (state.query) await runSearch();
  else renderSearchResults();

  window.addEventListener('online', () => {
    updateNetworkStatus();
    void loadCatalogSafe().then(renderPacks);
  });
  window.addEventListener('offline', updateNetworkStatus);
}

for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => setView(button.dataset.view));
}

elements['search-form'].addEventListener('submit', (event) => {
  event.preventDefault();
  void runSearch();
});

elements['search-scope'].addEventListener('change', () => void runSearch());

elements['search-input'].addEventListener(
  'input',
  debounce(() => {
    const query = elements['search-input'].value.trim();
    if (query.length >= 3 || (query.length === 0 && state.query)) void runSearch();
  }, 480)
);

elements['note-form'].addEventListener('submit', (event) => void handleNoteSubmit(event));
elements['note-relation'].addEventListener('change', updateNoteLinkPreview);
elements['reset-note-button'].addEventListener('click', resetNoteEditor);
elements['export-notes-button'].addEventListener('click', () => void exportNotesPack());

elements['pack-file-input'].addEventListener('change', async () => {
  const file = elements['pack-file-input'].files?.[0];
  if (!file) return;
  try {
    const installed = await importKnowledgePackFile(file);
    await rebuildIndex();
    await renderPacks();
    toast(`Импортирован пакет «${installed.title}».`, 'success');
  } catch (error) {
    console.error(error);
    toast(`Импорт не выполнен: ${error.message}`, 'error', 8000);
  } finally {
    elements['pack-file-input'].value = '';
  }
});

elements['persist-storage-button'].addEventListener('click', async () => {
  const result = await requestPersistentStorage();
  if (!result.supported) toast('Браузер не поддерживает запрос постоянного хранилища.', 'error');
  else if (result.persisted) toast('Браузер закрепил локальные данные.', 'success');
  else toast('Браузер не разрешил закрепить хранилище. Экспортируйте важные заметки.', 'error');
  await renderStorageStatus();
});

elements['clear-data-button'].addEventListener('click', async () => {
  if (!confirm('Удалить все пакеты, заметки и настройки L-Note на этом устройстве?')) return;
  await clearAllLocalData();
  resetNoteEditor();
  state.query = '';
  elements['search-input'].value = '';
  await rebuildIndex();
  await Promise.all([renderPacks(), renderNotes()]);
  renderSearchResults();
  toast('Локальные данные очищены.');
});

elements['model-select'].addEventListener('change', async () => {
  state.modelId = elements['model-select'].value;
  await setSetting('modelId', state.modelId);
  renderModelPanel();
});

elements['load-model-button'].addEventListener('click', () => void loadSelectedModel());
elements['unload-model-button'].addEventListener('click', async () => {
  await state.ai.unload();
  elements['model-progress'].hidden = true;
  renderModelPanel();
  toast('Модель выгружена из памяти.');
});
elements['answer-current-query-button'].addEventListener('click', async () => {
  if (!state.query || state.searchResult.hits.length === 0) {
    toast('Сначала выполните поиск.', 'error');
    setView('search');
    return;
  }
  setView('search');
  await composeAnswer();
});

elements['detail-dialog'].querySelector('.dialog-close').addEventListener('click', () => {
  elements['detail-dialog'].close();
});
elements['detail-dialog'].addEventListener('click', (event) => {
  if (event.target === elements['detail-dialog']) elements['detail-dialog'].close();
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  elements['install-app-button'].hidden = false;
});

elements['install-app-button'].addEventListener('click', async () => {
  if (!state.deferredInstallPrompt) return;
  await state.deferredInstallPrompt.prompt();
  state.deferredInstallPrompt = null;
  elements['install-app-button'].hidden = true;
});
window.addEventListener('appinstalled', () => {
  state.deferredInstallPrompt = null;
  elements['install-app-button'].hidden = true;
  toast('L-Note установлена как приложение.', 'success');
});

void initialize().catch((error) => {
  console.error(error);
  root.replaceChildren(
    el('main', { class: 'fatal-error' }, [
      el('h1', { text: 'L-Note не удалось запустить' }),
      el('p', { text: error.message }),
      el('button', { class: 'primary-button', type: 'button', text: 'Перезагрузить', onclick: () => location.reload() })
    ])
  );
});
