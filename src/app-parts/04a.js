  sourcePanel.append(Text({ variant: 'title', as: 'h2', text: 'Источники' }));
  for (const source of evidence.sources) {
    sourcePanel.append(SourceCard({
      sourceId: source.id,
      title: `${source.result.documentTitle} — ${source.result.title}`,
      type: source.document?.source?.title ?? source.result.packTitle ?? 'Справочный источник',
      excerpt: `${source.result.body.slice(0, 340)}${source.result.body.length > 340 ? '…' : ''}`,
      onOpen: () => navigateResource('document', source.result.documentId, { sectionId: source.result.sectionId }),
    }));
  }
  if (!evidence.sources.length) sourcePanel.append(Text({ variant: 'muted', text: 'Нет справочных источников для ответа.' }));
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
  const mode = selectedAnswerModeProfile();
  const results = state.search.search(query, {
    limit: Math.max(18, mode.sourceLimit * 4),
    personalPriority: true,
  });
  state.currentEvidence = collectEvidence(query, results, state.knowledge, { sourceLimit: mode.sourceLimit });
  state.currentEvidenceModeId = mode.id;
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
  const profile = selectedLocalModelProfile();
  const mode = selectedAnswerModeProfile();
  dom.aiStatus.textContent = `${profile.label} · режим «${mode.label}»: источники собраны. Можно запустить локальный ответ.`;
}

async function loadOrRunLocalAi(button) {
  if (!state.localAi.available) {
    toast('WebGPU или Web Worker недоступен. Поиск по базе остаётся рабочим на странице «Поиск».', 'error');
    return;
  }

  const selectedModelId = dom.localAiModel.value;
  const selectedProfile = selectedLocalModelProfile();
  const selectedMode = selectedAnswerModeProfile();
  const selectedReady = state.localAiReady && state.localAi.modelId === selectedModelId;
  const query = dom.askInput.value.trim();
  const evidenceMatchesQuestion = Boolean(
    state.currentEvidence
      && state.currentEvidence.query === query
      && state.currentEvidenceModeId === selectedMode.id,
  );
  const action = resolveLocalModelAction({
    modelReady: selectedReady,
    hasEvidence: evidenceMatchesQuestion,
    hasQuestion: Boolean(query),
  });

  if (action === LOCAL_MODEL_ACTION.LOAD) {
    const persistence = await requestPersistentStorage();
    beginLocalModelLoad(selectedProfile);
    try {
      const loaded = await state.localAi.load({
        modelId: selectedModelId,
        onProgress: reportLocalModelProgress,
      });
      state.lastModelLoad = loaded;
      state.localAiReady = true;
      state.storagePersistence = persistence;
      markLocalModelCached(selectedModelId, true);
      finishLocalModelLoad();
      const loadKind = loaded.cachedBeforeLoad ? 'включена из дискового кэша' : 'скачана и включена';
      dom.aiStatus.textContent = `${selectedProfile.label} ${loadKind} в Web Worker за ${formatModelDuration(loaded.loadMs)}. ${storagePersistenceLabel(persistence)}.`;
      toast(`${selectedProfile.label} включена. В памяти находится только одна модель; веса остаются на диске.`);
    } catch (error) {
      state.localAiReady = false;
      rejectLocalModelLoad(error);
      toast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      renderModelPageState();
    }
    return;
  }

  if (action === LOCAL_MODEL_ACTION.NEEDS_QUESTION) {
    toast('Введите вопрос, чтобы собрать источники и получить ответ.', 'error');
    return;
  }

  if (action === LOCAL_MODEL_ACTION.COLLECT_AND_ANSWER) {
    renderEvidence(buildEvidenceForQuestion(query));
  }

  button.disabled = true;
  button.replaceChildren(
    Icon({ name: 'spinner', className: 'icon model-spinner' }),
    document.createTextNode('Генерация и проверка ссылок…'),
  );
  try {
    const answer = await state.localAi.answer(
      state.currentEvidence.query,
      state.currentEvidence,
      { modeId: selectedMode.id },
    );
    const profile = localModelProfile(answer.modelId);
    const panel = create('article', { className: 'answer-panel' });
    panel.append(create('h2', { text: `Ответ ${profile?.label ?? answer.modelId} · ${answer.modeLabel}` }));
    const body = create('p', { className: 'ai-answer', text: answer.text || 'Модель вернула пустой ответ.' });
    panel.append(body);
    const metrics = create('div', { className: 'storage-summary' });
    metrics.append(
      create('span', { text: `Ответ: ${formatModelDuration(answer.durationMs)}` }),
      create('span', { text: formatGenerationSpeed(answer.tokensPerSecond) }),
      create('span', { text: answer.completionTokens ? `${answer.completionTokens} токенов` : 'Токены не сообщены' }),
      create('span', { text: `контекст ≈${answer.evidenceChars.toLocaleString('ru-RU')} знаков` }),
      create('span', { text: answer.grounded ? 'Ссылки прошли проверку' : 'Ссылки не подтверждены' }),
    );
    panel.append(metrics);
    if (!answer.grounded) {
      panel.append(create('div', {
        className: 'conflict-box',
        text: answer.invalidCitations.length
          ? `Ответ содержит неизвестные ссылки: ${answer.invalidCitations.join(', ')}. Проверяйте его вручную.`
          : 'Ответ не содержит проверяемых ссылок на локальные источники и не считается grounded.',
      }));
    }
    dom.answerOutput.prepend(panel);
    state.localAiRuns.unshift({
      modelId: answer.modelId,
      modeId: answer.modeId,
      loadMs: state.lastModelLoad?.modelId === answer.modelId ? state.lastModelLoad.loadMs : null,
      durationMs: answer.durationMs,
      tokensPerSecond: answer.tokensPerSecond,
      completionTokens: answer.completionTokens,
      grounded: answer.grounded,
      createdAt: new Date().toISOString(),
    });
    state.localAiRuns = state.localAiRuns.slice(0, 6);
    renderModelRunHistory();
    dom.aiStatus.textContent = `${profile?.label ?? answer.modelId} · ${answer.modeLabel}: ответ за ${formatModelDuration(answer.durationMs)}, ${formatGenerationSpeed(answer.tokensPerSecond)}.`;
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    button.disabled = false;
    syncLocalAiButton();
  }
}

async function importPackFile(file) {
  try {
    const pack = JSON.parse(await file.text());
    await installPack(pack, { sizeBytes: file.size });
    toast(`Импортирован пакет «${pack.title}».`);
  } catch (error) {
