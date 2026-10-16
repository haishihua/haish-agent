import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
globalThis.window = {};
const { createConversationRuntime } = await import('../../../src/features/conversations/hooks/createConversationRuntime.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { createConversationHandlers } = await import('../../../src/features/conversations/hooks/createConversationHandlers.js');
const { createTaskStreamHandlers } = await import('../../../src/features/tasks/hooks/createTaskStreamHandlers.js');
const { createDeployHandlers } = await import('../../../src/features/tasks/hooks/createDeployHandlers.js');
const { evictInactiveRuntimes } = await import('../../../src/features/conversations/model/runtime-cache.js');
const { waitForAttemptRunConfig } = await import('../../../src/features/conversations/model/attempt-run-config.js');
const tasks = await import('../../../src/features/tasks/model/task-runtime.js');
const events = await import('../../../src/features/tasks/model/runtime-events.js');
const workspace = await import('../../../src/features/conversations/model/workspace-state.js');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const route = { llm_config_id: 'origin-provider', model_id: 'origin-model', agent_id: 'origin-agent', reasoning_effort: 'xhigh' };
function harness({ transport, configSync, configTimeoutMs } = {}) {
  const conversationIdRef = { current: 'A' };
  const runtimes = new Map();
  const requests = [], toasts = [], projections = [];
  let retryPending = false;
  const noop = () => {};
  const ctx = {
    ...tasks, ...events, API_BASE: '', providerOptions: [{ id: route.llm_config_id, provider: 'custom' }],
    configSync, attemptConfigTimeoutMs: configTimeoutMs,
    canStartDeployForConversation: id => conversationIdRef.current === id,
    conversationIdRef, runtimesRef: { current: runtimes },
    streamTargetConvIdRef: { current: null }, taskImageAttachmentsRef: { current: new Map() },
    chatFinalizedTaskIdsRef: { current: new Set() }, userCancelledTaskIdsRef: { current: new Set() },
    setBusy: noop, setShellSeeded: noop, setWorkspaceState: noop, setTaskRuntimeState: state => projections.push(state),
    setConversationRetryPending: value => { retryPending = value; },
    normalizeWorkspaceOrdering: state => state, notifyTaskComplete: noop,
    isTaskActuallyActive: workspace.isTaskActuallyActive, taskUpdatedTimestamp: workspace.taskUpdatedTimestamp,
    timestampValue: workspace.timestampValue, normalizeChatImageRefs: images => images,
    normalizeRuntimeEvent: event => event, toDisplayText: String,
    stripChatImageAugmentation: text => ({ text: text || '' }), getChatProgressLine: () => '',
    generateHexId: () => 'pending-attempt', removeConversationTaskFromWorkspace: noop,
    draftConversationRef: { current: null }, recoverConversationTasks: async () => {},
    cancelActiveConversationTask: async id => Response.json({ cancelled: false, conversation_id: id }),
    cancelActiveTask: async id => Response.json({ cancelled: true, task_id: id, conversation_id: 'A' }),
    runTaskStream: async (command, onEvent) => {
      requests.push(command);
      if (transport) return transport(command, onEvent);
      const event = { task_id: 'confirmed-attempt', conversation_id: 'A', user_message_id: 'user-A', source_task_id: 'source-A' };
      onEvent({ ...event, type: 'run_started', message: 'Origin question' });
      onEvent({ ...event, type: 'run_finished', status: 'done', task: { ...event, title: 'Origin question', status: 'done', answer_text: 'Origin answer' } });
    },
  };
  Object.assign(ctx, createConversationRuntime(ctx));
  ctx.showToast = (...args) => toasts.push(args);
  Object.assign(ctx, createConversationActivationHandlers(ctx));
  ctx.recoverConversationTasks = async (id) => ({ conversation_id: id });
  Object.assign(ctx, createTaskStreamHandlers(ctx));
  const source = { taskId: 'source-A', conversationId: 'A', userMessageId: 'user-A', title: 'Origin question',
    status: 'failed', executionMode: 'chat', originViewMode: 'chat', requestedProvider: route.llm_config_id, requestedModelId: route.model_id };
  const origin = ctx.getRuntime('A', { create: true });
  origin.taskRuntimeState = { ...tasks.createEmptyTaskRuntimeState(), tasksById: { 'source-A': source }, taskOrder: ['source-A'], latestTaskId: 'source-A' };
  const destination = ctx.getRuntime('B', { create: true });
  const destinationState = destination.taskRuntimeState;
  const handlers = createConversationHandlers(ctx);
  const stop = createDeployHandlers(ctx);
  function switchTo(id) {
    conversationIdRef.current = id;
    ctx.syncDisplayedRuntime(ctx.getRuntime(id, { create: true }));
  }
  return { ctx, handlers, stop, origin, destination, destinationState, source, requests, toasts, projections, runtimes,
    switchTo, currentId: conversationIdRef, retryPending: () => retryPending };
}

test('owned Retry survives A to B navigation, runtime eviction and duplicate clicks after return', async () => {
  const load = deferred();
  const h = harness();
  const session = { loaded: false, attached: false, current: { ready: false } };
  load.promise.then(saved => { session.loaded = true; session.saved = session.baseline = saved; });
  let ensures = 0;
  const config = { ensureSaved: options => { ensures += 1; return waitForAttemptRunConfig(session, options); } };
  const pending = h.handlers.handleRetryTask(h.source, null, config);
  assert.equal(h.retryPending(), true);
  assert.equal(h.origin.busy, false, 'configuration waiting is not server acceptance');
  h.switchTo('B');
  assert.equal(h.retryPending(), false, 'destination is not blocked by the origin preflight');
  for (let index = 0; index < 6; index += 1) h.ctx.getRuntime(`cache-${index}`, { create: true });
  assert.equal(evictInactiveRuntimes(h.runtimes, 'B', 0).has('A'), false);
  h.switchTo('A');
  assert.equal(h.retryPending(), true);
  const reentered = createConversationHandlers(h.ctx);
  await assert.rejects(reentered.handleRetryTask({ ...h.source, taskId: 'another-source' }, null, config), /already waiting/);
  await assert.rejects(reentered.handleRetryTask(h.source, 'different edit', config), /already waiting/);
  assert.equal(reentered.handleRetryTask(h.source, null, { ensureSaved: () => { throw new Error('must join'); } }), pending);
  h.switchTo('B');
  const before = h.projections.length;
  load.resolve(route);
  assert.equal(await pending, true);
  await tick();
  assert.equal(ensures, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].operation, 'rerun');
  assert.equal(h.requests[0].task_id, 'source-A');
  assert.equal(h.requests[0].conversation_id, 'A');
  assert.equal(h.requests[0].payload.llm_config_id, route.llm_config_id);
  assert.equal(h.requests[0].payload.model_id, route.model_id);
  assert.equal(h.requests[0].payload.reasoning_effort, 'xhigh');
  assert.equal(h.currentId.current, 'B', 'Retry must not activate A');
  assert.equal(h.destination.taskRuntimeState, h.destinationState);
  assert.equal(h.projections.length, before, 'background events never project into B');
  assert.equal(h.origin.pendingRetry, null);
  assert.equal(h.origin.taskRuntimeState.tasksById['confirmed-attempt'].status, 'done');
  assert.deepEqual(h.toasts, []);
});

