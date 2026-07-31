import assert from 'node:assert/strict';
import test from 'node:test';

import {
  modeAfterModelChange,
  resolveLocalModelPreferences,
} from '../src/services/model-preferences.js';

const models = [
  { modelId: 'small', recommendedModeId: 'compact' },
  { modelId: 'large', recommendedModeId: 'detailed' },
];
const modes = [{ id: 'compact' }, { id: 'detailed' }];

test('restores a valid model and answer mode', () => {
  assert.deepEqual(resolveLocalModelPreferences({
    storedModelId: 'large',
    storedModeId: 'compact',
    modelProfiles: models,
    answerModes: modes,
    defaultModelId: 'small',
    defaultModeId: 'compact',
  }), { modelId: 'large', modeId: 'compact' });
});

test('falls back to the selected model recommendation', () => {
  assert.deepEqual(resolveLocalModelPreferences({
    storedModelId: 'large',
    storedModeId: 'missing',
    modelProfiles: models,
    answerModes: modes,
    defaultModelId: 'small',
    defaultModeId: 'compact',
  }), { modelId: 'large', modeId: 'detailed' });
});

test('changes mode with the model only when the previous recommendation was followed', () => {
  assert.equal(modeAfterModelChange({
    currentModeId: 'compact',
    previousProfile: models[0],
    nextProfile: models[1],
  }), 'detailed');
  assert.equal(modeAfterModelChange({
    currentModeId: 'detailed',
    previousProfile: models[0],
    nextProfile: models[1],
  }), 'detailed');
});
