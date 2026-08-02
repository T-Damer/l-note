export const ANSWER_MODE_PROFILES = Object.freeze([
  Object.freeze({
    id: 'compact',
    label: 'Экономный',
    description: 'До 4 источников и короткий ответ. Оптимально для Qwen3 1.7B и устройств с 8 ГБ памяти.',
    sourceLimit: 4,
    sourceChars: 1300,
    evidenceChars: 5600,
    noteLimit: 2,
    noteChars: 700,
    maxOutputTokens: 384,
  }),
  Object.freeze({
    id: 'detailed',
    label: 'Расширенный',
    description: 'До 8 источников и более подробный ответ. Предпочтительно для Qwen3 4B и устройств с 12 ГБ памяти.',
    sourceLimit: 8,
    sourceChars: 1700,
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

export function buildEvidencePrompt(evidence, modeId = DEFAULT_ANSWER_MODE_ID) {
  const mode = answerModeProfile(modeId);
  const blocks = [];
  const includedSourceIds = [];
  const includedNoteIds = [];
  let remainingChars = mode.evidenceChars;

  for (const source of (evidence?.sources ?? []).slice(0, mode.sourceLimit)) {
    const sourceName = source.document?.source?.title
      ?? source.document?.title
      ?? source.result?.documentTitle
      ?? 'Локальный источник';
    const heading = `[${source.id}] ${source.result?.documentTitle ?? 'Документ'} — ${source.result?.title ?? 'Раздел'}\nИсточник: ${sourceName}\nТекст: `;
    const availableBodyChars = Math.min(mode.sourceChars, Math.max(0, remainingChars - heading.length));
    if (availableBodyChars < 80) break;
    const body = clipText(source.result?.body ?? '', availableBodyChars);
    const block = `${heading}${body}`;
    blocks.push(block);
    includedSourceIds.push(source.id);
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
