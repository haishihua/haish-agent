import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { migrateExecutionRoute, savedExecutionConfigId } from '../../../src/features/settings/model/execution-identity.js';
import { normalizeReasoningEffort, REASONING_EFFORT_OPTIONS } from '../../../src/features/chat/model/run-catalog.js';
import { executionConfigError } from '../../../src/features/workflow/model/execution-config.js';

const source = readFileSync(new URL('../../../src/features/conversations/hooks/useConversationRunConfig.js', import.meta.url), 'utf8');

// Run the production hook with a deterministic effect scheduler, without a DOM or API.
function hookHarness(initial, makeHook = null) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let props = initial;
  let result;
  const changed = (before, after) => !before || after.some((value, index) => !Object.is(value, before[index]));
  const React = {
    useState(value) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof value === 'function' ? value() : value };
      return [slots[index].value, (next) => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(value) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: value };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) {
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const persistence = vm.runInNewContext(`${source.replace("import React from 'react';", '').replace('export function', 'function')}\nuseConversationRunConfig;`, { React });
  const hook = makeHook ? makeHook(React, persistence) : persistence;
  function render() {
    cursor = 0; dirty = false; effects = [];
    result = hook(props);
    for (const effect of effects) effect();
  }
  return {
    get result() { return result; },
    update(next) { props = { ...props, ...next }; render(); },
    async settle() {
      render();
      for (let iteration = 0; iteration < 20; iteration += 1) {
        await new Promise(resolve => setImmediate(resolve));
        if (!dirty) return;
        render();
      }
      assert.fail('hook did not settle');
    },
  };
}

const route = { execution_mode: 'chat', agent_id: 'agent', llm_config_id: 'saved-record', model_id: 'gpt-6.1-sol', reasoning_effort: 'xhigh' };

function fixture(config, saveBlockedReason = '') {
  const observed = [];
  const writes = [];
  const restored = [];
  const sync = {
    load: async () => structuredClone(route),
    observe: (_scope, next) => observed.push(structuredClone(next)),
    flush: async () => { const next = observed.at(-1); writes.push(next); return next; },
  };
  const harness = hookHarness({ sync, conversationId: 'history', scopeId: 'history', config, saveBlockedReason, restore: next => restored.push(next) });
  return { harness, observed, writes, restored };
}

test('restoring a new-format historical route does not observe or save an empty selection', async () => {
  const state = fixture({ ...route, llm_config_id: '' }, 'Chat: select a saved model configuration before sending.');
  await state.harness.settle();
  assert.equal(state.harness.result.ready, true);
  assert.equal(state.restored[0].llm_config_id, 'saved-record');
  assert.equal(state.observed.length, 0);
  assert.equal(state.writes.length, 0);
  await assert.rejects(state.harness.result.ensureSaved(), /select a saved model configuration/);
  await assert.rejects(state.harness.result.changeAgent('another-agent'), /select a saved model configuration/);
  assert.equal(state.writes.length, 0);
});

test('Settings loading or an unavailable record never replaces the stored route', async () => {
  const state = fixture({ ...route, llm_config_id: 'removed-record' }, 'Chat: the selected configuration is unavailable.');
  await state.harness.settle();
  assert.equal(state.observed.length, 0);
  assert.equal(state.writes.length, 0);
  state.harness.update({ config: route, saveBlockedReason: '', loading: true });
  await state.harness.settle();
  assert.equal(state.writes.length, 0);
  state.harness.update({ loading: false });
  await state.harness.settle();
  assert.equal(state.writes.length, 0); // Restored route already matches the server.
  assert.equal((await state.harness.result.ensureSaved()).llm_config_id, 'saved-record');
});

