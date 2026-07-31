import { Button, Card } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { Text } from '../ui/text.js';

function entityTerms(entity) {
  return [entity.name, ...(entity.aliases ?? [])]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function appendLinkedText({ container, text, entityIds, knowledge, normalizeText, navigate }) {
  const entities = entityIds.map((id) => knowledge.entities.get(id)).filter(Boolean);
  const candidates = entities.flatMap((entity) => (
    entityTerms(entity).map((term) => ({ term, entity }))
  ));
  candidates.sort((left, right) => right.term.length - left.term.length);
  if (!candidates.length) {
    container.textContent = text;
    return;
  }

  const escaped = candidates.map(({ term }) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'giu');
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    container.append(document.createTextNode(text.slice(cursor, index)));
    const matched = match[0];
    const candidate = candidates.find(({ term }) => normalizeText(term) === normalizeText(matched));
    if (candidate) {
      container.append(Button({
        variant: 'ghost',
        className: 'entity-link',
        text: matched,
        onClick: () => navigate('concept', candidate.entity.id),
      }));
    } else {
      container.append(document.createTextNode(matched));
    }
    cursor = index + matched.length;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

function claimsForSection(knowledge, documentId, sectionId) {
  return [...knowledge.claims.values()].filter((claim) => (
    claim.source?.documentId === documentId && claim.source?.sectionId === sectionId
  ));
}

function renderClaim({ claim, navigate }) {
  const card = Card({ kind: 'statement', className: 'claim-card' });
  const openClaim = Button({
    variant: 'ghost',
    className: 'claim-open-button',
    text: claim.text,
    onClick: () => navigate('statement', claim.id),
  });
  const addNote = Button({
    variant: 'secondary',
    text: 'Добавить наблюдение',
    onClick: () => navigate('note', 'new', { claimId: claim.id }),
  });
  card.append(
    openClaim,
    element('footer', {}, [
      element('span', {
        className: 'pill',
        text: claim.authority === 'reference'
          ? 'Утверждение источника'
          : claim.authority ?? 'Утверждение',
      }),
      addNote,
    ]),
  );
  return card;
}

function renderSection({ section, documentRecord, knowledge, normalizeText, navigate }) {
  const article = element('article', {
    className: 'document-section',
    id: `section-${section.id}`,
  });
  const paragraph = element('p');
  appendLinkedText({
    container: paragraph,
    text: section.text,
    entityIds: section.entityIds ?? [],
    knowledge,
    normalizeText,
    navigate,
  });
  article.append(Text({ variant: 'heading', as: 'h3', text: section.title }), paragraph);

  const claims = claimsForSection(knowledge, documentRecord.id, section.id);
  if (claims.length) {
    article.append(element('div', { className: 'claim-list' }, (
      claims.map((claim) => renderClaim({ claim, navigate }))
    )));
  }
  return article;
}

function renderExternalSource(source) {
  if (!source?.url) return null;
  return element('a', {
    className: 'source-link button-with-icon',
    href: source.url,
    target: '_blank',
    rel: 'noreferrer',
  }, [
    Icon({ name: 'external' }),
    document.createTextNode('Открыть внешний первоисточник'),
  ]);
}

export function renderDocumentResource({
  record,
  knowledge,
  dialogView,
  navigate,
  findDocumentForSection,
  normalizeText,
} = {}) {
  const documentRecord = findDocumentForSection(knowledge, record);
  if (!documentRecord) return false;

  dialogView.replaceHeading([
    Text({ variant: 'eyebrow', text: documentRecord.packTitle }),
    Text({ variant: 'title', as: 'h2', text: documentRecord.title }),
    Text({ variant: 'muted', text: documentRecord.source?.title ?? 'Локальный источник' }),
  ]);
  const body = [];
  if (documentRecord.summary) {
    body.push(Text({ variant: 'body', className: 'document-summary', text: documentRecord.summary }));
  }
  for (const section of documentRecord.sections ?? []) {
    body.push(renderSection({
      section,
      documentRecord,
      knowledge,
      normalizeText,
      navigate,
    }));
  }
  body.push(renderExternalSource(documentRecord.source));
  dialogView.replaceBody(body.filter(Boolean));
  dialogView.show();

  if (record.sectionId) {
    queueMicrotask(() => {
      const escaped = globalThis.CSS?.escape?.(record.sectionId) ?? record.sectionId;
      dialogView.scrollTo(`#section-${escaped}`);
    });
  }
  return true;
}
