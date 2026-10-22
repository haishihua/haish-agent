import test from 'node:test';
import assert from 'node:assert/strict';

// The task-runtime model chain reaches shared/api/base.js, which reads window.
globalThis.window = {};
const { createConversationRuntime } = await import('../../../src/features/conversations/hooks/createConversationRuntime.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { createTaskStreamHandlers } = await import('../../../src/features/tasks/hooks/createTaskStreamHandlers.js');
const { buildChatTimeline, appendAnswerDelta } = await import('../../../src/features/chat/model/chat-timeline.js');
const { eventDeltaText } = await import('../../../src/features/chat/model/chat-text.js');
const tasks = await import('../../../src/features/tasks/model/task-runtime.js');
const runtimeEvents = await import('../../../src/features/tasks/model/runtime-events.js');

const delta = (id, text) => ({
  type: 'llm_answer_delta', event_id: id, delta: text, task_id: 'task', conversation_id: 'conversation',
});
const runStarted = { type: 'run_started', event_id: 'run', task_id: 'task', conversation_id: 'conversation' };
const answerOf = (task) => buildChatTimeline(task).items
  .filter((item) => item.kind === 'text').map((item) => item.text).join('');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function harness(transport, overrides = {}, initial = null) {
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
    fetchTaskRuntimeDetail: async () => { throw new Error('resync should not refetch a task we hold no copy of'); },
    restoreLatestTaskRuntime: async () => { throw new Error('resync should not hydrate a task we already hold'); },
    ...overrides,
  };
  Object.assign(ctx, createConversationRuntime(ctx));
  Object.assign(ctx, createConversationActivationHandlers(ctx));
  const runtime = ctx.getRuntime('conversation', { create: true });
  if (initial) {
    runtime.taskRuntimeState = {
      ...tasks.createEmptyTaskRuntimeState(), taskOrder: ['task'], tasksById: { task: initial },
    };
  }
  return {
    ctx,
    runtime,
    handlers: () => createTaskStreamHandlers(ctx),
    task: () => runtime.taskRuntimeState.tasksById.task,
  };
}

const pendingQuest = {
  id: 'local', title: 'Offline question', originViewMode: 'chat',
  requestedProvider: 'fixture', requestedModelId: 'model',
};

test('resync_required refetches only the missed events into the live task instead of failing it', async () => {
  const fetches = [];
  const toasts = [];
  const h = harness(async (_command, emit) => {
    emit(runStarted);
    emit(delta('a', 'live-'));
    emit({ type: 'resync_required', request_id: 'request', task_id: 'task', reason: 'backpressure' });
    // 补事件是异步的（游标 GET）：等它落下去，直播再从下一段继续。
    await tick();
    emit(delta('c', '+more'));
  }, {
    showToast: (kind, text) => toasts.push([kind, text]),
    fetchTaskRuntimeDetail: async (taskId, conversationId) => {
      fetches.push([taskId, conversationId]);
      return {
        normalizedTask: { task_id: taskId, conversation_id: conversationId },
        events: [runtimeEvents.normalizeRuntimeEvent(delta('b', 'missed-'))],
      };
    },
  });

  await h.handlers().executeQuest(pendingQuest, 'conversation');
  await tick();

  assert.deepEqual(fetches, [['task', 'conversation']], 'one cursor refetch for the reported task');
  // 漏掉的那一段被按 event_id 补进同一条日志：不是整份替换，也没重复计。
  assert.equal(answerOf(h.task()), 'live-missed-+more');
  assert.deepEqual(toasts, [], 'a backpressure hint is never surfaced as a user-facing error');
  assert.notEqual(h.task().status, 'failed');
});

test('a resync that brings only seen events changes nothing', async () => {
  const h = harness(async (_command, emit) => {
    emit(runStarted);
    emit(delta('a', 'live-'));
    emit({ type: 'resync_required', request_id: 'request', task_id: 'task' });
  }, {
    fetchTaskRuntimeDetail: async (taskId, conversationId) => ({
      normalizedTask: { task_id: taskId, conversation_id: conversationId },
      events: [runStarted, delta('a', 'live-')],
    }),
  });

  await h.handlers().executeQuest(pendingQuest, 'conversation');
  await tick();

  assert.equal(answerOf(h.task()), 'live-');
});

test('resync_required for a task with no local copy uses the ordinary restore path', async () => {
  const restored = [];
  const toasts = [];
  const h = harness(async (_command, emit) => {
    emit({ type: 'resync_required', request_id: 'request', task_id: 'unknown-task' });
  }, {
    showToast: (kind, text) => toasts.push([kind, text]),
    fetchTaskRuntimeDetail: async () => { throw new Error('unknown tasks must hydrate, not append'); },
    restoreLatestTaskRuntime: async (taskId, options) => {
      restored.push([taskId, options.targetConversationId, options.isCurrentActivation()]);
    },
  });

  await h.handlers().executeQuest(pendingQuest, 'conversation');
  await tick();

  assert.deepEqual(restored, [['unknown-task', 'conversation', true]]);
  assert.deepEqual(toasts, []);
});

test('a failing resync refetch leaves the live task running and says nothing to the user', async () => {
  const toasts = [];
  const warnings = [];
  const originalWarn = console.warn;
  const h = harness(async (_command, emit) => {
    emit(runStarted);
    emit(delta('a', 'live-'));
    emit({ type: 'resync_required', request_id: 'request', task_id: 'task' });
  }, {
    showToast: (kind, text) => toasts.push([kind, text]),
    fetchTaskRuntimeDetail: async () => { throw Object.assign(new Error('refetch failed'), { status: 500 }); },
  });

  console.warn = (...args) => warnings.push(args);
  try {
    await h.handlers().executeQuest(pendingQuest, 'conversation');
    await tick();
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(answerOf(h.task()), 'live-');
  assert.notEqual(h.task().status, 'failed');
  assert.equal(h.task().error, null);
  assert.deepEqual(toasts, []);
  // 没补上只写日志给诊断用，不进时间线、不进 toast。
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], '[runtime] resync after backpressure failed');
});

test('a truncated resync page keeps what the live stream already showed instead of duplicating it', async () => {
  // 服务端只能给最近的一页（truncated）：本地已有的那段不重复计，被丢掉的中段也不会被拼回来。
  const h = harness(async (_command, emit) => {
    emit(runStarted);
    emit(delta('a', 'live-'));
    emit(delta('b', 'tail-'));
    emit({ type: 'resync_required', request_id: 'request', task_id: 'task' });
  }, {
    fetchTaskRuntimeDetail: async (taskId, conversationId) => ({
      normalizedTask: { task_id: taskId, conversation_id: conversationId, truncated: true, next_cursor: 'b' },
      events: [runtimeEvents.normalizeRuntimeEvent(delta('b', 'tail-'))],
    }),
  });

  await h.handlers().executeQuest(pendingQuest, 'conversation');
  await tick();

  assert.equal(answerOf(h.task()), 'live-tail-');
});
