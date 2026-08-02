import { formatDurationMs, formatGenerationSpeed } from '../helpers/model-formatters.js';
import { element } from '../ui/dom.js';

function verificationLabel(answer) {
  if (answer.supportVerification) {
    return answer.supportVerification.supported
      ? 'Утверждения поддержаны источниками'
      : 'Есть неподтверждённые утверждения';
  }
  return answer.grounded ? 'ID ссылок прошли проверку' : 'Ссылки не подтверждены';
}

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
    element('span', { text: verificationLabel(answer) }),
  ]);
}

function unsupportedList(answer) {
  const values = answer.unsupportedStatements ?? [];
  if (!values.length) return null;
  return element('details', { className: 'answer-verification-details' }, [
    element('summary', { text: `Показать неподтверждённые утверждения · ${values.length}` }),
    element('ul', {}, values.slice(0, 12).map((value) => element('li', { text: value }))),
  ]);
}

function renderGroundingWarning(answer) {
  if (answer.grounded) return null;
  let message = 'Ответ не прошёл проверку поддержки утверждений источниками. Проверяйте его вручную.';
  if (answer.invalidCitations?.length) {
    message = `Ответ содержит неизвестные ссылки: ${answer.invalidCitations.join(', ')}.`;
  } else if (!answer.supportVerification) {
    message = 'Ответ не содержит проверяемых ссылок на локальные источники.';
  }
  return element('div', { className: 'conflict-box' }, [
    element('p', { text: message }),
    unsupportedList(answer),
  ].filter(Boolean));
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
