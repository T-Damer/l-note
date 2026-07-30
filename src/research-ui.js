import { answerWithLocalModel, loadLocalModel, localAiCapability } from './ai.js';
import { buildDeterministicBriefing } from './core.js';
import { listNotes } from './db.js';
import { searchKnowledge } from './search.js';
import { state } from './state.js';
import { $, clear, node, setBusy, toast } from './ui.js';

export async function runResearch() {
  const question = $('#research-question').value.trim();
  if (!question) return;
  const button = $('#research-run');
  setBusy(button, true, 'Исследование…');
  try {
    const output = await searchKnowledge(question, { includeNotes: false, limit: 8 });
    state.researchEvidence = output.results
      .filter((item) => item.kind !== 'note')
      .slice(0, 6);
    const notes = await listNotes();
    const briefing = buildDeterministicBriefing(question, state.researchEvidence, notes);
    renderBriefing(briefing);
    renderResearchEvidence();
  } catch (error) {
    console.error(error);
    toast(`Не удалось собрать сводку: ${error.message}`, 'error');
  } finally {
    setBusy(button, false);
  }
}

function renderResearchEvidence() {
  const list = clear($('#research-evidence'));
  state.researchEvidence.forEach((item, index) => {
    list.append(
      node(
        'article',
        { class: 'evidence-card' },
        node('span', { class: 'evidence-id' }, `E${index + 1}`),
        node(
          'div',
          {},
          node('strong', {}, item.documentTitle),
          node('p', {}, item.sectionTitle),
          node('p', {}, item.text),
        ),
      ),
    );
  });
}

function renderBriefing(briefing) {
  const target = clear($('#research-briefing'));
  target.append(node('p', { class: 'lead' }, briefing.summary));
  if (briefing.findings.length) {
    target.append(node('h3', {}, 'Найденные положения'));
    for (const finding of briefing.findings) {
      target.append(
        node(
          'article',
          { class: 'briefing-item' },
          node('strong', {}, `[${finding.id}] ${finding.title}`),
          node('p', {}, finding.text),
        ),
      );
    }
  }
  if (briefing.refinements.length) {
    target.append(node('h3', {}, 'Практические уточнения'));
    for (const note of briefing.refinements) {
      target.append(node('p', { class: 'note-preview' }, `${note.title}: ${note.body}`));
    }
  }
  if (briefing.conflicts.length) {
    target.append(node('h3', {}, 'Противоречащие заметки'));
    for (const note of briefing.conflicts) {
      target.append(node('p', { class: 'conflict-preview' }, `${note.title}: ${note.body}`));
    }
  }
  if (briefing.gaps.length) {
    target.append(node('h3', {}, 'Ограничения'));
    for (const gap of briefing.gaps) target.append(node('p', {}, gap));
  }
}

export function renderResearchState() {
  const capability = localAiCapability();
  $('#ai-capability').textContent = capability.webGpu
    ? 'WebGPU доступен: можно загрузить компактную модель в память браузера.'
    : 'WebGPU недоступен: детерминированная сводка продолжает работать без модели.';
  $('#ai-load').disabled = !capability.webGpu;
}

export async function handleLoadModel() {
  const button = $('#ai-load');
  setBusy(button, true, 'Подготовка модели…');
  const progress = $('#ai-progress');
  progress.removeAttribute('hidden');
  try {
    const loaded = await loadLocalModel((item) => {
      progress.value = Math.round((item.progress ?? 0) * 100);
      $('#ai-progress-label').textContent = item.text ?? `Загрузка ${progress.value}%`;
    });
    $('#ai-model-name').textContent = loaded.modelId;
    $('#ai-generate').disabled = false;
    button.textContent = 'Модель загружена';
    button.disabled = true;
    toast('Локальная модель готова. Её файлы остаются в кэше браузера.', 'success');
  } catch (error) {
    console.error(error);
    toast(`Модель не загрузилась: ${error.message}`, 'error');
    setBusy(button, false);
  }
}

export async function handleGenerateAnswer() {
  const question = $('#research-question').value.trim();
  if (!question || !state.researchEvidence.length) {
    toast('Сначала выполните исследование и получите фрагменты источников.', 'warning');
    return;
  }
  const button = $('#ai-generate');
  setBusy(button, true, 'Модель проверяет источники…');
  try {
    const notes = await listNotes();
    const output = await answerWithLocalModel(question, state.researchEvidence, notes);
    const target = clear($('#ai-answer'));
    target.append(node('h3', {}, `Ответ модели · ${output.modelId}`));
    target.append(node('pre', { class: 'ai-answer-text' }, output.answer));
    if (!output.validation.valid) {
      target.append(
        node(
          'div',
          { class: 'validation-warning' },
          node('strong', {}, 'Проверка цитат не пройдена.'),
          node(
            'p',
            {},
            `Неизвестные ссылки: ${output.validation.unknown.join(', ') || 'нет'}. Абзацев без ссылок: ${output.validation.uncitedParagraphs.length}.`,
          ),
        ),
      );
    } else {
      target.append(
        node(
          'p',
          { class: 'validation-ok' },
          `Все ссылки модели разрешаются в локальные фрагменты: ${output.validation.cited.join(', ')}.`,
        ),
      );
    }
  } catch (error) {
    console.error(error);
    toast(`Локальный ответ не создан: ${error.message}`, 'error');
  } finally {
    setBusy(button, false);
  }
}
