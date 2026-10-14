import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftConversationHandlers } from '../../../src/features/conversations/hooks/createDraftConversationHandlers.js';
import { normalizeRuntimeEvents } from '../../../src/features/tasks/model/runtime-events.js';
import { eventDeltaText } from '../../../src/features/chat/model/chat-text.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const event = (id, text) => ({ event_id: id, type: 'llm_answer_delta', payload: { delta: text } });
const task = (events, delta = true) => ({ task_id: 't', conversation_id: 'c', events, events_delta: delta });

function harness() {
  const requests = [];
  const cache = { current: new Map([['t', { lastEventId: 'e1', events: normalizeRuntimeEvents([event('e1', 'prefix')]) }]]) };
  const fetches = { current: new Map() };
  const handlers = () => createDraftConversationHandlers({
    API_BASE: 'http://runtime', buildApiHeaders: () => ({}),
    apiFetch: (url, options) => {
      const response = deferred();
      requests.push({ url, options, response });
      options.signal?.addEventListener('abort', () => response.reject(new DOMException('cancelled', 'AbortError')), { once: true });
      return response.promise;
    },
    normalizeRuntimeEvents, taskRuntimeEventCacheRef: cache, taskRuntimeFetchesRef: fetches,
  });
  const respond = (index, value) => requests[index].response.resolve({
    ok: true, json: async () => requests[index].options.method === 'GET' ? value : [value],
  });
  return { requests, cache, fetches, handlers, respond };
}

for (const order of ['single-first', 'batch-first']) {
  for (const scoped of [false, true]) {
    test(`${order} overlapping ${scoped ? 'owned' : 'unscoped'} GET and batch normalize the e1→e2 delta once`, async () => {
      const h = harness();
      const single = () => h.handlers().fetchTaskRuntimeDetail('t', scoped ? 'c' : undefined);
      const batch = () => h.handlers().fetchTaskRuntimeBatch('c', ['t']);
      const first = order === 'single-first' ? single() : batch();
      await tick();
      const second = order === 'single-first' ? batch() : single();
      await tick();
      assert.equal(h.requests.length, 1, 'one task/cursor has one transport owner');
      if (order === 'single-first') assert.match(h.requests[0].url, /after_event_id=e1$/);
      else assert.equal(JSON.parse(h.requests[0].options.body).tasks[0].after_event_id, 'e1');
      h.respond(0, task([event('e2', 'answer')]));
      await Promise.all([first, second]);
      assert.equal(h.cache.current.get('t').events.map(eventDeltaText).join(''), 'prefixanswer');
      assert.equal(h.cache.current.get('t').lastEventId, 'e2', 'cursor is the last raw id, not the compacted first id');
      const next = single();
      await tick();
      assert.match(h.requests[1].url, /after_event_id=e2$/);
      h.respond(1, task([event('e3', 'answer')]));
      await next;
      assert.equal(h.cache.current.get('t').events.map(eventDeltaText).join(''), 'prefixansweranswer', 'identical text under distinct ids is real output');
      assert.equal(h.fetches.current.size, 0);
    });
  }
}

test('empty deltas retain the cursor and unknown-cursor full replay replaces rather than appends', async () => {
  const h = harness();
  const empty = h.handlers().fetchTaskRuntimeDetail('t');
  await tick();
  h.respond(0, task([]));
  await empty;
  assert.equal(h.cache.current.get('t').lastEventId, 'e1');
  const full = h.handlers().fetchTaskRuntimeBatch('c', ['t']);
  await tick();
  h.respond(1, task([event('replacement', 'new history')], false));
  await full;
  assert.equal(h.cache.current.get('t').events.map(eventDeltaText).join(''), 'new history');
  assert.equal(h.cache.current.get('t').lastEventId, 'replacement');
});

test('a GET lease survives batch subscriber cancellation without a duplicate request or cache append', async () => {
  const h = harness();
  const controller = new AbortController();
  const batch = h.handlers().fetchTaskRuntimeBatch('c', ['t'], controller.signal);
  const rejected = assert.rejects(batch, { name: 'AbortError' });
  const single = h.handlers().fetchTaskRuntimeDetail('t');
  await tick();
  controller.abort();
  await rejected;
  assert.equal(h.requests[0].options.signal.aborted, false);
  h.respond(0, task([event('e2', 'answer')]));
  await single;
  assert.equal(h.cache.current.get('t').events.map(eventDeltaText).join(''), 'prefixanswer');
  assert.equal(h.requests.length, 1);
});

