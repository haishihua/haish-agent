import test from 'node:test';
import assert from 'node:assert/strict';

import { providerBrandForModel } from '../../../src/shared/lib/provider-brand.js';

test('model ids resolve to their vendor brand', () => {
  const cases = {
    'ai router-ds/deepseek-v4-flash': 'deepseek',
    'deepseek-v4-flash': 'deepseek',
    'ds-v4-flash': 'deepseek',
    'gpt-6.1-terra': 'openai',
    'o3-mini': 'openai',
    'claude-opus-5-5': 'anthropic',
    'gemini-2.5-pro': 'gemini',
    'grok-4.7': 'xai',
    'glm-5.3': 'zhipu',
    'kimi-k2.7-code': 'moonshot',
    'qwen3-max': 'dashscope',
    'minimax-m3': 'minimax',
  };
  for (const [id, brand] of Object.entries(cases)) {
    assert.equal(providerBrandForModel(id), brand, `${id} should map to ${brand}`);
  }
});

test('unknown vendors fall back to no brand instead of guessing', () => {
  for (const id of ['llama3.2', 'mistral-large', 'ai router-unknown', '', null, undefined]) {
    assert.equal(providerBrandForModel(id), '');
  }
});
