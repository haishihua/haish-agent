import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
const { createAttemptHarness } = await import('../../fixtures/task-attempt-runtime.js');
const { createDeployHandlers } = await import('../../../src/features/tasks/hooks/createDeployHandlers.js');
const { collapseFullTaskAttempts } = await import('../../../src/features/chat/model/task-attempts.js');
const { applyTerminalTaskState, sortTaskIdsForRestore, taskSummaryToRuntimeTask } = await import('../../../src/features/tasks/model/task-runtime.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { createConversationHandlers } = await import('../../../src/features/conversations/hooks/createConversationHandlers.js');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const sourceTurn = () => ({ taskId: 'source', conversationId: 'conversation', userMessageId: 'user',
  requestedProvider: 'fixture', requestedModelId: 'fixture-model', title: 'Question',
  status: 'failed', error: 'Original 503', executionMode: 'chat', originViewMode: 'chat' });

function stopHarness(harness, { cancel, recover, currentId = { current: 'conversation' }, deployContext = {} } = {}) {
  const runtime = harness.runtime;
  const calls = [];
  const handlers = createDeployHandlers({
    applyTerminalTaskState,
    conversationIdRef: currentId,
    draftConversationRef: { current: null },
    getRuntime: () => runtime,
    mutateRuntime: (_id, update) => update(runtime),
    updateTaskRuntimeState: (update) => { runtime.taskRuntimeState = update(runtime.taskRuntimeState); },
    updateTaskById: (id, update) => {
      const previous = runtime.taskRuntimeState.tasksById[id];
      if (previous) runtime.taskRuntimeState.tasksById[id] = update(previous);
    },
    isTaskActuallyActive: (task) => ['running', 'queued'].includes(task?.status),
    taskUpdatedTimestamp: (task) => task.updatedAt || 0,
    chatFinalizedTaskIdsRef: { current: new Set() },
    userCancelledTaskIdsRef: { current: new Set() },
    cancelActiveConversationTask: (id) => { calls.push(['conversation', id]); return cancel(); },
    cancelActiveTask: async (id) => { calls.push(['task', id]); return Response.json({ cancelled: true, task_id: id, conversation_id: 'conversation' }); },
    recoverConversationTasks: async (...args) => { calls.push(['recover', args[0]]); return recover?.(...args); },
    flushRuntimeTasksToWorkspace: () => {},
    setWorkspaceState: () => {},
    normalizeWorkspaceOrdering: (state) => state,
    ...deployContext,
  });
  return { ...handlers, calls };
}

function visibleTasks(runtime) {
  const state = runtime.taskRuntimeState;
  return collapseFullTaskAttempts(state.taskOrder.map((id) => state.tasksById[id]).filter(Boolean), state.pendingTask);
}

