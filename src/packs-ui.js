import { validatePack } from './core.js';
import { installPack, removePack } from './db.js';
import { catalogUrl, state } from './state.js';
import { $, clear, formatBytes, node, setBusy, toast } from './ui.js';

let onKnowledgeChanged = async () => {};

export function configurePacksUI(options = {}) {
  onKnowledgeChanged = options.onKnowledgeChanged ?? onKnowledgeChanged;
}

export async function loadCatalog() {
  try {
    const response = await fetch(catalogUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = await response.json();
    state.catalog = Array.isArray(catalog.packs) ? catalog.packs : [];
  } catch (error) {
    console.error(error);
    state.catalog = [];
    toast(
      'Каталог недоступен. Установленные пакеты и импорт файлов продолжают работать офлайн.',
      'warning',
    );
  }
}

async function installCatalogPack(item, button) {
  setBusy(button, true, 'Скачивание…');
  try {
    const url = new URL(item.url, catalogUrl);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const pack = await response.json();
    const stats = await installPack(pack, url.href);
    await navigator.storage?.persist?.();
    await onKnowledgeChanged();
    renderPacks();
    toast(
      `Пакет установлен: ${stats.documents} документов, ${stats.chunks} фрагментов.`,
      'success',
    );
  } catch (error) {
    console.error(error);
    toast(`Не удалось установить пакет: ${error.message}`, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function uninstallPack(packId, button) {
  setBusy(button, true, 'Удаление…');
  try {
    await removePack(packId);
    state.searchResults = state.searchResults.filter((result) => result.packId !== packId);
    await onKnowledgeChanged();
    renderPacks();
    toast('Пакет удалён с устройства.', 'success');
  } catch (error) {
    console.error(error);
    toast(`Не удалось удалить пакет: ${error.message}`, 'error');
  } finally {
    setBusy(button, false);
  }
}

export function renderPacks() {
  const container = clear($('#pack-catalog'));
  const installedById = new Map(state.installed.map((pack) => [pack.id, pack]));

  if (!state.catalog.length && !state.installed.length) {
    container.append(
      node(
        'div',
        { class: 'empty-card' },
        node('h3', {}, 'Каталог пока недоступен'),
        node('p', {}, 'Можно импортировать локальный файл .json в формате L-Note Pack.'),
      ),
    );
  }

  for (const item of state.catalog) {
    const installed = installedById.get(item.id);
    const action = node(
      'button',
      {
        class: installed ? 'button button--ghost' : 'button button--primary',
        type: 'button',
        onclick: (event) =>
          installed
            ? uninstallPack(item.id, event.currentTarget)
            : installCatalogPack(item, event.currentTarget),
      },
      installed ? 'Удалить с устройства' : 'Скачать на устройство',
    );
    container.append(
      node(
        'article',
        { class: 'pack-card' },
        node(
          'div',
          { class: 'pack-card__top' },
          node('span', { class: 'eyebrow' }, item.domain ?? 'knowledge pack'),
          installed
            ? node('span', { class: 'status-pill status-pill--installed' }, 'установлен')
            : null,
        ),
        node('h3', {}, item.title),
        node('p', {}, item.description),
        node(
          'div',
          { class: 'meta-row' },
          node('span', {}, item.language?.toUpperCase() ?? '—'),
          node('span', {}, item.version ?? '—'),
          node('span', {}, formatBytes(item.sizeBytes)),
        ),
        node(
          'div',
          { class: 'tag-row' },
          ...(item.tags ?? []).map((tag) => node('span', { class: 'tag' }, tag)),
        ),
        node('div', { class: 'pack-card__actions' }, action),
      ),
    );
  }

  for (const installed of state.installed) {
    if (state.catalog.some((item) => item.id === installed.id)) continue;
    container.append(
      node(
        'article',
        { class: 'pack-card' },
        node(
          'div',
          { class: 'pack-card__top' },
          node('span', { class: 'eyebrow' }, 'импортированный пакет'),
        ),
        node('h3', {}, installed.title),
        node('p', {}, installed.description || 'Локально импортированный набор знаний.'),
        node(
          'div',
          { class: 'meta-row' },
          node('span', {}, installed.version),
          node('span', {}, installed.language),
        ),
        node(
          'button',
          {
            class: 'button button--ghost',
            type: 'button',
            onclick: (event) => uninstallPack(installed.id, event.currentTarget),
          },
          'Удалить с устройства',
        ),
      ),
    );
  }
}

export async function importPackFile(file) {
  if (!file) return;
  try {
    const pack = JSON.parse(await file.text());
    validatePack(pack);
    await installPack(pack, null);
    await navigator.storage?.persist?.();
    await onKnowledgeChanged();
    renderPacks();
    toast(`Импортирован пакет «${pack.manifest.title}».`, 'success');
  } catch (error) {
    console.error(error);
    toast(`Файл не установлен: ${error.message}`, 'error');
  } finally {
    $('#pack-file').value = '';
  }
}
