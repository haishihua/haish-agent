import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScheduleEvent } from '../../../src/features/schedules/model/schedule.js';
import { deferred, scheduleHookHarness } from './hook-harness.js';

function fixture() {
  const requests = [], runtime = [], recovered = [];
  let emit, stopped = false;
  const listeners = new Map();
  const api = { list: () => { const request = deferred(); requests.push(request); return request.promise; } };
  const hook = scheduleHookHarness('../../../src/features/schedules/hooks/useSchedules.js', 'useSchedulesState', {
    api,
    subscribe: (callback) => { emit = callback; return () => { stopped = true; }; },
    onRuntimeEvent: (event) => runtime.push(event),
    onRecover: async (job) => recovered.push(job),
  }, { applyScheduleEvent, window: {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  } });
  return { hook, requests, runtime, recovered, emit: (message) => emit(message), focus: () => listeners.get('focus')(), get stopped() { return stopped; } };
}
const job = { id: 's', conversation_id: 'owner', last_run: { id: 'r', task_id: 't', status: 'running' } };
const delta = { type: 'task.event', schedule_id: 's', conversation_id: 'owner', event: { type: 'llm_answer_delta', delta: 'text' } };

test('scheduled content stream routes every delta without starving initial or focus list snapshots', async () => {
  const f = fixture();
  for (let i = 0; i < 200; i++) f.emit(delta);
  f.requests[0].resolve([job]);
  await f.hook.settle();
  assert.equal(f.requests.length, 1);
  assert.equal(f.hook.result.loading, false);
  assert.deepEqual(f.hook.result.items, [job]);
  assert.equal(f.runtime.length, 200);
  assert.equal(f.recovered.length, 1);
  f.focus();
  for (let i = 0; i < 200; i++) f.emit(delta);
  f.requests[1].resolve([job]);
  await f.hook.settle();
  assert.equal(f.requests.length, 2);
  assert.equal(f.runtime.length, 400);
  f.emit({ type: 'schedule.event', event: { action: 'unrelated' } });
  assert.equal(f.requests.length, 2);
  f.hook.unmount();
  assert.equal(f.stopped, true);
  f.emit(delta);
  assert.equal(f.runtime.length, 400);
});

for (const event of [
  { action: 'created', schedule: job },
  { action: 'updated', schedule: { ...job, state: 'paused' } },
  { action: 'deleted', schedule_id: 's' },
  { run: { id: 'r', schedule_id: 's', status: 'running' }, conversation_id: 'owner' },
  { run: { id: 'r', schedule_id: 's', task_id: 't', status: 'failed' }, conversation_id: 'owner' },
]) test(`schedule metadata invalidates a pending snapshot: ${event.action || event.run.status}`, async () => {
  const f = fixture();
  f.emit({ type: 'schedule.event', event });
  f.requests[0].resolve([]);
  await f.hook.settle();
  assert.equal(f.requests.length, 2);
  assert.equal(f.hook.result.loading, true);
  f.emit(delta);
  const latest = event.action === 'deleted' ? [] : [event.schedule || { ...job, last_run: event.run }];
  f.requests[1].resolve(latest);
  await f.hook.settle();
  assert.deepEqual(f.hook.result.items, latest);
  assert.equal(f.hook.result.loading, false);
  assert.equal(f.runtime.length, 1);
  if (event.run?.status === 'failed') assert.ok(f.recovered.some((record) => record.last_run === event.run));
  f.hook.unmount();
});

for (const type of ['schedule.resync', 'task.end']) test(`${type} refresh wins over an older snapshot or failure`, async () => {
  const f = fixture();
  f.emit({ type, schedule_id: 's' });
  assert.equal(f.requests.length, 2);
  f.requests[0].reject(new Error('stale failure'));
  await f.hook.settle();
  assert.equal(f.hook.result.error, '');
  assert.equal(f.hook.result.loading, true);
  f.requests[1].resolve([job]);
  await f.hook.settle();
  assert.deepEqual(f.hook.result.items, [job]);
  assert.equal(f.hook.result.loading, false);
  f.hook.unmount();
});