test('Stop before Retry confirmation retains the server attempt and suppresses late output', async () => {
  const source = sourceTurn();
  const start = deferred();
  const finish = deferred();
  const cancel = deferred();
  let onEvent;
  const harness = createAttemptHarness(source, { transport: async (_command, callback) => {
    onEvent = callback;
    await start.promise;
    callback({ type: 'run_started', task_id: 'server-retry', conversation_id: source.conversationId,
      source_task_id: source.taskId, user_message_id: source.userMessageId });
    await finish.promise;
  } });
  const stop = stopHarness(harness, { cancel: () => cancel.promise });
  const first = harness.executeQuest(source, source.conversationId, { attempt: 'rerun', requestId: 'retry-1' });
  stop.handleStop();
  const barrier = harness.runtime.stopPromise;
  assert.ok(barrier, 'Stop must keep a per-conversation settlement barrier');
  assert.equal(visibleTasks(harness.runtime).some((task) => task.taskId === source.taskId), false,
    'the pending stopped retry must not reveal the old failed bubble');
  start.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  onEvent({ type: 'llm_answer_delta', task_id: 'server-retry', conversation_id: source.conversationId, text: 'late output' });
  assert.deepEqual(visibleTasks(harness.runtime).map((task) => [task.taskId, task.status]), [['server-retry', 'cancelled']]);
  assert.equal(harness.runtime.taskRuntimeState.tasksById['server-retry'].answerText, '');
  assert.equal(harness.runtime.taskRuntimeState.latestTaskId, 'server-retry');
  cancel.resolve(Response.json({ cancelled: true, task_id: 'server-retry', conversation_id: source.conversationId }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.runtime.stopPromise, barrier, 'cancellation acknowledgement alone must not release the old stream');
  finish.resolve();
  await first;
  await barrier;
  assert.equal(harness.runtime.stopPromise, null);
  assert.equal(harness.runtime.busy, false);
  await assert.rejects(harness.executeQuest(source, source.conversationId, { attempt: 'rerun', requestId: 'retry-old' }), /latest|replaced/i);
  assert.equal(harness.requests.length, 1, 'the old failed task must never be submitted again');
});

test('a cancellation that beat task registration cancels the confirmed task explicitly', async () => {
  const source = sourceTurn();
  const start = deferred();
  const harness = createAttemptHarness(source, { transport: async (_command, onEvent) => {
    await start.promise;
    onEvent({ type: 'run_started', task_id: 'late-retry', conversation_id: source.conversationId,
      source_task_id: source.taskId, user_message_id: source.userMessageId });
  } });
  const stop = stopHarness(harness, { cancel: async () => Response.json({ cancelled: false, task_id: null, conversation_id: source.conversationId }) });
  const first = harness.executeQuest(source, source.conversationId, { attempt: 'rerun', requestId: 'retry' });
  stop.handleStop();
  const barrier = harness.runtime.stopPromise;
  start.resolve();
  await first;
  await barrier;
  assert.ok(stop.calls.some(([kind, id]) => kind === 'task' && id === 'late-retry'));
  assert.deepEqual(visibleTasks(harness.runtime).map((task) => task.taskId), ['late-retry']);
});

test('next attempt waits for cancellation and recovery without touching another conversation', async () => {
  const source = { ...sourceTurn(), status: 'cancelled' };
  const harness = createAttemptHarness(source);
  const cancel = deferred();
  const recover = deferred();
  const currentId = { current: source.conversationId };
  const stop = stopHarness(harness, { currentId, cancel: () => cancel.promise, recover: () => recover.promise });
  stop.handleStop();
  const barrier = harness.runtime.stopPromise;
  const next = harness.executeQuest(source, source.conversationId, { attempt: 'edit', message: 'Revised', requestId: 'next' });
  currentId.current = 'other-conversation';
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.requests.length, 0);
  cancel.resolve(Response.json({ cancelled: false, task_id: null, conversation_id: source.conversationId }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.requests.length, 0, 'recovery is part of the Stop barrier');
  recover.resolve();
  await barrier;
  await next;
  assert.equal(harness.requests.length, 1);
  assert.ok(stop.calls.every(([, id]) => id !== 'other-conversation'));
});

function recoveryHarness(runtime, getDetail) {
  const updates = [];
  const handlers = createConversationActivationHandlers({
    getRuntime: () => runtime,
    apiFetch: async () => Response.json(await getDetail()),
    sortTaskIdsForRestore,
    taskSummaryToRuntimeTask,
    updateTaskRuntimeState: (update, owner) => {
      updates.push(owner);
      runtime.taskRuntimeState = update(runtime.taskRuntimeState);
    },
    mutateRuntime: (owner, update) => { updates.push(owner); update(runtime); },
    isTaskActuallyActive: (task) => ['running', 'queued'].includes(task.status),
    restoreTaskRuntimes: async (_ids, { targetConversationId, isCurrentActivation }) => {
      assert.equal(targetConversationId, 'conversation');
      assert.equal(isCurrentActivation(), true);
    },
    flushRuntimeTasksToWorkspace: (owner) => { updates.push(owner); },
  });
  return { ...handlers, updates };
}

test('cancellation response and history recover the server task even without run_started', async () => {
  const source = sourceTurn();
  const finish = deferred();
  const harness = createAttemptHarness(source, { transport: async () => finish.promise });
  const recovery = recoveryHarness(harness.runtime, async () => ({ conversation_id: 'conversation', last_task_id: 'server-only', tasks: [
    { task_id: 'source', conversation_id: 'conversation', status: 'failed', title: 'Question' },
    { task_id: 'server-only', conversation_id: 'conversation', status: 'cancelled', title: 'Question', source_task_id: 'source', user_message_id: 'user' },
  ] }));
  const stop = stopHarness(harness, {
    cancel: async () => Response.json({ cancelled: true, task_id: 'server-only', conversation_id: 'conversation' }),
    recover: recovery.recoverConversationTasks,
  });
  const first = harness.executeQuest(source, 'conversation', { attempt: 'rerun' });
  stop.handleStop();
  const barrier = harness.runtime.stopPromise;
  finish.resolve();
  await first;
  await barrier;
  assert.deepEqual(visibleTasks(harness.runtime).map((task) => task.taskId), ['server-only']);
  assert.equal(harness.runtime.taskRuntimeState.latestTaskId, 'server-only');
  assert.ok(recovery.updates.every((owner) => owner === 'conversation'));
});

test('a latest-turn 409 refreshes authoritative state without automatically retargeting Retry', async () => {
  const source = sourceTurn();
  let recoveries = 0;
  const harness = createAttemptHarness(source, { transport: async () => {
    throw Object.assign(new Error('Only the latest turn can be retried or edited.'), { status: 409 });
  }, recover: async () => {
    recoveries += 1;
    harness.runtime.taskRuntimeState = { ...harness.runtime.taskRuntimeState, latestTaskId: 'newer', tasksById: {
      ...harness.runtime.taskRuntimeState.tasksById,
      newer: { ...source, taskId: 'newer', sourceTaskId: source.taskId, status: 'done' },
    }, taskOrder: [source.taskId, 'newer'] };
  } });
  let accepted = false;
  await assert.rejects(harness.executeQuest(source, 'conversation', { attempt: 'rerun', onAccepted: () => { accepted = true; } }), /latest turn/);
  assert.equal(recoveries, 1);
  assert.equal(accepted, false);
  assert.equal(harness.requests.length, 1);
  assert.deepEqual(visibleTasks(harness.runtime).map((task) => task.taskId), ['newer']);
  await assert.rejects(harness.executeQuest(source, 'conversation', { attempt: 'rerun' }), /latest|replaced/);
  assert.equal(harness.requests.length, 1);
});

test('startup rejection and an unconfirmed end never acknowledge the edit', async () => {
  for (const reject of [true, false]) {
    const source = sourceTurn();
    const harness = createAttemptHarness(source, { transport: async () => {
      if (reject) throw Object.assign(new Error('Startup rejected'), { status: 409 });
    } });
    const handlers = createConversationHandlers({ executeQuest: harness.executeQuest,
      getRuntime: () => harness.runtime, canStartDeployForConversation: () => true });
    await assert.rejects(handlers.handleRetryTask(source, 'Revised', { provider: 'p', modelId: 'm', agentId: 'a' }),
      reject ? /Startup rejected/ : /not confirmed/);
  }
});

test('Stop failures block the next attempt and remain recoverable by another Stop', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source);
  let fail = true;
  const stop = stopHarness(harness, { cancel: async () => {
    if (fail) return Response.json({}, { status: 500 });
    return Response.json({ cancelled: false, task_id: null, conversation_id: 'conversation' });
  } });
  stop.handleStop();
  await harness.runtime.stopPromise;
  assert.match(harness.runtime.stopError, /verify/);
  assert.equal(harness.runtime.busy, false, 'a Stop failure must not masquerade as a running task');
  await assert.rejects(harness.executeQuest(source, 'conversation', { attempt: 'rerun' }), /verify/);
  assert.equal(harness.requests.length, 0);
  fail = false;
  stop.handleStop();
  await harness.runtime.stopPromise;
  assert.equal(harness.runtime.stopError, null);
  await harness.executeQuest(source, 'conversation', { attempt: 'rerun' });
  assert.equal(harness.requests.length, 1);
});

