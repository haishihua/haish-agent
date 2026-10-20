import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { reconcileSettings, hasSettingsVersion, resetSettingsSync, trackSettingsDraft } from '../../../src/shared/lib/settings-sync.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';
import {
  LLM_SETTINGS_STORAGE_KEY, applyLlmSettingsPayloadToDraft, llmDraftForStorage,
  loadLlmSettingsDraft, mergeLlmSettingsDraft, runtimeLlmProviderOptions,
} from '../../../src/features/settings/model/llm-settings.js';
import { apiFetch, parseResponseMessage } from '../../../src/shared/api/client.js';
import { executionConfigError } from '../../../src/features/workflow/model/execution-config.js';

const hookSource = readFileSync(new URL('../../../src/features/settings/hooks/useLlmSettings.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace(/\bexport /g, '');
const shell = readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const hookStart = shell.indexOf(' = useLlmSettings({') + ' = useLlmSettings('.length;
const hookArguments = shell.slice(hookStart, shell.indexOf('\n  });', hookStart) + '\n  }'.length);
const settled = () => new Promise(resolve => setImmediate(resolve));
const row = (id = 'saved-route', model = 'saved-model') => ({ id, provider: 'custom', name: 'Saved route', model, auth_mode: 'api_key' });
const payload = (model = 'saved-model') => ({ chat: row('saved-route', model), profiles: [], vision: { providers: [] }, compact: { providers: [] }, embedding: {} });
const normalized = value => applyLlmSettingsPayloadToDraft({}, value);
const json = value => JSON.parse(JSON.stringify(value));

// Execute the production hook, AppShell arguments, API client and handlers.
// Only React slots and the transport/storage are replaced; no real API runs.
function harness(t, initial, cache = new Map()) {
  resetSettingsSync();
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  if (initial !== undefined) cache.set(LLM_SETTINGS_STORAGE_KEY, llmDraftForStorage(initial));
  const requests = [];
  const notices = [];
  const timers = new Map();
  const stored = [];
  let timerId = 0;
  let storageFails = false;
  const window = {
    localStorage: {
      getItem: key => cache.get(key) ?? null,
      setItem: (key, value) => {
        if (storageFails) throw new Error('fixture storage is full');
        stored.push({ key, value });
        cache.set(key, value);
      },
    },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
  };
  globalThis.window = window;
  const transport = (url, init) => new Promise((resolve, reject) => requests.push({ url, init, resolve, reject }));
  globalThis.fetch = transport;
  const slots = [];
  let cursor = 0;
  let effects = [];
  let draft = loadLlmSettingsDraft();
  let settingsMode = false;
  let settingsSection = 'llm';
  let result;
  let stopped = false;
  const useRef = value => slots[cursor++] ||= { current: value };
  const useState = initialValue => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
    return [slots[index].value, update => {
      slots[index].value = typeof update === 'function' ? update(slots[index].value) : update;
      render();
    }];
  };
  const useMemo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index].deps[i]))) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const useCallback = (callback, deps) => useMemo(() => callback, deps);
  const useEffect = (effect, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index].deps[i]))) effects.push(() => {
      slots[index]?.cleanup?.();
      slots[index] = { deps, cleanup: effect() };
    });
  };
  const useLlmSettings = vm.runInNewContext(`${hookSource}\nuseLlmSettings;`, {
    useState, useRef, useMemo, useCallback, useEffect, API_BASE: '', apiFetch, parseResponseMessage, AbortController,
    reconcileSettings, hasSettingsVersion,
    LLM_SETTINGS_STORAGE_KEY, applyLlmSettingsPayloadToDraft, llmDraftForStorage, loadLlmSettingsDraft,
    mergeLlmSettingsDraft, runtimeLlmProviderOptions, window, console: { warn() {} },
  });
  const setDraft = update => { draft = typeof update === 'function' ? update(draft) : update; render(); };
  function render() {
    if (stopped) return;
    cursor = 0;
    effects = [];
    trackSettingsDraft('llm', draft);
    const args = vm.runInNewContext(`(${hookArguments})`, { llmSettingsDraft: draft, setLlmSettingsDraft: setDraft, settingsMode, settingsSection, settingsSync: { epochs: {} } });
    result = useLlmSettings(args);
    effects.forEach(effect => effect());
  }
  const stop = () => {
    if (stopped) return;
    stopped = true;
    slots.forEach(slot => slot.cleanup?.());
  };
  t.after(() => { stop(); globalThis.window = previousWindow; globalThis.fetch = previousFetch; });
  render();
  return {
    cache, requests, notices, timers, stored, stop,
    get draft() { return draft; },
    get options() { return result.providerOptions; },
    edit: setDraft,
    open: (section = 'llm') => { settingsMode = true; settingsSection = section; render(); },
    close: () => { settingsMode = false; render(); },
    handlers: () => createSettingsHandlers({
      API_BASE: '', llmSettingsDraft: draft, beginLlmSettingsWrite: result.beginWrite,
      apiFetch, parseResponseMessage, showToast: (...args) => notices.push(args),
    }),
    resolve: async (index, value, status = 200, version) => {
      requests[index].resolve({ ok: status >= 200 && status < 300, status,
        headers: new Headers(version ? { 'x-haish-settings-versions': JSON.stringify({ llm: version }) } : {}), json: async () => value });
      await settled();
    },
    retry: () => { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.callback(); },
    failStorage: () => { storageFails = true; },
    routeError: (provider = 'saved-route', modelId = 'saved-model') => executionConfigError({ provider, modelId, providerOptions: result.providerOptions }),
  };
}

