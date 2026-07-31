import { createEvidenceEnvelope } from './core/contracts.js';
import {
  DEFAULT_ANSWER_MODE_ID,
  answerModeProfile,
  buildEvidencePrompt,
} from './services/answer-modes.js';

const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.84';
const WEBLLM_WORKER_URL = new URL('./workers/webllm-worker.js', import.meta.url);

export const LOCAL_MODEL_PROFILES = Object.freeze([
  Object.freeze({
    id: 'qwen3-1.7b',
    modelId: 'Qwen3-1.7B-q4f16_1-MLC',
    label: 'Qwen3 1.7B',
    parameters: '1.7B',
    quantization: 'q4f16_1',
    downloadSizeMB: 1000,
    runtimeMemoryMB: 2036.66,
    sizeMB: 1000,
    vramRequiredMB: 2036.66,
    contextWindow: 4096,
    recommendedRamGB: 8,
    recommendedModeId: 'compact',
    role: 'По умолчанию для 8 ГБ',
    description: 'Основной профиль для средних мобильных устройств. Сохраняет запас памяти для браузера, базы знаний и интерфейса.',
  }),
  Object.freeze({
    id: 'qwen3-4b',
    modelId: 'Qwen3-4B-q4f16_1-MLC',
    label: 'Qwen3 4B',
    parameters: '4B',
    quantization: 'q4f16_1',
    downloadSizeMB: 2300,
    runtimeMemoryMB: 3431.59,
    sizeMB: 2300,
    vramRequiredMB: 3431.59,
    contextWindow: 4096,
    recommendedRamGB: 12,
    recommendedModeId: 'detailed',
    role: 'Лучшее качество',
    description: 'Встроенная WebLLM-модель без собственной конвертации весов. Предпочтительна на устройствах с 12 ГБ общей памяти.',
  }),
  Object.freeze({
    id: 'phi4-mini',
    modelId: 'Phi-4-mini-instruct-q4f16_1-MLC',
    label: 'Phi-4 Mini',
    parameters: '3.8B',
    quantization: 'q4f16_1',
    downloadSizeMB: 2180,
    runtimeMemoryMB: 3437.58,
    sizeMB: 2180,
    vramRequiredMB: 3437.58,
    contextWindow: 4096,
    recommendedRamGB: 12,
    recommendedModeId: 'detailed',
    role: 'Математика и логика',
    description: 'Альтернативный профиль для сравнительных тестов, математических и формально-логических вопросов.',
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

function evidenceLimit(options) {
  if (typeof options === 'number') return Math.max(1, Math.floor(options));
  return Math.max(1, Math.floor(Number(options?.sourceLimit ?? options?.limit ?? 8)));
}

export function collectEvidence(query, results, knowledgeState, options = {}) {
  const limit = evidenceLimit(options);
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
    return note.title.toLocaleLowerCase('ru-RU').includes(normalizedQuery)
      || note.body.toLocaleLowerCase('ru-RU').includes(normalizedQuery);
  });

  const conflicts = relatedNotes
    .filter((note) => note.relation === 'contradicts' || note.relation === 'supersedes')
    .map((note) => ({ note, claim: note.targetClaimId ? knowledgeState.claims.get(note.targetClaimId) : undefined }));

  return createEvidenceEnvelope({ query, sources, relatedNotes, conflicts });
}

export function evidencePrompt(evidence, modeId = DEFAULT_ANSWER_MODE_ID) {
  return buildEvidencePrompt(evidence, modeId).text;
}

function defaultWorkerFactory() {
  if (typeof Worker !== 'function') throw new Error('Web Worker недоступен в этом окружении.');
  return new Worker(WEBLLM_WORKER_URL, { type: 'module', name: 'l-note-webllm' });
}

export class BrowserLocalAi {
  constructor({ workerFactory = defaultWorkerFactory } = {}) {
    this.engine = null;
    this.worker = null;
    this.workerFactory = workerFactory;
    this.modelId = null;
    this.module = null;
    this.cacheBackend = 'cache';
  }

  get available() {
    return Boolean(globalThis.navigator?.gpu && typeof Worker === 'function');
  }

  async inspectModels() {
    this.module ??= await import(WEBLLM_URL);
    return resolveLocalModelProfiles(this.module.prebuiltAppConfig?.model_list ?? []);
  }

  async unload() {
    const engine = this.engine;
    const worker = this.worker;
    this.engine = null;
    this.worker = null;
    this.modelId = null;
    try {
      await engine?.unload?.();
    } finally {
      worker?.terminate?.();
    }
  }

  async load({ modelId = DEFAULT_LOCAL_MODEL_ID, onProgress } = {}) {
    if (!this.available) {
      throw new Error('WebGPU или Web Worker недоступен. Поиск и доказательная сводка продолжат работать без модели.');
    }
    const webllm = (this.module ??= await import(WEBLLM_URL));
    const modelList = webllm.prebuiltAppConfig?.model_list ?? [];
    const selectedRecord = modelList.find((record) => record.model_id === modelId);
    if (!selectedRecord) throw new Error(`Модель ${modelId} отсутствует во встроенном каталоге WebLLM ${WEBLLM_URL.split('@').at(-1)}.`);

    const profile = localModelProfile(modelId);
    if (this.engine && this.modelId === modelId) {
      return {
        modelId,
        profile,
        loadMs: 0,
        reused: true,
        runtime: 'web-worker',
        cacheBackend: this.cacheBackend,
      };
    }

    if (this.engine || this.worker) await this.unload();

    const worker = this.workerFactory();
    const startedAt = monotonicNow();
    try {
      const appConfig = {
        ...webllm.prebuiltAppConfig,
        cacheBackend: this.cacheBackend,
      };
      const engine = await webllm.CreateWebWorkerMLCEngine(
        worker,
        modelId,
        {
          initProgressCallback: (progress) => onProgress?.(progress),
          appConfig,
        },
        profile?.contextWindow ? { context_window_size: profile.contextWindow } : undefined,
      );
      this.worker = worker;
      this.engine = engine;
      this.modelId = modelId;
      return {
        modelId,
        profile,
        loadMs: monotonicNow() - startedAt,
        reused: false,
        runtime: 'web-worker',
        cacheBackend: this.cacheBackend,
      };
    } catch (error) {
      worker.terminate?.();
      throw error;
    }
  }

  async answer(query, evidence, { modeId = DEFAULT_ANSWER_MODE_ID } = {}) {
    if (!this.engine || !this.modelId) throw new Error('Локальная модель не загружена.');
    const prompt = buildEvidencePrompt(evidence, modeId);
    const mode = answerModeProfile(modeId);
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
            `Режим ответа: ${mode.label}.`,
            'Отвечай по-русски, структурированно и без лишних повторов.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `ВОПРОС:\n${query}\n\nЛОКАЛЬНЫЕ ИСТОЧНИКИ:\n${prompt.text || 'Подходящих источников нет.'}`,
        },
      ],
      temperature: 0.1,
      max_tokens: mode.maxOutputTokens,
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
      ...validateGroundedAnswer(text, prompt.includedSourceIds),
      modelId: this.modelId,
      modeId: mode.id,
      modeLabel: mode.label,
      evidenceChars: prompt.usedChars,
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
