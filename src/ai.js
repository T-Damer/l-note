import { createEvidenceEnvelope } from './core/contracts.js';

const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.84';

export const LOCAL_MODEL_PROFILES = Object.freeze([
  Object.freeze({
    id: 'gemma3-1b',
    modelId: 'gemma3-1b-it-q4f16_1-MLC',
    label: 'Gemma 3',
    parameters: '1B',
    sizeMB: 711.07,
    role: 'Лёгкий baseline',
    description: 'Самая компактная независимая архитектура в тесте. Нужна для сравнения скорости, русского ответа и дисциплины цитирования при минимальном расходе памяти.',
    vramRequiredMB: 711.07,
  }),
  Object.freeze({
    id: 'qwen3-1.7b',
    modelId: 'Qwen3-1.7B-q4f16_1-MLC',
    label: 'Qwen3',
    parameters: '1.7B',
    sizeMB: 2036.66,
    role: 'Рекомендуемая модель',
    description: 'Основной кандидат MiniMed и L-Note: умеренный размер, хороший практический баланс и модель по умолчанию для сравнительных прогонов.',
    vramRequiredMB: 2036.66,
  }),
  Object.freeze({
    id: 'phi4-mini',
    modelId: 'Phi-4-mini-instruct-q4f16_1-MLC',
    label: 'Phi-4 Mini',
    parameters: '3.8B',
    sizeMB: 3437.58,
    role: 'Сильная альтернатива',
    description: 'Более тяжёлый независимый кандидат для проверки качества синтеза, следования локальным источникам и корректного отказа при недостатке данных.',
    vramRequiredMB: 3437.58,
  }),
]);

export const DEFAULT_LOCAL_MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';

export function localModelProfile(modelId) {
  return LOCAL_MODEL_PROFILES.find((profile) => profile.modelId === modelId) ?? null;
}

export function resolveLocalModelProfiles(modelList) {
  const records = new Map((modelList ?? []).map((record) => [record.model_id, record]));
  return LOCAL_MODEL_PROFILES.map((profile) => ({
    ...profile,
    available: records.has(profile.modelId),
    record: records.get(profile.modelId) ?? null,
  }));
}

function monotonicNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

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

  return createEvidenceEnvelope({ query, sources, relatedNotes, conflicts });
}

export function evidencePrompt(evidence) {
  const blocks = evidence.sources.map((source) => {
    const sourceName = source.document?.source?.title ?? source.document?.title ?? source.result.documentTitle;
    return `[${source.id}] ${source.result.documentTitle} — ${source.result.title}\nИсточник: ${sourceName}\nТекст: ${source.result.body}`;
  });
  const notes = evidence.relatedNotes.map((note, index) => `[N${index + 1}] ${note.title}\n${note.body}\nТип связи: ${note.relation}`);
  return [...blocks, ...notes].join('\n\n');
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
    return resolveLocalModelProfiles(this.module.prebuiltAppConfig?.model_list ?? []);
  }

  async load({ modelId = DEFAULT_LOCAL_MODEL_ID, onProgress } = {}) {
    if (!this.available) throw new Error('WebGPU недоступен в этом браузере. Поиск и доказательная сводка продолжат работать без модели.');
    const webllm = (this.module ??= await import(WEBLLM_URL));
    const modelList = webllm.prebuiltAppConfig?.model_list ?? [];
    const selectedRecord = modelList.find((record) => record.model_id === modelId);
    if (!selectedRecord) throw new Error(`Модель ${modelId} отсутствует в каталоге WebLLM ${WEBLLM_URL.split('@').at(-1)}.`);

    const profile = localModelProfile(modelId);
    if (this.engine && this.modelId === modelId) {
      return { modelId, profile, loadMs: 0, reused: true };
    }

    if (this.engine && this.modelId !== modelId) {
      try {
        await this.engine.unload?.();
      } catch {
        // A failed unload must not prevent loading the selected model.
      }
      this.engine = null;
      this.modelId = null;
    }

    const startedAt = monotonicNow();
    this.engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => onProgress?.(progress),
      appConfig: { ...webllm.prebuiltAppConfig, cacheBackend: 'cache' },
    });
    this.modelId = modelId;
    return {
      modelId,
      profile,
      loadMs: monotonicNow() - startedAt,
      reused: false,
    };
  }

  async answer(query, evidence) {
    if (!this.engine || !this.modelId) throw new Error('Локальная модель не загружена.');
    const context = evidencePrompt(evidence);
    const startedAt = monotonicNow();
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
            'Не выводи внутренние рассуждения или скрытую цепочку мыслей.',
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
      enable_thinking: false,
      stream: false,
    });
    const durationMs = monotonicNow() - startedAt;
    const text = response.choices?.[0]?.message?.content?.trim() ?? '';
    const completionTokens = Number.isFinite(response.usage?.completion_tokens)
      ? response.usage.completion_tokens
      : null;
    const tokensPerSecond = completionTokens && durationMs > 0
      ? completionTokens / (durationMs / 1000)
      : null;
    return {
      ...validateGroundedAnswer(text, evidence.sources.map((source) => source.id)),
      modelId: this.modelId,
      durationMs,
      completionTokens,
      tokensPerSecond,
      usage: response.usage ?? null,
    };
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
