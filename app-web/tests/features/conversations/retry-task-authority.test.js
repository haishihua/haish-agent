import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = {};
const { createConversationHandlers } = await import('../../../src/features/conversations/hooks/createConversationHandlers.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { sortTaskIdsForRestore, taskSummaryToRuntimeTask, taskDetailToRuntimeTask } = await import('../../../src/features/tasks/model/task-runtime.js');
const { collapseFullTaskAttempts } = await import('../../../src/features/chat/model/task-attempts.js');
const { createAttemptHarness } = await import('../../fixtures/task-attempt-runtime.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const sourceTurn = () => ({ taskId: 'source', conversationId: 'A', userMessageId: 'user', status: 'failed',
  error: 'Local runtime connection closed.', title: 'Original input', executionMode: 'chat',
  requestedProvider: 'fixture', requestedModelId: 'model', runtimeHydrated: true, updatedAt: Date.now() });
const route = { provider: 'fixture', modelId: 'model', agentId: 'agent', reasoningEffort: null };
const serverTask = (status, extra = {}) => ({ task_id: 'source', conversation_id: 'A', user_message_id: 'user',
  status, title: 'Original input', execution_mode: 'chat', answer_text: status === 'done' ? 'Server answer' : '',
  updated_at: '2026-01-01T00:00:00Z', events: [], ...extra });
function harness({ status = 'failed', read = null, hydrate = null, transport = null, timeoutMs } = {}) {
  const source = sourceTurn();
  const h = createAttemptHarness(source, { transport });
  const requests = [], toasts = [];
  let current = 'A';
  const destination = {};
  const getRuntime = id => id === 'A' ? h.runtime : destination;
  const recovery = createConversationActivationHandlers({ getRuntime, API_BASE: '', sortTaskIdsForRestore, taskSummaryToRuntimeTask,
    apiFetch: async (url, options) => {
      requests.push({ url, options });
      return Response.json(await (read?.(options) || { conversation_id: 'A', last_task_id: 'source', tasks: [serverTask(status)] }));
    },
    restoreTaskRuntimes: async (ids, options) => {
      const records = await (hydrate?.(options) || ids.map(id => serverTask(status, { task_id: id })));
      if (!options.isCurrentActivation()) return;
      for (const record of records) h.runtime.taskRuntimeState = { ...h.runtime.taskRuntimeState, tasksById: {
        ...h.runtime.taskRuntimeState.tasksById, [record.task_id]: taskDetailToRuntimeTask(record),
      } };
    },
    updateTaskRuntimeState: update => { h.runtime.taskRuntimeState = update(h.runtime.taskRuntimeState); },
    mutateRuntime: (_id, update) => update(h.runtime),
    isTaskActuallyActive: task => ['running', 'queued'].includes(task.status),
    flushRuntimeTasksToWorkspace: () => {},
  });
  const handlers = createConversationHandlers({ getRuntime, executeQuest: h.executeQuest,
    recoverConversationTasks: recovery.recoverConversationTasks, attemptConfigTimeoutMs: timeoutMs,
    showToast: (...args) => toasts.push(args) });
  return { ...h, handlers, recovery, source, reads: requests, toasts, destination,
    navigate: () => { current = 'B'; }, current: () => current };
}

for (const status of ['done', 'running', 'queued', 'cancelled']) {
  test(`Retry restores server ${status} instead of rerunning a client-only failure`, async () => {
    const h = harness({ status });
    const retry = h.handlers.handleRetryTask(h.source, null, route);
    h.navigate();
    assert.equal(await retry, true);
    assert.equal(h.requests.length, 0);
    assert.equal(h.runtime.taskRuntimeState.tasksById.source.status, status);
    assert.equal(h.runtime.taskRuntimeState.tasksById.source.error, null);
    assert.equal(h.runtime.busy, ['running', 'queued'].includes(status));
    assert.equal(h.current(), 'B');
    assert.deepEqual(h.destination, {});
    assert.deepEqual(h.toasts, []);
    assert.equal(h.runtime.pendingRetry, null);
    if (status === 'done') assert.equal(h.runtime.taskRuntimeState.tasksById.source.answerText, 'Server answer');
  });
}

test('confirmed server failure dispatches once, using the current route', async () => {
  const gate = deferred();
  const h = harness({ read: () => gate.promise });
  const pending = h.handlers.handleRetryTask(h.source, null, route);
  await tick();
  assert.equal(h.requests.length, 0);
  assert.equal(h.runtime.busy, false);
  assert.equal(h.runtime.taskRuntimeState.tasksById.source, h.source);
  assert.equal(h.handlers.handleRetryTask(h.source, null, route), pending);
  gate.resolve({ conversation_id: 'A', last_task_id: 'source', tasks: [serverTask('failed')] });
  assert.equal(await pending, true);
  assert.equal(h.reads.length, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].operation, 'rerun');
  assert.equal(h.requests[0].body.llm_config_id, 'fixture');
});

