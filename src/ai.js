import { sentenceSplit, truncate, unique } from './utils.js';

export const DEFAULT_MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

export const LOCAL_MODEL_OPTIONS = Object.freeze([
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    title: 'Qwen 2.5 0.5B — быстрее',
    note: 'Для краткой сводки и проверки формата; качество рассуждения ограничено.'
  },
  {
    id: DEFAULT_MODEL_ID,
    title: 'Qwen 2.5 1.5B — основной',
    note: 'Более надежное объединение нескольких источников, но выше расход памяти.'
  }
]);

function evidenceBlock(evidence) {
  return evidence
    .map(
      (source) =>
        `[${source.id}] ${source.title}${source.section ? ` — ${source.section}` : ''}\n${truncate(
          source.body,
          1400
        )}`
    )
    .join('\n\n');
}

function personalBlock(notes) {
  if (!notes.length) return 'Личных заметок по запросу не найдено.';
  return notes
    .slice(0, 6)
    .map(
      (note, index) =>
        `[N${index + 1}] ${note.title} (${note.section || 'личная заметка'})\n${truncate(note.body, 800)}`
    )
    .join('\n\n');
}

export function buildExtractiveAnswer(query, evidence, personalHits = []) {
  if (evidence.length === 0 && personalHits.length === 0) {
    return {
      text: 'В установленных пакетах не найдено достаточно данных для ответа. Установите другой пакет или переформулируйте запрос.',
      mode: 'deterministic',
      citations: [],
      warnings: ['Недостаточно локальных источников.']
    };
  }

  const lines = [];
  if (evidence.length > 0) {
    lines.push(`По запросу «${query}» наиболее релевантны следующие фрагменты:`);
    for (const source of evidence.slice(0, 5)) {
      const firstSentence = sentenceSplit(source.body)[0] ?? truncate(source.body, 240);
      lines.push(`• ${firstSentence} [${source.id}]`);
    }
  }

  const personal = personalHits.slice(0, 3);
  if (personal.length > 0) {
    lines.push('Личные наблюдения хранятся отдельно от справочника:');
    for (const note of personal) {
      lines.push(`• ${note.title}: ${truncate(note.body, 220)} [личная заметка]`);
    }
  }

  lines.push('Это извлекающая сводка без генеративной модели: откройте источники ниже для проверки контекста.');
  return {
    text: lines.join('\n\n'),
    mode: 'deterministic',
    citations: evidence.map((source) => source.id),
    warnings: []
  };
}

export function validateCitations(text, sourceCount) {
  const matches = [...String(text).matchAll(/\[S(\d+)\]/gu)];
  const cited = unique(matches.map((match) => Number(match[1])));
  const invalid = cited.filter((number) => number < 1 || number > sourceCount);
  const substantiveParagraphs = String(text)
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(
      (paragraph) =>
        paragraph.length >= 80 &&
        !paragraph.toLocaleLowerCase('ru-RU').startsWith('огранич') &&
        !paragraph.toLocaleLowerCase('ru-RU').startsWith('источник')
    );
  const uncitedParagraphs = substantiveParagraphs.filter(
    (paragraph) => !/\[S\d+\]/u.test(paragraph) && !/личн(?:ая|ой|ые) заметк/iu.test(paragraph)
  );
  return {
    valid: invalid.length === 0 && (sourceCount === 0 || cited.length > 0) && uncitedParagraphs.length === 0,
    cited,
    invalid,
    uncitedParagraphs
  };
}

function parseJsonObject(value) {
  const text = String(value ?? '').trim();
  const unfenced = text.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Verifier did not return JSON.');
  return JSON.parse(unfenced.slice(start, end + 1));
}

export class LocalAiSession {
  #engine = null;

  #modelId = null;

