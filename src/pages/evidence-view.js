import { SourceCard } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

function renderOverview(evidence) {
  const overview = element('article', { className: 'answer-panel' }, [
    Text({ variant: 'title', text: 'Доказательная сводка' }),
    Text({
      variant: 'muted',
      text: evidence.sources.length
        ? `Найдено ${evidence.sources.length} справочных фрагментов и ${evidence.relatedNotes.length} личных заметок. Генеративная модель пока не использовалась.`
        : 'В активных пакетах не найдено достаточных справочных фрагментов.',
    }),
  ]);
  if (!evidence.conflicts.length) return overview;

  const conflict = element('div', { className: 'conflict-box' }, [
    element('strong', { text: 'Обнаружены локальные противоречия' }),
  ]);
  for (const item of evidence.conflicts) {
    conflict.append(element('p', {
      text: `${item.note.title}${item.claim ? ` ↔ ${item.claim.text}` : ''}`,
    }));
  }
  overview.append(conflict);
  return overview;
}

function renderSources(evidence, onOpenSource) {
  const panel = element('article', { className: 'answer-panel' }, [
    Text({ variant: 'title', as: 'h2', text: 'Источники' }),
  ]);
  for (const source of evidence.sources) {
    panel.append(SourceCard({
      sourceId: source.id,
      title: `${source.result.documentTitle} — ${source.result.title}`,
      type: source.document?.source?.title ?? source.result.packTitle ?? 'Справочный источник',
      excerpt: `${source.result.body.slice(0, 340)}${source.result.body.length > 340 ? '…' : ''}`,
      onOpen: () => onOpenSource?.(source),
    }));
  }
  if (!evidence.sources.length) {
    panel.append(Text({ variant: 'muted', text: 'Нет справочных источников для ответа.' }));
  }
  return panel;
}

function renderPersonalNotes(evidence, relationLabel) {
  if (!evidence.relatedNotes.length) return null;
  const list = element('ul');
  for (const note of evidence.relatedNotes) {
    list.append(element('li', {}, [
      element('strong', { text: `${relationLabel(note.relation)}: ` }),
      document.createTextNode(`${note.title} — ${note.body.slice(0, 260)}`),
    ]));
  }
  return element('article', { className: 'answer-panel' }, [
    Text({ variant: 'title', as: 'h2', text: 'Личный слой' }),
    list,
  ]);
}

export function renderEvidenceView({ evidence, output, onOpenSource, relationLabel }) {
  if (!(output instanceof HTMLElement)) {
    throw new TypeError('renderEvidenceView requires an output element.');
  }
  if (!evidence || !Array.isArray(evidence.sources)) {
    throw new TypeError('renderEvidenceView requires an evidence envelope.');
  }
  if (typeof relationLabel !== 'function') {
    throw new TypeError('renderEvidenceView requires a relation-label formatter.');
  }

  output.replaceChildren(
    renderOverview(evidence),
    renderSources(evidence, onOpenSource),
  );
  const notes = renderPersonalNotes(evidence, relationLabel);
  if (notes) output.append(notes);
  return output;
}
