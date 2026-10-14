import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = { HAISH_API_BASE: '', haish: {}, localStorage: { getItem: () => null, setItem: () => {} } };
const { createConversationRuntime } = await import('../../../src/features/conversations/hooks/createConversationRuntime.js');
const { createDraftConversationHandlers } = await import('../../../src/features/conversations/hooks/createDraftConversationHandlers.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { createConversationHandlers } = await import('../../../src/features/conversations/hooks/createConversationHandlers.js');
const { createWorkflowTaskSelectionHandler } = await import('../../../src/features/conversations/hooks/createWorkflowTaskSelectionHandler.js');
const { createTaskStreamHandlers } = await import('../../../src/features/tasks/hooks/createTaskStreamHandlers.js');
const { createDeployHandlers } = await import('../../../src/features/tasks/hooks/createDeployHandlers.js');
const tasks = await import('../../../src/features/tasks/model/task-runtime.js');
const events = await import('../../../src/features/tasks/model/runtime-events.js');
const workspace = await import('../../../src/features/conversations/model/workspace-state.js');
const { conversationRuntimeHasLiveTurn } = await import('../../../src/features/conversations/model/runtime-restore-guard.js');
const { nextEarlierTaskRuntimeIds } = await import('../../../src/features/tasks/model/task-runtime-paging.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const task = (id, status = 'done', updated = 1) => ({
  task_id: id, conversation_id: 'c', title: `Question ${id}`, execution_mode: 'chat',
  status, answer_text: `Answer ${id} ${updated}`,
  created_at: '2026-01-01T00:00:00Z', updated_at: `2026-01-01T00:00:0${updated}Z`,
  events: [{ event_id: `${id}-${updated}`, type: 'llm_answer_delta', payload: { delta: `Answer ${id} ${updated}` } }],
});
const detail = (records) => ({ conversation_id: 'c', last_task_id: records.at(-1)?.task_id, tasks: records, messages: [] });