test('joining an unscoped GET does not bypass batch owner validation', async () => {
  const h = harness();
  const single = h.handlers().fetchTaskRuntimeDetail('t');
  const batch = h.handlers().fetchTaskRuntimeBatch('other', ['t']);
  const rejected = assert.rejects(batch, /does not belong to conversation other/);
  await tick();
  h.respond(0, task([event('e2', 'answer')]));
  await single;
  await rejected;
  assert.equal(h.requests.length, 1);
});

const missingBatch = (h) => {
  const batch = h.handlers().fetchTaskRuntimeBatch('c', ['t', 'deleted']);
  const rejected = assert.rejects(batch, { status: 404, runtimeRequestKind: 'batch' });
  return { batch, rejected };
};
const failBatch = (h, index = 0) => h.requests[index].response.resolve({
  ok: false, status: 404, json: async () => ({ detail: 'Task not found in conversation.' }),
});

test('joined GET confirmations coalesce once after a mixed batch 404 and normalize the surviving delta once', async () => {
  const h = harness();
  const { rejected } = missingBatch(h);
  const first = h.handlers().fetchTaskRuntimeDetail('t', 'c');
  const second = h.handlers().fetchTaskRuntimeDetail('t');
  await tick();
  failBatch(h);
  await rejected;
  await tick();
  assert.equal(h.requests.length, 2, 'both singles share one independent confirmation GET');
  assert.equal(h.requests[1].options.method, 'GET');
  h.respond(1, task([event('e2', 'answer')]));
  await Promise.all([first, second]);
  assert.equal(h.cache.current.get('t').events.map(eventDeltaText).join(''), 'prefixanswer');
  assert.equal(h.fetches.current.size, 0);
});

test('cancelling a GET joined to a failed batch does not launch a confirmation or cancel the batch lease', async () => {
  const h = harness();
  const { rejected } = missingBatch(h);
  const controller = new AbortController();
  const single = h.handlers().fetchTaskRuntimeDetail('t', 'c', controller.signal);
  const cancelled = assert.rejects(single, { name: 'AbortError' });
  await tick();
  controller.abort();
  await cancelled;
  assert.equal(h.requests[0].options.signal.aborted, false);
  failBatch(h);
  await rejected;
  await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.fetches.current.size, 0);
});

test('one confirmation GET subscriber can cancel while another retains its lease', async () => {
  const h = harness();
  const { rejected } = missingBatch(h);
  const controller = new AbortController();
  const first = h.handlers().fetchTaskRuntimeDetail('t', 'c', controller.signal);
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  const second = h.handlers().fetchTaskRuntimeDetail('t', 'c');
  await tick();
  failBatch(h);
  await rejected;
  await tick();
  controller.abort();
  await cancelled;
  assert.equal(h.requests[1].options.signal.aborted, false);
  h.respond(1, task([event('e2', 'answer')]));
  await second;
  assert.equal(h.requests.length, 2);
  assert.equal(h.cache.current.get('t').events.map(eventDeltaText).join(''), 'prefixanswer');
  assert.equal(h.fetches.current.size, 0);
});

test('cancelling every confirmation lease aborts GET, releases ownership and permits immediate retry', async () => {
  const h = harness();
  const { rejected } = missingBatch(h);
  const controller = new AbortController();
  const first = h.handlers().fetchTaskRuntimeDetail('t', 'c', controller.signal);
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  await tick();
  failBatch(h);
  await rejected;
  await tick();
  controller.abort();
  await cancelled;
  assert.equal(h.requests[1].options.signal.aborted, true);
  const retry = h.handlers().fetchTaskRuntimeDetail('t', 'c');
  await tick();
  h.respond(2, task([event('e2', 'answer')]));
  await retry;
  assert.equal(h.cache.current.get('t').events.map(eventDeltaText).join(''), 'prefixanswer');
  assert.equal(h.fetches.current.size, 0);
});