test('versioned runtime refreshes saved models but keeps dirty editor out of execution and saves its stale draft anyway', async t => {
  const h = harness(t, normalized(payload()));
  await h.resolve(0, payload(), 200, 'e:0');
  h.open();
  await h.resolve(1, payload('external'), 200, 'e:1');
  assert.equal(h.draft.chat.model, 'external');
  assert.equal(h.options[0].defaultModelId, 'external');
  h.edit(draft => ({ ...draft, chat: { ...draft.chat, model: 'my edit' } }));
  h.close();
  await h.resolve(2, payload('external-new'), 200, 'e:2');
  assert.equal(h.draft.chat.model, 'my edit');
  assert.equal(h.options[0].defaultModelId, 'external-new');
  const before = h.requests.length;
  const saving = h.handlers().handleSaveSettingsDraft('llm');
  await settled();
  assert.equal(h.requests[before].init.method, 'PUT');
  // 旧草稿不拦保存：不带前置版本号，按最后写入生效。
  assert.equal(h.requests[before].init.headers['If-Haish-Settings-Match'], undefined);
  await h.resolve(before, payload('my edit'));
  assert.equal(await saving, true);
  assert.equal(h.notices.at(-1)[0], 'success');
});

test('startup restores a saved provider from stale unpersisted cache without opening Settings', async t => {
  const stale = payload();
  stale.chat._persisted = false;
  const h = harness(t, stale);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].init.method, 'GET');
  assert.match(h.routeError(), /unavailable/);
  await h.resolve(0, payload());
  assert.equal(h.routeError(), '');
  assert.equal(loadLlmSettingsDraft().chat._persisted, true);
  assert.equal(h.draft.chat._persisted, true);
});

test('save caches the normalized successful response and a restart can send before GET resolves', async t => {
  const h = harness(t);
  await h.resolve(0, { profiles: [] });
  const newRecord = { ...row('new-route', 'request-model'), _persisted: false, api_key: 'fixture-api-secret', oauth_code: 'fixture-code', oauth_state: 'fixture-state', oauth_verifier: 'fixture-verifier' };
  h.edit(draft => ({ ...draft, profiles: [newRecord] }));
  const beforeCache = h.cache.get(LLM_SETTINGS_STORAGE_KEY);
  const saving = h.handlers().handleSaveSettingsDraft('llm');
  assert.equal(h.cache.get(LLM_SETTINGS_STORAGE_KEY), beforeCache);
  assert.equal(h.options.length, 0);
  assert.equal(JSON.parse(h.requests[1].init.body).profiles[0].api_key, 'fixture-api-secret');
  await h.resolve(1, { profiles: [{ ...newRecord, _persisted: undefined, model: 'canonical-model', api_key_configured: true }] });
  assert.equal(await saving, true);
  const stored = JSON.parse(h.cache.get(LLM_SETTINGS_STORAGE_KEY));
  assert.equal(stored.profiles[0]._persisted, true);
  assert.equal(stored.profiles[0].model, 'canonical-model');
  for (const secret of ['fixture-api-secret', 'fixture-code', 'fixture-state', 'fixture-verifier']) assert.ok(!h.cache.get(LLM_SETTINGS_STORAGE_KEY).includes(secret));
  h.stop();
  const reboot = harness(t, undefined, h.cache);
  assert.equal(reboot.requests.length, 1);
  assert.equal(reboot.routeError('new-route', 'canonical-model'), '');
  assert.equal(reboot.options[0].defaultModelId, 'canonical-model');
});

