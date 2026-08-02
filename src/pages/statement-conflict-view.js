import { diffTextSegments } from '../helpers/text-diff.js';
import { statementRelationLabel } from '../helpers/statement-conflicts.js';
import { Button, Card } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { Text } from '../ui/text.js';

function formattedDate(value) {
  if (!value) return 'дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function appendDiff(container, segments) {
  for (const segment of segments) {
    const node = segment.changed
      ? element('mark', { className: 'statement-conflict-change', text: segment.text })
      : document.createTextNode(segment.text);
    container.append(node);
  }
}

function orderedSides(conflict, currentClaimRefs) {
  const refs = new Set(currentClaimRefs ?? []);
  if (refs.has(conflict.target.claimRef) && !refs.has(conflict.source.claimRef)) {
    return [conflict.target, conflict.source];
  }
  return [conflict.source, conflict.target];
}

function renderSide(side, segments, navigate, label) {
  const card = Card({ kind: 'source', className: 'statement-conflict-side' });
  const heading = element('header', { className: 'statement-conflict-side__header' }, [
    Text({ variant: 'eyebrow', text: label }),
    Text({ variant: 'title', as: 'h4', text: side.documentTitle }),
    Text({
      variant: 'caption',
      text: `${side.packTitle} · ${formattedDate(side.date)}`,
    }),
  ]);
  const quote = element('blockquote', { className: 'statement-conflict-quote' });
  appendDiff(quote, segments);
  const open = Button({
    variant: 'ghost',
    icon: 'document',
    text: 'Открыть документ',
    onClick: () => navigate('document', side.claim.source.documentId, {
      sectionId: side.sectionId,
    }),
  });
  card.append(heading, quote, open);
  return card;
}

function renderConflict(conflict, currentClaimRefs, navigate) {
  const [left, right] = orderedSides(conflict, currentClaimRefs);
  const diff = diffTextSegments(left.quote, right.quote);
  const root = element('article', { className: 'statement-conflict-comparison' });
  const meta = element('header', { className: 'statement-conflict-comparison__header' }, [
    Text({ variant: 'label', text: statementRelationLabel(conflict.type) }),
    Text({
      variant: 'caption',
      text: conflict.status === 'proposed'
        ? 'Предложено при подготовке пакета'
        : 'Зафиксировано при подготовке пакета',
    }),
  ]);
  if (conflict.reason) meta.append(Text({ variant: 'muted', text: conflict.reason }));
  root.append(
    meta,
    element('div', { className: 'statement-conflict-diff' }, [
      renderSide(left, diff.left, navigate, 'Сведение A'),
      renderSide(right, diff.right, navigate, 'Сведение B'),
    ]),
  );
  return root;
}

export function createStatementConflictDisclosure({
  id,
  conflicts = [],
  currentClaimRefs = [],
  navigate,
  expanded = false,
} = {}) {
  const panelId = String(id ?? `statement-conflict-${Math.random().toString(36).slice(2)}`);
  const panel = element('section', {
    className: 'statement-conflict-panel',
    id: panelId,
    hidden: !expanded,
  });
  panel.append(
    element('header', { className: 'statement-conflict-panel__header' }, [
      Icon({ name: 'conflict', label: 'Разные сведения' }),
      element('div', {}, [
        Text({ variant: 'heading', as: 'h3', text: 'В источниках есть разные сведения' }),
        Text({
          variant: 'muted',
          text: conflicts.length > 1
            ? `Найдено сопоставлений: ${conflicts.length}. L-Note показывает все версии и не выбирает одну автоматически.`
            : 'L-Note показывает обе версии и не выбирает одну автоматически.',
        }),
      ]),
    ]),
  );
  for (const conflict of conflicts) {
    panel.append(renderConflict(conflict, currentClaimRefs, navigate));
  }

  const marker = Button({
    variant: 'icon',
    icon: 'conflict',
    iconLabel: 'Показать разные сведения',
    className: 'statement-conflict-marker',
    title: conflicts.length > 1
      ? `Есть разные сведения (${conflicts.length})`
      : 'Есть разные сведения',
    onClick() {
      const nextExpanded = panel.hidden;
      panel.hidden = !nextExpanded;
      marker.setAttribute('aria-expanded', String(nextExpanded));
      if (nextExpanded) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  });
  marker.setAttribute('aria-controls', panelId);
  marker.setAttribute('aria-expanded', String(Boolean(expanded)));
  return { marker, panel };
}