test('Stop on B does not cancel A preflight; explicit Stop on A does', async () => {
  const h = harness();
  const session = { loaded: false, attached: false, current: { ready: false } };
  const pending = h.handlers.handleRetryTask(h.source, null, { ensureSaved: options => waitForAttemptRunConfig(session, options) });
  const rejected = assert.rejects(pending, /Retry was stopped/);
  const controller = h.origin.pendingRetry.controller;
  h.switchTo('B'); h.stop.handleStop();
  await h.destination.stopPromise;
  assert.equal(controller.signal.aborted, false);
  h.switchTo('A'); h.stop.handleStop();
  await rejected;
  await h.origin.stopPromise;
  session.loaded = true; session.saved = session.baseline = route;
  await tick();
  assert.equal(h.requests.length, 0);
  assert.equal(h.origin.pendingRetry, null);
});

test('Stop during prior Stop reconciliation cannot launch the waiting Retry afterward', async () => {
  const h = harness();
  const reconcile = deferred();
  h.origin.stopPromise = reconcile.promise;
  const pending = h.handlers.handleRetryTask(h.source, null, { ensureSaved: async () => route });
  const rejected = assert.rejects(pending, /Retry was stopped/);
  await tick();
  h.stop.handleStop();
  h.origin.stopPromise = null;
  reconcile.resolve();
  await rejected;
  assert.equal(h.requests.length, 0);
});

