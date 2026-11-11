import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftConversationHandlers } from '../../../src/features/conversations/hooks/createDraftConversationHandlers.js';
import { normalizeRuntimeEvents } from '../../../src/core/runtime-events.js';

const event = (id, delta) => ({ type: 'llm_answer_delta', event_id: id, delta, task_id: 'task-1', conversation_id: 'conversation-1' });
const task = (overrides = {}) => ({ task_id: 'task-1', conversation_id: 'conversation-1', events: [], ...overrides });

function harness(seed = null) {
  const cache = { current: new Map() };
  if (seed) cache.current.set('task-1', { ...seed, events: normalizeRuntimeEvents(seed.events) });
  const requests = [];
  const responses = [];
  const handlers = createDraftConversationHandlers({
    API_BASE: 'http://runtime', buildApiHeaders: () => ({}), normalizeRuntimeEvents,
    taskRuntimeEventCacheRef: cache, taskRuntimeFetchesRef: { current: new Map() },
    apiFetch: async (url, options = {}) => {
      requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
      assert.ok(responses.length, `unexpected request: ${url}`);
      return Response.json(responses.shift());
    },
  });
  return { cache, handlers, requests, respond: (payload) => responses.push(payload) };
}

test('truncated batch retrieves full history, replaces old cache and advances the cursor', async () => {
  const h = harness({ lastEventId: 'e2', events: [event('e1', 'old'), event('e2', 'old')] });
  h.respond([task({ truncated: true, events: [event('e9', 'tail')] })]);
  h.respond(task({ events: [event('e1', 'first'), event('e9', 'last')] }));
  const [detail] = await h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']);
  assert.equal(h.requests[0].body.tasks[0].after_event_id, 'e2');
  assert.match(h.requests[1].url, /event_view=full/);
  assert.equal(detail.events[0].delta, 'firstlast');
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e9');
  h.respond([task({ events_delta: true, events: [event('e9', 'last'), event('e10', 'next')] })]);
  const [next] = await h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']);
  assert.equal(next.events[0].delta, 'firstlastnext');
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e10');
});

test('single task truncated snapshot also retrieves full history', async () => {
  const h = harness();
  h.respond(task({ truncated: true, events: [event('e9', 'tail')] }));
  h.respond(task({ events: [event('e1', 'head'), event('e9', 'tail')] }));
  const detail = await h.handlers.fetchTaskRuntimeDetail('task-1', 'conversation-1');
  assert.equal(detail.events[0].delta, 'headtail');
  assert.match(h.requests[1].url, /event_view=full/);
});

test('unrelated full response cannot poison cache', async () => {
  const h = harness({ lastEventId: 'e2', events: [event('e2', 'kept')] });
  h.respond([task({ truncated: true })]);
  h.respond(task({ conversation_id: 'other', events: [event('e9', 'wrong')] }));
  await assert.rejects(h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']), /unrelated/);
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e2');
});

test('non-truncated delta appends to the cache', async () => {
  const h = harness({ lastEventId: 'e2', events: [event('e2', 'old')] });
  h.respond([task({ events_delta: true, events: [event('e3', 'new')] })]);
  const [detail] = await h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']);
  assert.equal(detail.events[0].delta, 'oldnew');
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e3');
});

test('non-delta page with cursor replaces cache', async () => {
  const h = harness({ lastEventId: 'e2', events: [event('e2', 'old')] });
  h.respond([task({ events_delta: false, next_cursor: 'e10', events: [event('e9', 'new')] })]);
  const [detail] = await h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']);
  assert.equal(detail.events[0].delta, 'new');
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e10');
});