function harness(records = [task('history'), task('latest', 'running')]) {
  const ref = (current) => ({ current });
  const noop = () => {};
  const requests = [];
  const removed = [];
  let state = { projects: [{ id: 'p', conversations: [{ id: 'c', tasks: records.map((record) => tasks.taskSummaryToRuntimeTask(record)) }] }] };
  const ctx = {
    ...tasks, ...events, API_BASE: '', workspaceState: state,
    conversationIdRef: ref('other'), runtimesRef: ref(new Map()), streamTargetConvIdRef: ref(null),
    taskImageAttachmentsRef: ref(new Map()), taskRuntimeFetchesRef: ref(new Map()), taskRuntimeEventCacheRef: ref(new Map()),
    conversationActivationSeqRef: ref(0), conversationDetailAbortRef: ref(null),
    draftConversationRef: ref(null), pendingCreatedDetailRef: ref(null), ownerIdRef: ref('owner'),
    chatFinalizedTaskIdsRef: ref(new Set()), userCancelledTaskIdsRef: ref(new Set()),
    viewModeRef: ref('chat'), toastTimerRef: ref(null), buildApiHeaders: () => ({}),
    findConversationById: workspace.findConversationById, findProjectByConversationId: workspace.findProjectByConversationId,
    isTaskActuallyActive: workspace.isTaskActuallyActive, timestampValue: workspace.timestampValue,
    taskUpdatedTimestamp: workspace.taskUpdatedTimestamp, mergeChatImageRefs: workspace.mergeChatImageRefs,
    chatImageFallbacksByTaskIdFromMessages: () => new Map(),
    loadStoredContextUsage: () => null, latestContextUsageFromTasks: () => null,
    contextUsageFromConversationDetail: () => null, estimateContextUsageFromConversationDetail: () => null,
    applyContextUsage: noop, setConversationAttachments: noop, setConversationId: noop, setStoredConversationId: noop,
    setLocalWorkspace: noop, setComposerAttachment: noop, setUploadState: noop, setViewMode: noop,
    setBusy: noop, setShellSeeded: noop, setTaskRuntimeState: noop, setTaskCompletionNotices: noop,
    setViewedWorkflowTask: noop, setConversationError: noop, notifyTaskComplete: noop,
    setWorkspaceState: (update) => { state = update(state); }, normalizeWorkspaceOrdering: (value) => value,
    workspaceStateWithConversationDetail: (previous) => previous,
    getChatProgressLine: () => '', appendChatProgressText: (text) => text,
    eventDeltaText: (event) => event.delta || '', appendAnswerDelta: (text, delta) => text + delta,
    normalizeChatImageRefs: (images) => images, toDisplayText: String,
    stripChatImageAugmentation: (text) => ({ text: text || '' }),
    generateHexId: () => 'manual-attempt', providerOptions: [{ id: 'fixture', provider: 'custom' }],
    runTaskStream: async (_request, emit) => {
      emit({ type: 'run_started', task_id: 'manual', conversation_id: 'c' });
      emit({ type: 'run_finished', task_id: 'manual', conversation_id: 'c', status: 'done',
        task: { status: 'done', answer_text: 'New manual answer' } });
    },
    apiFetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, resolve, reject });
      options.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
    }),
    removeConversationTaskFromWorkspace: (owner, id) => removed.push([owner, id]),
  };
  Object.assign(ctx, createConversationRuntime(ctx));
  ctx.showToast = noop;
  Object.assign(ctx, createDraftConversationHandlers(ctx));
  Object.assign(ctx, createConversationActivationHandlers(ctx));
  Object.assign(ctx, createConversationHandlers(ctx));
  Object.assign(ctx, createTaskStreamHandlers(ctx));
  Object.assign(ctx, createDeployHandlers(ctx));
  ctx.removeConversationTaskFromWorkspace = (owner, id) => removed.push([owner, id]);
  // Execute the page's actual history/deletion callbacks, not separate test implementations.
  const shell = readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
  const earlierSource = shell.match(/ {2}const loadEarlierTaskRuntimes = async \(targetConversationId\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(earlierSource, 'execute the actual page history callback');
  const pagingCtx = { ...ctx, nextEarlierTaskRuntimeIds };
  const loadEarlierTaskRuntimes = new Function(...Object.keys(pagingCtx),
    `${earlierSource[0]}\nreturn loadEarlierTaskRuntimes;`)(...Object.values(pagingCtx));
  const removeSource = shell.slice(shell.indexOf('  function removeMissingTask('), shell.indexOf('  const panelWorkspaceState'));
  const deleteSource = shell.slice(shell.indexOf('  async function handleDeleteWorkflowTask('), shell.indexOf('  useEffect(() => {', shell.indexOf('  async function handleDeleteWorkflowTask(')));
  const deletionCtx = { ...ctx, viewedWorkflowTask: null, clearTaskCompletionNotice: (value) => value };
  const deletion = new Function(...Object.keys(deletionCtx), `${removeSource}\n${deleteSource}\nreturn { removeMissingTask, handleDeleteWorkflowTask };`)(...Object.values(deletionCtx));
  Object.assign(ctx, deletion);
  const selectTask = createWorkflowTaskSelectionHandler(ctx);
  const respond = (index, payload, status = 200) => requests[index].resolve(Response.json(payload, { status }));
  const seed = () => ctx.ensureConversationRuntime('c');
  const activate = async () => {
    const selected = ctx.handleSelectConversation('p', 'c');
    await tick();
    respond(0, detail(records));
    await tick();
    const batch = requests[1];
    assert.ok(batch?.url.endsWith('/tasks/runtime'), 'initial detail must hydrate the remote running row');
    respond(1, JSON.parse(batch.options.body).tasks.map(({ task_id }) => records.find((record) => record.task_id === task_id)));
    await selected;
    return ctx.getRuntime('c');
  };
  const sanityStart = shell.indexOf('  useEffect(() => {\n    if (!busy || currentConversationActive) return;');
  assert.ok(sanityStart >= 0);
  const sanitySource = shell.slice(sanityStart, shell.indexOf('  }, [busy, currentConversationActive, taskRuntimeState.activeTaskId, taskRuntimeState.pendingTask]);', sanityStart));
  const settleDisplayed = () => {
    const runtime = ctx.getRuntime('c');
    new Function('taskRuntimeState', 'busy', 'currentConversationActive', 'runtimeApiRef', 'isTaskActuallyActive',
      sanitySource.replace('  useEffect(() => {', '')
    )(runtime.taskRuntimeState, runtime.busy, false, { current: ctx }, workspace.isTaskActuallyActive);
  };
  const schedule = (type) => ctx.applyScheduledEvent({ type: 'task.event', schedule_id: 'schedule', run_id: 'run', conversation_id: 'c',
    event: { type, task_id: 'scheduled', conversation_id: 'c', status: 'done', task: { status: 'done', answer_text: 'New scheduled answer' } } });
  return { ctx, requests, respond, seed, activate, selectTask, settleDisplayed, schedule, removed, loadEarlierTaskRuntimes };
}

test('ordinary selection hydrates a remote running task and repeated restoreLatest polls reach done', async () => {
  const h = harness();
  const runtime = await h.activate();
  assert.equal(runtime.shellSeeded, false);
  assert.equal(runtime.busy, true, 'remote busy is display state, not stream ownership');
  assert.equal(runtime.activeRunId, null);
  assert.equal(runtime.fetchController, null);
  assert.equal(runtime.taskRuntimeState.tasksById.latest.runtimeHydrated, true);
  assert.equal(runtime.taskRuntimeState.tasksById.latest.eventLog[0].delta, 'Answer latest 1');
  assert.equal(runtime.taskRuntimeState.tasksById.latest.answerText, 'Answer latest 1');
  for (const [status, updated] of [['running', 2], ['done', 3]]) {
    const poll = h.ctx.restoreLatestTaskRuntime('latest', { targetConversationId: 'c', isCurrentActivation: () => true });
    await tick();
    assert.equal(h.requests.at(-1).options.method, 'GET');
    h.respond(h.requests.length - 1, task('latest', status, updated));
    assert.equal((await poll).status, status);
    assert.equal(runtime.taskRuntimeState.tasksById.latest.status, status);
    assert.equal(runtime.taskRuntimeState.tasksById.latest.eventLog[0].delta, `Answer latest ${updated}`);
  }
  assert.equal(runtime.taskRuntimeState.activeTaskId, null);
  assert.equal(runtime.taskRuntimeState.tasksById.latest.answerText, 'Answer latest 3');
  h.settleDisplayed();
  assert.equal(runtime.busy, false);
  assert.equal(h.ctx.taskRuntimeFetchesRef.current.size, 0);
});

for (const ownership of ['manual-controller', 'scheduled', 'pendingRun', 'Stop']) {
  test(`${ownership} ownership still protects the active turn from activation, selection and hydration`, async () => {
    const h = harness();
    const runtime = h.seed();
    runtime.shellSeeded = false;
    runtime.activeTaskId = 'latest';
    runtime.taskRuntimeState.activeTaskId = 'latest';
    if (ownership === 'manual-controller') runtime.fetchController = new AbortController();
    if (ownership === 'scheduled') runtime.activeRunId = 'schedule:run';
    if (ownership === 'pendingRun') runtime.pendingRun = {};
    if (ownership === 'Stop') runtime.stopPromise = Promise.resolve();
    const live = { ...runtime.taskRuntimeState.tasksById.latest, answerText: 'Live answer', runtimeHydrated: true };
    runtime.taskRuntimeState.tasksById.latest = live;
    runtime.answerBuffer = 'Live answer';
    assert.equal(conversationRuntimeHasLiveTurn(runtime), true);
    await h.ctx.activateConversationDetail(detail([task('latest', 'done')]));
    await h.selectTask('p', 'c', { taskId: 'latest' });
    await h.ctx.restoreLatestTaskRuntime('latest', { targetConversationId: 'c', isCurrentActivation: () => true });
    assert.equal(h.requests.length, 0);
    assert.equal(runtime.taskRuntimeState.tasksById.latest, live);
    assert.equal(runtime.answerBuffer, 'Live answer');
    if (runtime.fetchController) assert.equal(runtime.fetchController.signal.aborted, false);
  });
}

for (const id of ['exists', 'deleted']) {
  test(`selection joined to [exists,deleted] batch confirms ${id} via GET before removing anything`, async () => {
    const records = [task('exists'), task('deleted')];
    const h = harness(records);
    const runtime = h.seed();
    runtime.shellSeeded = false;
    h.ctx.conversationIdRef.current = 'c';
    const batch = h.ctx.restoreTaskRuntimes(['exists', 'deleted'], { targetConversationId: 'c', isCurrentActivation: () => true });
    const failure = assert.rejects(batch, { status: 404, runtimeRequestKind: 'batch' });
    const selected = h.selectTask('p', 'c', { taskId: id });
    await tick();
    assert.equal(h.requests.length, 1, 'the single initially shares the successful-batch fast path');
    h.respond(0, { detail: 'Task not found in conversation.' }, 404);
    await failure;
    await tick();
    assert.equal(h.removed.length, 0, 'a group 404 is not a per-task tombstone');
    assert.equal(h.requests[1].options.method, 'GET');
    assert.match(h.requests[1].url, new RegExp(`/api/tasks/${id}\\?`));
    h.respond(1, id === 'exists' ? records[0] : { detail: 'Task not found.' }, id === 'exists' ? 200 : 404);
    await selected;
    assert.equal(Boolean(runtime.taskRuntimeState.tasksById.exists), true);
    assert.equal(Boolean(runtime.taskRuntimeState.tasksById.deleted), id !== 'deleted');
    assert.deepEqual(h.removed, id === 'deleted' ? [['c', 'deleted']] : []);
    assert.equal(h.ctx.taskRuntimeFetchesRef.current.size, 0);
  });
}

test('a confirmation GET 404 cannot remove a task after a newer scheduled generation finishes', async () => {
  const h = harness([task('exists'), task('deleted')]);
  const runtime = h.seed();
  runtime.shellSeeded = false;
  h.ctx.conversationIdRef.current = 'c';
  const batch = h.ctx.restoreTaskRuntimes(['exists', 'deleted'], { targetConversationId: 'c', isCurrentActivation: () => true });
  const rejected = assert.rejects(batch, { status: 404, runtimeRequestKind: 'batch' });
  const selected = h.selectTask('p', 'c', { taskId: 'deleted' });
  await tick();
  h.respond(0, { detail: 'Task not found in conversation.' }, 404);
  await rejected;
  await tick();
  assert.equal(h.requests[1].options.method, 'GET');
  h.schedule('run_started');
  h.schedule('run_finished');
  const expected = runtime.taskRuntimeState;
  h.respond(1, { detail: 'Task not found.' }, 404);
  await selected;
  assert.equal(runtime.taskRuntimeState, expected);
  assert.deepEqual(h.removed, []);
});

test('independent single hydration that adds a turn invalidates a pending recovery rebuild', async () => {
  const h = harness([task('history'), task('latest')]);
  const runtime = h.seed();
  runtime.shellSeeded = false;
  const recovering = h.ctx.recoverConversationTasks('c');
  h.respond(0, detail([task('history'), task('latest', 'done', 2)]));
  await tick();
  const revision = runtime.taskStructureRevision;
  const selected = h.ctx.restoreLatestTaskRuntime('independent', { targetConversationId: 'c', isCurrentActivation: () => true });
  await tick();
  h.respond(2, task('independent'));
  await selected;
  assert.ok(runtime.taskStructureRevision > revision, 'hydration may update content, not silently replace history structure');
  const expected = runtime.taskRuntimeState;
  h.respond(1, [task('latest', 'done', 3)]);
  await recovering;
  assert.equal(runtime.taskRuntimeState, expected);
  assert.ok(runtime.taskRuntimeState.taskOrder.includes('independent'));
});

for (const mutation of ['delete', 'reorder', 'add', 'latest', 'pending']) {
  test(`Stop recovery cannot overwrite a ${mutation} structure change during real batch hydration`, async () => {
    const records = [task('history'), task('latest', 'running')];
    const h = harness(records);
    const runtime = h.seed();
    runtime.shellSeeded = false;
    runtime.taskRuntimeState.tasksById.history = tasks.taskDetailToRuntimeTask(records[0]);
    h.ctx.conversationIdRef.current = 'c';
    h.ctx.handleStop();
    const stopped = runtime.stopPromise;
    h.respond(0, { cancelled: true, conversation_id: 'c', task_id: 'latest' });
    await tick();
    h.respond(1, detail([task('history', 'done', 2), task('latest', 'cancelled', 2)]));
    await tick();
    assert.deepEqual(JSON.parse(h.requests[2].options.body).tasks.map(({ task_id }) => task_id), ['latest', 'history']);
    const revision = runtime.taskStructureRevision;
    if (mutation === 'delete') {
      const deleted = h.ctx.handleDeleteWorkflowTask('p', 'c', { taskId: 'history' });
      h.respond(3, {});
      await deleted;
    } else {
      h.ctx.updateTaskRuntimeState((state) => {
        if (mutation === 'reorder') return { ...state, taskOrder: state.taskOrder.slice().reverse() };
        if (mutation === 'add') return { ...state, taskOrder: [...state.taskOrder, 'local'], tasksById: { ...state.tasksById, local: { taskId: 'local' } } };
        if (mutation === 'latest') return { ...state, latestTaskId: 'history' };
        return { ...state, pendingTask: { id: 'local-pending', title: 'Unsent local question' } };
      }, 'c');
    }
    assert.ok(runtime.taskStructureRevision > revision);
    const expected = runtime.taskRuntimeState;
    h.respond(2, [task('latest', 'cancelled', 3), task('history', 'done', 3)]);
    await stopped;
    assert.equal(runtime.taskRuntimeState, expected, 'neither the batch nor old detail may replace the new structure');
    if (mutation === 'delete') assert.equal(runtime.taskRuntimeState.tasksById.history, undefined);
    assert.equal(runtime.stopPromise, null);
    assert.equal(runtime.taskRecoveryRequest, null);
  });
}

for (const scenario of ['newer full', 'newer summary', 'deleted history']) {
  test(`Stop recovery with actual page history hydration respects ${scenario} outside its latest batch`, async () => {
    const records = [task('history'), task('latest', 'running')];
    const h = harness(records);
    const runtime = h.seed();
    runtime.shellSeeded = false;
    runtime.taskRuntimeState.tasksById.latest = tasks.taskDetailToRuntimeTask(records[1]);
    h.ctx.conversationIdRef.current = 'c';
    h.ctx.handleStop();
    const stopped = runtime.stopPromise;
    assert.ok(stopped);
    h.respond(0, { cancelled: true, conversation_id: 'c', task_id: 'latest' });
    await tick();
    const summaryVersion = scenario === 'newer summary' ? 3 : 1;
    const summaries = [task('history', 'done', summaryVersion), task('latest', 'cancelled', 2)]
      .map(({ events: _events, ...summary }) => summary);
    h.respond(1, detail(summaries));
    await tick();
    assert.deepEqual(JSON.parse(h.requests[2].options.body).tasks.map(({ task_id }) => task_id), ['latest'],
      'summary-only history is not included in Stop recovery');
    const revision = runtime.taskStructureRevision;
    const initialState = runtime.taskRuntimeState;
    assert.equal(initialState.tasksById.history.runtimeHydrated, false);
    assert.equal(initialState.tasksById.history.updatedAt, Date.parse(records[0].updated_at));

    const paging = h.loadEarlierTaskRuntimes('c');
    await tick();
    assert.deepEqual(JSON.parse(h.requests[3].options.body).tasks.map(({ task_id }) => task_id), ['history']);
    h.respond(3, [task('history', 'done', 2)]);
    await paging;
    const hydrated = runtime.taskRuntimeState.tasksById.history;
    assert.notEqual(runtime.taskRuntimeState, initialState, 'real paging replaces the content state');
    assert.equal(runtime.taskStructureRevision, revision, 'existing-task hydration is not a structure change');
    assert.equal(hydrated.runtimeHydrated, true);
    assert.equal(hydrated.updatedAt, Date.parse('2026-01-01T00:00:02Z'));
    assert.equal(hydrated.eventLog[0].delta, 'Answer history 2');
    assert.ok(runtime.stopPromise, 'latest recovery batch is still pending after history hydration');

    if (scenario === 'deleted history') {
      const deleted = h.ctx.handleDeleteWorkflowTask('p', 'c', { taskId: 'history' });
      h.respond(4, {});
      await deleted;
      assert.ok(runtime.taskStructureRevision > revision);
    }
    const expectedState = runtime.taskRuntimeState;
    h.respond(2, [task('latest', 'cancelled', 3)]);
    await stopped;
    const history = runtime.taskRuntimeState.tasksById.history;
    if (scenario === 'deleted history') {
      assert.equal(runtime.taskRuntimeState, expectedState, 'neither late batch nor detail may resurrect deleted history');
      assert.equal(history, undefined);
      assert.deepEqual(runtime.taskRuntimeState.taskOrder, ['latest']);
    } else if (scenario === 'newer summary') {
      assert.equal(history.updatedAt, Date.parse('2026-01-01T00:00:03Z'));
      assert.equal(history.answerText, 'Answer history 3', 'newer server summary still refreshes history');
      assert.equal(history.runtimeHydrated, false, 'older full content must be hydrated again');
    } else {
      assert.equal(history, hydrated, 'old detail must retain independently hydrated newer history');
      assert.equal(history.answerText, 'Answer history 2');
      assert.equal(history.eventLog[0].delta, 'Answer history 2');
    }
    assert.equal(runtime.stopError, null);
    assert.equal(runtime.stopPromise, null);
    assert.equal(runtime.taskRecoveryRequest, null);
    assert.equal(h.ctx.taskRuntimeFetchesRef.current.size, 0);
  });
}

test('Stop recovery accepts its own hydration state changes and preserves the newer full record', async () => {
  const h = harness();
  const runtime = h.seed();
  runtime.shellSeeded = false;
  h.ctx.conversationIdRef.current = 'c';
  h.ctx.handleStop();
  const stopped = runtime.stopPromise;
  h.respond(0, { cancelled: true, conversation_id: 'c', task_id: 'latest' });
  await tick();
  h.respond(1, detail([task('history'), task('latest', 'cancelled', 2)]));
  await tick();
  const initial = runtime.taskRuntimeState;
  h.respond(2, [task('latest', 'cancelled', 3)]);
  await stopped;
  assert.notEqual(runtime.taskRuntimeState, initial, 'hydration legitimately replaces state');
  assert.equal(runtime.taskRuntimeState.tasksById.latest.runtimeHydrated, true);
  assert.equal(runtime.taskRuntimeState.tasksById.latest.updatedAt, Date.parse('2026-01-01T00:00:03Z'));
  assert.equal(runtime.taskRuntimeState.tasksById.latest.answerText, 'Answer latest 3');
  assert.deepEqual(runtime.taskRuntimeState.taskOrder, ['history', 'latest']);
  assert.equal(runtime.stopError, null);
});

for (const run of ['scheduled', 'manual']) {
  test(`recovery batch cannot overwrite a ${run} run that starts and finishes while hydration waits`, async () => {
    const h = harness([task('history'), task('latest', 'done')]);
    const runtime = h.seed();
    runtime.shellSeeded = false;
    const recovering = h.ctx.recoverConversationTasks('c');
    h.respond(0, detail([task('history'), task('latest', 'done', 2)]));
    await tick();
    const generation = runtime.runGeneration;
    if (run === 'scheduled') { h.schedule('run_started'); h.schedule('run_finished'); }
    else await h.ctx.executeQuest(runtime.taskRuntimeState.tasksById.latest, 'c', {
      attempt: 'rerun', runConfig: { provider: 'fixture', modelId: 'model' },
    });
    assert.ok(runtime.runGeneration > generation);
    assert.equal(runtime.activeRunId, null);
    const expected = runtime.taskRuntimeState;
    h.respond(1, [task('latest', 'done', 3)]);
    await recovering;
    assert.equal(runtime.taskRuntimeState, expected);
    assert.equal(runtime.taskRuntimeState.tasksById[run].answerText, run === 'manual' ? 'New manual answer' : 'New scheduled answer');
    assert.equal(runtime.taskRecoveryRequest, null);
  });
}
