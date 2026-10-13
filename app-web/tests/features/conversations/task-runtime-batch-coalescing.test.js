import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftConversationHandlers } from '../../../src/features/conversations/hooks/createDraftConversationHandlers.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const abortError = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });
const task = (taskId, conversationId = 'c') => ({
  task_id: taskId, conversation_id: conversationId, status: 'done', events: [],
});

function createHarness() {
  const requests = [];
  const updates = [];
  const states = new Map();
  const fetches = { current: new Map() };
  const cache = { current: new Map() };
  let normalizations = 0;
  const handlers = () => createDraftConversationHandlers({
    API_BASE: 'http://runtime',
    buildApiHeaders: () => ({ 'content-type': 'application/json' }),
    apiFetch: (url, options) => {
      const response = deferred();
      const request = { url, options, response, ids: JSON.parse(options.body).tasks.map((item) => item.task_id) };
      requests.push(request);
      options.signal?.addEventListener('abort', () => response.reject(abortError()), { once: true });
      return response.promise;
    },
    taskRuntimeFetchesRef: fetches,
    taskRuntimeEventCacheRef: cache,
    normalizeRuntimeEvents: (events) => { normalizations += 1; return events || []; },
    taskDetailToRuntimeTask: (value) => ({ taskId: value.task_id, status: value.status, runtimeHydrated: true }),
    isTaskActuallyActive: () => false,
    applyContextUsage: () => {},
    latestContextUsageFromTasks: () => ({}),
    updateTaskRuntimeState: (updater, id) => {
      updates.push(id);
      states.set(id, updater(states.get(id) || { taskOrder: [], tasksById: {}, activeTaskId: null }));
    },
  });
  const respond = (index, payload = requests[index].ids.map((id) => task(id))) => requests[index].response.resolve({
    ok: true, json: async () => payload,
  });
  return {
    requests, updates, states, fetches, cache, respond, handlers,
    normalizations: () => normalizations,
    restore: (ids, { targetConversationId = 'c', isCurrentActivation = () => true, signal } = {}) => (
      handlers().restoreTaskRuntimes(ids, { targetConversationId, isCurrentActivation, signal })
    ),
  };
}

test('initial restore and earlier paging share overlapping runtimes across handler recreation', async () => {
  const h = createHarness();
  const first = h.restore(['t3', 't2', 't1']);
  const page = h.restore(['t1', 't2', 't3']);
  await tick();
  assert.equal(h.requests.length, 1);
  h.respond(0);
  assert.deepEqual((await first).map((value) => value.task_id), ['t3', 't2', 't1']);
  assert.deepEqual((await page).map((value) => value.task_id), ['t1', 't2', 't3']);
  assert.equal(h.normalizations(), 3, 'parse/normalize the shared payload only once');
  assert.equal(h.fetches.current.size, 0);
});

test('partially overlapping batches fetch only the missing task ids', async () => {
  const h = createHarness();
  const first = h.restore(['t3', 't2']);
  const page = h.restore(['t2', 't1']);
  await tick();
  assert.deepEqual(h.requests.map((request) => request.ids), [['t3', 't2'], ['t1']]);
  h.respond(1);
  h.respond(0);
  await Promise.all([first, page]);
  assert.deepEqual(Object.keys(h.states.get('c').tasksById).sort(), ['t1', 't2', 't3']);
  assert.equal(h.fetches.current.size, 0);
});

test('task ids are deduplicated within a batch', async () => {
  const h = createHarness();
  const restore = h.restore(['t1', 't1']);
  await tick();
  assert.deepEqual(h.requests[0].ids, ['t1']);
  h.respond(0);
  assert.equal((await restore).length, 1);
});

test('a finished request is not a permanent cache of an old snapshot', async () => {
  const h = createHarness();
  const first = h.restore(['t1']);
  await tick();
  h.respond(0);
  await first;
  const second = h.restore(['t1']);
  await tick();
  assert.equal(h.requests.length, 2);
  h.respond(1);
  await second;
});