test('recovery cannot overwrite a newer run that starts while its response is pending', async () => {
  const harness = createAttemptHarness(sourceTurn());
  const detail = deferred();
  const recovery = recoveryHarness(harness.runtime, () => detail.promise);
  const restore = recovery.recoverConversationTasks('conversation');
  harness.runtime.activeRunId = 'new-run';
  detail.resolve({ conversation_id: 'conversation', last_task_id: 'stale', tasks: [] });
  await restore;
  assert.deepEqual(harness.runtime.taskRuntimeState.taskOrder, ['source']);
  assert.equal(harness.runtime.activeRunId, 'new-run');
  assert.deepEqual(recovery.updates, []);
});

test('Stop after startup keeps the confirmed attempt and repeated Stop joins the same barrier', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source, { hold: true });
  const cancel = deferred();
  const stop = stopHarness(harness, { cancel: () => cancel.promise });
  const first = harness.executeQuest(source, 'conversation', { attempt: 'rerun' });
  assert.equal(harness.runtime.activeTaskId, 'confirmed-attempt');
  stop.handleStop();
  const barrier = harness.runtime.stopPromise;
  stop.handleStop();
  assert.equal(harness.runtime.stopPromise, barrier);
  assert.equal(stop.calls.filter(([kind]) => kind === 'conversation').length, 1);
  assert.deepEqual(visibleTasks(harness.runtime).map((task) => [task.taskId, task.status]), [['confirmed-attempt', 'cancelled']]);
  cancel.resolve(Response.json({ cancelled: true, task_id: 'confirmed-attempt', conversation_id: 'conversation' }));
  harness.release();
  await first;
  await barrier;
  assert.equal(harness.runtime.taskRuntimeState.pendingTask, null);
  assert.equal(harness.runtime.busy, false);
});

