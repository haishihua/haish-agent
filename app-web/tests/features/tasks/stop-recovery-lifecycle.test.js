import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = {};
const { createConversationRuntime } = await import('../../../src/features/conversations/hooks/createConversationRuntime.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { createTaskStreamHandlers } = await import('../../../src/features/tasks/hooks/createTaskStreamHandlers.js');
const { createDeployHandlers } = await import('../../../src/features/tasks/hooks/createDeployHandlers.js');
const { evictInactiveRuntimes } = await import('../../../src/features/conversations/model/runtime-cache.js');
const tasks = await import('../../../src/features/tasks/model/task-runtime.js');
const events = await import('../../../src/features/tasks/model/runtime-events.js');
const workspace = await import('../../../src/features/conversations/model/workspace-state.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const detail = (id = 'source') => ({ conversation_id: 'conversation', last_task_id: id,
  tasks: [{ task_id: id, conversation_id: 'conversation', title: 'Synthetic question', status: 'done' }] });

function makeHarness({ fetchDetail = async () => Response.json(detail()),
  cancel = async () => Response.json({ cancelled: false, conversation_id: 'conversation' }),
  restore = async () => {}, transport = async () => {} } = {}) {
  const currentId = { current: 'conversation' };
  const runtimes = new Map();
  let stopState = { pending: false, error: '' };
  let stopProjections = 0;
  let recoveries = 0;
  const calls = [];
  const noop = () => {};
  const ctx = {
    ...tasks, ...events, API_BASE: '', providerOptions: [{ id: 'fixture', provider: 'custom' }],
    conversationIdRef: currentId, runtimesRef: { current: runtimes },
    streamTargetConvIdRef: { current: null }, taskImageAttachmentsRef: { current: new Map() },
    chatFinalizedTaskIdsRef: { current: new Set() }, userCancelledTaskIdsRef: { current: new Set() },
    setConversationStopState: (update) => { stopState = update(stopState); stopProjections += 1; },
    setBusy: noop, setShellSeeded: noop, setTaskRuntimeState: noop,
    setWorkspaceState: noop, normalizeWorkspaceOrdering: (state) => state, notifyTaskComplete: noop,
    isTaskActuallyActive: workspace.isTaskActuallyActive, taskUpdatedTimestamp: workspace.taskUpdatedTimestamp,
    timestampValue: workspace.timestampValue, normalizeChatImageRefs: (images) => images,
    normalizeRuntimeEvent: (event) => event, toDisplayText: String,
    stripChatImageAugmentation: (text) => ({ text: text || '' }), getChatProgressLine: () => '',
    appendAnswerDelta: (text, delta) => text + delta, eventDeltaText: (event) => event.delta || '',
    apiFetch: async () => { recoveries += 1; return fetchDetail(); },
    restoreTaskRuntimes: restore, runTaskStream: transport, generateHexId: () => 'pending-attempt',
    removeConversationTaskFromWorkspace: noop, draftConversationRef: { current: null },
    cancelActiveConversationTask: cancel,
    cancelActiveTask: async (id) => {
      calls.push(['cancel-task', id]);
      return Response.json({ cancelled: true, task_id: id, conversation_id: 'conversation' });
    },
    viewModeRef: { current: 'chat' }, showToast: (...args) => calls.push(['toast', ...args]),
  };
  Object.assign(ctx, createConversationRuntime(ctx));
  ctx.showToast = (...args) => calls.push(['toast', ...args]);
  Object.assign(ctx, createConversationActivationHandlers(ctx));
  const stream = createTaskStreamHandlers(ctx);
  const stop = createDeployHandlers(ctx);
  const runtime = ctx.getRuntime('conversation', { create: true });
  const source = { taskId: 'source', conversationId: 'conversation', title: 'Synthetic question',
    status: 'failed', executionMode: 'chat', requestedProvider: 'fixture', requestedModelId: 'model' };
  runtime.taskRuntimeState = { ...tasks.createEmptyTaskRuntimeState(), taskOrder: ['source'], tasksById: { source } };
  function switchTo(id) {
    currentId.current = id;
    ctx.syncDisplayedRuntime(ctx.getRuntime(id, { create: true }));
  }
  function prune() {
    for (let index = 0; index < 4; index += 1) {
      ctx.getRuntime(`cached-${index}`, { create: true }).lastAccessedAt = Date.now() + index + 1;
    }
    runtime.lastAccessedAt = 1;
    return evictInactiveRuntimes(runtimes, currentId.current);
  }
  function schedule(event) {
    stream.applyScheduledEvent({ type: 'task.event', schedule_id: 'schedule', run_id: 'scheduled-run',
      conversation_id: 'conversation', event: { task_id: 'scheduled', conversation_id: 'conversation', ...event } });
  }
  return { ctx, stream, stop, runtime, source, calls, switchTo, prune, schedule, runtimes,
    stopState: () => stopState, stopProjections: () => stopProjections, recoveries: () => recoveries };
}

