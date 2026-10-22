import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftConversationHandlers } from '../../../src/features/conversations/hooks/createDraftConversationHandlers.js';
import { normalizeRuntimeEvents } from '../../../src/features/tasks/model/runtime-events.js';

// 游标恢复的两条分支：增量（events_delta: true）追加、截断（truncated / next_cursor）
// 整份替换。截断时若把新一页拼到旧缓存后面，服务端已经丢掉的旧历史会被原样拼回来
// ——时间线上就会出现重复的解释或半截工具调用。
const answerDelta = (id, text) => ({
  type: 'llm_answer_delta',
  event_id: id,
  delta: text,
  task_id: 'task-1',
  conversation_id: 'conversation-1',
});

const eventIds = (events) => events.map((event) => event.event_id);

// 缓存里的条目一定是归一过的事件（normalizeFetchedTaskRuntime 写入的就是这一种），
// 所以种子也走同一个归一化，否则 loop_index 之类的新式字段会对不齐。
const seedEvents = (events) => normalizeRuntimeEvents(events);

function harness(seedCache = null) {
  const cache = { current: new Map() };
  if (seedCache) cache.current.set('task-1', { ...seedCache, events: seedEvents(seedCache.events) });
  const requests = [];
  const responses = [];
  const handlers = createDraftConversationHandlers({
    API_BASE: 'http://runtime',
    buildApiHeaders: () => ({ 'content-type': 'application/json' }),
    normalizeRuntimeEvents,
    taskRuntimeEventCacheRef: cache,
    taskRuntimeFetchesRef: { current: new Map() },
    apiFetch: async (url, options = {}) => {
      requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
      return Response.json(responses.shift());
    },
  });
  return {
    cache,
    handlers,
    requests,
    respond(payload) {
      responses.push(payload);
    },
  };
}

test('a truncated page replaces the cached events instead of appending the old history back', async () => {
  const h = harness({ lastEventId: 'e2', events: [answerDelta('e1', 'old-'), answerDelta('e2', 'history')] });
  h.respond([{
    task_id: 'task-1',
    conversation_id: 'conversation-1',
    status: 'running',
    events_delta: false,
    truncated: true,
    next_cursor: 'e9',
    events: [answerDelta('e8', 'fresh-'), answerDelta('e9', 'page')],
  }]);

  const [detail] = await h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']);

  // 请求仍然带旧游标：截断是服务端对“这个游标太旧”的回答，不是客户端丢游标。
  assert.deepEqual(h.requests[0].body.tasks, [{ task_id: 'task-1', after_event_id: 'e2' }]);
  assert.deepEqual(eventIds(h.cache.current.get('task-1').events), ['e8', 'e9']);
  assert.deepEqual(eventIds(detail.normalizedTask.events), ['e8', 'e9']);
  assert.deepEqual(eventIds(detail.events), ['e8', 'e9']);
  // next_cursor 指向这一页之后，比“最后一条事件的 event_id”更权威。
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e9');
  assert.equal(detail.normalizedTask.events_delta, false);
});

test('next_cursor without truncated still means the page must replace the cache', async () => {
  const h = harness({ lastEventId: 'e2', events: [answerDelta('e1', 'old-'), answerDelta('e2', 'history')] });
  h.respond([{
    task_id: 'task-1',
    conversation_id: 'conversation-1',
    status: 'running',
    events_delta: false,
    next_cursor: 'e10',
    events: [answerDelta('e9', 'page')],
  }]);

  const [detail] = await h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']);

  assert.deepEqual(eventIds(h.cache.current.get('task-1').events), ['e9']);
  assert.deepEqual(eventIds(detail.normalizedTask.events), ['e9']);
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e10');
});

test('a truncated empty page clears the cache and keeps the server cursor', async () => {
  const h = harness({ lastEventId: 'e2', events: [answerDelta('e1', 'old-'), answerDelta('e2', 'history')] });
  h.respond([{
    task_id: 'task-1',
    conversation_id: 'conversation-1',
    status: 'running',
    truncated: true,
    next_cursor: 'e20',
    events: [],
  }]);

  await h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']);

  assert.deepEqual(h.cache.current.get('task-1').events, []);
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e20');
});

test('without the new fields a delta page still appends and advances the cursor', async () => {
  const h = harness({ lastEventId: 'e2', events: [answerDelta('e1', 'old-'), answerDelta('e2', 'history')] });
  h.respond([{
    task_id: 'task-1',
    conversation_id: 'conversation-1',
    status: 'running',
    events_delta: true,
    events: [answerDelta('e3', '+more')],
  }]);

  const [detail] = await h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']);

  assert.deepEqual(h.requests[0].body.tasks, [{ task_id: 'task-1', after_event_id: 'e2' }]);
  // 增量页照旧追加：三段相邻文本被压平成一段（旧行为不变），游标推进到最后一条事件。
  assert.deepEqual(eventIds(h.cache.current.get('task-1').events), ['e1']);
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e3');
  assert.equal(detail.normalizedTask.events[0].delta, 'old-history+more');
});

test('a truncated page is not compacted with the dropped history', async () => {
  // 旧缓存里最后一段是被压平的连续文本；截断页必须以原文照旧进入缓存，不能再与旧段合并。
  const h = harness({
    lastEventId: 'e2',
    events: [{ ...answerDelta('e1', 'a'), deltaEventIds: ['e1'] }],
  });
  h.respond([{
    task_id: 'task-1',
    conversation_id: 'conversation-1',
    status: 'running',
    truncated: true,
    next_cursor: null,
    events: [answerDelta('e5', 'b'), answerDelta('e6', 'c')],
  }]);

  const [detail] = await h.handlers.fetchTaskRuntimeBatch('conversation-1', ['task-1']);

  // 没有 next_cursor 时游标退回最后一条事件。
  assert.equal(h.cache.current.get('task-1').lastEventId, 'e6');
  assert.deepEqual(eventIds(detail.events), ['e5', 'e6']);
  assert.equal(detail.events[0].delta, 'b');
});