test('background Retry preserves latest-turn checks and never substitutes a newer task', async () => {
  const h = harness();
  const load = deferred();
  const pending = h.handlers.handleRetryTask(h.source, null, { ensureSaved: () => load.promise });
  const rejected = assert.rejects(pending, /no longer the latest/);
  h.switchTo('B');
  h.origin.taskRuntimeState.latestTaskId = 'newer-task';
  load.resolve(route);
  await rejected;
  assert.equal(h.requests.length, 0);
  assert.equal(h.origin.pendingRetry, null);
});

test('timeout and load/save failures clear background preflight without dispatching', async () => {
  for (const reason of ['timeout', 'load', 'save', 'invalid']) {
    const h = harness();
    const session = { loaded: false, attached: false, current: { ready: false } };
    if (reason === 'load') session.error = 'Synthetic load failed';
    if (reason === 'save') session.operation = Promise.reject(new Error('Synthetic save failed'));
    if (reason === 'invalid') Object.assign(session, { loaded: true, baseline: route,
      current: { ready: false, validate: () => 'Synthetic invalid configuration' } });
    const pending = h.handlers.handleRetryTask(h.source, null, { ensureSaved: options => waitForAttemptRunConfig(session, { ...options, timeoutMs: 10 }) });
    h.switchTo('B');
    await assert.rejects(pending, reason === 'timeout' ? /Timed out/ : /Synthetic/);
    assert.equal(h.requests.length, 0);
    assert.equal(h.origin.pendingRetry, null);
    assert.equal(h.destination.taskRuntimeState, h.destinationState);
  }
});

test('sidebar Retry releases preflight immediately on Stop during a stalled save or load', async () => {
  for (const stage of ['save', 'load']) {
    const stalled = deferred();
    let loads = 0;
    const h = harness({ configSync: {
      waitForSave: () => stage === 'save' ? stalled.promise : Promise.resolve(),
      load: () => { loads += 1; return stage === 'load' ? stalled.promise : Promise.resolve(route); },
    } });
    const pending = h.handlers.handleRetryTask(h.source);
    const result = pending.then(() => null, error => error);
    await tick();
    h.stop.handleStop();
    const error = await Promise.race([result, new Promise(resolve => setTimeout(() => resolve(null), 100))]);
    try {
      assert.match(error?.message || '', /Retry was stopped/);
      assert.equal(h.origin.pendingRetry, null);
      assert.equal(h.retryPending(), false);
      assert.equal(h.requests.length, 0);
    } finally {
      stalled.resolve(route);
      await result;
      await h.origin.stopPromise;
    }
    assert.equal(loads, stage === 'load' ? 1 : 0, 'Stop during the save barrier must not start a later load');
    assert.equal(h.requests.length, 0, 'late configuration completion never launches the cancelled Retry');
  }
});

test('sidebar Retry has one configuration deadline and ignores a late response', async () => {
  const stalled = deferred();
  const h = harness({ configTimeoutMs: 20, configSync: { waitForSave: async () => {}, load: () => stalled.promise } });
  const pending = h.handlers.handleRetryTask(h.source);
  const result = pending.then(() => null, error => error);
  const error = await Promise.race([result, new Promise(resolve => setTimeout(() => resolve(null), 100))]);
  try {
    assert.match(error?.message || '', /Timed out waiting for conversation configuration/);
    assert.equal(h.origin.pendingRetry, null);
    assert.equal(h.retryPending(), false);
  } finally {
    stalled.resolve(route);
    await result;
  }
  await tick();
  assert.equal(h.requests.length, 0);
});

