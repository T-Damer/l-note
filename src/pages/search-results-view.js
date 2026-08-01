import { highlightRanges } from '../search.js';
import { Card } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Icon, iconNameForSearchResult } from '../ui/icons.js';
import { Text } from '../ui/text.js';

function appendHighlighted(container, text, terms) {
  const ranges = highlightRanges(text, terms);
  if (!ranges.length) {
    container.textContent = text;
    return;
  }
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  let cursor = 0;
  for (const [start, end] of merged) {
    container.append(document.createTextNode(text.slice(cursor, start)));
    container.append(element('mark', { text: text.slice(start, end) }));
    cursor = end;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

function resultCard({ result, relationLabel, navigate }) {
  const open = () => {
    if (result.kind === 'note') navigate('note', result.noteId);
    else navigate('document', result.documentId, { sectionId: result.sectionId });
  };
  const card = Card({
    kind: 'result',
    className: `result-card${result.kind === 'note' ? ' personal' : ''}`,
    interactive: true,
    ariaLabel: `Открыть ${result.title}`,
    onActivate: open,
  });
  const titleGroup = element('div', {}, [
    Text({ variant: 'title', as: 'h2', text: result.title }),
    element('div', { className: 'document-name', text: result.documentTitle || result.packTitle }),
  ]);
  const typeLabel = result.kind === 'note' ? relationLabel(result.relation) : result.packTitle;
  const typePill = element(
    'span',
    { className: `pill result-type-pill ${result.kind === 'note' ? 'accent' : 'blue'}` },
    [
      Icon({ name: iconNameForSearchResult(result), className: 'result-type-icon' }),
      document.createTextNode(typeLabel),
    ],
  );
  const snippet = element('p');
  appendHighlighted(snippet, result.snippet ?? result.body, result.queryTerms ?? []);
  const footer = element('footer', {}, [
    element('span', {
      className: 'pill muted',
      text: result.kind === 'note' ? 'Личная запись' : 'Справочный источник',
    }),
    element('span', {
      title: 'Относительная релевантность внутри текущей поисковой выдачи, а не вероятность диагноза.',
      text: `релевантность ${result.relevance ?? 0}%`,
    }),
  ]);
  card.append(element('header', {}, [titleGroup, typePill]), snippet, footer);
  return card;
}

export function renderSearchResults({
  results,
  resultsContainer,
  emptyContainer,
  relationLabel,
  navigate,
} = {}) {
  resultsContainer.replaceChildren();
  emptyContainer.replaceChildren();
  if (!results.length) {
    emptyContainer.append(
      Text({ variant: 'title', text: 'Ничего не найдено' }),
      Text({
        variant: 'muted',
        text: 'Попробуйте сократить запрос, использовать сокращение или установить дополнительный пакет знаний.',
      }),
    );
    return;
  }
  resultsContainer.append(...results.map((result) => resultCard({
    result,
    relationLabel,
    navigate,
  })));
}
