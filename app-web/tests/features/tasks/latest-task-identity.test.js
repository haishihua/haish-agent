import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
const { createAttemptHarness } = await import('../../fixtures/task-attempt-runtime.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { buildChatRows, latestChatTaskId } = await import('../../../src/features/app/model/chat-rows.js');
const { createConversationHandlers } = await import('../../../src/features/conversations/hooks/createConversationHandlers.js');

const sourceTurn = () => ({ taskId: 'previous', conversationId: 'conversation', userMessageId: 'previous-user',
  title: 'Previous input', status: 'done', executionMode: 'chat', originViewMode: 'chat',
  requestedProvider: 'fixture', requestedModelId: 'model' });
const failure = (taskId, extra = {}) => ({ type: 'run_finished', task_id: taskId, conversation_id: 'conversation',
  status: 'failed', error: 'Synthetic rate limit', task: { task_id: taskId, conversation_id: 'conversation',
    title: 'Latest input', status: 'failed', user_message_id: 'latest-user', error: 'Synthetic rate limit', ...extra } });
const latestPending = () => ({ ...sourceTurn(), id: 'local-latest', taskId: 'local-latest', userMessageId: null,
  title: 'Latest input', status: 'running' });

for (const replayedStart of [false, true]) {
  test(`latest failed task stays retryable when run_started is ${replayedStart ? 'already hydrated and deduplicated' : 'missing from the stream'}`, async () => {
    const previous = sourceTurn();
    const h = createAttemptHarness(previous, { transport: async (_command, emit) => {
      if (replayedStart) emit({ type: 'run_started', event_id: 'start', task_id: 'latest', conversation_id: 'conversation' });
      emit(failure('latest'));
    } });
    h.runtime.taskRuntimeState.latestTaskId = previous.taskId;
    if (replayedStart) {
      h.runtime.taskRuntimeState.taskOrder.push('latest');
      h.runtime.taskRuntimeState.tasksById.latest = { ...latestPending(), taskId: 'latest',
        eventLog: [{ type: 'run_started', eventId: 'start' }] };
    }
    await h.executeQuest(latestPending(), previous.conversationId);
    const state = h.runtime.taskRuntimeState;
    assert.equal(state.tasksById.latest.status, 'failed');
    assert.equal(state.latestTaskId, 'latest', 'the failure row and latest-turn eligibility must refer to the same confirmed task');
    assert.equal(state.pendingTask, null, 'a confirmed task must not leave a local duplicate behind');
    assert.equal(h.runtime.busy, false);
  });
}

test('the first received task event confirms Retry even if run_started was lost', async () => {
  const source = { ...sourceTurn(), status: 'failed' };
  const h = createAttemptHarness(source, { transport: async (_command, emit) => {
    emit(failure('retried', { source_task_id: source.taskId }));
  } });
  h.runtime.taskRuntimeState.latestTaskId = source.taskId;
  let accepted = 0;
  await h.executeQuest(source, source.conversationId, { attempt: 'rerun', onAccepted: () => { accepted += 1; } });
  assert.equal(accepted, 1, 'a server task receipt must not be mistaken for an unconfirmed Retry');
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'retried');
  assert.equal(h.runtime.taskRuntimeState.tasksById.retried.status, 'failed');
  assert.equal(h.runtime.taskRuntimeState.pendingTask, null);
  assert.equal(h.runtime.activeRunId, null);
});

test('a fully hydrated and replayed failure still settles this request without duplicating events', async () => {
  const previous = sourceTurn();
  const terminal = { ...failure('latest'), event_id: 'end' };
  const h = createAttemptHarness(previous, { transport: async (_command, emit) => emit(terminal) });
  const eventLog = [{ type: 'run_finished', eventId: 'end' }];
  h.runtime.taskRuntimeState = { latestTaskId: previous.taskId, taskOrder: [previous.taskId, 'latest'],
    pendingTask: null, tasksById: { previous, latest: { ...latestPending(), taskId: 'latest', status: 'failed', eventLog } } };
  let accepted = 0;
  await h.executeQuest(latestPending(), previous.conversationId, { onAccepted: () => { accepted += 1; } });
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'latest');
  assert.equal(h.runtime.taskRuntimeState.pendingTask, null);
  assert.equal(h.runtime.taskRuntimeState.tasksById.latest.eventLog, eventLog, 'duplicate content stays deduplicated');
  assert.equal(accepted, 1);
  assert.equal(h.runtime.busy, false);
  assert.equal(h.runtime.activeTaskId, null);
  assert.equal(h.runtime.activeRunId, null);
});

