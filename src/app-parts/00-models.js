import { DEFAULT_LOCAL_MODEL_ID, LOCAL_MODEL_PROFILES, localModelProfile } from './ai.js';
import {
  ANSWER_MODE_PROFILES,
  DEFAULT_ANSWER_MODE_ID,
  answerModeProfile,
} from './services/answer-modes.js';
import {
  formatDurationMs as formatModelDuration,
  formatGenerationSpeed,
} from './helpers/model-formatters.js';
import { LOCAL_MODEL_ACTION, resolveLocalModelAction } from './services/model-action.js';
import {
  createModelRunRecord,
  loadSelectedLocalModel,
  prependModelRun,
} from './services/local-model-loader.js';
import {
  MODEL_LOAD_STATUS,
  completeModelLoad,
  createModelLoadState,
  failModelLoad,
  startModelLoad,
  updateModelLoadProgress,
} from './services/model-progress.js';
import {
  ANSWER_MODE_SETTING_KEY,
  MODEL_SELECTION_SETTING_KEY,
  modeAfterModelChange,
  resolveLocalModelPreferences,
} from './services/model-preferences.js';
import {
  MODEL_CATALOG_STATUS,
  indexModelCatalog,
  isModelAvailable,
  markModelCached as updateModelCachedCatalog,
  resolveModelLifecycle,
} from './services/model-lifecycle.js';
import { requestPersistentStorage, storagePersistenceLabel } from './services/storage-persistence.js';
import { renderGeneratedLocalAnswer } from './pages/local-answer-view.js';
import { createModelLabView } from './pages/model-lab-view.js';
