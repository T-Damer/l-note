const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.83';

function evidenceId(index) {
  return `S${index + 1}`;
}

export function collectEvidence(query, results, knowledgeState, limit = 8) {
  const sources = results
    .filter((result) => result.kind === 'section')
    .slice(0, limit)
    .map((result, index) => ({
      id: evidenceId(index),
      result,
      document: knowledgeState.documents.get(result.documentId),
      section: knowledgeState.sections.get(`${result.documentId}/${result.sectionId}`),
      claims: (result.claimIds ?? []).map((id) => knowledgeState.claims.get(id)).filter(Boolean),
    }));

  const sourceClaimIds = new Set(sources.flatMap((source) => source.claims.map((claim) => claim.id)));
  const relatedNotes = knowledgeState.notes.filter((note) => {
    if (note.targetClaimId && sourceClaimIds.has(note.targetClaimId)) return true;
    const normalizedQuery = query.toLocaleLowerCase('ru-RU');
    return note.title.toLocaleLowerCase('ru-RU').includes(normalizedQuery) || note.body.toLocaleLowerCase('ru-RU').includes(normalizedQuery);
  });

  const conflicts = relatedNotes
    .filter((note) => note.relation === 'contradicts' || note.relation === 'supersedes')
    .map((note) => ({ note, claim: note.targetClaimId ? knowledgeState.claims.get(note.targetClaimId) : undefined }));

  return { query, sources, relatedNotes, conflicts };
}

export function evidencePrompt(evidence) {
  const blocks = evidence.sources.map((source) => {
    const sourceName = source.document?.source?.title ?? source.document?.title ?? source.result.documentTitle;
    return `[${source.id}] ${source.result.documentTitle} — ${source.result.title}\nИсточник: ${sourceName}\nТекст: ${source.result.body}`;
  });
  const notes = evidence.relatedNotes.map((note, index) => `[N${index + 1}] ${note.title}\n${note.body}\nТип связи: ${note.relation}`);
  return [...blocks, ...notes].join('\n\n');
}

function rankModel(modelId) {
  const id = String(modelId).toLowerCase();
  let size = 100;
  const match = id.match(/(\d+(?:\.\d+)?)b/u);
  if (match) size = Number(match[1]);
  const qwen = id.includes('qwen') ? -20 : 0;
  const instruct = id.includes('instruct') ? -10 : 0;
  const quantized = id.includes('q4') ? -5 : 0;
  return size * 100 + qwen + instruct + quantized;
}

function pickSmallModel(modelList) {
  const candidates = modelList
    .map((record) => record.model_id)
    .filter((id) => /instruct/iu.test(id) && /(0\.5b|0\.6b|0\.8b|1b|1\.5b|1\.7b)/iu.test(id));
  const pool = candidates.length > 0 ? candidates : modelList.map((record) => record.model_id).filter((id) => /instruct/iu.test(id));
  return pool.sort((a, b) => rankModel(a) - rankModel(b))[0];
}

export class BrowserLocalAi {
  constructor() {
    this.engine = null;
    this.modelId = null;
    this.module = null;
  }

  get available() {
    return Boolean(globalThis.navigator?.gpu);
  }

  async inspectModels() {
    this.module ??= await import(WEBLLM_URL);
    return this.module.prebuiltAppConfig?.model_list ?? [];
  }

  async load({ modelId, onProgress } = {}) {
    if (!this.available) throw new Error('WebGPU недоступен в этом браузере. Поиск и доказательная сводка продолжат работать без модели.');
    const webllm = (this.module ??= await import(WEBLLM_URL));
    const selected = modelId || pickSmallModel(webllm.prebuiltAppConfig?.model_list ?? []);
    if (!selected) throw new Error('В каталоге WebLLM не найдено компактной instruct-модели.');
    this.modelId = selected;
    this.engine = await webllm.CreateMLCEngine(selected, {
      initProgressCallback: (progress) => onProgress?.(progress),
      appConfig: { ...webllm.prebuiltAppConfig, cacheBackend: 'cache' },
    });
    return selected;
  }

  async answer(query, evidence) {
    if (!this.engine) throw new Error('Локальная модель не загружена.');
    const context = evidencePrompt(evidence);
    const response = await this.engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: [
            'Ты работаешь как локальный помощник по базе знаний.',
            'Используй только предоставленные фрагменты. Не добавляй факты из памяти.',
            'Каждое содержательное утверждение подтверждай ссылкой вида [S1].',
            'Личные заметки обозначай отдельно и не выдавай их за официальный источник.',
            'При противоречии явно опиши его. Если данных недостаточно, так и скажи.',
            'Отвечай по-русски, кратко и структурированно.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `ВОПРОС:\n${query}\n\nЛОКАЛЬНЫЕ ИСТОЧНИКИ:\n${context}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 650,
      stream: false,
    });
    const text = response.choices?.[0]?.message?.content?.trim() ?? '';
    return validateGroundedAnswer(text, evidence.sources.map((source) => source.id));
  }
}

export function validateGroundedAnswer(text, allowedSourceIds) {
  const allowed = new Set(allowedSourceIds);
  const citations = [...String(text).matchAll(/\[S(\d+)\]/gu)].map((match) => `S${match[1]}`);
  const invalidCitations = [...new Set(citations.filter((id) => !allowed.has(id)))];
  const validCitations = [...new Set(citations.filter((id) => allowed.has(id)))];
  return {
    text,
    validCitations,
    invalidCitations,
    grounded: validCitations.length > 0 && invalidCitations.length === 0,
  };
}
