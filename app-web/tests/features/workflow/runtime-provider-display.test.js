import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeProviderDisplay } from '../../../src/features/workflow/model/runtime-provider-display.js';

const providers = [{ id: 'profile-a', requestProvider: 'profile-a', provider: 'openai', label: 'Source Provider' }];
test('runtime provider display uses exact profile identity, not first same-brand profile', () => {
  assert.deepEqual(runtimeProviderDisplay('profile-a', providers, true), { selected: providers[0], label: 'Source Provider', provider: 'openai' });
  assert.deepEqual(runtimeProviderDisplay('openai', providers, true), { selected: null, label: 'OpenAI', provider: 'openai' });
});
test('read-only snapshots retain brand icons without claiming current provider availability', () => {
  assert.deepEqual(runtimeProviderDisplay('anthropic', [], true), { selected: null, label: 'Anthropic', provider: 'anthropic' });
  assert.deepEqual(runtimeProviderDisplay('deleted-profile', [], true), { selected: null, label: 'deleted-profile', provider: 'custom' });
  assert.deepEqual(runtimeProviderDisplay('openai', [], false), { selected: null, label: 'Unavailable: openai', provider: 'openai' });
});
