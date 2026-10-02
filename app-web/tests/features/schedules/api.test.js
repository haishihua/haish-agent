import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { HAISH_API_BASE: '' };
const { createSchedulesApi } = await import('../../../src/features/schedules/api/schedules.js');

test('schedule REST methods use the current strict contract', async () => {
  const calls = [];
  const api = createSchedulesApi(async (url, init) => { calls.push({ url, ...init }); return Response.json({ id: 's' }); }, '/runtime');
  const payload = { conversation_id: 'c', message: 'review', schedule: { kind: 'interval', seconds: 60 } };
  await api.create(payload);
  await api.list(); await api.update('s/1', { message: 'new' });
  await api.pause('s/1'); await api.resume('s/1'); await api.remove('s/1'); await api.runs('s/1', 50);
  assert.equal(calls[0].url, '/runtime/api/schedules');
  assert.deepEqual(JSON.parse(calls[0].body), payload);
  assert.deepEqual(calls.map((call) => call.method), ['POST', 'GET', 'PATCH', 'POST', 'POST', 'DELETE', 'GET']);
  assert.equal(calls.at(-1).url, '/runtime/api/schedules/s%2F1/runs?limit=50&offset=50');
  assert.deepEqual(JSON.parse(calls[2].body), { message: 'new' });
});

test('schedule API surfaces 422 and provider errors without fallback or retry', async () => {
  const api = createSchedulesApi(async () => Response.json({ detail: [{ msg: 'Invalid five-field cron' }] }, { status: 422 }));
  await assert.rejects(api.create({}), /Invalid five-field cron/);
  let calls = 0;
  const strict = createSchedulesApi(async () => { calls++; return Response.json({ detail: 'Selected provider not configured' }, { status: 400 }); });
  await assert.rejects(strict.create({}), /Selected provider not configured/);
  assert.equal(calls, 1);
});