  get ready() {
    return Boolean(this.#engine);
  }

  get modelId() {
    return this.#modelId;
  }

  async load(modelId = DEFAULT_MODEL_ID, onProgress = () => {}) {
    if (this.#engine && this.#modelId === modelId) return;
    if (this.#engine?.unload) await this.#engine.unload();
    this.#engine = null;
    this.#modelId = null;
    const webllm = await import('@mlc-ai/web-llm');
    this.#engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        onProgress({
          progress: Number.isFinite(report.progress) ? report.progress : null,
          text: report.text ?? 'Загрузка локальной модели…'
        });
      }
    });
    this.#modelId = modelId;
  }

  async unload() {
    if (this.#engine?.unload) await this.#engine.unload();
    this.#engine = null;
    this.#modelId = null;
  }

  async answer({ query, evidence, personalHits = [], onToken = () => {} }) {
    if (!this.#engine) throw new Error('Локальная модель не загружена.');
    if (evidence.length === 0) return buildExtractiveAnswer(query, evidence, personalHits);

    const system = [
      'Ты локальный помощник по пользовательской базе знаний.',
      'Отвечай только на основании выданных источников, не используй память модели как источник фактов.',
      'Каждый фактический абзац должен содержать ссылки вида [S1], [S2].',
      'Личные заметки [N1] отделяй от справочных данных и явно называй личными наблюдениями.',
      'Если источники расходятся, перечисли расхождение. Если данных недостаточно, прямо скажи об этом.',
      'Не придумывай ссылок и не превращай наблюдение пользователя в общий факт.'
    ].join(' ');
    const user = `ВОПРОС:\n${query}\n\nСПРАВОЧНЫЕ ИСТОЧНИКИ:\n${evidenceBlock(
      evidence
    )}\n\nЛИЧНЫЕ ЗАМЕТКИ:\n${personalBlock(personalHits)}\n\nСформируй краткий ответ, затем раздел «Ограничения».`;

    const stream = await this.#engine.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.1,
      max_tokens: 750,
      stream: true
    });

    let draft = '';
    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content ?? '';
      draft += token;
      if (token) onToken(draft, token);
    }
    draft = draft.trim();

    const initialValidation = validateCitations(draft, evidence.length);
    const verificationPrompt = `Проверь черновик только по источникам. Верни СТРОГО JSON без Markdown:\n{
  "verdict": "pass" | "revise" | "reject",
  "unsupported": ["неподтвержденное утверждение"],
  "revisedAnswer": "исправленный ответ с [S1]"
}\n\nИСТОЧНИКИ:\n${evidenceBlock(evidence)}\n\nЧЕРНОВИК:\n${draft}`;

    let verifier = null;
    try {
      const verificationResponse = await this.#engine.chat.completions.create({
        messages: [
          {
            role: 'system',
            content:
              'Ты проверяющий. Удали любые утверждения, которые нельзя подтвердить предоставленными источниками. Сохрани корректные ссылки.'
          },
          { role: 'user', content: verificationPrompt }
        ],
        temperature: 0,
        max_tokens: 700,
        response_format: { type: 'json_object' }
      });
      verifier = parseJsonObject(verificationResponse.choices?.[0]?.message?.content);
    } catch (error) {
      console.warn('Local verifier failed; deterministic validation remains active.', error);
    }

    const candidate =
      verifier?.verdict === 'revise' && typeof verifier.revisedAnswer === 'string'
        ? verifier.revisedAnswer.trim()
        : draft;
    const finalValidation = validateCitations(candidate, evidence.length);
    if (!finalValidation.valid) {
      const fallback = buildExtractiveAnswer(query, evidence, personalHits);
      return {
        ...fallback,
        mode: 'rejected-local-ai',
        warnings: [
          'Сгенерированный ответ отклонен: модель не прошла проверку ссылок.',
          ...initialValidation.invalid.map((number) => `Несуществующая ссылка S${number}.`),
          ...(verifier?.unsupported ?? []).slice(0, 4)
        ]
      };
    }

    return {
      text: candidate,
      mode: 'local-ai-verified',
      citations: finalValidation.cited.map((number) => `S${number}`),
      warnings: (verifier?.unsupported ?? []).slice(0, 4),
      verifier: verifier
        ? {
            verdict: verifier.verdict,
            unsupported: verifier.unsupported ?? []
          }
        : null
    };
  }
}
