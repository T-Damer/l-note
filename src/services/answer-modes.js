export const ANSWER_MODE_PROFILES = Object.freeze([
  Object.freeze({
    id: 'compact',
    label: 'Экономный',
    description: 'До 4 основных источников, 2 подтверждённых расхождений и короткий ответ.',
    sourceLimit: 4,
    discrepancyLimit: 2,
    sourceChars: 1300,
    supplementalSourceChars: 800,
    evidenceChars: 5600,
    noteLimit: 2,
    noteChars: 700,
    maxOutputTokens: 384,
  }),
  Object.freeze({
    id: 'detailed',
    label: 'Расширенный',
    description: 'До 8 основных источников, 3 подтверждённых расхождений и более подробный ответ.',
    sourceLimit: 8,
    discrepancyLimit: 3,
    sourceChars: 1700,
    supplementalSourceChars: 1000,
    evidenceChars: 11000,
    noteLimit: 4,
    noteChars: 1000,
    maxOutputTokens: 640,
  }),
]);

export const DEFAULT_ANSWER_MODE_ID = 'compact';

export function answerModeProfile(modeId = DEFAULT_ANSWER_MODE_ID) {
  return ANSWER_MODE_PROFILES.find((profile) => profile.id === modeId)
    ?? ANSWER_MODE_PROFILES.find((profile) => profile.id === DEFAULT_ANSWER_MODE_ID);
}

export function clipText(value, maxChars) {
  const text = String(value ?? '').trim();
  const limit = Math.max(0, Number(maxChars) || 0);
  if (!limit || text.length <= limit) return text;
  if (limit <= 1) return '…'.slice(0, limit);
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function discrepancyBlock(discrepancy) {
  const sourceId = discrepancy?.source?.evidenceId;
  const targetId = discrepancy?.target?.evidenceId;
  if (!sourceId || !targetId) return '';
  return [
    `ПОДТВЕРЖДЁННОЕ РАСХОЖДЕНИЕ: [${sourceId}] ↔ [${targetId}]`,
    `Тип связи: ${discrepancy.type}.`,
    discrepancy.reason ? `Пояснение рецензента: ${discrepancy.reason}` : '',
    'Представь обе версии нейтрально. Не выбирай один источник автоматически.',
  ].filter(Boolean).join('\n');
}

export function buildEvidencePrompt(evidence, modeId = DEFAULT_ANSWER_MODE_ID) {
  const mode = answerModeProfile(modeId);
  const blocks = [];
  const includedSourceIds = [];
  const includedNoteIds = [];
  let remainingChars = mode.evidenceChars;

  const sourceLimit = mode.sourceLimit + mode.discrepancyLimit;
  for (const source of (evidence?.sources ?? []).slice(0, sourceLimit)) {
    const sourceName = source.document?.source?.title
      ?? source.document?.title
      ?? source.result?.documentTitle
      ?? 'Локальный источник';
    const heading = `[${source.id}] ${source.result?.documentTitle ?? 'Документ'} — ${source.result?.title ?? 'Раздел'}\nИсточник: ${sourceName}\nТекст: `;
    const sourceChars = source.supplemental
      ? mode.supplementalSourceChars
      : mode.sourceChars;
    const availableBodyChars = Math.min(sourceChars, Math.max(0, remainingChars - heading.length));
    if (availableBodyChars < 80) break;
    const body = clipText(source.result?.body ?? '', availableBodyChars);
    const block = `${heading}${body}`;
    blocks.push(block);
    includedSourceIds.push(source.id);
    remainingChars -= block.length + 2;
  }

  const includedSources = new Set(includedSourceIds);
  for (const discrepancy of (evidence?.discrepancies ?? []).slice(0, mode.discrepancyLimit)) {
    if (!includedSources.has(discrepancy.source?.evidenceId)
      || !includedSources.has(discrepancy.target?.evidenceId)) continue;
    const block = discrepancyBlock(discrepancy);
    if (!block || remainingChars < block.length + 2) break;
    blocks.push(block);
    remainingChars -= block.length + 2;
  }

  for (const note of (evidence?.relatedNotes ?? []).slice(0, mode.noteLimit)) {
    if (remainingChars < 120) break;
    const noteId = note.id ?? `note-${includedNoteIds.length + 1}`;
    const heading = `[N${includedNoteIds.length + 1}] ${note.title ?? 'Личная заметка'}\nТип связи: ${note.relation ?? 'observation'}\nТекст: `;
    const availableBodyChars = Math.min(mode.noteChars, Math.max(0, remainingChars - heading.length));
    if (availableBodyChars < 60) break;
    const block = `${heading}${clipText(note.body ?? '', availableBodyChars)}`;
    blocks.push(block);
    includedNoteIds.push(noteId);
    remainingChars -= block.length + 2;
  }

  return {
    mode,
    text: blocks.join('\n\n'),
    includedSourceIds,
    includedNoteIds,
    usedChars: Math.max(0, mode.evidenceChars - remainingChars),
  };
}