function editAction(h, ensureSaved) {
  const panel = readFileSync(new URL('../../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
  const callback = panel.slice(panel.indexOf('const editMessage = React.useCallback('), panel.indexOf('// 批注校验'));
  const rowActionRef = { current: { onEditMessage: (_id, text, config) => h.handlers.handleRetryTask(h.source, text, config) } };
  const edit = vm.runInNewContext(`${callback}\neditMessage;`, {
    React: { useCallback: fn => fn },
    composerRunConfigRef: { current: { provider: route.llm_config_id, modelId: route.model_id, ensureSaved } },
    rowActionRef,
  });
  return { edit: text => edit(text, { taskId: h.source.taskId }), rowActionRef };
}

test('editing claims preflight before configuration saving, and Stop prevents late dispatch', async () => {
  const saving = deferred();
  const h = harness();
  let options;
  const { edit } = editAction(h, next => { options = next; return saving.promise; });
  const pending = edit('Edited question');
  const result = pending.then(() => null, error => error);
  try {
    assert.equal(h.retryPending(), true);
    assert.equal(h.origin.pendingRetry.editedMessage, 'Edited question');
    assert.equal(options.background, false, 'editing retains the foreground navigation guard');
    h.stop.handleStop();
    const error = await Promise.race([result, new Promise(resolve => setTimeout(() => resolve(null), 100))]);
    assert.match(error?.message || '', /Retry was stopped/);
    assert.equal(h.origin.pendingRetry, null);
  } finally {
    saving.resolve(route);
    await result;
    await h.origin.stopPromise;
  }
  await tick();
  assert.equal(h.requests.length, 0);
});

test('editing without Stop waits for the saved route and dispatches exactly once to its source', async () => {
  const saving = deferred();
  const h = harness();
  const { edit } = editAction(h, () => saving.promise);
  const pending = edit('Edited question');
  assert.equal(h.retryPending(), true);
  assert.equal(h.requests.length, 0);
  saving.resolve(route);
  assert.equal(await pending, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].operation, 'edit');
  assert.equal(h.requests[0].conversation_id, 'A');
  assert.equal(h.requests[0].payload.message, 'Edited question');
  assert.equal(h.requests[0].payload.llm_config_id, route.llm_config_id);
  assert.equal(h.requests[0].payload.reasoning_effort, route.reasoning_effort);
  assert.equal(h.origin.pendingRetry, null);
});

test('sidebar Retry timeout stops a late save barrier from starting the subsequent load', async () => {
  const stalled = deferred();
  let loads = 0;
  const h = harness({ configTimeoutMs: 10, configSync: {
    waitForSave: () => stalled.promise,
    load: async () => { loads += 1; return route; },
  } });
  const pending = h.handlers.handleRetryTask(h.source);
  await assert.rejects(pending, /Timed out waiting for conversation configuration/);
  assert.equal(h.origin.pendingRetry, null);
  stalled.resolve();
  await tick();
  assert.equal(loads, 0);
  assert.equal(h.requests.length, 0);
});

test('an edit never hands its source task or saved configuration to another conversation handler', async () => {
  const saving = deferred();
  const h = harness();
  const { edit, rowActionRef } = editAction(h, () => saving.promise);
  const pending = edit('Edited question');
  const result = pending.then(() => null, error => error);
  let destinationEdits = 0;
  h.switchTo('B');
  rowActionRef.current = { onEditMessage: () => { destinationEdits += 1; return true; } };
  saving.resolve(route);
  const error = await result;
  assert.match(error?.message || '', /Conversation is still loading/);
  assert.equal(destinationEdits, 0);
  assert.equal(h.requests.length, 0);
  assert.equal(h.origin.pendingRetry, null);
});

test('an offline end without startup confirmation never acknowledges background Retry', async () => {
  const h = harness({ transport: async () => {} });
  const pending = h.handlers.handleRetryTask(h.source, null, { ensureSaved: async () => route });
  h.switchTo('B');
  await assert.rejects(pending, /not confirmed/);
  assert.equal(h.requests.length, 1);
  assert.equal(h.origin.pendingRetry, null);
});