for (const readFirst of [true, false]) {
  for (const action of ['save', 'delete']) {
    test(`${action} wins over a startup GET completing ${readFirst ? 'before' : 'after'} the write response`, async t => {
      const h = harness(t, normalized(payload()));
      const writing = action === 'save' ? h.handlers().handleSaveSettingsDraft('llm') : h.handlers().handleDeleteLlmProvider('chat', 'saved-route');
      assert.equal(h.requests[0].init.signal.aborted, true);
      const saved = action === 'save' ? payload('canonical-model') : { profiles: [] };
      if (readFirst) await h.resolve(0, payload('old-model'));
      await h.resolve(1, saved);
      assert.equal(await writing, true);
      if (!readFirst) await h.resolve(0, payload('old-model'));
      assert.equal(h.options.length, action === 'save' ? 1 : 0);
      if (action === 'save') assert.equal(h.options[0].defaultModelId, 'canonical-model');
      else assert.match(h.routeError(), /unavailable/);
      assert.deepEqual(json(loadLlmSettingsDraft()), json(normalized(saved)));
    });
  }
}

test('GET preserves edits made before or during a Settings refresh but they never enter execution', async t => {
  const h = harness(t, normalized(payload()));
  await h.resolve(0, payload());
  const options = h.options;
  h.edit(draft => ({ ...draft, chat: { ...draft.chat, model: 'unsaved-before-read' }, profiles: [{ ...row('unsaved-route'), _persisted: false }] }));
  assert.equal(h.options, options, 'draft edits must not trigger an execution catalog change');
  h.open();
  h.edit(draft => ({ ...draft, chat: { ...draft.chat, name: 'Edited while reading' } }));
  await h.resolve(1, payload('server-model'));
  assert.equal(h.draft.chat.model, 'unsaved-before-read');
  assert.equal(h.draft.chat.name, 'Edited while reading');
  assert.equal(h.draft.profiles[0].id, 'unsaved-route');
  assert.equal(h.options.length, 1);
  assert.equal(h.options[0].defaultModelId, 'server-model');
  assert.equal(loadLlmSettingsDraft().chat.model, 'server-model');
  assert.match(h.routeError('unsaved-route'), /unavailable/);
});

test('PUT preserves later edits but only its successful snapshot becomes executable and cached', async t => {
  const h = harness(t, normalized(payload()));
  await h.resolve(0, payload());
  h.edit(draft => ({ ...draft, chat: { ...draft.chat, model: 'submitted-model' } }));
  const saving = h.handlers().handleSaveSettingsDraft('llm');
  h.edit(draft => ({ ...draft, chat: { ...draft.chat, model: 'later-model' }, profiles: [{ ...row('later-route'), _persisted: false }] }));
  await h.resolve(1, payload('submitted-model'));
  assert.equal(await saving, true);
  assert.equal(h.draft.chat.model, 'later-model');
  assert.equal(h.draft.profiles[0].id, 'later-route');
  assert.equal(h.options[0].defaultModelId, 'submitted-model');
  assert.equal(loadLlmSettingsDraft().chat.model, 'submitted-model');
  assert.match(h.routeError('later-route'), /unavailable/);
});

test('failed save neither publishes nor caches the draft and resumes startup loading', async t => {
  const h = harness(t, normalized(payload()));
  h.edit(draft => ({ ...draft, chat: { ...draft.chat, model: 'failed-draft' } }));
  const cacheBefore = h.cache.get(LLM_SETTINGS_STORAGE_KEY);
  const saving = h.handlers().handleSaveSettingsDraft('llm');
  await h.resolve(1, { detail: 'fixture write rejected' }, 503);
  assert.equal(await saving, false);
  assert.equal(h.options[0].defaultModelId, 'saved-model');
  assert.equal(h.cache.get(LLM_SETTINGS_STORAGE_KEY), cacheBefore);
  assert.equal(h.draft.chat.model, 'failed-draft');
  assert.equal(h.requests[2].init.method, 'GET');
  await h.resolve(2, payload());
  assert.equal(h.draft.chat.model, 'failed-draft');
  assert.deepEqual(h.notices, [['error', 'fixture write rejected']]);
});

test('true server deletion removes execution identity without inventing a replacement', async t => {
  const saved = payload();
  saved.profiles = [row('other-route', 'other-model')];
  const h = harness(t, normalized(saved));
  await h.resolve(0, { chat: {}, profiles: [saved.profiles[0]] });
  assert.deepEqual(h.options.map(option => option.id), ['other-route']);
  assert.match(h.routeError(), /unavailable/);
  assert.equal(h.routeError('other-route', 'other-model'), '');
});

for (const scope of ['vision', 'compact']) {
  test(`${scope} immediate toggle synchronizes its successful response to the draft and cache`, async t => {
    const saved = payload();
    saved[scope] = { providers: [{ ...row('aux-a'), enabled: true }, { ...row('aux-b'), enabled: false }] };
    const h = harness(t, normalized(saved));
    await h.resolve(0, saved);
    const toggling = h.handlers().handleToggleLlmProvider('aux-b', true);
    const submitted = JSON.parse(h.requests[1].init.body);
    assert.deepEqual(submitted[scope].providers.map(item => item.enabled), [false, true]);
    await h.resolve(1, submitted);
    assert.equal(await toggling, true);
    assert.deepEqual(h.draft[scope].providers.map(item => item.enabled), [false, true]);
    assert.deepEqual(loadLlmSettingsDraft()[scope].providers.map(item => item.enabled), [false, true]);
    assert.equal(h.routeError(), '');
  });
}

