function buildEvidenceForQuestion(query) {
  const mode = selectedAnswerModeProfile();
  const collected = collectQuestionEvidence({
    query,
    mode,
    searchPort: state.search,
    knowledgeState: state.knowledge,
    collectEvidence,
  });
  state.currentEvidence = collected.evidence;
  state.currentEvidenceModeId = collected.modeId;
  return collected.evidence;
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
  const action = resolveLocalModelAction({
    modelReady: selectedReady,
    hasEvidence: evidenceMatchesRequest(
      state.currentEvidence,
      query,
      state.currentEvidenceModeId,
      selectedMode.id,
    ),
    hasQuestion: Boolean(query),
  });

  if (action === LOCAL_MODEL_ACTION.LOAD) {
    beginLocalModelLoad(selectedProfile);
    try {
      const { loaded, persistence } = await loadSelectedLocalModel({
        modelPort: state.localAi,
        modelId: selectedModelId,
        onProgress: reportLocalModelProgress,
        requestPersistence: requestPersistentStorage,
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
    const rendered = renderGeneratedLocalAnswer({ answer, profile, output: dom.answerOutput });
    const record = createModelRunRecord(answer, state.lastModelLoad);
    state.localAiRuns = prependModelRun(state.localAiRuns, record);
    renderModelRunHistory();
    dom.aiStatus.textContent = rendered.statusText;
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