import { validateGroundedAnswer } from './core.js';

let engine = null;
let modelId = null;

export function localAiCapability() {
  return {
    webGpu: Boolean(navigator.gpu),
    crossOriginIsolated: globalThis.crossOriginIsolated,
  };
}

export async function loadLocalModel(onProgress = () => {}) {
  if (engine) return { engine, modelId };
  if (!navigator.gpu) throw new Error('WebGPU недоступен в этом браузере.');

  const webllm = await import('https://esm.run/@mlc-ai/web-llm@0.2.84');
  const candidates = webllm.prebuiltAppConfig.model_list;
  const preferred =
    candidates.find((item) => /qwen2(?:\.5)?[-_ ].*0\.5b.*q4/i.test(item.model_id)) ??
    candidates.find((item) => /qwen.*0\.5b/i.test(item.model_id)) ??
    candidates.find((item) => /1b.*q4/i.test(item.model_id));

  if (!preferred) throw new Error('В каталоге WebLLM не найдена компактная модель 0.5–1B.');
  modelId = preferred.model_id;
  engine = await webllm.CreateWebWorkerMLCEngine(
    new Worker(new URL('./llm-worker.js', import.meta.url), { type: 'module' }),
    modelId,
    {
      initProgressCallback: (progress) => onProgress(progress),
      appConfig: {
        ...webllm.prebuiltAppConfig,
        cacheBackend: 'indexeddb',
      },
    },
  );
  return { engine, modelId };
}

export async function answerWithLocalModel(question, evidence, notes = []) {
  if (!engine) throw new Error('Сначала загрузите локальную модель.');
  const sourceText = evidence
    .map(
      (item, index) =>
        `[E${index + 1}] ${item.documentTitle} — ${item.sectionTitle}\n${item.text}`,
    )
    .join('\n\n');
  const noteText = notes.length
    ? `\n\nЛИЧНЫЕ ЗАМЕТКИ (не считать официальными источниками):\n${notes
        .map((note, index) => `[N${index + 1}] ${note.title}: ${note.body}`)
        .join('\n')}`
    : '';

  const messages = [
    {
      role: 'system',
      content:
        'Ты локальный исследователь базы знаний. Отвечай только по переданным фрагментам. Каждый содержательный абзац обязан заканчиваться ссылкой вида [E1]. Не придумывай источники, номера, дозы или факты. Личные заметки отделяй от справочных данных. При противоречии явно перечисляй позиции. Если данных недостаточно, так и скажи.',
    },
    {
      role: 'user',
      content: `ВОПРОС:\n${question}\n\nСПРАВОЧНЫЕ ФРАГМЕНТЫ:\n${sourceText}${noteText}`,
    },
  ];

  const completion = await engine.chat.completions.create({
    messages,
    temperature: 0.1,
    max_tokens: 700,
  });
  const answer = completion.choices[0]?.message?.content?.trim() ?? '';
  const validation = validateGroundedAnswer(
    answer,
    evidence.map((_item, index) => `E${index + 1}`),
  );
  return { answer, validation, modelId };
}

export async function unloadLocalModel() {
  if (engine?.unload) await engine.unload();
  engine = null;
  modelId = null;
}
