const inspectModelsThroughRuntime = state.localAi.inspectModels.bind(state.localAi);
let localModelInspectionEnabled = false;
let localModelInspectionResolved = false;
let localModelInspectionPromise = null;

state.localAi.inspectModels = async function inspectModelsOnlyForAskPage(options = {}) {
  if (localModelInspectionEnabled) return inspectModelsThroughRuntime(options);
  return LOCAL_MODEL_PROFILES.map((profile) => ({
    ...profile,
    available: true,
    record: null,
    cached: null,
  }));
};

async function ensureLocalModelCatalogInspection() {
  if (localModelInspectionResolved) return;
  if (!localModelInspectionPromise) {
    localModelInspectionEnabled = true;
    localModelInspectionPromise = refreshLocalModelCatalogState()
      .then(() => {
        localModelInspectionResolved = true;
      })
      .finally(() => {
        localModelInspectionPromise = null;
      });
  }
  return localModelInspectionPromise;
}

const showBasePageWithoutModelInspection = showBasePage;
showBasePage = function showBasePageWithLazyModelInspection(page, options = {}) {
  showBasePageWithoutModelInspection(page, options);
  if (normalizeBaseRoute(page) !== 'ask') return;
  queueMicrotask(() => {
    void ensureLocalModelCatalogInspection().catch((error) => {
      console.warn('Local model cache inspection failed.', error);
    });
  });
};
