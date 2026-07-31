import { formatDurationMs, formatGenerationSpeed } from '../helpers/model-formatters.js';
import { element } from '../ui/dom.js';

function renderMetrics(answer) {
  return element('div', { className: 'storage-summary' }, [
    element('span', { text: `Ответ: ${formatDurationMs(answer.durationMs)}` }),
    element('span', { text: formatGenerationSpeed(answer.tokensPerSecond) }),
    element('span', {
      text: answer.completionTokens ? `${answer.completionTokens} токенов` : 'Токены не сообщены',
    }),
    element('span', {
      text: `контекст ≈${Number(answer.evidenceChars ?? 0).toLocaleString('ru-RU')} знаков`,
    }),
    element('span', {
      text: answer.grounded ? 'Ссылки прошли проверку' : 'Ссылки не подтверждены',
    }),
  ]);
}

function renderGroundingWarning(answer) {
  if (answer.grounded) return null;
  return element('div', {
    className: 'conflict-box',
    text: answer.invalidCitations?.length
      ? `Ответ содержит неизвестные ссылки: ${answer.invalidCitations.join(', ')}. Проверяйте его вручную.`
      : 'Ответ не содержит проверяемых ссылок на локальные источники и не считается grounded.',
  });
}

export function renderGeneratedLocalAnswer({ answer, profile, output }) {
  if (!(output instanceof HTMLElement)) {
    throw new TypeError('renderGeneratedLocalAnswer requires an output element.');
  }
  const modelLabel = profile?.label ?? answer.modelId;
  const panel = element('article', { className: 'answer-panel' }, [
    element('h2', { text: `Ответ ${modelLabel} · ${answer.modeLabel}` }),
    element('p', {
      className: 'ai-answer',
      text: answer.text || 'Модель вернула пустой ответ.',
    }),
    renderMetrics(answer),
    renderGroundingWarning(answer),
  ]);
  output.prepend(panel);
  return {
    panel,
    statusText: `${modelLabel} · ${answer.modeLabel}: ответ за ${formatDurationMs(answer.durationMs)}, ${formatGenerationSpeed(answer.tokensPerSecond)}.`,
  };
}