test('an explicit valid replacement is saved after recovery and preserves model/effort', async () => {
  const state = fixture({ ...route, llm_config_id: '' }, 'Select a configuration.');
  await state.harness.settle();
  const replacement = { ...route, llm_config_id: 'explicitly-selected-record' };
  state.harness.update({ config: replacement, saveBlockedReason: '' });
  await state.harness.settle();
  assert.equal(state.writes.length, 1);
  assert.deepEqual(state.writes[0], replacement);
  assert.deepEqual(JSON.parse(JSON.stringify(await state.harness.result.ensureSaved())), replacement);
});

test('conflicting restored identities block all saves until an explicit provider selection', async () => {
  const options = ['record-a', 'record-b'].map(id => ({ id, defaultModelId: 'synthetic-model' }));
  const conflict = { ...route, llm_config_id: 'record-a', provider: 'record-b', model_id: 'synthetic-model' };
  const writes = [];
  const observed = [];
  const storageWrites = [];
  const selectionSource = readFileSync(new URL('../../../src/features/chat/hooks/useRunConfig.js', import.meta.url), 'utf8');
  const sync = {
    load: async () => structuredClone(conflict),
    observe: (_scope, next) => observed.push(structuredClone(next)),
    flush: async () => { writes.push(observed.at(-1)); return observed.at(-1); },
  };
  const harness = hookHarness({ providerOptions: options }, (React, persistence) => {
    const selectionHook = vm.runInNewContext(`${selectionSource.replace(/^import .*;\n/gm, '').replace(/export /g, '')}\nusePersistentRunConfig;`, {
      React, migrateExecutionRoute, savedExecutionConfigId, normalizeReasoningEffort, REASONING_EFFORT_OPTIONS,
      window: { localStorage: { getItem: () => null, setItem: (_key, value) => storageWrites.push(JSON.parse(value)) } },
    });
    return props => {
      const selection = selectionHook({ selectionStorageKey: 'fixture', providerOptions: props.providerOptions,
        agentOptions: [{ id: 'agent' }], defaultAgentId: 'agent' });
      const config = { ...route, llm_config_id: selection.providerId, model_id: selection.modelId,
        reasoning_effort: selection.reasoningEffort, ...(selection.legacyProvider ? { provider: selection.legacyProvider } : {}) };
      const guard = executionConfigError({ provider: selection.providerId, legacyProvider: selection.legacyProvider,
        modelId: selection.modelId, providerOptions: props.providerOptions });
      const saved = persistence({ sync, scopeId: 'fixture', conversationId: 'history', config,
        saveBlockedReason: guard, restore: selection.restoreConfig });
      return { selection, saved, config, guard };
    };
  });
  await harness.settle();
  assert.match(harness.result.guard, /conflicting/);
  assert.equal(harness.result.config.llm_config_id, 'record-a');
  assert.equal(harness.result.config.provider, 'record-b');
  assert.equal(writes.length, 0);
  assert.equal(observed.length, 0);
  assert.equal(storageWrites.length, 0);
  await assert.rejects(harness.result.saved.ensureSaved(), /conflicting/);
  harness.result.selection.setModelId('another-model');
  harness.result.selection.setReasoningEffort('low');
  await harness.settle();
  assert.match(harness.result.guard, /conflicting/);
  assert.equal(writes.length, 0);
  harness.update({ providerOptions: [] });
  await harness.settle();
  harness.update({ providerOptions: options });
  await harness.settle();
  assert.match(harness.result.guard, /conflicting/);
  assert.equal(harness.result.config.provider, 'record-b');
  harness.result.selection.setProviderId('record-b');
  await harness.settle();
  assert.equal(harness.result.guard, '');
  assert.equal(harness.result.config.provider, undefined);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].llm_config_id, 'record-b');
});

test('composer passes the route error to persistence and retains the restored identity', () => {
  const composer = readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
  const syncCall = composer.slice(composer.indexOf('useConversationRunConfig({'), composer.indexOf('async function changeAgent'));
  assert.match(syncCall, /saveBlockedReason: modelConfigError/);
  assert.match(syncCall, /llm_config_id: executionMode === 'bot' \? null : providerId/);
});
