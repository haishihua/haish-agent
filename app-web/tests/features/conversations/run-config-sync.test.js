import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunConfigSync } from '../../../src/features/conversations/model/run-config-sync.js';

test('conversation model writes are serialized and save waits for latest selection', async () => {
  const calls = [];
  let release;
  const sync = createRunConfigSync({ get: async () => null, save: async (id, config) => {
    calls.push({ id, ...config });
    if (calls.length === 1) await new Promise((resolve) => { release = resolve; });
  } });
  sync.observe('draft', { provider: 'p1', model_id: 'old' });
  const first = sync.flush('real', 'draft');
  await new Promise((resolve) => setTimeout(resolve, 0));
  sync.observe('draft', { provider: 'p2', model_id: 'new' });
  const second = sync.flush('real', 'draft');
  release();
  await Promise.all([first, second]);
  assert.equal(calls.at(-1).model_id, 'new');
  assert.equal(calls.at(-1).provider, 'p2');
  assert.ok(calls.every((call) => call.id === 'real'));
});

test('switching conversation never writes another scope and failures are explicit', async () => {
  const calls = [];
  const sync = createRunConfigSync({ get: async () => null, save: async (id, config) => calls.push({ id, ...config }) });
  sync.observe('a', { model_id: 'a-model' }); sync.observe('b', { model_id: 'b-model' });
  await sync.flush('a-id', 'a'); await sync.flush('b-id', 'b');
  assert.deepEqual(calls, [{ id: 'a-id', model_id: 'a-model' }, { id: 'b-id', model_id: 'b-model' }]);
  await assert.rejects(sync.flush('new', 'missing'), /not ready/);
  const failing = createRunConfigSync({ save: async () => { throw new Error('offline'); } });
  failing.observe('s', { model_id: 'new' });
  await assert.rejects(failing.flush('c', 's'), /offline/);
});

test('run configuration API is independent of schedule definitions and rejects errors', async () => {
  globalThis.window = { HAISH_API_BASE: '' };
  const { createRunConfigApi } = await import('../../../src/features/conversations/api/run-config.js');
  const calls = [];
  const api = createRunConfigApi(async (url, init) => { calls.push({ url, ...init }); return Response.json(null); }, '/runtime');
  await api.get('c/1'); await api.save('c/1', { provider: 'p', model_id: 'm' });
  assert.equal(calls[0].url, '/runtime/api/conversations/c%2F1/run-config');
  assert.equal(calls[0].method, 'GET'); assert.equal(calls[1].method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].body), { provider: 'p', model_id: 'm' });
  const failed = createRunConfigApi(async () => Response.json({ detail: 'invalid config' }, { status: 400 }));
  await assert.rejects(failed.save('c', {}), /invalid config/);
});
