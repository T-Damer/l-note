const askWorkflow = createAskWorkflow({
  modelPort: state.localAi,
  getSearchPort: () => state.search,
  getKnowledgeState: () => state.knowledge,
  getSelectedProfile: selectedLocalModelProfile,
  getSelectedMode: selectedAnswerModeProfile,
  isModelReady: modelIsReady,
  getEvidenceSnapshot: () => ({
    evidence: state.currentEvidence,
    modeId: state.currentEvidenceModeId,
  }),
  setEvidenceSnapshot({ evidence, modeId }) {
    state.currentEvidence = evidence;
    state.currentEvidenceModeId = modeId;
  },
  collectEvidence,
  requestPersistence: requestPersistentStorage,
});

const askPageController = createAskPageController({
  workflow: askWorkflow,
  elements: {
    input: dom.askInput,
    status: dom.aiStatus,
  },
  renderEvidence,
  onLoadStart: beginLocalModelLoad,
  onLoadProgress: reportLocalModelProgress,
  async onLoaded({ loaded, persistence, profile }) {
    state.lastModelLoad = loaded;
    state.localAiReady = true;
    state.storagePersistence = persistence;
    markLocalModelCached(profile.modelId, true);
    finishLocalModelLoad();
    const loadKind = loaded.cachedBeforeLoad ? 'включена из дискового кэша' : 'скачана и включена';
    dom.aiStatus.textContent = `${profile.label} ${loadKind} в Web Worker за ${formatModelDuration(loaded.loadMs)}. ${storagePersistenceLabel(persistence)}.`;
    toast(`${profile.label} включена. В памяти находится только одна модель; веса остаются на диске.`);
  },
  onLoadFailed(error) {
    state.localAiReady = false;
    rejectLocalModelLoad(error);
  },
  async onAnswered({ answer }) {
    const profile = localModelProfile(answer.modelId);
    const rendered = renderGeneratedLocalAnswer({ answer, profile, output: dom.answerOutput });
    const record = createModelRunRecord(answer, state.lastModelLoad);
    state.localAiRuns = prependModelRun(state.localAiRuns, record);
    renderModelRunHistory();
    dom.aiStatus.textContent = rendered.statusText;
  },
  resetAnswerButton: syncLocalAiButton,
  onRunFinished: renderModelPageState,
  toast,
});

function handleAsk(event) {
  return askPageController.handleSubmit(event);
}

function loadOrRunLocalAi(button) {
  return askPageController.handleRun(button);
}

Object.assign(state, { askWorkflow });
Object.assign(dom, { askPageController });
