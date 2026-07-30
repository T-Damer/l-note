  sourcePanel.append(create('h2', { text: 'Источники' }));
  for (const source of evidence.sources) {
    const chip = create('button', { className: 'source-chip', type: 'button' }, [
      create('b', { text: `[${source.id}]` }),
      create('span', { text: `${source.result.documentTitle} — ${source.result.title}: ${source.result.body.slice(0, 340)}${source.result.body.length > 340 ? '…' : ''}` }),
    ]);
    chip.addEventListener('click', () => openDocument(source.result));
    sourcePanel.append(chip);
  }
  if (!evidence.sources.length) sourcePanel.append(create('p', { text: 'Нет справочных источников для ответа.' }));
  dom.answerOutput.append(sourcePanel);

  if (evidence.relatedNotes.length) {
    const notesPanel = create('article', { className: 'answer-panel' });
    notesPanel.append(create('h2', { text: 'Личный слой' }));
    const list = create('ul');
    for (const note of evidence.relatedNotes) {
      const item = create('li', {}, [
        create('strong', { text: `${relationLabel(note.relation)}: ` }),
        document.createTextNode(`${note.title} — ${note.body.slice(0, 260)}`),
      ]);
      list.append(item);
    }
    notesPanel.append(list);
    dom.answerOutput.append(notesPanel);
  }
}

function buildEvidenceForQuestion(query) {
  const results = state.search.search(query, { limit: 18, personalPriority: true });
  state.currentEvidence = collectEvidence(query, results, state.knowledge, 8);
  return state.currentEvidence;
}

async function handleAsk(event) {
  event.preventDefault();
  const query = dom.askInput.value.trim();
  if (!query) {
    toast('Сформулируйте вопрос.', 'error');
    return;
  }
  const evidence = buildEvidenceForQuestion(query);
  renderEvidence(evidence);
  dom.aiStatus.textContent = state.localAiReady
    ? `Модель ${state.localAi.modelId} готова. Нажмите «Подключить локальный WebLLM» ещё раз, чтобы получить ответ.`
    : 'Доказательства собраны без модели. Локальный WebLLM можно подключить отдельно.';
}

async function loadOrRunLocalAi(button) {
  if (!state.currentEvidence) {
    const query = dom.askInput.value.trim();
    if (!query) {
      toast('Сначала введите вопрос и соберите доказательства.', 'error');
      return;
    }
    renderEvidence(buildEvidenceForQuestion(query));
  }
  if (!state.localAi.available) {
    toast('WebGPU недоступен. Доказательная сводка остаётся полностью рабочей.', 'error');
    return;
  }
  if (!state.localAiReady) {
    button.disabled = true;
    button.textContent = 'Загрузка модели…';
    try {
      const model = await state.localAi.load({
        onProgress: (progress) => {
          dom.aiStatus.textContent = progress.text ?? `Загрузка: ${Math.round(Number(progress.progress ?? 0) * 100)}%`;
        },
      });
      state.localAiReady = true;
      button.textContent = 'Ответить локальной моделью';
      dom.aiStatus.textContent = `Модель ${model} закэширована в браузере и готова.`;
      toast('Локальная модель готова. Повторное открытие будет использовать кэш.');
    } catch (error) {
      button.textContent = 'Подключить локальный WebLLM';
      toast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      button.disabled = false;
    }
    return;
  }

  button.disabled = true;
  button.textContent = 'Факт-чекинг…';
  try {
    const answer = await state.localAi.answer(state.currentEvidence.query, state.currentEvidence);
    const panel = create('article', { className: 'answer-panel' });
    panel.append(create('h2', { text: 'Ответ локальной модели' }));
    const body = create('p', { className: 'ai-answer', text: answer.text || 'Модель вернула пустой ответ.' });
    panel.append(body);
    if (!answer.grounded) {
      panel.append(create('div', {
        className: 'conflict-box',
        text: answer.invalidCitations.length
          ? `Ответ содержит неизвестные ссылки: ${answer.invalidCitations.join(', ')}. Проверяйте его вручную.`
          : 'Ответ не содержит проверяемых ссылок на локальные источники и не считается grounded.',
      }));
    }
    dom.answerOutput.prepend(panel);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Ответить локальной моделью';
  }
}

async function importPackFile(file) {
  try {
    const pack = JSON.parse(await file.text());
    await installPack(pack, { sizeBytes: file.size });
    toast(`Импортирован пакет «${pack.title}».`);
  } catch (error) {
