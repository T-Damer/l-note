import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KNOWLEDGE_APPLICATION_ADAPTER_VERSION,
  LNOTE_CONTRACT_VERSION,
  defineKnowledgeApplicationAdapter,
} from 'l-note/core';
import { createMiniSearchPort } from 'l-note/adapters/browser';
import {
  MINIMED_ADAPTER_CONTRACT_VERSION,
  defineMiniMedAdapter,
} from 'l-note/integrations/minimed';

test('package entrypoints expose the stable core, browser adapters and MiniMed boundary', () => {
  assert.equal(LNOTE_CONTRACT_VERSION, '0.1.0');
  assert.equal(KNOWLEDGE_APPLICATION_ADAPTER_VERSION, '0.1.0');
  assert.equal(MINIMED_ADAPTER_CONTRACT_VERSION, '0.1.0');
  assert.equal(typeof defineKnowledgeApplicationAdapter, 'function');
  assert.equal(typeof createMiniSearchPort, 'function');
  assert.equal(typeof defineMiniMedAdapter, 'function');
});