function runActualAppShellSanityEffect(h) {
  const source = readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
  const effect = source.match(/useEffect\(\(\) => \{\n {4}if \(!busy \|\| currentConversationActive\) return;([\s\S]*?)\n {2}\}, \[busy, currentConversationActive, taskRuntimeState.activeTaskId, taskRuntimeState.pendingTask\]\);/);
  assert.ok(effect, 'execute the actual page guard, not a second implementation');
  const execute = new Function('busy', 'currentConversationActive', 'taskRuntimeState', 'runtimeApiRef',
    'isTaskActuallyActive', `if (!busy || currentConversationActive) return;${effect[1]}`);
  execute(h.runtime.busy, false, h.runtime.taskRuntimeState, { current: h.ctx }, workspace.isTaskActuallyActive);
}

test('Stop failure remains projected after the actual page cleanup, navigation and another Stop', async () => {
  let fail = true;
  const h = makeHarness({ cancel: async () => Response.json({}, { status: fail ? 500 : 200 }) });
  h.stop.handleStop();
  assert.equal(h.stopState().pending, true);
  await h.runtime.stopPromise;
  assert.equal(h.runtime.busy, false);
  assert.match(h.stopState().error, /verify/);
  assert.equal(h.stopState().pending, false);
  h.ctx.setRuntimeBusy(true, 'conversation'); // simulate the old stale busy flag
  runActualAppShellSanityEffect(h);
  assert.equal(h.runtime.busy, false);
  assert.match(h.stopState().error, /verify/);
  assert.equal(h.stop.handleDeploy('Keep this text', null, 'model', null, [], 'agent', 'fixture'), false);
  await assert.rejects(h.stream.executeQuest(h.source, 'conversation', { attempt: 'rerun' }), /verify/);
  h.switchTo('other');
  assert.deepEqual(h.stopState(), { pending: false, error: '' });
  assert.equal(h.prune().has('conversation'), false, 'an unresolved failure is not an evictable cache');
  h.switchTo('conversation');
  assert.match(h.stopState().error, /verify/);
  const projections = h.stopProjections();
  fail = false;
  h.stop.handleStop();
  await h.runtime.stopPromise;
  assert.deepEqual(h.stopState(), { pending: false, error: '' });
  assert.ok(h.stopProjections() > projections, 'Stop changes are projected without relying on a task-list change');
  h.switchTo('other');
  assert.equal(h.prune().has('conversation'), true, 'a reconciled runtime is evictable again');
});

