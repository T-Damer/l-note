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

function textInput({ value = '', placeholder = '', required = false } = {}) {
  return element('input', { type: 'text', value, placeholder, required });
}

function fileSummary(files) {
  const selected = [...(files ?? [])];
  if (!selected.length) return 'Файлы ещё не выбраны.';
  const total = selected.reduce((sum, file) => sum + Number(file.size ?? 0), 0);
  return `${selected.length} файл(а) · ${formatBytes(total)}`;
}

function progressText(progress) {
  if (progress.stage === 'reading') return `Чтение: ${progress.filename ?? 'файл'}`;
  if (progress.stage === 'indexing') return 'Поиск сокращений и построение локального индекса…';
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
  container.replaceChildren(
    Text({ variant: 'label', text: pack.title }),
    element('div', { className: 'pack-builder-stats' }, [
      element('span', { className: 'pill muted', text: `${stats.documents} документов` }),
      element('span', { className: 'pill muted', text: `${stats.sections} разделов` }),
      element('span', { className: 'pill muted', text: `${stats.entities} понятий` }),
      element('span', { className: 'pill muted', text: formatBytes(stats.bytes) }),
    ]),
    Text({
      variant: 'caption',
      text: stats.entities
        ? 'Сокращения, найденные в тексте, уже связаны с разделами. Утверждения и сложные связи можно добавить при последующей LLM-подготовке.'
        : 'Документы готовы для локального поиска. Сложную LLM-разметку можно добавить позднее на более мощном устройстве.',
    }),
  );
  container.hidden = false;
}

export function renderPackageBuilderResource({
  dialogView,
  onInstall,
  onDownload,
} = {}) {
  if (!dialogView?.replaceBody || !dialogView?.show) throw new TypeError('A routed dialog view is required.');
  if (typeof onInstall !== 'function' || typeof onDownload !== 'function') {
    throw new TypeError('Package builder actions are required.');
  }

  const title = textInput({ placeholder: 'Например: Мой рабочий справочник', required: true });
  const id = textInput({ placeholder: 'user.moy-spravochnik' });
  const version = textInput({ value: '1.0.0', required: true });
  const language = textInput({ value: 'ru', required: true });
  const description = element('textarea', {
    rows: 3,
    value: 'Пользовательский пакет знаний',
    placeholder: 'Кратко опишите содержимое пакета',
  });
  const files = element('input', {
    type: 'file',
    multiple: true,
    accept: BROWSER_PACK_EXTENSIONS.join(','),
  });
  const selectedFiles = Text({ variant: 'caption', text: fileSummary(files.files) });
  const status = Text({ variant: 'muted', text: 'Все данные обрабатываются локально и не отправляются на сервер.' });
  const progress = element('progress', { className: 'pack-builder-progress', max: 1, value: 0, hidden: true });
  const preview = element('section', { className: 'pack-builder-preview', hidden: true });
  const buildButton = Button({ variant: 'primary', icon: 'package', text: 'Собрать пакет' });
  const installButton = Button({
    variant: 'primary',
    icon: 'download',
    text: 'Установить и открыть',
    hidden: true,
  });
  const downloadButton = Button({
    variant: 'secondary',
    icon: 'download',
    text: 'Скачать JSON',
    hidden: true,
  });
  let builtPack = null;
  let idEdited = false;

  const setBusy = (busy) => {
    buildButton.disabled = busy;
    installButton.disabled = busy;
    downloadButton.disabled = busy;
    title.disabled = busy;
    id.disabled = busy;
    version.disabled = busy;
    language.disabled = busy;
    description.disabled = busy;
    files.disabled = busy;
  };

  title.addEventListener('input', () => {
    if (!idEdited) id.value = proposedBrowserPackId(title.value);
  });
  id.addEventListener('input', () => {
    idEdited = true;
  });
  files.addEventListener('change', () => {
    selectedFiles.textContent = fileSummary(files.files);
    builtPack = null;
    preview.hidden = true;
    installButton.hidden = true;
    downloadButton.hidden = true;
    status.textContent = 'Файлы выбраны. Сборка выполняется локально в браузере.';
  });

  buildButton.addEventListener('click', async () => {
    setBusy(true);
    progress.hidden = false;
    progress.value = 0;
    status.textContent = 'Подготовка пакета…';
    try {
      builtPack = await buildPackFromBrowserFiles({
        files: files.files,
        id: id.value,
        version: version.value,
        title: title.value,
        description: description.value,
        language: language.value,
        onProgress(update) {
          progress.value = progressValue(update);
          status.textContent = progressText(update);
        },
      });
      title.value = builtPack.title;
      id.value = builtPack.id;
      version.value = builtPack.version;
      language.value = builtPack.language;
      renderStats(preview, builtPack);
      installButton.hidden = false;
      downloadButton.hidden = false;
    } catch (error) {
      builtPack = null;
      preview.hidden = true;
      installButton.hidden = true;
      downloadButton.hidden = true;
      status.textContent = error instanceof Error ? error.message : String(error);
      status.classList.add('is-error');
    } finally {
      setBusy(false);
    }
  });

  installButton.addEventListener('click', async () => {
    if (!builtPack) return;
    setBusy(true);
    status.textContent = 'Установка пакета в локальную библиотеку…';
    try {
      await onInstall(builtPack);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      status.classList.add('is-error');
      setBusy(false);
    }
  });
  downloadButton.addEventListener('click', () => builtPack && onDownload(builtPack));

  const root = element('section', { className: 'pack-builder' }, [
    Text({
      variant: 'muted',
      text: 'Выберите Markdown, TXT или JSON. L-Note разобьёт документы на разделы, найдёт явные сокращения и соберёт устанавливаемый пакет без сети.',
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
    selectedFiles,
    progress,
    status,
    preview,
    element('div', { className: 'pack-builder-actions' }, [buildButton, installButton, downloadButton]),
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
