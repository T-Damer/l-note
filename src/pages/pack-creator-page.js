import {
  browserPackStats,
  buildPackFromBrowserFiles,
  proposedBrowserPackId,
} from '../services/browser-pack-builder.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

function requireElement(value, label) {
  if (!(value instanceof HTMLElement)) throw new TypeError(`${label} must be an HTML element.`);
  return value;
}

function versionForToday(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 ** 2)).toFixed(1)} МБ`;
}

function virtualMarkdownFile(title, text) {
  const content = String(text ?? '').trim();
  return Object.freeze({
    name: `${proposedBrowserPackId(title).replace(/^user\./u, '') || 'notes'}.md`,
    size: new TextEncoder().encode(content).byteLength,
    async text() {
      return content;
    },
  });
}

function progressText(progress) {
  if (progress.stage === 'reading') {
    return `Чтение ${progress.filename ?? 'файла'} · ${progress.completed + 1}/${progress.total}`;
  }
  if (progress.stage === 'indexing') return 'Разметка разделов и поиск сокращений…';
  if (progress.stage === 'ready') return 'Пакет собран и проверен.';
  return 'Подготовка пакета…';
}

function renderFileSummary(target, files, hasManualText) {
  const names = [...files].map((file) => file.name);
  if (hasManualText) names.push('Вставленный текст');
  target.replaceChildren();
  if (!names.length) {
    target.append(Text({ variant: 'caption', text: 'Добавьте файлы или вставьте текст ниже.' }));
    return;
  }
  target.append(
    Text({ variant: 'label', text: `Источники · ${names.length}` }),
    element('div', { className: 'pack-creator-file-list' }, names.map((name) => (
      element('span', { className: 'pill muted', text: name })
    ))),
  );
}

function renderPackPreview(target, pack) {
  const stats = browserPackStats(pack);
  const metrics = [
    `${stats.documents} документов`,
    `${stats.sections} разделов`,
    `${stats.entities} понятий`,
    formatBytes(stats.bytes),
  ];
  const documents = pack.documents.map((documentRecord) => element('article', {
    className: 'pack-creator-document',
  }, [
    Text({ variant: 'label', as: 'strong', text: documentRecord.title }),
    Text({
      variant: 'caption',
      text: `${documentRecord.sections?.length ?? 0} разделов · ${documentRecord.source?.title ?? 'локальный источник'}`,
    }),
  ]));

  target.replaceChildren(
    Text({ variant: 'eyebrow', text: 'Готовый пакет' }),
    Text({ variant: 'title', as: 'h2', text: pack.title }),
    Text({ variant: 'muted', text: `${pack.id} · ${pack.version} · ${pack.language}` }),
    element('div', { className: 'pack-creator-metrics' }, metrics.map((value) => (
      element('span', { className: 'pill', text: value })
    ))),
    element('div', { className: 'pack-creator-documents' }, documents),
    Text({
      variant: 'caption',
      text: 'Сейчас браузерная подготовка детерминированно сохраняет текст, заголовки и найденные сокращения. Утверждения и связи можно добавить позднее при расширенной подготовке.',
    }),
  );
}

export function createPackCreatorPage({
  form,
  titleInput,
  idInput,
  versionInput,
  descriptionInput,
  languageInput,
  filesInput,
  manualTextInput,
  fileSummary,
  status,
  preview,
  resultActions,
  buildButton,
  resetButton,
  downloadButton,
  installButton,
  backButtons = [],
  onDownload,
  onInstall,
  onBack,
  onError = () => {},
} = {}) {
  const elements = {
    form: requireElement(form, 'form'),
    titleInput: requireElement(titleInput, 'titleInput'),
    idInput: requireElement(idInput, 'idInput'),
    versionInput: requireElement(versionInput, 'versionInput'),
    descriptionInput: requireElement(descriptionInput, 'descriptionInput'),
    languageInput: requireElement(languageInput, 'languageInput'),
    filesInput: requireElement(filesInput, 'filesInput'),
    manualTextInput: requireElement(manualTextInput, 'manualTextInput'),
    fileSummary: requireElement(fileSummary, 'fileSummary'),
    status: requireElement(status, 'status'),
    preview: requireElement(preview, 'preview'),
    resultActions: requireElement(resultActions, 'resultActions'),
    buildButton: requireElement(buildButton, 'buildButton'),
    resetButton: requireElement(resetButton, 'resetButton'),
    downloadButton: requireElement(downloadButton, 'downloadButton'),
    installButton: requireElement(installButton, 'installButton'),
  };
  let currentPack = null;
  let idEdited = Boolean(elements.idInput.value.trim());

  function setStatus(message, type = 'info') {
    elements.status.textContent = message;
    elements.status.classList.toggle('is-error', type === 'error');
    elements.status.classList.toggle('is-success', type === 'success');
  }

  function selectedSources() {
    const files = [...(elements.filesInput.files ?? [])];
    const manualText = elements.manualTextInput.value.trim();
    if (manualText) files.push(virtualMarkdownFile(elements.titleInput.value, manualText));
    return files;
  }

  function syncFiles() {
    renderFileSummary(
      elements.fileSummary,
      elements.filesInput.files ?? [],
      Boolean(elements.manualTextInput.value.trim()),
    );
  }

  function clearResult() {
    currentPack = null;
    elements.preview.replaceChildren();
    elements.preview.hidden = true;
    elements.resultActions.hidden = true;
  }

  function reset() {
    elements.form.reset();
    elements.versionInput.value = versionForToday();
    idEdited = false;
    clearResult();
    syncFiles();
    setStatus('Пакет собирается локально в браузере; исходные файлы никуда не отправляются.');
  }

  async function build(event) {
    event.preventDefault();
    clearResult();
    elements.buildButton.disabled = true;
    try {
      const pack = await buildPackFromBrowserFiles({
        files: selectedSources(),
        title: elements.titleInput.value,
        id: elements.idInput.value,
        version: elements.versionInput.value,
        description: elements.descriptionInput.value,
        language: elements.languageInput.value,
        onProgress: (progress) => setStatus(progressText(progress)),
      });
      currentPack = pack;
      elements.idInput.value = pack.id;
      renderPackPreview(elements.preview, pack);
      elements.preview.hidden = false;
      elements.resultActions.hidden = false;
      setStatus('Пакет готов: скачайте его или установите сразу в L-Note.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, 'error');
      onError(message);
    } finally {
      elements.buildButton.disabled = false;
    }
  }

  elements.titleInput.addEventListener('input', () => {
    if (!idEdited) elements.idInput.value = proposedBrowserPackId(elements.titleInput.value);
  });
  elements.idInput.addEventListener('input', () => {
    idEdited = Boolean(elements.idInput.value.trim());
  });
  elements.filesInput.addEventListener('change', syncFiles);
  elements.manualTextInput.addEventListener('input', syncFiles);
  elements.form.addEventListener('submit', build);
  elements.resetButton.addEventListener('click', reset);
  elements.downloadButton.addEventListener('click', () => currentPack && onDownload?.(currentPack));
  elements.installButton.addEventListener('click', async () => {
    if (!currentPack) return;
    elements.installButton.disabled = true;
    try {
      await onInstall?.(currentPack);
      setStatus('Пакет установлен и включён в локальный поиск.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, 'error');
      onError(message);
    } finally {
      elements.installButton.disabled = false;
    }
  });
  for (const button of backButtons) button.addEventListener('click', () => onBack?.());

  reset();
  return Object.freeze({
    reset,
    get currentPack() {
      return currentPack;
    },
  });
}