test('an acknowledged attempt stays pinned through cancellation, stream settlement and recovery', async () => {
  const start = deferred();
  const finish = deferred();
  const cancel = deferred();
  const history = deferred();
  const h = makeHarness({ cancel: () => cancel.promise, fetchDetail: () => history.promise,
    transport: async (_request, emit) => {
      await start.promise;
      emit({ type: 'run_started', task_id: 'confirmed', conversation_id: 'conversation' });
      await finish.promise;
    } });
  const run = h.stream.executeQuest(h.source, 'conversation', { attempt: 'rerun' });
  start.resolve();
  await tick();
  h.stop.handleStop();
  const barrier = h.runtime.stopPromise;
  h.switchTo('other');
  assert.equal(h.runtime.taskRuntimeState.pendingTask, null);
  assert.equal(h.runtime.busy, false);
  assert.equal(h.prune().has('conversation'), false);
  cancel.resolve(Response.json({ cancelled: true, task_id: 'confirmed', conversation_id: 'conversation' }));
  await tick();
  assert.equal(h.runtime.stopPromise, barrier);
  assert.equal(h.prune().has('conversation'), false);
  finish.resolve();
  await run;
  await tick();
  assert.equal(h.recoveries(), 1);
  assert.equal(h.prune().has('conversation'), false);
  history.resolve(Response.json(detail('confirmed')));
  await barrier;
  assert.equal(h.runtime.stopError, null);
  assert.equal(h.runtime.stopPromise, null);
  assert.equal(h.prune().has('conversation'), true);
});

test('late startup identity survives navigation and cache pressure so the exact task is cancelled', async () => {
  const start = deferred();
  const finish = deferred();
  const h = makeHarness({ transport: async (_request, emit) => {
    await start.promise;
    emit({ type: 'run_started', task_id: 'late', conversation_id: 'conversation' });
    await finish.promise;
  } });
  const run = h.stream.executeQuest(h.source, 'conversation', { attempt: 'rerun' });
  h.stop.handleStop();
  const barrier = h.runtime.stopPromise;
  h.switchTo('other');
  assert.equal(h.prune().has('conversation'), false);
  start.resolve();
  await tick();
  assert.equal(h.runtime.taskRuntimeState.pendingTask, null);
  assert.equal(h.prune().has('conversation'), false);
  assert.deepEqual(h.calls.filter(([kind]) => kind === 'cancel-task'), [['cancel-task', 'late']]);
  finish.resolve();
  await run;
  await barrier;
});

test('pending run and history requests are pinned independently of busy and Stop state', () => {
  for (const property of ['pendingRun', 'taskRecoveryRequest']) {
    const h = makeHarness();
    h.runtime[property] = {};
    h.switchTo('other');
    assert.equal(h.prune().has('conversation'), false);
    h.runtime[property] = null;
    assert.equal(h.prune().has('conversation'), true);
  }
});

test('a stale detail cannot erase a scheduled run that started and finished during recovery', async () => {
  const response = deferred();
  const h = makeHarness({ fetchDetail: () => response.promise });
  const recovering = h.ctx.recoverConversationTasks('conversation');
  h.schedule({ type: 'run_started' });
  h.schedule({ type: 'run_finished', status: 'done', task: { status: 'done', answer_text: 'New answer' } });
  assert.equal(h.runtime.activeRunId, null);
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'scheduled');
  response.resolve(Response.json(detail()));
  await recovering;
  assert.deepEqual(h.runtime.taskRuntimeState.taskOrder, ['source', 'scheduled']);
  assert.equal(h.runtime.taskRuntimeState.tasksById.scheduled.answerText, 'New answer');
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'scheduled');
  assert.equal(h.runtime.taskRecoveryRequest, null);
});

test('a stale detail cannot erase a manual attempt that completed during recovery', async () => {
  const response = deferred();
  const h = makeHarness({ fetchDetail: () => response.promise, transport: async (_request, emit) => {
    emit({ type: 'run_started', task_id: 'manual', conversation_id: 'conversation' });
    emit({ type: 'run_finished', task_id: 'manual', conversation_id: 'conversation', status: 'done',
      task: { status: 'done', answer_text: 'Manual answer' } });
  } });
  const recovering = h.ctx.recoverConversationTasks('conversation');
  await h.stream.executeQuest(h.source, 'conversation', { attempt: 'rerun' });
  assert.equal(h.runtime.activeRunId, null);
  response.resolve(Response.json(detail()));
  await recovering;
  assert.equal(h.runtime.taskRuntimeState.tasksById.manual.answerText, 'Manual answer');
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'manual');
});

