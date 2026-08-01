import { ASK_WORKFLOW_RESULT } from '../services/ask-workflow.js';
import { LOCAL_MODEL_ACTION } from '../services/model-action.js';
import { Icon } from '../ui/icons.js';

function requireElement(value, label) {
  if (!(value instanceof HTMLElement)) throw new TypeError(`${label} must be an HTML element.`);
  return value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createAskPageController({
  workflow,
  elements = {},
  renderEvidence,
  onLoadStart,
  onLoadProgress,
  onLoaded,
  onLoadFailed,
  onAnswered,
  onAnswerFailed,
  onRunFinished,
  resetAnswerButton,
  toast,
} = {}) {
  if (!workflow?.collect || !workflow?.plan || !workflow?.execute) {
    throw new TypeError('A complete Ask workflow is required.');
  }
  const input = requireElement(elements.input, 'input');
  const status = requireElement(elements.status, 'status');
  if (typeof renderEvidence !== 'function') throw new TypeError('renderEvidence must be a function.');
  if (typeof toast !== 'function') throw new TypeError('toast must be a function.');

  function question() {
    return input.value.trim();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const query = question();
    if (!query) {
      toast('Сформулируйте вопрос.', 'error');
      return null;
    }
    status.textContent = 'Поиск и сбор локальных источников…';
    try {
      const collected = await workflow.collect(query);
      renderEvidence(collected.evidence);
      const prepared = workflow.plan(query);
      status.textContent = `${prepared.profile.label} · режим «${prepared.mode.label}»: источники собраны. Можно запустить локальный ответ.`;
      return collected;
    } catch (error) {
      toast(errorMessage(error), 'error');
      status.textContent = 'Не удалось собрать источники.';
      return null;
    }
  }

  async function handleRun(button) {
    const prepared = workflow.plan(question());
    if (prepared.kind === ASK_WORKFLOW_RESULT.UNAVAILABLE) {
      toast('WebGPU или Web Worker недоступен. Локальный поиск по базе остаётся рабочим.', 'error');
      return prepared;
    }
    if (prepared.action === LOCAL_MODEL_ACTION.NEEDS_QUESTION) {
      toast('Введите вопрос, чтобы собрать источники и получить ответ.', 'error');
      return Object.freeze({ kind: ASK_WORKFLOW_RESULT.NEEDS_QUESTION });
    }

    const loading = prepared.action === LOCAL_MODEL_ACTION.LOAD;
    if (loading && typeof onLoadStart === 'function') onLoadStart(prepared.profile);
    if (!loading) {
      button.disabled = true;
      button.replaceChildren(
        Icon({ name: 'spinner', className: 'model-spinner' }),
        document.createTextNode('Генерация и проверка ссылок…'),
      );
    }

    try {
      const result = await workflow.execute(prepared, {
        onProgress: onLoadProgress,
        onEvidence: renderEvidence,
      });
      if (result.kind === ASK_WORKFLOW_RESULT.LOADED) {
        if (typeof onLoaded === 'function') await onLoaded(result);
      } else if (result.kind === ASK_WORKFLOW_RESULT.ANSWERED) {
        if (typeof onAnswered === 'function') await onAnswered(result);
      }
      return result;
    } catch (error) {
      if (loading && typeof onLoadFailed === 'function') onLoadFailed(error);
      if (!loading && typeof onAnswerFailed === 'function') onAnswerFailed(error);
      toast(errorMessage(error), 'error');
      return Object.freeze({ kind: 'error', error });
    } finally {
      if (!loading) {
        button.disabled = false;
        if (typeof resetAnswerButton === 'function') resetAnswerButton(button);
      }
      if (typeof onRunFinished === 'function') onRunFinished(prepared);
    }
  }

  return Object.freeze({ handleRun, handleSubmit, question });
}