test('cancelling the original caller does not cancel a surviving paging caller', async () => {
  const h = createHarness();
  const controller = new AbortController();
  const first = h.restore(['t1'], { signal: controller.signal });
  const page = h.restore(['t1']);
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  await tick();
  controller.abort();
  await cancelled;
  assert.equal(h.requests[0].options.signal.aborted, false);
  h.respond(0);
  await page;
  assert.equal(h.requests.length, 1);
  assert.equal(h.updates.length, 1, 'the cancelled caller must not write a restored snapshot');
});

test('cancelling a joined caller does not cancel the original request', async () => {
  const h = createHarness();
  const first = h.restore(['t1']);
  const controller = new AbortController();
  const joined = h.restore(['t1'], { signal: controller.signal });
  const cancelled = assert.rejects(joined, { name: 'AbortError' });
  await tick();
  controller.abort();
  await cancelled;
  h.respond(0);
  await first;
  assert.equal(h.requests.length, 1);
  assert.equal(h.updates.length, 1);
});

test('aborting all subscribers releases the request and permits an immediate retry', async () => {
  const h = createHarness();
  const controller = new AbortController();
  const first = h.restore(['t1'], { signal: controller.signal });
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  await tick();
  controller.abort();
  await cancelled;
  assert.equal(h.requests[0].options.signal.aborted, true);
  const retry = h.restore(['t1']);
  await tick();
  assert.equal(h.requests.length, 2);
  h.respond(1);
  await retry;
  assert.equal(h.fetches.current.size, 0);
  assert.equal(h.updates.length, 1);
});

test('late responses from cancelled transports cannot clear a newer in-flight retry', async () => {
  const h = createHarness();
  const controller = new AbortController();
  const first = h.restore(['t1'], { signal: controller.signal });
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  await tick();
  // Simulate a transport that ignores abort and still resolves later.
  const oldRequest = h.requests[0];
  const ignoredResponse = deferred();
  oldRequest.response.resolve({ ok: true, json: () => ignoredResponse.promise });
  await tick();
  controller.abort();
  await cancelled;
  const retry = h.restore(['t1']);
  await tick();
  ignoredResponse.resolve([task('t1')]);
  await tick();
  assert.equal(h.cache.current.size, 0, 'cancelled data must not enter the event cache');
  const joined = h.restore(['t1']);
  await tick();
  assert.equal(h.requests.length, 2, 'late cleanup must not remove the newer request');
  h.respond(1);
  await Promise.all([retry, joined]);
  assert.equal(h.fetches.current.size, 0);
});

test('an already aborted caller does not start a request', async () => {
  const h = createHarness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(h.restore(['t1'], { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(h.requests.length, 0);
});

test('a failed shared request rejects all callers, cleans up and can be retried', async () => {
  const h = createHarness();
  const first = h.restore(['t1']);
  const joined = h.restore(['t1']);
  const failures = [assert.rejects(first, /offline/), assert.rejects(joined, /offline/)];
  await tick();
  h.requests[0].response.reject(new Error('offline'));
  await Promise.all(failures);
  assert.equal(h.fetches.current.size, 0);
  assert.equal(h.cache.current.size, 0);
  const retry = h.restore(['t1']);
  await tick();
  h.respond(1);
  await retry;
  assert.equal(h.requests.length, 2);
});

test('shared requests cannot mix owners and malformed payloads cannot populate caches', async () => {
  const h = createHarness();
  const first = h.restore(['t1'], { targetConversationId: 'a' });
  const second = h.restore(['t1'], { targetConversationId: 'b' });
  const failure = assert.rejects(first, /does not belong to conversation a/);
  await tick();
  assert.equal(h.requests.length, 2);
  h.respond(0, [task('t1', 'b')]);
  await failure;
  assert.equal(h.cache.current.size, 0);
  h.respond(1, [task('t1', 'b')]);
  await second;
  assert.deepEqual(h.updates, ['b']);
  assert.equal(h.fetches.current.size, 0);
});

test('activation guards still protect each caller sharing the same payload', async () => {
  const h = createHarness();
  let current = true;
  const stale = h.restore(['t1'], { isCurrentActivation: () => current });
  const live = h.restore(['t1']);
  await tick();
  current = false;
  h.respond(0);
  assert.deepEqual(await stale, []);
  await live;
  assert.deepEqual(h.updates, ['c']);
});