test('Retry waiting for a prior Stop rechecks server cancellation instead of launching it again', async () => {
  const stop = deferred();
  const h = harness({ status: 'cancelled' });
  h.runtime.stopPromise = stop.promise;
  const retry = h.handlers.handleRetryTask(h.source, null, route);
  await tick();
  assert.equal(h.reads.length, 0);
  h.runtime.stopPromise = null;
  stop.resolve();
  assert.equal(await retry, true);
  assert.equal(h.requests.length, 0);
  assert.equal(h.runtime.taskRuntimeState.tasksById.source.status, 'cancelled');
});

test('an unverified Stop blocks Retry before state recovery or dispatch', async () => {
  const h = harness({ status: 'done' });
  h.runtime.stopError = 'Stop again before retrying.';
  await assert.rejects(h.handlers.handleRetryTask(h.source, null, route), /Stop again/);
  assert.equal(h.reads.length, 0);
  assert.equal(h.requests.length, 0);
});

test('a newer server turn is restored but never silently retried', async () => {
  const newer = serverTask('failed', { task_id: 'newer', source_task_id: 'source' });
  const h = harness({ read: async () => ({ conversation_id: 'A', last_task_id: 'newer', tasks: [serverTask('failed'), newer] }),
    hydrate: async () => [newer] });
  await assert.rejects(h.handlers.handleRetryTask(h.source, null, route), /no longer the latest/);
  assert.equal(h.requests.length, 0);
  assert.equal(h.runtime.taskRuntimeState.latestTaskId, 'newer');
});

test('failed refresh preserves the original failure and never sends a rerun', async () => {
  const h = harness({ read: async () => { throw new Error('Runtime unavailable'); } });
  await assert.rejects(h.handlers.handleRetryTask(h.source, null, route), /Runtime unavailable/);
  assert.equal(h.runtime.taskRuntimeState.tasksById.source, h.source);
  assert.equal(h.runtime.pendingRetry, null);
  assert.equal(h.requests.length, 0);
});

for (const stage of ['detail', 'body']) {
  test(`Stop while refreshing ${stage} aborts Retry and prevents late restoration or dispatch`, async () => {
    const gate = deferred();
    const h = harness(stage === 'detail' ? { read: () => gate.promise } : { hydrate: () => gate.promise });
    const retry = h.handlers.handleRetryTask(h.source, null, route);
    const rejected = assert.rejects(retry, /Retry was stopped/);
    await tick();
    h.runtime.pendingRetry.controller.abort();
    await rejected;
    gate.resolve(stage === 'detail'
      ? { conversation_id: 'A', last_task_id: 'source', tasks: [serverTask('done')] } : [serverTask('done')]);
    await tick();
    assert.equal(h.runtime.taskRuntimeState.tasksById.source, h.source);
    assert.equal(h.requests.length, 0);
    assert.equal(h.runtime.pendingRetry, null);
  });
}

test('refresh timeout aborts the read and ignores its late result', async () => {
  const gate = deferred();
  const h = harness({ timeoutMs: 10, read: () => gate.promise });
  await assert.rejects(h.handlers.handleRetryTask(h.source, null, route), /Timed out refreshing task status/);
  assert.equal(h.reads[0].options.signal.aborted, true);
  gate.resolve({ conversation_id: 'A', last_task_id: 'source', tasks: [serverTask('done')] });
  await tick();
  assert.equal(h.runtime.taskRuntimeState.tasksById.source, h.source);
  assert.equal(h.requests.length, 0);
});

test('a concurrent new run invalidates Retry preflight instead of using stale local failure', async () => {
  const gate = deferred();
  const h = harness({ read: () => gate.promise });
  const retry = h.handlers.handleRetryTask(h.source, null, route);
  const rejected = assert.rejects(retry, /state changed/);
  await tick();
  h.runtime.runGeneration = 1;
  gate.resolve({ conversation_id: 'A', last_task_id: 'source', tasks: [serverTask('failed')] });
  await rejected;
  assert.equal(h.requests.length, 0);
});

