function endpointFor(baseUrl) {
  const normalized = baseUrl.trim().replace(/\/+$/u, '');
  if (normalized.endsWith('/chat/completions')) return normalized;
  return `${normalized}/chat/completions`;
}

function bundleJson(bundle) {
  return JSON.stringify(bundle, null, 2);
}

export function createGroundedAnswerPrompt(bundle) {
  return [
    'Ответь на вопрос только по предоставленному пакету доказательств.',
    'После каждого проверяемого утверждения укажи идентификаторы источников в квадратных скобках.',
    'Личные наблюдения помечай отдельно от справочных данных.',
    'Если claimLinks содержит contradicts, явно опиши противоречие.',
    'Не дополняй отсутствующие факты. Если данных недостаточно, так и напиши.',
    '',
    bundleJson(bundle),
  ].join('\n');
}

export function createVerificationPrompt(bundle, draft) {
  return [
    'Проверь черновик ответа по пакету доказательств.',
    'Удаляй или исправляй утверждения без прямой поддержки sources/claims.',
    'Проверяй, что указанные source ID существуют и действительно поддерживают предложение.',
    'Не скрывай противоречия и не смешивай личные наблюдения со справочными источниками.',
    'Верни только исправленный окончательный ответ.',
    '',
    'ПАКЕТ ДОКАЗАТЕЛЬСТВ:',
    bundleJson(bundle),
    '',
    'ЧЕРНОВИК:',
    draft,
  ].join('\n');
}

async function chatCompletion({ baseUrl, model, apiKey, messages, temperature = 0.1, signal }) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpointFor(baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature, stream: false }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Local model request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('The local model returned no message content.');
  }
  return content.trim();
}

export async function answerWithSelfCheck({ baseUrl, model, apiKey = '', bundle, signal }) {
  if (!baseUrl?.trim()) throw new Error('Укажите URL локального OpenAI-compatible сервера.');
  if (!model?.trim()) throw new Error('Укажите имя локальной модели.');

  const draft = await chatCompletion({
    baseUrl,
    model,
    apiKey,
    signal,
    messages: [
      {
        role: 'system',
        content:
          'Ты работаешь как retrieval-first ассистент. Используй только предоставленные источники и всегда цитируй их ID.',
      },
      { role: 'user', content: createGroundedAnswerPrompt(bundle) },
    ],
  });

  const final = await chatCompletion({
    baseUrl,
    model,
    apiKey,
    signal,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'Ты независимый факт-чекер. Исправляй ответ по источникам, удаляй неподтвержденные выводы и сохраняй точные цитаты-ID.',
      },
      { role: 'user', content: createVerificationPrompt(bundle, draft) },
    ],
  });

  return { draft, final };
}
