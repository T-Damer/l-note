import { TRANSFER_STATUS } from '../services/transfer-queue.js';
import { Button } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { Text } from '../ui/text.js';

const STATUS_LABELS = Object.freeze({
  [TRANSFER_STATUS.QUEUED]: 'В очереди',
  [TRANSFER_STATUS.ACTIVE]: 'Загружается',
  [TRANSFER_STATUS.INTERRUPTED]: 'Нужно продолжить',
  [TRANSFER_STATUS.FAILED]: 'Не завершено',
  [TRANSFER_STATUS.CANCELLED]: 'Отменено',
});

const KIND_ICONS = Object.freeze({
  package: 'package',
  model: 'model',
  'speech-model': 'microphone',
  document: 'document',
});

function formatBytes(value) {
  if (!Number.isFinite(value)) return null;
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function progressText(task) {
  const loaded = formatBytes(task.loaded);
  const total = formatBytes(task.total);
  if (loaded && total) return `${loaded} / ${total}`;
  if (loaded) return loaded;
  return `${Math.round((task.progress ?? 0) * 100)}%`;
}

function actionButtons(task, queue) {
  const values = [];
  if ([TRANSFER_STATUS.QUEUED, TRANSFER_STATUS.ACTIVE].includes(task.status)) {
    values.push(Button({
      variant: 'secondary',
      icon: 'close',
      text: 'Отменить',
      onClick: () => queue.cancel(task.id),
    }));
  }
  if ([TRANSFER_STATUS.INTERRUPTED, TRANSFER_STATUS.FAILED, TRANSFER_STATUS.CANCELLED].includes(task.status)) {
    values.push(Button({
      variant: 'secondary',
      icon: 'retry',
      text: task.status === TRANSFER_STATUS.INTERRUPTED ? 'Продолжить' : 'Повторить',
      onClick: () => queue.retry(task.id),
    }));
    values.push(Button({
      variant: 'ghost',
      text: 'Убрать',
      onClick: () => queue.remove(task.id),
    }));
  }
  return values;
}

function transferItem(task, queue) {
  const progress = Math.round(Math.max(0, Math.min(1, task.progress ?? 0)) * 100);
  return element('article', { className: `transfer-item is-${task.status}` }, [
    element('header', {}, [
      element('span', { className: 'transfer-item__icon' }, [
        Icon({ name: KIND_ICONS[task.kind] ?? 'download' }),
      ]),
      element('div', { className: 'transfer-item__copy' }, [
        Text({ variant: 'label', as: 'strong', text: task.label }),
        Text({
          variant: 'caption',
          text: `${STATUS_LABELS[task.status] ?? task.status} · ${task.message ?? progressText(task)}`,
        }),
      ]),
      element('span', { className: 'pill muted', text: progressText(task) }),
    ]),
    element('div', {
      className: 'transfer-progress',
      role: 'progressbar',
      'aria-label': task.label,
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(progress),
    }, [element('span', { style: { width: `${progress}%` } })]),
    task.error ? Text({ variant: 'caption', className: 'transfer-item__error', text: task.error }) : null,
    element('footer', {}, actionButtons(task, queue)),
  ].filter(Boolean));
}

export function createTransferQueueView({ queue, container } = {}) {
  if (!queue?.subscribe) throw new TypeError('Transfer queue is required.');
  if (!(container instanceof HTMLElement)) throw new TypeError('Transfer queue container is required.');
  const count = Text({ variant: 'caption', text: '' });
  const heading = element('header', { className: 'transfer-queue-heading' }, [
    element('div', {}, [
      Text({ variant: 'heading', as: 'h2', text: 'Загрузки' }),
    ]),
    count,
  ]);
  const list = element('div', { className: 'transfer-list' });
  const panel = element('section', { className: 'transfer-queue-panel', hidden: true }, [heading, list]);
  container.append(panel);

  const unsubscribe = queue.subscribe((tasks) => {
    const visible = tasks
      .filter((task) => task.status !== TRANSFER_STATUS.COMPLETED)
      .slice(0, 8);
    panel.hidden = visible.length === 0;
    count.textContent = visible.length === 1 ? '1 операция' : `${visible.length} операций`;
    list.replaceChildren(...visible.map((task) => transferItem(task, queue)));
  });
  return Object.freeze({ panel, destroy: unsubscribe });
}
