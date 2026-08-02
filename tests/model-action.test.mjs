import assert from 'node:assert/strict';
import test from 'node:test';

import { LOCAL_MODEL_ACTION, resolveLocalModelAction } from '../src/services/model-action.js';

test('an uninstalled model can be loaded without a question or evidence', () => {
  assert.equal(
    resolveLocalModelAction({ modelReady: false, hasQuestion: false, hasEvidence: false }),
    LOCAL_MODEL_ACTION.LOAD,
  );
});

test('a loaded model asks for a question only when no evidence exists', () => {
  assert.equal(
    resolveLocalModelAction({ modelReady: true, hasQuestion: false, hasEvidence: false }),
    LOCAL_MODEL_ACTION.NEEDS_QUESTION,
  );
  assert.equal(
    resolveLocalModelAction({ modelReady: true, hasQuestion: true, hasEvidence: false }),
    LOCAL_MODEL_ACTION.COLLECT_AND_ANSWER,
  );
  assert.equal(
    resolveLocalModelAction({ modelReady: true, hasQuestion: false, hasEvidence: true }),
    LOCAL_MODEL_ACTION.ANSWER,
  );
});
