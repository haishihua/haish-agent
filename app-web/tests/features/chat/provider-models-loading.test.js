import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { apiFetch, parseResponseMessage } from '../../../src/shared/api/client.js';
import { runtimeLlmProviderOptions } from '../../../src/features/settings/model/llm-settings.js';

const source = readFileSync(new URL('../../../src/features/chat/hooks/useRunConfig.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
const cacheKey = 'haish_provider_models_v1';
const provider = (id = 'route-a', extras = {}) => ({ id, provider: 'custom', authMode: 'api_key', baseUrl: 'https://fixture.invalid/v1', ...extras });
const response = models => ({ provider: 'custom', models, default_model: models[0]?.id || models[0] || '' });

// Production hook + ordinary API client. Only the React scheduler, storage,
// deadline clock and fetch transport are replaced; no external calls occur.
function harness(t, initial, cache = new Map()) {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const timers = new Map();
  const requests = [];
  let timerId = 0;
  let failStorage = false;
  const window = {
    localStorage: {
      getItem: key => { if (failStorage) throw new Error('fixture storage unavailable'); return cache.get(key) ?? null; },
      setItem: (key, value) => { if (failStorage) throw new Error('fixture storage full'); cache.set(key, value); },
    },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
  };
  globalThis.window = window;
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => requests.push({ url, init, resolve, reject }));
  const slots = [];
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let option = initial;
  let result;
  const changed = (before, after) => !before || after.some((value, index) => !Object.is(value, before[index]));
  const React = {
    useState(initialValue) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[index].value, update => {
        const value = typeof update === 'function' ? update(slots[index].value) : update;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
  };
  const { useProviderModels, providerModelsRequest, PROVIDER_MODELS_TIMEOUT_MS } = vm.runInNewContext(`${source}\n({useProviderModels, providerModelsRequest, PROVIDER_MODELS_TIMEOUT_MS});`, {
    React, API_BASE: '', apiFetch, parseResponseMessage, AbortController, window,
  });
  function render() {
    cursor = 0; effects = []; dirty = false;
    result = useProviderModels(option);
    effects.forEach(effect => effect());
  }
  function flush() {
    for (let i = 0; dirty && i < 15; i += 1) render();
    assert.equal(dirty, false, 'hook render must settle');
  }
  const settle = async () => {
    for (let i = 0; i < 4; i += 1) { await new Promise(resolve => setImmediate(resolve)); flush(); }
  };
  const stop = () => slots.forEach(slot => slot.cleanup?.());
  t.after(() => { stop(); globalThis.window = previousWindow; globalThis.fetch = previousFetch; });
  render(); flush();
  return {
    requests, timers, cache,
    get result() { return result; },
    get ids() { return Array.from(result.options, item => item.id); },
    timeoutMs: PROVIDER_MODELS_TIMEOUT_MS,
    settle, stop,
    render: next => { option = next; render(); flush(); },
    retry: () => { result.retry(); flush(); },
    expire: () => { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.callback(); flush(); },
    respond: async (index, payload, status = 200) => { requests[index].resolve({ ok: status >= 200 && status < 300, status, json: async () => payload }); await settle(); },
    reject: async (index, error) => { requests[index].reject(error); await settle(); },
    seed: (value, models) => cache.set(cacheKey, JSON.stringify({ [JSON.stringify(providerModelsRequest(value))]: { options: models.map(id => ({ id, label: id })), defaultModelId: models[0] } })),
    failStorage: () => { failStorage = true; },
  };
}

test('saved default and configured models remain usable while discovery is pending', t => {
  const h = harness(t, provider('route-a', { defaultModelId: 'saved-default', modelOptions: ['configured-model'] }));
  assert.deepEqual(h.ids, ['configured-model', 'saved-default']);
  assert.equal(h.result.defaultModelId, 'saved-default');
  assert.equal(h.result.loading, false);
  assert.equal(h.result.refreshing, true);
  assert.equal(h.requests.length, 1);
  assert.equal(JSON.parse(h.requests[0].init.body).llm_config_id, 'route-a');
});

test('a valid cache survives remount and a background refresh never hides its models', async t => {
  const a = provider();
  const h = harness(t, null);
  h.seed(a, ['cached-model']);
  h.render(a);
  assert.deepEqual(h.ids, ['cached-model']);
  assert.equal(h.result.loading, false);
  h.stop();
  const reboot = harness(t, a, h.cache);
  assert.deepEqual(reboot.ids, ['cached-model']);
  assert.equal(reboot.result.loading, false);
  await reboot.respond(0, response(['remote-model']));
  assert.deepEqual(reboot.ids, ['remote-model']);
  assert.equal(reboot.result.refreshing, false);
});

test('first discovery without cache shows Loading then settles a successful catalog', async t => {
  const h = harness(t, provider());
  assert.equal(h.result.loading, true);
  await h.respond(0, response(['remote-model']));
  assert.equal(h.result.loading, false);
  assert.equal(h.result.refreshing, false);
  assert.equal(h.result.error, '');
  assert.deepEqual(h.ids, ['remote-model']);
  assert.equal(h.timers.size, 0);
});

for (const bodyStalled of [false, true]) {
  test(`${bodyStalled ? 'stalled JSON body' : 'never-settling transport'} stops at the deadline and ignores its late success`, async t => {
    const h = harness(t, provider());
    let resolveBody;
    if (bodyStalled) {
      h.requests[0].resolve({ ok: true, json: () => new Promise(resolve => { resolveBody = resolve; }) });
      await h.settle();
    }
    assert.equal(h.timers.values().next().value.delay, 15_000);
    assert.equal(h.timeoutMs, 15_000);
    h.expire();
    assert.equal(h.result.loading, false);
    assert.equal(h.result.refreshing, false);
    assert.match(h.result.error, /timed out/);
    assert.equal(h.requests[0].init.signal.aborted, true);
    if (bodyStalled) { resolveBody(response(['late-model'])); await h.settle(); }
    else await h.respond(0, response(['late-model']));
    assert.deepEqual(h.ids, []);
    assert.equal(h.cache.has(cacheKey), false);
    assert.match(h.result.error, /timed out/);
  });
}

test('unexpected active AbortError settles Loading with an explicit recoverable error', async t => {
  const h = harness(t, provider());
  const error = new Error('fixture aborted'); error.name = 'AbortError';
  await h.reject(0, error);
  assert.equal(h.result.loading, false);
  assert.equal(h.result.refreshing, false);
  assert.match(h.result.error, /interrupted/);
  assert.equal(h.timers.size, 0);
});

test('HTTP failure keeps the cached catalog, exposes server detail and retries only on request', async t => {
  const a = provider();
  const h = harness(t, null);
  h.seed(a, ['cached-model']); h.render(a);
  await h.respond(0, { detail: 'fixture access denied' }, 403);
  assert.equal(h.result.loading, false);
  assert.equal(h.result.error, 'fixture access denied');
  assert.deepEqual(h.ids, ['cached-model']);
  assert.equal(h.requests.length, 1);
  h.retry();
  assert.equal(h.requests.length, 2);
  assert.equal(h.result.refreshing, true);
  assert.equal(h.result.loading, false);
  assert.deepEqual(h.ids, ['cached-model']);
  await h.respond(1, response(['recovered-model']));
  assert.deepEqual(h.ids, ['recovered-model']);
  assert.equal(h.result.error, '');
});

test('timeout preserves configured choices and a successful retry clears only the catalog error', async t => {
  const h = harness(t, provider('route-a', { defaultModelId: 'configured-default' }));
  h.expire();
  assert.deepEqual(h.ids, ['configured-default']);
  assert.equal(h.result.loading, false);
  h.retry();
  await h.respond(1, response(['discovered-model']));
  assert.deepEqual(h.ids, ['discovered-model', 'configured-default']);
  assert.equal(h.result.defaultModelId, 'configured-default');
  assert.equal(h.result.error, '');
});

for (const malformed of [null, {}, { provider: 'custom', models: 'not-a-list' }, { provider: 'openai', models: ['wrong-provider-model'] }]) {
  test(`invalid or wrong-provider response cannot become a catalog: ${JSON.stringify(malformed)}`, async t => {
    const h = harness(t, provider());
    await h.respond(0, malformed);
    assert.equal(h.result.loading, false);
    assert.equal(h.result.refreshing, false);
    assert.ok(h.result.error);
    assert.deepEqual(h.ids, []);
    assert.equal(h.cache.has(cacheKey), false);
  });
}

test('an authoritative empty discovery settles without inventing a model', async t => {
  const h = harness(t, provider());
  await h.respond(0, response([]));
  assert.equal(h.result.loading, false);
  assert.equal(h.result.error, '');
  assert.deepEqual(h.ids, []);
});

for (const oldBodyPending of [false, true]) {
  test(`rapid A → B switch ignores old ${oldBodyPending ? 'JSON' : 'HTTP'} result in UI and cache`, async t => {
    const a = provider(); const b = provider('route-b');
    const h = harness(t, a);
    let resolveBody;
    if (oldBodyPending) {
      h.requests[0].resolve({ ok: true, json: () => new Promise(resolve => { resolveBody = resolve; }) });
      await h.settle();
    }
    h.render(b);
    assert.equal(h.requests[0].init.signal.aborted, true);
    assert.equal(h.timers.size, 1);
    await h.respond(1, response(['b-model']));
    const cacheBefore = h.cache.get(cacheKey);
    if (oldBodyPending) { resolveBody(response(['a-late-model'])); await h.settle(); }
    else await h.respond(0, response(['a-late-model']));
    assert.deepEqual(h.ids, ['b-model']);
    assert.equal(h.result.error, '');
    assert.equal(h.cache.get(cacheKey), cacheBefore);
  });
}

test('same record ID with changed endpoint cannot expose the old endpoint catalog', async t => {
  const a = provider(); const h = harness(t, a);
  await h.respond(0, response(['old-endpoint-model']));
  h.render({ ...a, baseUrl: 'https://new-fixture.invalid/v1' });
  assert.deepEqual(h.ids, []);
  assert.equal(h.result.loading, true);
  await h.respond(1, response(['new-endpoint-model']));
  assert.deepEqual(h.ids, ['new-endpoint-model']);
});

test('custom Anthropic discovery uses the saved protocol and isolates protocol changes and late results', async t => {
  const [native] = runtimeLlmProviderOptions({ chat: {
    id: 'native-relay', provider: 'custom', name: 'Native relay', auth_mode: 'api_key',
    base_url: 'https://fixture.invalid/v1', protocol: 'anthropic', model: 'claude-sonnet-5-5',
  } });
  const h = harness(t, native);
  assert.equal(JSON.parse(h.requests[0].init.body).protocol, 'anthropic');
  assert.equal(JSON.parse(h.requests[0].init.body).model, 'claude-sonnet-5-5');
  await h.respond(0, response(['claude-opus-5-5']));
  assert.deepEqual(h.ids, ['claude-opus-5-5', 'claude-sonnet-5-5']);
  h.retry();
  assert.equal(h.requests.length, 2);
  h.render({ ...native, protocol: 'openai' });
  assert.equal(h.requests[1].init.signal.aborted, true);
  assert.equal(JSON.parse(h.requests[2].init.body).protocol, 'openai');
  assert.deepEqual(h.ids, ['claude-sonnet-5-5'], 'the old protocol catalog must not leak');
  await h.respond(1, response(['late-anthropic-model']));
  assert.deepEqual(h.ids, ['claude-sonnet-5-5']);
  await h.respond(2, response(['openai-wire-model']));
  assert.deepEqual(h.ids, ['openai-wire-model', 'claude-sonnet-5-5']);
});

test('official Anthropic discovery sends the provider without a custom protocol', async t => {
  const h = harness(t, provider('official-anthropic', { provider: 'anthropic', baseUrl: '', defaultModelId: 'claude-opus-5-5' }));
  const payload = JSON.parse(h.requests[0].init.body);
  assert.equal(payload.provider, 'anthropic');
  assert.equal('protocol' in payload, false);
  await h.respond(0, { provider: 'anthropic', models: ['claude-opus-5-5'], default_model: 'claude-opus-5-5' });
  assert.equal(h.result.error, '');
  assert.deepEqual(h.ids, ['claude-opus-5-5']);
});

test('equivalent renders and fallback-only changes do not restart discovery', async t => {
  const a = provider(); const h = harness(t, a);
  await h.respond(0, response(['remote-model']));
  h.render({ ...a });
  h.render({ ...a, modelOptions: ['latest-configured-model'] });
  assert.equal(h.requests.length, 1);
  assert.equal(h.result.refreshing, false);
  assert.deepEqual(h.ids, ['remote-model', 'latest-configured-model']);
  h.render({ ...a, defaultModelId: 'new-default' });
  assert.equal(h.requests.length, 2);
  assert.equal(h.result.loading, false);
  assert.deepEqual(h.ids, ['new-default']);
});

test('removed provider cancels the deadline and stale responses cannot revive its models', async t => {
  const h = harness(t, provider());
  h.render(null);
  assert.equal(h.result.loading, false);
  assert.equal(h.result.refreshing, false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests[0].init.signal.aborted, true);
  await h.respond(0, response(['late-model']));
  assert.deepEqual(h.ids, []);
  assert.equal(h.cache.has(cacheKey), false);
});

test('unmount disposes the request and ignores late failure without scheduling retries', async t => {
  const h = harness(t, provider());
  h.stop();
  assert.equal(h.requests[0].init.signal.aborted, true);
  assert.equal(h.timers.size, 0);
  await h.reject(0, new Error('late fixture failure'));
  assert.equal(h.requests.length, 1);
  assert.equal(h.result.error, '');
});

test('storage exceptions never prevent live discovery or erase the configured default', async t => {
  const a = provider('route-a', { defaultModelId: 'default-model' });
  const h = harness(t, a); h.failStorage();
  h.render({ ...a });
  await h.respond(0, response(['live-model']));
  assert.deepEqual(h.ids, ['live-model', 'default-model']);
  assert.equal(h.result.loading, false);
  assert.equal(h.result.error, '');
});

test('background model refresh failures stay silent and keep the last known catalog', () => {
  const composer = readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../../../src/features/workflow/components/WorkflowRuntimeConfig.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(composer, /modelError=|modelRefreshing=|onModelRetry=/);
  assert.doesNotMatch(picker, /modelError|modelRefreshing|onModelRetry/);
  assert.doesNotMatch(workflow, /models\.error|models\.retry/);
  assert.match(picker, /\{options\.length === 0 \? \(/);
  assert.doesNotMatch(picker, /LoadingState label="Loading models"/);
  assert.doesNotMatch(workflow, /Loading models…/);
  assert.doesNotMatch(source, /setProviderId\(.*defaultModelId|setModelId\(.*defaultModelId/);
});