test('eligibility 409 refreshes state once and never automatically resubmits', async () => {
  let recovered = 0;
  const source = sourceTurn();
  const h = createAttemptHarness(source, { transport: async () => {
    throw Object.assign(new Error('Task is not eligible for this operation.'), { status: 409 });
  }, recover: async () => {
    recovered += 1;
    h.runtime.taskRuntimeState.tasksById.source = { ...source, status: 'done', error: null, answerText: 'Recovered' };
  } });
  await assert.rejects(h.executeQuest(source, 'A', { attempt: 'rerun' }), /not eligible/);
  assert.equal(recovered, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.runtime.taskRuntimeState.tasksById.source.status, 'done');
  assert.equal(h.runtime.taskRuntimeState.pendingTask, null);
});

test('Stop cancels eligibility-conflict recovery and prevents its late state from applying', async () => {
  const gate = deferred();
  const source = sourceTurn();
  const preflight = new AbortController();
  let recoverySignal;
  const h = createAttemptHarness(source, { transport: async () => {
    throw Object.assign(new Error('Task is not eligible for this operation.'), { status: 409 });
  }, recover: async (_id, { signal }) => {
    recoverySignal = signal;
    await gate.promise;
    if (!signal?.aborted) h.runtime.taskRuntimeState.tasksById.source = { ...source, status: 'done' };
  } });
  const run = h.executeQuest(source, 'A', { attempt: 'rerun', preflightSignal: preflight.signal });
  const rejected = assert.rejects(run, /Retry was stopped/);
  await tick();
  preflight.abort();
  gate.resolve();
  await rejected;
  assert.equal(recoverySignal?.aborted, true);
  assert.equal(h.runtime.taskRuntimeState.tasksById.source, source);
  assert.equal(h.runtime.pendingRun, null);
});

test('eligibility-conflict refresh has a deadline and discards its late result', async () => {
  const gate = deferred();
  const source = sourceTurn();
  let signal;
  const h = createAttemptHarness(source, { attemptConfigTimeoutMs: 10, transport: async () => {
    throw Object.assign(new Error('Task is not eligible for this operation.'), { status: 409 });
  }, recover: async (_id, options) => {
    signal = options.signal;
    await gate.promise;
    if (!signal.aborted) h.runtime.taskRuntimeState.tasksById.source = { ...source, status: 'done' };
  } });
  await assert.rejects(h.executeQuest(source, 'A', { attempt: 'rerun' }), /Timed out refreshing task status/);
  assert.equal(signal.aborted, true);
  gate.resolve(); await tick();
  assert.equal(h.runtime.taskRuntimeState.tasksById.source, source);
  assert.equal(h.runtime.pendingRun, null);
  assert.equal(h.requests.length, 1);
});

test('Retry keeps its original failure visible until run_started, then replaces it once', async () => {
  const gate = deferred();
  const source = sourceTurn();
  const h = createAttemptHarness(source, { transport: async (_command, emit) => {
    await gate.promise;
    emit({ type: 'run_started', task_id: 'confirmed', conversation_id: 'A', source_task_id: 'source', user_message_id: 'user' });
    emit({ type: 'run_finished', task_id: 'confirmed', conversation_id: 'A', status: 'done', task: { status: 'done' } });
  } });
  const run = h.executeQuest(source, 'A', { attempt: 'rerun' });
  const visible = () => collapseFullTaskAttempts(Object.values(h.runtime.taskRuntimeState.tasksById), h.runtime.taskRuntimeState.pendingTask);
  assert.equal(h.runtime.taskRuntimeState.pendingTask.awaitingRetryConfirmation, true);
  assert.deepEqual(visible().map(task => task.taskId), ['source']);
  gate.resolve();
  await run;
  assert.deepEqual(visible().map(task => task.taskId), ['confirmed']);
});

test('Retry loading stays within the original error button and the page wires server recovery', () => {
  const source = readFileSync(new URL('../../../src/shared/ui/agent-elements/ErrorState.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../../src/shared/ui/agent-elements/error-state.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /if \(retrying\)|aui-error-retrying/);
  assert.match(source, /disabled=\{disabled \|\| !onRetry \|\| retrying\}/);
  assert.match(source, /aria-busy=\{Boolean\(retrying\)\}/);
  assert.match(css, /button\[aria-busy="true"\] svg/);
  assert.doesNotMatch(css, /aui-error-shimmer|aui-error-retrying/);
  const shell = [
    readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../../../src/features/app/hooks/useShellHandlers.js', import.meta.url), 'utf8'),
  ].join('\n'); // handlers 装配在 hook 里
  // pending 那一轮的失败态在 model/chat-rows.js 里拼行。
  const rowBuilder = readFileSync(new URL('../../../src/features/app/model/chat-rows.js', import.meta.url), 'utf8');
  assert.match(shell, /createConversationHandlers\(\{\s*executeQuest, recoverConversationTasks,/);
  assert.match(rowBuilder, /!pendingTurn\.awaitingRetryConfirmation \|\| pendingTurn\.stopPending/);
});
