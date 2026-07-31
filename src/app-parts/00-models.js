import { DEFAULT_LOCAL_MODEL_ID, LOCAL_MODEL_PROFILES, localModelProfile } from './ai.js';
import {
  ANSWER_MODE_PROFILES,
  DEFAULT_ANSWER_MODE_ID,
  answerModeProfile,
} from './services/answer-modes.js';
import { LOCAL_MODEL_ACTION, resolveLocalModelAction } from './services/model-action.js';
import {
  MODEL_LOAD_STATUS,
  completeModelLoad,
  createModelLoadState,
  failModelLoad,
  startModelLoad,
  updateModelLoadProgress,
} from './services/model-progress.js';
