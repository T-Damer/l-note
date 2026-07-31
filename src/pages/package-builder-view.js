import {
  BROWSER_PACK_EXTENSIONS,
  buildPackFromBrowserFiles,
  browserPackStats,
  proposedBrowserPackId,
} from '../services/browser-pack-builder.js';
import { Button, Field } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

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

function versionForToday(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function textInput({ value = '', placeholder = '', required = false, maxLength = 180 } = {}) {
  return element('input', { type: 'text', value, placeholder, required, maxLength });
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

function sourceSummary(files, manualText) {
  const selected = [...(files ?? [])];
  const manualSize = new TextEncoder().encode(String(manualText ?? '').trim()).byteLength;
  const count = selected.length + (manualSize ? 1 : 0);
  if (!count) return 'Добавьте файлы или вставьте текст.';
  const total = selected.reduce((sum, file) => sum + Number(file.size ?? 0), manualSize);
  return `${count} источник(а) · ${formatBytes(total)}`;
}

function progressText(progress) {
  if (progress.stage === 'reading') return `Чтение: ${progress.filename ?? 'файл'}`;
  if (progress.stage === 'indexing') return 'Разметка разделов и поиск сокращений…';
  if (progress.stage === 'ready') return 'Пакет собран и проверен.';
  return 'Подготовка…';
}

function progressValue(progress) {
  if (progress.stage === 'ready') return 1;
  if (progress.stage === 'indexing') return .9;
  const total = Math.max(1, Number(progress.total ?? 1));
  return Math.min(.82, Math.max(.04, (Number(progress.completed ?? 0) + .25) / total * .82));
}

function renderStats(container, pack) {
  const stats = browserPackStats(pack);
  const documents = pack.documents.slice(0, 12).map((documentRecord) => element('article', {
    className: 'pack-builder-document',
  }, [
    Text({ variant: 'label', as: 'strong', text: documentRecord.title }),
    Text({
      variant: 'caption',
      text: `${documentRecord.sections?.length ?? 0} разделов · ${documentRecord.source?.title ?? 'локальный источник'}`,
    }),
  ]));
  container.replaceChildren(
    Text({ variant: 'label', text: pack.title }),
    element('div', { className: 'pack-builder-stats' }, [
      element('span', { className: 'pill muted', text: `${stats.documents} документов` }),
      element('span', { className: 'pill muted', text: `${stats.sections} разделов` }),
      element('span', { className: 'pill muted', text: `${stats.entities} понятий` }),
      element('span', { className: 'pill muted', text: formatBytes(stats.bytes) }),
    ]),
    element('div', { className: 'pack-builder-documents' }, documents),
    Text({
      variant: 'caption',
      text: stats.entities
        ? 'Явные сокращения уже связаны с разделами. Утверждения и сложные связи можно добавить при последующей LLM-подготовке.'
        : 'Документы готовы для локального поиска. Сложную LLM-разметку можно добавить позднее на более мощном устройстве.',
    }),
  );
  container.hidden = false;
}

export function renderPackageBuilderResource({ dialogView, onInstall, onDownload } = {}) {
  if (!dialogView?.replaceBody || !dialogView?.show) throw new TypeError('A routed dialog view is required.');
  if (typeof onInstall !== 'function' || typeof onDownload !== 'function') {
    throw new TypeError('Package builder actions are required.');
  }

  const title = textInput({ placeholder: 'Например: Мой рабочий справочник', required: true, maxLength: 160 });
  const id = textInput({ placeholder: 'user.moy-spravochnik' });
  const version = textInput({ value: versionForToday(), required: true, maxLength: 64 });
  const language = element('select', {}, [
    element('option', { value: 'ru', text: 'Русский' }),
    element('option', { value: 'en', text: 'English' }),
    element('option', { value: 'multi', text: 'Несколько языков' }),
  ]);
  const description = element('textarea', {
    rows: 3,
    value: 'Пользовательский пакет знаний',
    placeholder: 'Кратко опишите содержимое пакета',
    maxLength: 1200,
  });
  const files = element('input', {
    type: 'file',
    multiple: true,
    accept: BROWSER_PACK_EXTENSIONS.join(','),
  });
  const manualText = element('textarea', {
    rows: 7,
    placeholder: '# Заголовок документа\n\n## Раздел\nТекст, который должен войти в локальную базу знаний.',
  });
  const selectedSources = Text({ variant: 'caption', text: sourceSummary(files.files, manualText.value) });
  const status = Text({ variant: 'muted', text: 'Все данные обрабатываются локально и не отправляются на сервер.' });
  const progress = element('progress', { className: 'pack-builder-progress', max: 1, value: 0, hidden: true });
  const preview = element('section', { className: 'pack-builder-preview', hidden: true });
  const buildButton = Button({ variant: 'primary', icon: 'package', text: 'Собрать пакет' });
  const resetButton = Button({ variant: 'secondary', text: 'Очистить' });
  const installButton = Button({ variant: 'primary', icon: 'download', text: 'Установить и открыть', hidden: true });
  const downloadButton = Button({ variant: 'secondary', icon: 'download', text: 'Скачать JSON', hidden: true });
  let builtPack = null;
  let idEdited = false;

  const setStatus = (message, type = 'info') => {
    status.textContent = message;
    status.classList.toggle('is-error', type === 'error');
    status.classList.toggle('is-success', type === 'success');
  };
  const setBusy = (busy) => {
    for (const control of [buildButton, resetButton, installButton, downloadButton, title, id, version, language, description, files, manualText]) {
      control.disabled = busy;
    }
  };
  const clearResult = () => {
    builtPack = null;
    preview.hidden = true;
    preview.replaceChildren();
    installButton.hidden = true;
    downloadButton.hidden = true;
  };
  const sourceFiles = () => {
    const list = [...(files.files ?? [])];
    if (manualText.value.trim()) list.push(virtualMarkdownFile(title.value, manualText.value));
    return list;
  };
  const syncSources = () => {
    selectedSources.textContent = sourceSummary(files.files, manualText.value);
    clearResult();
    setStatus('Источники изменены. Соберите пакет заново.');
  };

  title.addEventListener('input', () => {
    if (!idEdited) id.value = proposedBrowserPackId(title.value);
  });
  id.addEventListener('input', () => {
    idEdited = Boolean(id.value.trim());
  });
  files.addEventListener('change', syncSources);
  manualText.addEventListener('input', syncSources);
  resetButton.addEventListener('click', () => {
    title.value = '';
    id.value = '';
    version.value = versionForToday();
    language.value = 'ru';
    description.value = 'Пользовательский пакет знаний';
    files.value = '';
    manualText.value = '';
    idEdited = false;
    progress.hidden = true;
    clearResult();
    selectedSources.textContent = sourceSummary([], '');
    setStatus('Все данные обрабатываются локально и не отправляются на сервер.');
  });

  buildButton.addEventListener('click', async () => {
    setBusy(true);
    clearResult();
    progress.hidden = false;
    progress.value = 0;
    setStatus('Подготовка пакета…');
    try {
      builtPack = await buildPackFromBrowserFiles({
        files: sourceFiles(),
        id: id.value,
        version: version.value,
        title: title.value,
        description: description.value,
        language: language.value,
        onProgress(update) {
          progress.value = progressValue(update);
          setStatus(progressText(update));
        },
      });
      title.value = builtPack.title;
      id.value = builtPack.id;
      version.value = builtPack.version;
      language.value = builtPack.language;
      renderStats(preview, builtPack);
      installButton.hidden = false;
      downloadButton.hidden = false;
      setStatus('Пакет готов: скачайте JSON или установите его сразу.', 'success');
    } catch (error) {
      clearResult();
      setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setBusy(false);
    }
  });
  installButton.addEventListener('click', async () => {
    if (!builtPack) return;
    setBusy(true);
    setStatus('Установка пакета в локальную библиотеку…');
    try {
      await onInstall(builtPack);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error');
      setBusy(false);
    }
  });
  downloadButton.addEventListener('click', () => builtPack && onDownload(builtPack));

  const root = element('section', { className: 'pack-builder' }, [
    Text({
      variant: 'muted',
      text: 'Выберите Markdown, TXT или JSON либо вставьте текст. L-Note разобьёт материалы на разделы, найдёт явные сокращения и соберёт пакет без сети.',
    }),
    element('div', { className: 'pack-builder-grid' }, [
      Field({ label: 'Название', control: title, required: true }),
      Field({ label: 'ID пакета', control: id, hint: 'Можно оставить автоматически предложенное значение.' }),
      Field({ label: 'Версия', control: version, required: true }),
      Field({ label: 'Язык', control: language, required: true }),
    ]),
    Field({ label: 'Описание', control: description }),
    Field({
      label: 'Исходные файлы',
      control: files,
      hint: 'До 32 МБ на файл и 64 МБ суммарно. Большие корпуса лучше готовить через CLI.',
    }),
    selectedSources,
    Field({ label: 'Или вставьте текст', control: manualText }),
    progress,
    status,
    preview,
    element('div', { className: 'pack-builder-actions' }, [buildButton, resetButton, installButton, downloadButton]),
  ]);

  dialogView.replaceHeading([
    Text({ variant: 'eyebrow', text: 'Локальная подготовка' }),
    Text({ variant: 'title', as: 'h2', text: 'Создать свой пакет' }),
    Text({ variant: 'muted', text: 'Детерминированная сборка без передачи файлов наружу' }),
  ]);
  dialogView.replaceBody([root]);
  dialogView.show();
  return true;
}
