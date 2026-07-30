import { deleteOne, getAll, getOne, putOne, storageMode } from './db.js';
import {
  buildKnowledgeState,
  findDocumentForSection,
  flattenKnowledge,
  packByteSize,
  relationLabel,
  safePackFilename,
  validatePack,
} from './packs.js';
import { createSearchEngine, highlightRanges, normalizeText } from './search.js';
import { BrowserLocalAi, collectEvidence } from './ai.js';

const state = {
  catalog: { packs: [] },
  packRecords: [],
  notes: [],
  knowledge: buildKnowledgeState([], []),
  records: [],
  search: createSearchEngine([], []),
  currentQuery: '',
  currentResults: [],
  currentEvidence: null,
  localAi: new BrowserLocalAi(),
  localAiReady: false,
  route: 'search',
};

const dom = {
  pages: [...document.querySelectorAll('[data-page]')],
  navButtons: [...document.querySelectorAll('[data-nav]')],
  sidebarStatus: document.querySelector('#sidebar-status'),
  notesCount: document.querySelector('#notes-count'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-input'),
  personalPriority: document.querySelector('#personal-priority'),
  searchEngineStatus: document.querySelector('#search-engine-status'),
  searchSuggestions: document.querySelector('#search-suggestions'),
  searchEmpty: document.querySelector('#search-empty'),
  searchResults: document.querySelector('#search-results'),
  askForm: document.querySelector('#ask-form'),
  askInput: document.querySelector('#ask-input'),
  aiStatus: document.querySelector('#ai-status'),
  answerOutput: document.querySelector('#answer-output'),
  catalogGrid: document.querySelector('#catalog-grid'),
  storageSummary: document.querySelector('#storage-summary'),
  packFileInput: document.querySelector('#pack-file-input'),
  notesGrid: document.querySelector('#notes-grid'),
  notesFileInput: document.querySelector('#notes-file-input'),
  documentDialog: document.querySelector('#document-dialog'),
  documentDialogHeading: document.querySelector('#document-dialog-heading'),
  documentDialogBody: document.querySelector('#document-dialog-body'),
  entityDialog: document.querySelector('#entity-dialog'),
  entityDialogHeading: document.querySelector('#entity-dialog-heading'),
  entityDialogBody: document.querySelector('#entity-dialog-body'),
  noteDialog: document.querySelector('#note-dialog'),
  noteForm: document.querySelector('#note-form'),
  noteDialogTitle: document.querySelector('#note-dialog-title'),
  noteId: document.querySelector('#note-id'),
  noteTargetClaim: document.querySelector('#note-target-claim'),
  noteTitle: document.querySelector('#note-title'),
  noteBody: document.querySelector('#note-body'),
  noteRelation: document.querySelector('#note-relation'),
  noteTargetSummary: document.querySelector('#note-target-summary'),
  noteRelatedPreview: document.querySelector('#note-related-preview'),
  deleteNoteButton: document.querySelector('#delete-note-button'),
  toastRegion: document.querySelector('#toast-region'),
};

function create(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('data-')) node.dataset[key.slice(5)] = value;
    else if (key === 'hidden') node.hidden = Boolean(value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function toast(message, type = 'info') {
  const item = create('div', { className: `toast${type === 'error' ? ' error' : ''}`, text: message });
  dom.toastRegion.append(item);
  setTimeout(() => item.remove(), 4300);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function routeTo(route) {
  const next = ['search', 'ask', 'library', 'notes'].includes(route) ? route : 'search';
  state.route = next;
  for (const page of dom.pages) page.classList.toggle('active', page.dataset.page === next);
  for (const button of dom.navButtons) button.classList.toggle('active', button.dataset.nav === next);
  if (location.hash !== `#/${next}`) history.replaceState(null, '', `#/${next}`);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function currentRouteFromHash() {
  return location.hash.replace(/^#\/?/u, '').split('/')[0] || 'search';
}

async function sha256Hex(buffer) {
  if (!crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function loadCatalog() {
  const response = await fetch('./packs/catalog.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Каталог недоступен: HTTP ${response.status}`);
  const catalog = await response.json();
  if (!Array.isArray(catalog?.packs)) throw new Error('Каталог пакетов имеет неверный формат.');
  state.catalog = catalog;
}

async function installPack(pack, source = {}) {
  const validation = validatePack(pack);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const previous = await getOne('packs', pack.id);
  await putOne('packs', {
    id: pack.id,
    enabled: previous?.enabled ?? true,
    installedAt: new Date().toISOString(),
    sizeBytes: source.sizeBytes ?? packByteSize(pack),
    sourceUrl: source.url ?? previous?.sourceUrl ?? null,
    sha256: source.sha256 ?? previous?.sha256 ?? null,
    pack,
  });
  await refreshState();
}

async function downloadAndInstall(entry, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Скачивание…';
  try {
    const response = await fetch(entry.url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Ошибка загрузки: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (entry.sha256) {
      button.textContent = 'Проверка…';
      const actual = await sha256Hex(buffer);
      if (actual && actual !== entry.sha256) throw new Error('SHA-256 пакета не совпал с каталогом.');
    }
    button.textContent = 'Индексация…';
    const pack = JSON.parse(new TextDecoder().decode(buffer));
    await installPack(pack, { url: entry.url, sha256: entry.sha256, sizeBytes: buffer.byteLength });
    toast(`Пакет «${pack.title}» установлен и доступен офлайн.`);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function refreshState() {
  state.packRecords = await getAll('packs');
  state.notes = (await getAll('notes')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const enabledPacks = state.packRecords.filter((record) => record.enabled).map((record) => record.pack);
  state.knowledge = buildKnowledgeState(enabledPacks, state.notes);
  state.records = flattenKnowledge(enabledPacks, state.notes);
  state.search = createSearchEngine(state.records, [...state.knowledge.entities.values()]);
  dom.searchEngineStatus.textContent = `${state.search.kind}: ${state.search.count} записей`;
  dom.notesCount.textContent = state.notes.length ? String(state.notes.length) : '';
  renderSidebarStatus();
  await Promise.all([renderCatalog(), renderNotes(), renderStorageSummary()]);
  renderSearchEmpty();
  renderSuggestions();
  if (state.currentQuery) runSearch(state.currentQuery);
}

function renderSidebarStatus() {
  const enabled = state.packRecords.filter((record) => record.enabled);
  const offline = !navigator.onLine;
  dom.sidebarStatus.replaceChildren(
    create('strong', { text: offline ? 'Оффлайн-режим' : 'Локальное хранилище' }),
    create('span', {
      text: `${enabled.length} пак. · ${state.records.length} записей · ${storageMode() === 'persistent' ? 'IndexedDB' : 'память вкладки'}`,
    }),
  );
}

function renderSearchEmpty() {
  dom.searchEmpty.replaceChildren();
  if (!state.packRecords.some((record) => record.enabled)) {
    dom.searchEmpty.append(
      create('h2', { text: 'На устройстве пока нет активных знаний' }),
      create('p', { text: 'Откройте каталог, выберите MiniMed или другой пакет и скачайте его. После этого поиск не будет зависеть от сети.' }),
      create('button', { className: 'primary-button', text: 'Открыть каталог', type: 'button' }),
    );
    dom.searchEmpty.querySelector('button').addEventListener('click', () => routeTo('library'));
  } else if (!state.currentQuery) {
    dom.searchEmpty.append(
      create('h2', { text: 'Введите вопрос или термин' }),
      create('p', { text: 'Поиск учитывает заголовки, текст, сокращения, алиасы и опечатки. Нажмите на результат, чтобы увидеть исходный раздел и backlinks.' }),
    );
  }
}

function renderSuggestions() {
  const examples = [
    'грудничок свистит при дыхании',
    'сатурация ниже 90 пневмония',
    'сыпь пошла с лица вниз',
    'ОАМ при температуре без очага',
    'fuzzy serch с опечаткой',
  ];
  const auto = state.currentQuery ? state.search.suggest(state.currentQuery, 3) : [];
  const suggestions = [...new Set([...auto, ...examples])].slice(0, 7);
  dom.searchSuggestions.replaceChildren();
  for (const suggestion of suggestions) {
    const button = create('button', { type: 'button', text: suggestion });
    button.addEventListener('click', () => {
      dom.searchInput.value = suggestion;
      runSearch(suggestion);
    });
    dom.searchSuggestions.append(button);
  }
}

function appendHighlighted(container, text, terms) {
  const ranges = highlightRanges(text, terms);
  if (!ranges.length) {
    container.textContent = text;
    return;
  }
  const merged = [];
