import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { HAISH_API_BASE: '', haish: {} };
const { createConversationRuntime } = await import('../../src/features/conversations/hooks/createConversationRuntime.js');
const { createConversationActivationHandlers } = await import('../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { createDraftConversationHandlers } = await import('../../src/features/conversations/hooks/createDraftConversationHandlers.js');
const { createConversationHandlers } = await import('../../src/features/conversations/hooks/createConversationHandlers.js');
const { createScheduledRuntimeHandlers } = await import('../../src/features/schedules/model/runtime-handlers.js');
const { createTaskStreamHandlers } = await import('../../src/features/tasks/hooks/createTaskStreamHandlers.js');
const tasks = await import('../../src/features/tasks/model/task-runtime.js');
const events = await import('../../src/features/tasks/model/runtime-events.js');
const workspace = await import('../../src/features/conversations/model/workspace-state.js');

const cid = 'scheduled-conversation';
function makeHarness() {
  const stored = Array.from({ length: 6 }, (_, index) => ({
    task_id: `t${index}`, conversation_id: cid, execution_mode: 'chat',
    title: `Question ${index}`, answer_text: `Saved answer ${index}`,
    status: 'done', stage: 'done',
    created_at: `2026-10-01T00:00:0${index}Z`, updated_at: `2026-10-01T00:00:0${index}Z`,
    assistant_message_id: `assistant-${index}`, events: [],
  }));
  const detail = { conversation_id: cid, execution_mode: 'chat', last_task_id: 't5', messages: [], tasks: stored };
  let state = { projects: [{ id: 'project', conversations: [{ id: cid, tasks: stored.map((task) => {
    const { answer_text: _answer, ...summary } = task;
    return tasks.taskSummaryToRuntimeTask(summary);
  }) }] }] };
  const requests = [];
  let interceptTask = null;
  const noOp = () => {};
  const ref = (current) => ({ current });
  const ctx = {
    ...tasks, ...events,
    API_BASE: '', workspaceState: state, conversationIdRef: ref('currently-open'),
    draftConversationRef: ref(null), pendingCreatedDetailRef: ref(null),
    runtimesRef: ref(new Map()), streamTargetConvIdRef: ref(null),
    taskImageAttachmentsRef: ref(new Map()), taskRuntimeFetchesRef: ref(new Map()),
    taskRuntimeEventCacheRef: ref(new Map()), conversationActivationSeqRef: ref(0),
    conversationDetailAbortRef: ref(null), chatFinalizedTaskIdsRef: ref(new Set()),
    userCancelledTaskIdsRef: ref(new Set()), viewModeRef: ref('chat'),
    toastTimerRef: ref(null), buildApiHeaders: () => ({}),
    normalizeWorkspaceOrdering: (next) => next,
    setWorkspaceState: (update) => { state = update(state); },
    findConversationById: workspace.findConversationById,
    findProjectByConversationId: workspace.findProjectByConversationId,
    isTaskActuallyActive: workspace.isTaskActuallyActive,
    taskUpdatedTimestamp: workspace.taskUpdatedTimestamp,
    timestampValue: workspace.timestampValue, mergeChatImageRefs: workspace.mergeChatImageRefs,
    chatImageFallbacksByTaskIdFromMessages: () => new Map(),
    loadStoredContextUsage: () => null, latestContextUsageFromTasks: () => null,
    contextUsageFromConversationDetail: () => null, estimateContextUsageFromConversationDetail: () => null,
    applyContextUsage: noOp, setConversationAttachments: noOp, setConversationId: noOp,
    setStoredConversationId: noOp, setLocalWorkspace: noOp, setComposerAttachment: noOp,
    setUploadState: noOp, setViewMode: noOp, setBusy: noOp, setShellSeeded: noOp,
    setTaskRuntimeState: noOp, notifyTaskComplete: noOp,
    getChatProgressLine: () => '', appendChatProgressText: (text) => text,
    eventDeltaText: (event) => event.delta || '', appendAnswerDelta: (text, delta) => text + delta,
    normalizeChatImageRefs: (images) => images, toDisplayText: String,
    stripChatImageAugmentation: (text) => ({ text }),
    workspaceStateWithConversationDetail: (previous) => previous,
    apiFetch: async (url, options) => {
      requests.push(url);
      if (url === `/api/conversations/${cid}`) return Response.json(detail);
      if (url.endsWith('/tasks/runtime')) {
        return Response.json(JSON.parse(options.body).tasks.map(({ task_id }) => stored.find((t) => t.task_id === task_id)));
      }
      if (url.startsWith('/api/tasks/')) {
        if (interceptTask) return interceptTask();
        return Response.json(stored[1]);
      }
      throw new Error(`Unexpected request ${url}`);
    },
  };
  Object.assign(ctx, createConversationRuntime(ctx));
  Object.assign(ctx, createDraftConversationHandlers(ctx));
  Object.assign(ctx, createConversationActivationHandlers(ctx));
  Object.assign(ctx, createTaskStreamHandlers(ctx));
  const schedule = createScheduledRuntimeHandlers(ctx);
  const selection = createConversationHandlers(ctx);
  const receipt = { conversation_id: cid, last_run: { task_id: 't1' } };
  const send = (event) => schedule.event({ type: 'task.event', schedule_id: 's', run_id: 'r', conversation_id: cid,
    event: { task_id: 'live', conversation_id: cid, scheduled_execution_mode: 'chat', ...event } });
  return { ctx, stored, detail, requests, schedule, selection, receipt, send,
    runtime: () => ctx.getRuntime(cid), state: () => state, intercept: (fn) => { interceptTask = fn; } };
}

test('schedule recovery uses ordinary loading: all historical answers appear on selection', async () => {
  const h = makeHarness();
  await h.schedule.recover(h.receipt);
  assert.equal(h.runtime().shellSeeded, true);
  assert.equal(h.ctx.conversationIdRef.current, 'currently-open');
  assert.equal(h.runtime().taskRuntimeState.tasksById.t1.answerText, 'Saved answer 1');
  await h.selection.handleSelectConversation('project', cid);
  assert.ok(h.requests.includes(`/api/conversations/${cid}`));
  for (const task of h.stored) {
    assert.equal(h.runtime().taskRuntimeState.tasksById[task.task_id].answerText, task.answer_text);
  }
  assert.equal(h.runtime().shellSeeded, false);
  assert.equal(h.runtime().taskRuntimeState.tasksById.t0.runtimeHydrated, false, 'older logs stay paginated, not older answers');
  // Switching back now takes the ordinary cache path, with no extra detail fetch.
  h.ctx.conversationIdRef.current = 'currently-open';
  await h.selection.handleSelectConversation('project', cid);
  assert.equal(h.requests.filter((url) => url === `/api/conversations/${cid}`).length, 1);
});

test('opening during a live scheduled stream loads history without overwriting the live turn', async () => {
  const h = makeHarness();
  h.send({ type: 'run_started', message: 'Scheduled question', user_message_id: 'live-user' });
  h.send({ type: 'llm_answer_delta', delta: 'Live partial answer' });
  const live = h.runtime().taskRuntimeState.tasksById.live;
  await h.selection.handleSelectConversation('project', cid);
  for (const task of h.stored) assert.equal(h.runtime().taskRuntimeState.tasksById[task.task_id].answerText, task.answer_text);
  assert.strictEqual(h.runtime().taskRuntimeState.tasksById.live, live);
  assert.equal(h.runtime().answerBuffer, 'Live partial answer');
  assert.equal(h.runtime().activeRunId, 'schedule:r');
  assert.equal(h.runtime().busy, true);
  h.send({ type: 'final_answer', content: 'Scheduled final answer' });
  h.send({ type: 'run_finished', status: 'done', task: { task_id: 'live', conversation_id: cid, execution_mode: 'chat', status: 'done' } });
  assert.equal(h.runtime().taskRuntimeState.tasksById.live.answerText, 'Scheduled final answer');
  assert.equal(h.runtime().busy, false);
  assert.equal(h.state().projects[0].conversations[0].tasks.length, 7);
});

test('ordinary manual inflight shells also merge historical answers without resetting buffers', async () => {
  const h = makeHarness();
  const runtime = h.ctx.ensureConversationRuntime(cid);
  runtime.activeRunId = 'manual-run'; runtime.activeTaskId = 'manual'; runtime.busy = true; runtime.answerBuffer = 'Manual partial';
  runtime.taskRuntimeState.tasksById.manual = { taskId: 'manual', status: 'running', answerText: 'Manual partial' };
  runtime.taskRuntimeState.taskOrder.push('manual');
  await h.selection.handleSelectConversation('project', cid);
  assert.equal(runtime.taskRuntimeState.tasksById.t5.answerText, 'Saved answer 5');
  assert.equal(runtime.taskRuntimeState.tasksById.manual.answerText, 'Manual partial');
  assert.equal(runtime.answerBuffer, 'Manual partial');
  assert.equal(runtime.activeRunId, 'manual-run');
});

test('an old recovery response cannot overwrite newer live schedule events', async () => {
  const h = makeHarness();
  let resolve;
  h.intercept(() => new Promise((done) => { resolve = done; }));
  const recovering = h.schedule.recover(h.receipt);
  h.send({ type: 'run_started', message: 'New run' });
  h.send({ type: 'llm_answer_delta', delta: 'New partial' });
  resolve(Response.json(h.stored[1]));
  await recovering;
  assert.equal(h.runtime().taskRuntimeState.tasksById.t1.runtimeHydrated, false);
  assert.equal(h.runtime().taskRuntimeState.tasksById.live.answerText, 'New partial');
  assert.equal(h.runtime().busy, true);
});

test('ordinary task recovery rejects a mismatched conversation', async () => {
  const h = makeHarness();
  h.intercept(() => Response.json({ ...h.stored[1], conversation_id: 'wrong' }));
  await assert.rejects(h.schedule.recover(h.receipt), /does not belong to conversation/);
  assert.equal(h.runtime().taskRuntimeState.tasksById.t1.runtimeHydrated, false);
});

test('recovering an older schedule preserves a newer manual task busy state', async () => {
  const h = makeHarness();
  const runtime = h.ctx.ensureConversationRuntime(cid);
  runtime.activeTaskId = 'manual'; runtime.activeRunId = 'manual-run'; runtime.busy = true;
  await h.schedule.recover(h.receipt);
  assert.equal(runtime.activeTaskId, 'manual');
  assert.equal(runtime.activeRunId, 'manual-run');
  assert.equal(runtime.busy, true);
});
