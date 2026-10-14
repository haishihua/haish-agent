import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { migrateExecutionRoute, savedExecutionConfigId } from '../../../src/features/settings/model/execution-identity.js';
import { normalizeReasoningEffort, REASONING_EFFORT_OPTIONS } from '../../../src/features/chat/model/run-catalog.js';
import { executionConfigError } from '../../../src/features/workflow/model/execution-config.js';
import { createRunConfigSync } from '../../../src/features/conversations/model/run-config-sync.js';
import { waitForAttemptRunConfig } from '../../../src/features/conversations/model/attempt-run-config.js';
import { createConversationHandlers } from '../../../src/features/conversations/hooks/createConversationHandlers.js';

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
  const persistence = vm.runInNewContext(`${source.replace(/^import .*;\n/gm, '').replace('export function', 'function')}\nuseConversationRunConfig;`, { React, setTimeout, structuredClone, waitForAttemptRunConfig });
  const hook = makeHook ? makeHook(React, persistence) : persistence;
  function render() {
    cursor = 0; dirty = false; effects = [];
    result = hook(props);
    for (const effect of effects) effect();
  }
  return {
    get result() { return result; },
    update(next) { props = { ...props, ...next }; render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
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

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function retryAction(ensureSaved, calls) {
  const panel = readFileSync(new URL('../../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
  const callback = panel.slice(panel.indexOf('const retryMessage = React.useCallback('), panel.indexOf('const editMessage = React.useCallback('));
  const runtime = { taskRuntimeState: { tasksById: {} } };
  const handlers = createConversationHandlers({ getRuntime: () => runtime, showToast: () => {},
    buildDeployRequest: (_text, _attachment, modelId, reasoningEffort, _images, agentId, provider) => ({ modelId, reasoningEffort, agentId, provider }),
    startDeploy: (config, conversationId) => { calls.push({ id: 'source', conversationId, config }); return true; } });
  return vm.runInNewContext(`${callback}\nretryMessage;`, {
    React: { useCallback: fn => fn },
    composerRunConfigRef: { current: { ensureSaved } },
    rowActionRef: { current: { onRetryTask: (id, config) => handlers.handleRetryTask({ taskId: id, conversationId: 'history', executionMode: 'chat' }, null, config) } },
  });
}

test('Retry waits for delayed configuration restore and uses the current save callback', async () => {
  const load = deferred();
  const calls = [], writes = [];
  let loads = 0;
  const sync = createRunConfigSync({
    get: () => { loads += 1; return load.promise; },
    save: async (_id, config) => { writes.push(config); return config; },
  });
  const harness = hookHarness({ sync, conversationId: 'history', scopeId: 'history', config: { ...route, llm_config_id: '' },
    restore: () => {}, saveBlockedReason: 'Select a configuration.', readOnly: true });
  await harness.settle();
  const retry = retryAction(harness.result.ensureSaved, calls);
  const pending = retry({ taskId: 'source' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 0);
  load.resolve(route);
  await harness.settle();
  // A new render has restored a newer selection. The click's initial closure
  // was unready; it must use this render's config and persist callback instead.
  const selected = { ...route, reasoning_effort: 'low' };
  harness.update({ config: selected, saveBlockedReason: '' });
  await harness.settle();
  assert.equal(await pending, true);
  assert.equal(loads, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].reasoning_effort, 'low');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'source');
  assert.equal(calls[0].config.reasoningEffort, 'low');
});

test('Retry clicked during a model catalog refresh uses the valid route without waiting for picker metadata', async () => {
  const catalog = deferred();
  const calls = [], writes = [];
  let catalogRequests = 0;
  const options = [{ id: route.llm_config_id, provider: 'openai', authMode: 'oauth',
    defaultModelId: route.model_id, modelOptions: [route.model_id], defaultReasoningEffort: 'high' }];
  const selectionSource = readFileSync(new URL('../../../src/features/chat/hooks/useRunConfig.js', import.meta.url), 'utf8');
  const sync = createRunConfigSync({ get: async () => route, save: async (_id, config) => { writes.push(config); return config; } });
  const harness = hookHarness({}, (React, persistence) => {
    const hooks = vm.runInNewContext(`${selectionSource.replace(/^import .*;\n/gm, '').replace(/export /g, '')}\n({usePersistentRunConfig, useProviderModels});`, {
      React, migrateExecutionRoute, savedExecutionConfigId, normalizeReasoningEffort, REASONING_EFFORT_OPTIONS,
      API_BASE: '', AbortController, console,
      apiFetch: () => { catalogRequests += 1; return catalog.promise; },
      window: { localStorage: { getItem: () => null, setItem: () => {} }, setTimeout, clearTimeout },
    });
    return () => {
      const selection = hooks.usePersistentRunConfig({ selectionStorageKey: 'fixture', providerOptions: options,
        agentOptions: [{ id: 'agent' }], defaultAgentId: 'agent' });
      const models = hooks.useProviderModels(options.find(item => item.id === selection.providerId));
      const config = { ...route, llm_config_id: selection.providerId, model_id: selection.modelId, reasoning_effort: selection.reasoningEffort };
      const saved = persistence({ sync, conversationId: 'history', scopeId: 'history', config,
        restore: selection.restoreConfig, loading: models.loading,
        saveBlockedReason: executionConfigError({ provider: selection.providerId, modelId: selection.modelId, providerOptions: options }) });
      return { saved, models };
    };
  });
  await harness.settle();
  assert.equal(harness.result.saved.ready, true);
  assert.equal(harness.result.models.loading, false);
  assert.equal(harness.result.models.refreshing, true);
  const pending = retryAction(harness.result.saved.ensureSaved, calls)({ taskId: 'source' });
  await pending;
  assert.equal(catalogRequests, 1);
  assert.equal(writes.length, 0);
  assert.equal(harness.result.models.loading, false);
  assert.equal(harness.result.models.refreshing, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.provider, route.llm_config_id);
  assert.equal(calls[0].config.modelId, route.model_id);
  assert.equal(calls[0].config.reasoningEffort, 'xhigh');
  harness.unmount();
});

test('Retry survives conversation switches and unmount without using another selection', async () => {
  for (const leaving of ['switch', 'unmount']) {
    const load = deferred();
    const restored = [], writes = [], calls = [];
    const other = { ...route, llm_config_id: 'other-provider', model_id: 'other-model' };
    const sync = createRunConfigSync({ get: id => id === 'history' ? load.promise : Promise.resolve(other),
      save: async (id, config) => { writes.push({ id, config }); return config; } });
    const harness = hookHarness({ sync, conversationId: 'history', scopeId: 'history', config: { ...route, llm_config_id: '' },
      restore: config => restored.push(config), validateConfig: config => config.llm_config_id ? '' : 'Missing provider.' });
    await harness.settle();
    const pending = retryAction(harness.result.ensureSaved, calls)({ taskId: 'source' });
    if (leaving === 'unmount') harness.unmount();
    else {
      harness.update({ conversationId: 'other', scopeId: 'other', config: other });
      await harness.settle();
    }
    load.resolve(route);
    // No React render for the old conversation is needed to finish the action.
    assert.equal(await pending, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].conversationId, 'history');
    assert.equal(calls[0].config.provider, route.llm_config_id);
    assert.equal(calls[0].config.modelId, route.model_id);
    assert.equal(writes.length, 0);
    assert.equal(restored.some(config => config.llm_config_id === route.llm_config_id), false);
  }
});

test('Retry keeps the originating in-flight save across navigation and unmount', async () => {
  for (const leaving of ['switch', 'unmount']) {
    const save = deferred();
    const calls = [], writes = [];
    const other = { ...route, llm_config_id: 'other-provider', model_id: 'other-model' };
    const sync = createRunConfigSync({ get: async id => id === 'history' ? route : other,
      save: async (id, config) => { writes.push({ id, config }); await save.promise; return config; } });
    const harness = hookHarness({ sync, conversationId: 'history', scopeId: 'history', config: route, restore: () => {} });
    await harness.settle();
    const selected = { ...route, reasoning_effort: 'low' };
    harness.update({ config: selected });
    await harness.settle();
    assert.equal(writes.length, 1);
    const pending = retryAction(harness.result.ensureSaved, calls)({ taskId: 'source' });
    if (leaving === 'unmount') harness.unmount();
    else { harness.update({ conversationId: 'other', scopeId: 'other', config: other }); await harness.settle(); }
    save.resolve();
    assert.equal(await pending, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].conversationId, 'history');
    assert.equal(calls[0].config.reasoningEffort, 'low');
    assert.equal(calls[0].config.provider, route.llm_config_id);
    assert.deepEqual(writes.map(write => write.id), ['history']);
  }
});

test('Retry can follow an Agent save after navigation while the picker action retains its foreground guard', async () => {
  const save = deferred();
  const calls = [], writes = [];
  const sync = createRunConfigSync({ get: async () => route,
    save: async (_id, config) => { writes.push(config); await save.promise; return config; } });
  const harness = hookHarness({ sync, conversationId: 'history', scopeId: 'history', config: route, restore: () => {} });
  await harness.settle();
  const change = harness.result.changeAgent('new-agent');
  const rejected = assert.rejects(change, /Conversation changed/);
  await harness.settle();
  const retry = retryAction(harness.result.ensureSaved, calls)({ taskId: 'source' });
  harness.update({ conversationId: 'other', scopeId: 'other', config: route });
  await harness.settle();
  save.resolve();
  await rejected;
  assert.equal(await retry, true);
  assert.equal(writes.length, 1);
  assert.equal(calls[0].config.agentId, 'new-agent');
});

test('foreground Send still stops waiting after unmount or configuration sync replacement', async () => {
  for (const change of ['unmount', 'sync']) {
    const state = fixture(route);
    await state.harness.settle();
    state.harness.update({ loading: true });
    const pending = state.harness.result.ensureSaved();
    if (change === 'unmount') state.harness.unmount();
    else state.harness.update({ sync: createRunConfigSync({ get: async () => route, save: async (_id, config) => config }), loading: false });
    await assert.rejects(pending, /Conversation changed/);
    assert.equal(state.writes.length, 0);
  }
});

test('Retry reports the actual configuration load failure instead of polling forever', async () => {
  const load = deferred();
  const harness = hookHarness({ sync: { load: () => load.promise }, conversationId: 'history', scopeId: 'history',
    config: route, loading: true, restore: () => {} });
  await harness.settle();
  const calls = [];
  const pending = retryAction(harness.result.ensureSaved, calls)({ taskId: 'source' });
  load.reject(new Error('Configuration load failed: offline'));
  await harness.settle();
  await assert.rejects(pending, /Configuration load failed: offline/);
  assert.equal(calls.length, 0);
});

test('a removed configuration stays blocked after the model loading wait', async () => {
  const state = fixture({ ...route, llm_config_id: 'removed' }, 'Chat: the selected configuration is unavailable.');
  await state.harness.settle();
  state.harness.update({ loading: true });
  const calls = [];
  const pending = retryAction(state.harness.result.ensureSaved, calls)({ taskId: 'source' });
  state.harness.update({ loading: false });
  await assert.rejects(pending, /unavailable/);
  assert.equal(calls.length, 0);
  assert.equal(state.observed.length, 0);
  assert.equal(state.writes.length, 0);
});

test('configuration waiting has a deadline without refetching or retrying saves', async () => {
  const state = fixture(route);
  await state.harness.settle();
  state.harness.update({ loading: true });
  await assert.rejects(state.harness.result.ensureSaved({ timeoutMs: 20 }), /Timed out waiting/);
  assert.equal(state.writes.length, 0);
  state.harness.update({ loading: false });
  assert.equal((await state.harness.result.ensureSaved()).llm_config_id, route.llm_config_id);
});

test('Retry waits for a save, then revalidates the latest selection before dispatching', async () => {
  const save = deferred();
  const state = fixture(route);
  await state.harness.settle();
  const observed = [], writes = [], calls = [];
  const sync = { load: async () => route, observe: (_id, config) => observed.push(config),
    flush: async () => { writes.push(observed.at(-1)); await save.promise; return writes.at(-1); } };
  state.harness.update({ sync, config: { ...route, reasoning_effort: 'low' } });
  await state.harness.settle();
  assert.equal(writes.length, 1);
  const pending = retryAction(state.harness.result.ensureSaved, calls)({ taskId: 'source' });
  state.harness.update({ readOnly: true, saveBlockedReason: 'Chat: conflicting model configuration identities.' });
  save.resolve();
  await state.harness.settle();
  await assert.rejects(pending, /conflicting/);
  assert.equal(calls.length, 0);
  assert.equal(writes.length, 1);
});

test('Retry does not dispatch after the pending configuration save fails', async () => {
  const save = deferred();
  const state = fixture(route);
  await state.harness.settle();
  const calls = [], observed = [];
  const sync = { load: async () => route, observe: (_id, config) => observed.push(config), flush: () => save.promise };
  state.harness.update({ sync, config: { ...route, reasoning_effort: 'low' } });
  await state.harness.settle();
  const pending = retryAction(state.harness.result.ensureSaved, calls)({ taskId: 'source' });
  save.reject(new Error('Configuration save failed: offline'));
  await state.harness.settle();
  await assert.rejects(pending, /Configuration save failed: offline/);
  assert.equal(calls.length, 0);
  assert.equal(observed[0].reasoning_effort, 'low');
});

test('a stalled foreground save keeps its deadline and navigation guard', async () => {
  for (const change of ['timeout', 'conversation']) {
    const save = deferred();
    const state = fixture(route);
    await state.harness.settle();
    const observed = [], writes = [];
    const sync = { load: async () => route, observe: (_id, config) => observed.push(config),
      flush: async () => { writes.push(observed.at(-1)); await save.promise; return writes.at(-1); } };
    state.harness.update({ sync, config: { ...route, reasoning_effort: 'low' } });
    await state.harness.settle();
    const pending = state.harness.result.ensureSaved({ timeoutMs: 20 });
    if (change === 'conversation') state.harness.update({ conversationId: 'other', scopeId: 'other', config: route });
    await assert.rejects(pending, change === 'timeout' ? /Timed out waiting/ : /Conversation changed/);
    assert.equal(writes.length, 1);
    save.resolve();
    await state.harness.settle();
  }
});

test('foreground configuration waiting honors Stop during a stalled save without cancelling the shared write', async () => {
  const save = deferred();
  const state = fixture(route);
  await state.harness.settle();
  const observed = [], writes = [];
  const sync = { load: async () => route, observe: (_id, config) => observed.push(config),
    flush: async () => { writes.push(observed.at(-1)); await save.promise; return writes.at(-1); } };
  state.harness.update({ sync, config: { ...route, reasoning_effort: 'low' } });
  await state.harness.settle();
  const controller = new AbortController();
  const pending = state.harness.result.ensureSaved({ signal: controller.signal, timeoutMs: 200 });
  controller.abort();
  await assert.rejects(pending, /Retry was stopped/);
  assert.equal(writes.length, 1);
  save.resolve();
  await state.harness.settle();
  assert.equal((await state.harness.result.ensureSaved()).reasoning_effort, 'low');
  assert.equal(writes.length, 1, 'Stop does not resubmit or cancel the shared configuration save');
});

test('composer passes the route error to persistence and retains the restored identity', () => {
  const composer = readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
  const syncCall = composer.slice(composer.indexOf('useConversationRunConfig({'), composer.indexOf('async function changeAgent'));
  assert.match(syncCall, /saveBlockedReason: modelConfigError/);
  assert.match(syncCall, /llm_config_id: executionMode === 'bot' \? null : providerId/);
});