test('the hydration guard rejects stale task payloads even after a newer run is idle again', async () => {
  const hydration = deferred();
  let guard;
  let applied = false;
  const h = makeHarness({ restore: async (_ids, { isCurrentActivation }) => {
    guard = isCurrentActivation;
    await hydration.promise;
    if (guard()) { applied = true; h.ctx.updateTaskRuntimeState(() => tasks.createEmptyTaskRuntimeState(), 'conversation'); }
  } });
  const recovering = h.ctx.recoverConversationTasks('conversation');
  await tick();
  assert.equal(guard(), true);
  h.schedule({ type: 'run_started' });
  h.schedule({ type: 'run_finished', status: 'done', task: { status: 'done', answer_text: 'New answer' } });
  assert.equal(guard(), false);
  hydration.resolve();
  await recovering;
  assert.equal(applied, false);
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'scheduled');
  assert.equal(h.runtime.taskRuntimeState.tasksById.scheduled.answerText, 'New answer');
});

test('newer recovery wins out-of-order responses and old cleanup cannot clear its ownership', async () => {
  const responses = [deferred(), deferred()];
  let index = 0;
  const h = makeHarness({ fetchDetail: () => responses[index++].promise });
  const first = h.ctx.recoverConversationTasks('conversation');
  const second = h.ctx.recoverConversationTasks('conversation');
  const owner = h.runtime.taskRecoveryRequest;
  responses[0].resolve(Response.json(detail('old')));
  await first;
  assert.equal(h.runtime.taskRecoveryRequest, owner);
  assert.deepEqual(h.runtime.taskRuntimeState.taskOrder, ['source']);
  responses[1].resolve(Response.json(detail('latest')));
  await second;
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'latest');
  assert.equal(h.runtime.taskRecoveryRequest, null);
});

test('non-run state updates also invalidate a pending history snapshot', async () => {
  const response = deferred();
  const h = makeHarness({ fetchDetail: () => response.promise });
  const recovering = h.ctx.recoverConversationTasks('conversation');
  h.ctx.updateTaskRuntimeState((state) => ({ ...state, latestTaskId: 'updated' }), 'conversation');
  response.resolve(Response.json(detail()));
  await recovering;
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'updated');
});

test('Stop completion cannot recreate an owner deleted while history recovery was pending', async () => {
  const response = deferred();
  const h = makeHarness({ fetchDetail: () => response.promise });
  h.stop.handleStop();
  const barrier = h.runtime.stopPromise;
  await tick();
  assert.ok(h.runtime.taskRecoveryRequest);
  h.runtimes.delete('conversation');
  response.resolve(Response.json(detail()));
  await barrier;
  assert.equal(h.runtimes.has('conversation'), false);
});

test('queued React projection captures a snapshot instead of rereading a mutable runtime', () => {
  const updates = [];
  const runtime = { taskRuntimeState: tasks.createEmptyTaskRuntimeState(), busy: false,
    stopPromise: Promise.resolve(), stopError: '' };
  const api = createConversationRuntime({ setBusy: () => {}, setTaskRuntimeState: () => {},
    setShellSeeded: () => {}, taskImageAttachmentsRef: { current: new Map() },
    setConversationStopState: (update) => updates.push(update) });
  api.syncDisplayedRuntime(runtime);
  runtime.stopPromise = null;
  runtime.stopError = 'Synthetic failure';
  api.syncDisplayedRuntime(runtime);
  assert.deepEqual(updates[0]({ pending: false, error: '' }), { pending: true, error: '' });
  assert.deepEqual(updates[1]({ pending: true, error: '' }), { pending: false, error: 'Synthetic failure' });
});

test('failed history recovery releases its request ownership and allows a clean retry', async () => {
  let fail = true;
  const h = makeHarness({ fetchDetail: async () => {
    if (fail) throw new Error('Offline');
    return Response.json(detail('latest'));
  } });
  await assert.rejects(h.ctx.recoverConversationTasks('conversation'), /Offline/);
  assert.equal(h.runtime.taskRecoveryRequest, null);
  fail = false;
  await h.ctx.recoverConversationTasks('conversation');
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'latest');
  assert.equal(h.runtime.taskRecoveryRequest, null);
});