test('unconfirmed old stream cleanup does not clear ownership of a newer background run', async () => {
  const source = sourceTurn();
  const finish = deferred();
  const harness = createAttemptHarness(source, { transport: async () => finish.promise });
  const first = harness.executeQuest(source, 'conversation', { attempt: 'rerun' });
  const controller = new AbortController();
  harness.runtime.activeRunId = 'schedule:new';
  harness.runtime.activeTaskId = 'scheduled';
  harness.runtime.busy = true;
  harness.runtime.fetchController = controller;
  finish.resolve();
  await first;
  assert.equal(harness.runtime.activeRunId, 'schedule:new');
  assert.equal(harness.runtime.activeTaskId, 'scheduled');
  assert.equal(harness.runtime.fetchController, controller);
  assert.equal(harness.runtime.busy, true);
});

test('composer send waits for Stop reconciliation and keeps its text when the conversation changes', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source);
  const cancel = deferred();
  const currentId = { current: 'conversation' };
  const toasts = [];
  const stop = stopHarness(harness, { currentId, cancel: () => cancel.promise, deployContext: {
    conversationId: 'conversation', selectedConversationId: 'conversation', viewModeRef: { current: 'chat' },
    showToast: (...args) => toasts.push(args),
  } });
  stop.handleStop();
  const send = stop.handleDeploy('Keep my text', null, 'm', null, [], 'a', 'p');
  assert.equal(harness.requests.length, 0);
  currentId.current = 'other-conversation';
  cancel.resolve(Response.json({ cancelled: false, task_id: null, conversation_id: 'conversation' }));
  assert.equal(await send, false);
  assert.equal(harness.requests.length, 0);
  assert.deepEqual(toasts, []);
});