test('storage failure does not turn backend save success into a failed save', async t => {
  const h = harness(t, normalized(payload()));
  await h.resolve(0, payload());
  h.failStorage();
  const saving = h.handlers().handleSaveSettingsDraft('llm');
  await h.resolve(1, payload('new-saved-model'));
  assert.equal(await saving, true);
  assert.equal(h.options[0].defaultModelId, 'new-saved-model');
  assert.deepEqual(h.notices, [['success', 'settings saved']]);
});

test('newer successful write cannot be rolled back by an older write response', async t => {
  const h = harness(t, normalized(payload()));
  await h.resolve(0, payload());
  const first = h.handlers().handleSaveSettingsDraft('llm');
  h.edit(draft => ({ ...draft, chat: { ...draft.chat, model: 'newer-model' } }));
  const second = h.handlers().handleSaveSettingsDraft('llm');
  await h.resolve(2, payload('newer-model'));
  await h.resolve(1, payload('older-model'));
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(h.options[0].defaultModelId, 'newer-model');
  assert.equal(loadLlmSettingsDraft().chat.model, 'newer-model');
});

test('runtime startup failure retries finitely and disposal ignores late reads', async t => {
  const h = harness(t);
  h.requests[0].reject(new Error('fixture runtime not ready'));
  await settled();
  assert.equal(h.timers.size, 1);
  h.retry();
  await h.resolve(1, payload());
  assert.equal(h.routeError(), '');
  h.open();
  const cacheBefore = h.cache.get(LLM_SETTINGS_STORAGE_KEY);
  h.stop();
  assert.equal(h.requests[2].init.signal.aborted, true);
  await h.resolve(2, payload('late-model'));
  assert.equal(h.cache.get(LLM_SETTINGS_STORAGE_KEY), cacheBefore);
  assert.equal(h.timers.size, 0);
});

test('startup retry stops after its finite budget and never replaces a valid cached catalog on failure', async t => {
  const h = harness(t, normalized(payload()));
  for (let attempt = 0; attempt < 9; attempt += 1) {
    h.requests[attempt].reject(new Error('fixture runtime is unavailable'));
    await settled();
    assert.equal(h.routeError(), '');
    if (attempt < 8) {
      assert.equal(h.timers.size, 1);
      h.retry();
    }
  }
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests.length, 9);
  assert.equal(h.stored.length, 0);
});

test('edited primary record deleted on the server remains only an unpersisted editor draft', async t => {
  const h = harness(t, normalized(payload()));
  h.edit(draft => ({ ...draft, chat: { ...draft.chat, model: 'keep-my-edit' } }));
  await h.resolve(0, { profiles: [] });
  assert.equal(h.draft.chat.id, 'saved-route');
  assert.equal(h.draft.chat.model, 'keep-my-edit');
  assert.equal(h.draft.chat._persisted, false);
  assert.match(h.routeError(), /unavailable/);
  assert.equal(loadLlmSettingsDraft().chat.provider, '');
});

test('Settings navigation during a write cannot start a competing read or lose the commit', async t => {
  const h = harness(t, normalized(payload()));
  const saving = h.handlers().handleSaveSettingsDraft('llm');
  h.open('compact');
  h.close();
  assert.equal(h.requests.length, 2);
  await h.resolve(1, payload('saved-on-navigation'));
  assert.equal(await saving, true);
  assert.equal(h.options[0].defaultModelId, 'saved-on-navigation');
  await h.resolve(0, payload('late-startup'));
  assert.equal(h.options[0].defaultModelId, 'saved-on-navigation');
});

test('draft reconciliation follows IDs, preserving additions, removals and edits to deleted records', () => {
  const baseline = normalized({ profiles: [row('a'), row('b'), row('c'), row('d')] });
  const current = { ...baseline, profiles: [{ ...baseline.profiles[2], model: 'edited-deleted' }, baseline.profiles[0], row('new')] };
  const saved = normalized({ profiles: [row('b', 'server-b'), row('a', 'server-a')] });
  const merged = mergeLlmSettingsDraft(current, saved, baseline);
  assert.deepEqual(merged.profiles.map(item => item.id), ['a', 'c', 'new']);
  assert.equal(merged.profiles[0].model, 'server-a');
  assert.equal(merged.profiles[1].model, 'edited-deleted');
  assert.equal(merged.profiles[1]._persisted, false);
  assert.equal(merged.profiles[2]._persisted, false);
});