test('a failed unaccepted draft can be retried without changing the authoritative server turn', async () => {
  const previous = sourceTurn();
  const pending = { ...latestPending(), taskId: null, status: 'failed', error: 'Connection failed before acceptance' };
  const state = { latestTaskId: previous.taskId, activeTaskId: null, pendingTask: pending,
    taskOrder: [previous.taskId], tasksById: { previous } };
  const rows = buildChatRows({ agentOptions: [], chatMessageRowsCache: new WeakMap(),
    conversationId: previous.conversationId, currentConversation: null, settledRuntimeTaskIds: new Set(), taskRuntimeState: state });
  assert.equal(rows.at(-1).status, 'failed');
  assert.equal(latestChatTaskId(state), rows.at(-1).taskId);
  assert.equal(state.latestTaskId, previous.taskId, 'local eligibility is not a server identity update');
  const calls = [];
  const runtime = { taskRuntimeState: state };
  const handlers = createConversationHandlers({ getRuntime: () => runtime,
    buildDeployRequest: (...args) => { calls.push(args); return {}; },
    startDeploy: (request, owner) => { calls.push([request, owner]); return true; },
  });
  assert.equal(await handlers.handleRetryTask(pending, null, { provider: 'fixture', modelId: 'model', agentId: 'agent' }), true);
  assert.equal(calls[0][0], pending.title);
  assert.equal(calls[1][1], previous.conversationId);
  assert.equal(latestChatTaskId({ ...state, pendingTask: null, latestTaskId: 'newer' }), 'newer');
  assert.equal(latestChatTaskId({ ...state, pendingTask: { ...pending, awaitingRetryConfirmation: true } }), previous.taskId);
});

for (const pending of [null, latestPending()]) {
  test(`late history events cannot steal latest identity${pending ? ' or consume a newer pending turn' : ''}`, () => {
    const previous = sourceTurn();
    const h = createAttemptHarness(previous);
    h.runtime.taskRuntimeState = { latestTaskId: 'latest', pendingTask: pending,
      taskOrder: ['previous', 'latest'], tasksById: { previous, latest: { ...previous, taskId: 'latest' } } };
    h.applyScheduledEvent({ type: 'task.event', schedule_id: 'schedule', run_id: 'old', conversation_id: 'conversation',
      event: { type: 'run_started', event_id: 'late-start', task_id: 'previous', conversation_id: 'conversation' } });
    assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'latest');
    assert.equal(h.runtime.taskRuntimeState.pendingTask, pending);
  });
}

test('history hydration order is not a replacement for the authoritative latest task', () => {
  const state = { latestTaskId: 'latest', taskOrder: ['latest', 'history'],
    tasksById: { latest: { ...sourceTurn(), taskId: 'latest' }, history: { ...sourceTurn(), taskId: 'history' } } };
  const runtime = { taskRuntimeState: state };
  const activation = createConversationActivationHandlers({
    getRuntime: () => runtime, activeRuntimeTargetConvId: id => id,
    userCancelledTaskIdsRef: { current: new Set() },
    updateTaskRuntimeState: update => { runtime.taskRuntimeState = update(runtime.taskRuntimeState); },
    mutateRuntime: (_id, update) => update(runtime),
  });
  activation.ensureTaskForEvent({ task_id: 'history', conversation_id: 'conversation' }, 'conversation');
  assert.equal(runtime.taskRuntimeState.latestTaskId, 'latest');
});
