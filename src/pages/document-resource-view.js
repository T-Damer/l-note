import { entityTerms } from '../helpers/entity-terms.js';
import {
  buildStatementConflictIndex,
  sectionConflictAnnotations,
  statementsForSection,
} from '../helpers/statement-conflicts.js';
import { Button, Card } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Icon } from '../ui/icons.js';
import { Text } from '../ui/text.js';
import { createDocumentAssetView } from './document-asset-view.js';
import { createStatementConflictDisclosure } from './statement-conflict-view.js';

function entitySpans({ text, entityIds, knowledge, normalizeText }) {
  const entities = entityIds.map((id) => knowledge.entities.get(id)).filter(Boolean);
  const candidates = entities.flatMap((entity) => (
    entityTerms(entity).map((term) => ({ term, entity }))
  ));
  candidates.sort((left, right) => right.term.length - left.term.length);
  if (!candidates.length) return [];

  const escaped = candidates.map(({ term }) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'giu');
  return [...text.matchAll(pattern)].map((match) => {
    const matched = match[0];
    const candidate = candidates.find(({ term }) => normalizeText(term) === normalizeText(matched));
    return candidate ? {
      start: match.index ?? 0,
      end: (match.index ?? 0) + matched.length,
      entity: candidate.entity,
    } : null;
  }).filter(Boolean);
}

function conflictDisclosures({ section, claims, conflictIndex, navigate }) {
  return sectionConflictAnnotations(section.text, claims, conflictIndex).map((annotation, index) => ({
    ...annotation,
    ...createStatementConflictDisclosure({
      id: `statement-conflict-${section.id}-${index + 1}`,
      conflicts: annotation.conflicts,
      currentClaimRefs: annotation.claimRefs,
      navigate,
    }),
  }));
}

function appendAnnotatedText({
  container,
  text,
  entityIds,
  knowledge,
  normalizeText,
  navigate,
  disclosures,
}) {
  const spans = entitySpans({ text, entityIds, knowledge, normalizeText });
  const boundaries = new Set([0, text.length]);
  for (const span of spans) boundaries.add(span.start).add(span.end);
  for (const disclosure of disclosures) boundaries.add(disclosure.position);
  const ordered = [...boundaries].sort((left, right) => left - right);
  const markersByPosition = new Map(disclosures.map((item) => [item.position, item.marker]));

  if (markersByPosition.has(0)) container.append(markersByPosition.get(0));
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (end > start) {
      const span = spans.find((candidate) => candidate.start <= start && candidate.end >= end);
      const segment = text.slice(start, end);
      container.append(span ? Button({
        variant: 'ghost',
        className: 'entity-link',
        text: segment,
        onClick: () => navigate('concept', span.entity.id),
      }) : document.createTextNode(segment));
    }
    if (markersByPosition.has(end)) container.append(markersByPosition.get(end));
  }
}

function renderClaim({ claim, navigate }) {
  const card = Card({ kind: 'statement', className: 'claim-card' });
  const openClaim = Button({
    variant: 'ghost',
    className: 'claim-open-button',
    text: claim.text,
    onClick: () => navigate('statement', claim.runtimeId ?? claim.id),
  });
  const addNote = Button({
    variant: 'secondary',
    text: 'Добавить наблюдение',
    onClick: () => navigate('note', 'new', { claimId: claim.runtimeId ?? claim.id }),
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

function renderSection({
  section,
  documentRecord,
  knowledge,
  normalizeText,
  navigate,
  assetView,
  conflictIndex,
}) {
  const article = element('article', {
    className: 'document-section',
    id: `section-${section.id}`,
  });
  const heading = element('header', { className: 'document-section-header' }, [
    Text({ variant: 'heading', as: 'h3', text: section.title }),
    assetView?.sourceButton(section.id),
  ].filter(Boolean));
  const claims = statementsForSection(
    knowledge.packs,
    documentRecord.packId,
    documentRecord.id,
    section.id,
  );
  const disclosures = conflictDisclosures({ section, claims, conflictIndex, navigate });
  const paragraph = element('p', { className: 'document-section-text' });
  appendAnnotatedText({
    container: paragraph,
    text: section.text,
    entityIds: section.entityIds ?? [],
    knowledge,
    normalizeText,
    navigate,
    disclosures,
  });
  article.append(heading, paragraph);
  if (disclosures.length) {
    article.append(element('div', { className: 'statement-conflict-panels' }, (
      disclosures.map((item) => item.panel)
    )));
  }
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
  const assetView = createDocumentAssetView({
    documentRecord,
    sectionId: record.sectionId,
  });
  const conflictIndex = buildStatementConflictIndex(knowledge.packs);

  dialogView.replaceHeading([
    Text({ variant: 'eyebrow', text: documentRecord.packTitle }),
    Text({ variant: 'title', as: 'h2', text: documentRecord.title }),
    Text({ variant: 'muted', text: documentRecord.source?.title ?? 'Локальный источник' }),
  ]);
  const body = [];
  if (assetView) body.push(assetView.element);
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
      assetView,
      conflictIndex,
    }));
  }
  body.push(renderExternalSource(documentRecord.source));
  dialogView.replaceBody(body.filter(Boolean));
  dialogView.show();

  if (record.sectionId) {
    queueMicrotask(() => {
      if (assetView) {
        assetView.openSection(record.sectionId);
        return;
      }
      const escaped = globalThis.CSS?.escape?.(record.sectionId) ?? record.sectionId;
      dialogView.scrollTo(`#section-${escaped}`);
    });
  }
  return true;
}
