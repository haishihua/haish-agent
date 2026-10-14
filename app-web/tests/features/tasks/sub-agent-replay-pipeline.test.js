import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRuntimeEventIngest } from '../../../src/features/chat/model/event-identity.js';
import { compactStreamEvents, mergeAdjacentStreamEvent } from '../../../src/features/chat/model/stream-events.js';
import { eventDeltaText } from '../../../src/features/chat/model/chat-text.js';
import { buildToolView } from '../../../src/features/chat/model/tool-view.js';
import * as runtimeEvents from '../../../src/features/tasks/model/runtime-events.js';

globalThis.window = {};
const { createConversationRuntime } = await import('../../../src/features/conversations/hooks/createConversationRuntime.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { createDraftConversationHandlers } = await import('../../../src/features/conversations/hooks/createDraftConversationHandlers.js');
const { createTaskStreamHandlers } = await import('../../../src/features/tasks/hooks/createTaskStreamHandlers.js');
const { buildChatTimeline, appendAnswerDelta } = await import('../../../src/features/chat/model/chat-timeline.js');
const tasks = await import('../../../src/features/tasks/model/task-runtime.js');

const delta = (id, text, parent = 'delegate') => ({ type: 'sub_agent_answer_delta', event_id: id,
  parent_call_id: parent, delta: text, task_id: 'task', conversation_id: 'conversation' });
const start = { type: 'tool_call_started', event_id: 'tool-start', call_id: 'delegate',
  tool_name: 'dispatch_sub_agent', task_id: 'task', conversation_id: 'conversation' };
const answer = (task) => buildToolView(buildChatTimeline(task).items.find((item) => item.callId === 'delegate')).streamAnswerText;

function harness(transport = async () => {}, initial = null) {
  const noop = () => {};
  const ctx = {
    ...tasks, ...runtimeEvents, providerOptions: [{ id: 'fixture', provider: 'custom' }],
    conversationIdRef: { current: 'conversation' }, streamTargetConvIdRef: { current: null },
    runtimesRef: { current: new Map() }, taskImageAttachmentsRef: { current: new Map() },
    userCancelledTaskIdsRef: { current: new Set() }, chatFinalizedTaskIdsRef: { current: new Set() },
    setBusy: noop, setShellSeeded: noop, setTaskRuntimeState: noop, setWorkspaceState: noop,
    normalizeWorkspaceOrdering: (state) => state, notifyTaskComplete: noop,
    timestampValue: (value) => Date.parse(value) || 0,
    getChatProgressLine: () => '', applyContextUsage: noop, generateHexId: () => 'local',
    runTaskStream: transport, eventDeltaText, appendAnswerDelta,
  };
  Object.assign(ctx, createConversationRuntime(ctx));
  Object.assign(ctx, createConversationActivationHandlers(ctx));
  const runtime = ctx.getRuntime('conversation', { create: true });
  if (initial) runtime.taskRuntimeState = { ...tasks.createEmptyTaskRuntimeState(),
    taskOrder: ['task'], tasksById: { task: initial } };
  return { ctx, runtime, handlers: () => createTaskStreamHandlers(ctx), task: () => runtime.taskRuntimeState.tasksById.task };
}

test('production stream rejects seen a:foo before batching replay a:foo with fresh b:bar', async () => {
  const h = harness(async (_command, emit) => {
    emit({ type: 'run_started', event_id: 'run', task_id: 'task', conversation_id: 'conversation' });
    emit(start);
    emit(delta('a', 'foo'));
    // An immediate control event flushes a as in the actual 32ms pipeline.
    emit({ type: 'todo_updated', event_id: 'boundary', task_id: 'task', conversation_id: 'conversation' });
    assert.equal(answer(h.task()), 'foo');
    emit(delta('a', 'foo'));
    emit(delta('b', 'bar'));
    emit(delta('b', 'bar')); // duplicate inside the same pending batch
    emit(delta('c', 'bar')); // distinct id with equal text is literal output
    emit(delta('d', ' ')); emit(delta('e', ' '));
  });
  await h.handlers().executeQuest({ id: 'local', title: 'Offline question', originViewMode: 'chat',
    requestedProvider: 'fixture', requestedModelId: 'model' }, 'conversation');
  assert.equal(answer(h.task()), 'foobarbar  ');
  const log = h.task().eventLog.filter((event) => event.type === 'sub_agent_answer_delta');
  assert.deepEqual(log.flatMap((event) => event.deltaEventIds || [event.eventId]), ['a', 'b', 'c', 'd', 'e']);
  const historical = tasks.taskDetailToRuntimeTask({ task_id: 'task', conversation_id: 'conversation', status: 'cancelled',
    events: [start, delta('a', 'foo'), delta('a', 'foo'), delta('b', 'bar'), delta('b', 'bar'),
      delta('c', 'bar'), delta('d', ' '), delta('e', ' ')] });
  assert.equal(answer(historical), answer(h.task()), 'history and realtime preserve the same literal output');
});

test('scheduled ingest rejects replay seeded from compacted history across factory recreation and stream consumers', async () => {
  const initial = tasks.taskDetailToRuntimeTask({ task_id: 'task', conversation_id: 'conversation', status: 'running',
    events: [start, delta('a', 'foo'), delta('b', 'foo')] });
  const h = harness(async (_command, emit) => {
    emit(delta('c', 'bar')); // already ingested by the schedule consumer
    emit(delta('d', 'bar'));
  }, initial);
  const schedule = (event) => h.handlers().applyScheduledEvent({ type: 'task.event', schedule_id: 'schedule',
    run_id: 'scheduled', conversation_id: 'conversation', event });
  schedule(delta('a', 'foo')); schedule(delta('b', 'foo'));
  schedule(delta('c', 'bar')); schedule(delta('c', 'bar'));
  assert.equal(answer(h.task()), 'foofoobar');
  await h.handlers().executeQuest({ ...initial, requestedProvider: 'fixture', requestedModelId: 'model' }, 'conversation');
  assert.equal(answer(h.task()), 'foofoobarbar');
});

test('history GET/batch cache rejects partial raw replay before recombining compacted text', async () => {
  const cache = { current: new Map() };
  let response = { task_id: 'task', conversation_id: 'conversation', events_delta: false,
    events: [start, delta('a', 'foo'), delta('b', 'foo')] };
  const handlers = () => createDraftConversationHandlers({
    normalizeRuntimeEvents: runtimeEvents.normalizeRuntimeEvents, buildApiHeaders: () => ({}),
    taskRuntimeEventCacheRef: cache, taskRuntimeFetchesRef: { current: new Map() },
    apiFetch: async (_url, options) => Response.json(options.method === 'GET' ? response : [response]),
  });
  await handlers().fetchTaskRuntimeDetail('task', 'conversation');
  response = { ...response, events_delta: true, events: [delta('a', 'foo'), delta('c', 'bar')] };
  const [result] = await handlers().fetchTaskRuntimeBatch('conversation', ['task']);
  assert.equal(answer(tasks.taskDetailToRuntimeTask(result.normalizedTask)), 'foofoobar');
  assert.equal(cache.current.get('task').lastEventId, 'c');
});

test('history replacement refreshes a running consumer identity Set once, without scanning each delta', () => {
  const initial = tasks.taskDetailToRuntimeTask({ task_id: 'task', conversation_id: 'conversation', status: 'running',
    events: [start, delta('a', 'foo')] });
  const h = harness(undefined, initial);
  const schedule = (event) => h.handlers().applyScheduledEvent({ type: 'task.event', schedule_id: 'schedule',
    run_id: 'scheduled', conversation_id: 'conversation', event });
  schedule(delta('a', 'foo')); // seed the consumer before history hydration
  const restored = tasks.taskDetailToRuntimeTask({ task_id: 'task', conversation_id: 'conversation', status: 'running',
    events: [start, delta('a', 'foo'), delta('b', 'bar')] });
  h.ctx.updateTaskRuntimeState((state) => ({ ...state, tasksById: { task: restored } }), 'conversation');
  schedule(delta('b', 'bar')); schedule(delta('c', 'bar'));
  assert.equal(answer(h.task()), 'foobarbar');
});

test('compaction never mutates a prior frozen history snapshot or its retained ids', () => {
  const previous = compactStreamEvents([delta('a', 'foo'), delta('b', 'foo')]);
  Object.freeze(previous[0].deltaEventIds); Object.freeze(previous[0]); Object.freeze(previous);
  const next = compactStreamEvents([...previous, delta('b', 'foo'), delta('c', 'bar')]);
  assert.equal(next[0].delta, 'foofoobar');
  assert.deepEqual(previous[0].deltaEventIds, ['a', 'b']);
  assert.deepEqual(next[0].deltaEventIds, ['a', 'b', 'c']);
});

test('stream merge is literal, not a replay or text-overlap heuristic', () => {
  const merged = mergeAdjacentStreamEvent(delta('a', 'foo'), delta('a', 'foo'));
  assert.equal(merged.delta, 'foofoo', 'identity filtering is the caller ingest responsibility');
});

for (const interleaved of [false, true]) {
  test(`10000-event historical ${interleaved ? 'interleaved' : 'adjacent'} compaction has linear identity work`, (t) => {
    const count = 10000;
    let idReads = 0;
    const events = Array.from({ length: count }, (_, index) => ({ ...delta(`event-${index}`, 'foo', interleaved ? `parent-${index % 2}` : 'delegate'),
      get event_id() { idReads += 1; return `event-${index}`; } }));
    const started = performance.now();
    const compacted = compactStreamEvents(events);
    const elapsed = performance.now() - started;
    t.diagnostic(`${count} events compacted in ${elapsed.toFixed(1)}ms`);
    assert.ok(elapsed < 1500, `compaction took ${elapsed.toFixed(1)}ms (old scan took ~7 seconds)`);
    assert.ok(idReads < count * 12, `${idReads} identity reads must be O(n), not a scan per delta`);
    assert.equal(compacted.map(eventDeltaText).join(''), 'foo'.repeat(count));
    assert.equal(compacted.flatMap((event) => event.deltaEventIds).length, count);
    const accept = createRuntimeEventIngest(compacted);
    assert.equal(accept(delta('event-9999', 'foo', interleaved ? 'parent-1' : 'delegate')), false);
    assert.equal(accept(delta('new', 'foo')), true, 'repeated text under a fresh id remains output');
  });
}

const mergeableTypes = ['llm_answer_delta', 'llm_thinking_delta', 'tool_output_delta', 'sub_agent_answer_delta'];
const streamDelta = (type, id, text) => ({ type, event_id: id, delta: text,
  task_id: 'task', conversation_id: 'conversation',
  ...(type === 'tool_output_delta' ? { call_id: 'output' } : {}),
  ...(type === 'sub_agent_answer_delta' ? { parent_call_id: 'delegate' } : {}),
});
const streamPrefix = (type) => type === 'sub_agent_answer_delta' ? [start]
  : type === 'tool_output_delta' ? [{ ...start, call_id: 'output', tool_name: 'read_file' }] : [];
function streamProjection(task, type) {
  if (type === 'sub_agent_answer_delta') return answer(task);
  const items = buildChatTimeline(task).items;
  if (type === 'tool_output_delta') return items.find((item) => item.callId === 'output').toolOutput;
  return items.filter((item) => item.kind === (type === 'llm_answer_delta' ? 'text' : 'thinking'))
    .map((item) => item.text).join('');
}

for (const type of mergeableTypes) {
  test(`${type}: real fetchTaskRuntimeBatch -> taskDetailToRuntimeTask -> timeline filters non-leading b replay`, async () => {
    const cache = { current: new Map() };
    const fetches = { current: new Map() };
    const requests = [];
    let response = { task_id: 'task', conversation_id: 'conversation', status: 'running', events_delta: false,
      events: [...streamPrefix(type), streamDelta(type, 'a', 'foo'), streamDelta(type, 'b', 'bar')] };
    const handlers = () => createDraftConversationHandlers({
      normalizeRuntimeEvents: runtimeEvents.normalizeRuntimeEvents, buildApiHeaders: () => ({}),
      taskRuntimeEventCacheRef: cache, taskRuntimeFetchesRef: fetches,
      apiFetch: async (_url, options) => {
        assert.equal(options.method, 'POST');
        requests.push(JSON.parse(options.body));
        return Response.json([response]);
      },
    });
    const [first] = await handlers().fetchTaskRuntimeBatch('conversation', ['task']);
    const hydrated = tasks.taskDetailToRuntimeTask(first.normalizedTask);
    assert.equal(streamProjection(hydrated, type), 'foobar');
    const compacted = first.events.find((event) => event.type === type);
    assert.deepEqual(compacted.deltaEventIds, ['a', 'b']);
    assert.deepEqual(hydrated.eventLog.find((event) => event.type === type).deltaEventIds, ['a', 'b']);
    Object.freeze(compacted.deltaEventIds); Object.freeze(compacted); Object.freeze(first.events);

    response = { ...response, events_delta: true,
      events: [streamDelta(type, 'b', 'bar'), streamDelta(type, 'c', 'baz')] };
    const [second] = await handlers().fetchTaskRuntimeBatch('conversation', ['task']);
    const restored = tasks.taskDetailToRuntimeTask(second.normalizedTask);
    assert.equal(streamProjection(restored, type), 'foobarbaz', 'must not become foobarbarbaz');
    assert.deepEqual(restored.eventLog.find((event) => event.type === type).deltaEventIds, ['a', 'b', 'c']);
    assert.equal(cache.current.get('task').lastEventId, 'c');
    assert.deepEqual(requests[1].tasks, [{ task_id: 'task', after_event_id: 'b' }]);
    assert.equal(streamProjection(hydrated, type), 'foobar', 'prior hydrated snapshot remains immutable');
  });

  test(`${type}: scheduled history seed rejects b replay across consumers and history replacement`, () => {
    const initial = tasks.taskDetailToRuntimeTask({ task_id: 'task', conversation_id: 'conversation', status: 'running',
      events: [...streamPrefix(type), streamDelta(type, 'a', 'foo'), streamDelta(type, 'b', 'bar')] });
    const h = harness(undefined, initial);
    const schedule = (event) => h.handlers().applyScheduledEvent({ type: 'task.event', schedule_id: 'schedule',
      run_id: 'scheduled', conversation_id: 'conversation', event });
    const beforeReplay = h.task();
    schedule(streamDelta(type, 'b', 'bar'));
    assert.equal(h.task(), beforeReplay, 'replay causes no projection or answer-buffer mutation');
    assert.equal(streamProjection(h.task(), type), 'foobar');
    schedule(streamDelta(type, 'c', 'baz'));
    schedule(streamDelta(type, 'c', 'baz'));
    assert.equal(streamProjection(h.task(), type), 'foobarbaz');

    const restored = tasks.taskDetailToRuntimeTask({ task_id: 'task', conversation_id: 'conversation', status: 'running',
      events: [...streamPrefix(type), streamDelta(type, 'a', 'foo'), streamDelta(type, 'b', 'bar'),
        streamDelta(type, 'c', 'baz'), streamDelta(type, 'd', 'bar')] });
    h.ctx.updateTaskRuntimeState((state) => ({ ...state, tasksById: { task: restored } }), 'conversation');
    schedule(streamDelta(type, 'd', 'bar'));
    assert.equal(h.task(), restored, 'replacement history seeds its non-leading ids once');
    schedule(streamDelta(type, 'e', 'bar'));
    assert.equal(streamProjection(h.task(), type), 'foobarbazbarbar', 'different ids with equal output are literal');
  });

  test(`${type}: queued production delta metadata survives log conversion into a new scheduled consumer`, async () => {
    const h = harness(async (_command, emit) => {
      emit({ type: 'run_started', event_id: 'run', task_id: 'task', conversation_id: 'conversation' });
      for (const event of streamPrefix(type)) emit(event);
      emit(streamDelta(type, 'a', 'foo'));
      emit(streamDelta(type, 'b', 'bar'));
    });
    await h.handlers().executeQuest({ id: 'local', title: 'Offline question', originViewMode: 'chat',
      requestedProvider: 'fixture', requestedModelId: 'model' }, 'conversation');
    assert.deepEqual(h.task().eventLog.find((event) => event.type === type).deltaEventIds, ['a', 'b']);
    const restored = harness(undefined, h.task());
    const schedule = (event) => restored.handlers().applyScheduledEvent({ type: 'task.event', schedule_id: 'schedule',
      run_id: 'scheduled', conversation_id: 'conversation', event });
    const beforeReplay = restored.task();
    schedule(streamDelta(type, 'b', 'bar'));
    assert.equal(restored.task(), beforeReplay);
    schedule(streamDelta(type, 'c', 'bar'));
    const log = restored.task().eventLog.filter((event) => event.type === type);
    assert.equal(log.map(eventDeltaText).join(''), 'foobarbar');
    assert.deepEqual(log.flatMap((event) => event.deltaEventIds), ['a', 'b', 'c']);
  });
}
