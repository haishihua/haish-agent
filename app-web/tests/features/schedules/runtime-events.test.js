import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { HAISH_API_BASE: '' };
const { createTaskStreamHandlers } = await import('../../../src/features/tasks/hooks/createTaskStreamHandlers.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { buildTaskRuntimeRecord, normalizeTaskStatus, isTerminalTaskStatus, applyTerminalTaskState } = await import('../../../src/features/tasks/model/task-runtime.js');
const { normalizeRuntimeEvent, CHAT_FINAL_FOLLOWUP_EVENT_TYPES } = await import('../../../src/features/tasks/model/runtime-events.js');

test('scheduled stream writes answers, task records and busy state only to its owner', () => {
  const runtimes = new Map();
  const getRuntime = (id) => {
    assert.ok(id, 'explicit owner required');
    if (!runtimes.has(id)) runtimes.set(id, { answerBuffer: '', taskRuntimeState: { tasksById: {}, taskOrder: [] }, busy: false });
    return runtimes.get(id);
  };
  const ctx = {
    activeRuntimeTargetConvId: (explicit) => explicit || 'currently-open',
    getRuntime,
    mutateRuntime: (id, update) => update(getRuntime(id)),
    batchRuntimeMutations: (_id, work) => work(),
    updateTaskRuntimeState: (update, id) => { getRuntime(id).taskRuntimeState = update(getRuntime(id).taskRuntimeState); },
    setRuntimeBusy: (busy, id) => { getRuntime(id).busy = busy; },
    setRuntimeActiveTaskId: (value, id) => { getRuntime(id).activeTaskId = value; },
    setRuntimeFetchController: (value, id) => { getRuntime(id).fetchController = value; },
    readRuntimeAnswerBuffer: (id) => getRuntime(id).answerBuffer,
    setRuntimeAnswerBuffer: (value, id) => { getRuntime(id).answerBuffer = value; },
    buildTaskRuntimeRecord, normalizeRuntimeEvent, normalizeTaskStatus, isTerminalTaskStatus, applyTerminalTaskState,
    CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
    userCancelledTaskIdsRef: { current: new Set() }, chatFinalizedTaskIdsRef: { current: new Set() },
    timestampValue: (value) => Date.parse(value) || 0,
    getChatProgressLine: () => '', appendChatProgressText: (text) => text,
    eventDeltaText: (event) => event.delta || '',
    appendAnswerDelta: (previous, next) => previous + next,
    normalizeChatImageRefs: (images) => images, toDisplayText: String,
    stripChatImageAugmentation: (text) => ({ text }),
  };
  const handlers = createTaskStreamHandlers({ ...ctx, ...createConversationActivationHandlers(ctx) });
  const runtime = getRuntime('scheduled');
  runtime.abortRequested = true; // A previous stopped run must not block a new scheduled run.
  const send = (event) => handlers.applyScheduledEvent({
    type: 'task.event', schedule_id: 's', run_id: 'r', conversation_id: 'scheduled', event: {
      conversation_id: 'scheduled', task_id: 't', scheduled_execution_mode: 'chat', ...event,
    },
  });
  send({ type: 'run_started', message: 'Review', user_message_id: 'u' });
  send({ type: 'llm_answer_delta', delta: 'Answer' });
  assert.equal(runtime.taskRuntimeState.tasksById.t.answerText, 'Answer');
  assert.equal(runtime.taskRuntimeState.tasksById.t.originViewMode, 'chat');
  assert.equal(runtime.busy, true);
  assert.equal(runtime.activeRunId, 'schedule:r');
  assert.equal(runtime.abortRequested, false);
  send({ type: 'final_answer', content: 'Final answer' });
  send({ type: 'run_finished', status: 'done', task: { task_id: 't', conversation_id: 'scheduled', title: 'Review', status: 'done', execution_mode: 'chat' } });
  assert.equal(runtime.taskRuntimeState.tasksById.t.status, 'done');
  assert.equal(runtime.taskRuntimeState.tasksById.t.answerText, 'Final answer');
  assert.equal(runtime.busy, false);
  assert.equal(runtime.activeRunId, null);
  assert.equal(runtimes.has('currently-open'), false);
  send({ type: 'llm_answer_delta', conversation_id: 'wrong', delta: 'should not appear' });
  assert.equal(runtime.answerBuffer, 'Final answer');
});
