import test from 'node:test';
import assert from 'node:assert/strict';

// The task-runtime import chain reaches shared/api/base.js, which reads window.
globalThis.window = globalThis.window || { haish: {} };

const { createDeployHandlers } = await import(
  '../../../src/features/tasks/hooks/createDeployHandlers.js'
);
const { applyTerminalTaskState } = await import(
  '../../../src/features/tasks/model/task-runtime.js'
);

function emptyRuntime() {
  return {
    taskRuntimeState: { activeTaskId: null, pendingTask: null, tasksById: {}, taskOrder: [] },
    busy: false,
    activeRunId: null,
    activeTaskId: null,
    fetchController: null,
    answerBuffer: '',
    cancelledRunIds: new Set(),
    abortRequested: false,
  };
}

function createHarness({
  runtime = emptyRuntime(),
  conversationId = 'conv-1',
  draftConversation = null,
  queuedDeploy = null,
  cancelConversationTask = null,
} = {}) {
  const calls = {
    cancelConversation: [],
    aborted: 0,
    flushed: 0,
    setQueuedDeploy: [],
    toasts: [],
  };
  const handlers = createDeployHandlers({
    applyTerminalTaskState,
    chatFinalizedTaskIdsRef: { current: new Set() },
    conversationIdRef: { current: conversationId },
    draftConversationRef: { current: draftConversation },
    getRuntime: () => runtime,
    isTaskActuallyActive: (task) => task?.status === 'running' || task?.status === 'queued',
    taskUpdatedTimestamp: (task) => task?.updatedAt || 0,
    queuedDeploy,
    setQueuedDeploy: (value) => { calls.setQueuedDeploy.push(value); },
    cancelActiveConversationTask: (targetConvId) => {
      calls.cancelConversation.push(targetConvId);
      return cancelConversationTask
        ? cancelConversationTask(targetConvId)
        : Promise.resolve({ ok: true });
    },
    updateTaskById: (taskId, updater) => {
      const task = runtime?.taskRuntimeState?.tasksById?.[taskId];
      if (!task) return;
      runtime.taskRuntimeState = {
        ...runtime.taskRuntimeState,
        tasksById: { ...runtime.taskRuntimeState.tasksById, [taskId]: updater(task) },
      };
    },
    updateTaskRuntimeState: (updater) => {
      runtime.taskRuntimeState = updater(runtime.taskRuntimeState);
    },
    mutateRuntime: (targetConvId, mutator) => { mutator(runtime); },
    flushRuntimeTasksToWorkspace: () => { calls.flushed += 1; },
    normalizeWorkspaceOrdering: (state) => state,
    setWorkspaceState: () => {},
    showToast: (...args) => { calls.toasts.push(args); },
    userCancelledTaskIdsRef: { current: new Set() },
  });
  return { handlers, runtime, calls };
}

test('stop reaches the server even when the local runtime has no bookkeeping', () => {
  // 回归现场：界面显示在跑，但本窗口账本为空。旧代码在这里静默返回，
  // 一个取消请求都发不出去；停止必须以服务端为准。
  const { handlers, calls } = createHarness();
  const restoreText = handlers.handleStop();
  assert.equal(restoreText, '');
  assert.deepEqual(calls.cancelConversation, ['conv-1']);
  // 本地账本为空时不覆盖服务端任务列表——flush 只服务本地收尾。
  assert.equal(calls.flushed, 0);
});

test('stop still asks the server when the conversation runtime is missing', () => {
  const { handlers, calls } = createHarness({ runtime: null });
  const restoreText = handlers.handleStop();
  assert.equal(restoreText, '');
  assert.deepEqual(calls.cancelConversation, ['conv-1']);
});

test('a rejected stop request stays silent and never throws', async () => {
  const { handlers, calls } = createHarness({
    cancelConversationTask: () => Promise.reject(new Error('offline')),
  });
  handlers.handleStop();
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.deepEqual(calls.cancelConversation, ['conv-1']);
  assert.equal(calls.toasts.length, 0);
});

test('a non-2xx stop response stays silent and does not throw', async () => {
  const { handlers, calls } = createHarness({
    cancelConversationTask: () => Promise.resolve({ ok: false, status: 409 }),
  });
  handlers.handleStop();
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(calls.toasts.length, 0);
});

test('stop rolls back local in-flight bookkeeping and still cancels through the server', () => {
  const runtime = emptyRuntime();
  runtime.busy = true;
  runtime.activeRunId = 'run-1';
  runtime.activeTaskId = 'task-1';
  runtime.taskRuntimeState = {
    activeTaskId: 'task-1',
    pendingTask: null,
    taskOrder: ['task-1'],
    tasksById: {
      'task-1': { taskId: 'task-1', status: 'running', title: 'Long task', updatedAt: 1, workflowRun: null },
    },
  };
  const { handlers, runtime: rt, calls } = createHarness({ runtime });
  rt.fetchController = { abort: () => { calls.aborted += 1; } };
  const restoreText = handlers.handleStop();
  assert.equal(restoreText, '');
  // 会话级取消照发——本地知道具体任务也不依赖本地账本决定请求口径。
  assert.deepEqual(calls.cancelConversation, ['conv-1']);
  assert.equal(calls.aborted, 1);
  // 本地收尾保持原语义：任务标 cancelled、runtime 清空、同步侧栏。
  assert.equal(rt.taskRuntimeState.tasksById['task-1'].status, 'cancelled');
  assert.equal(rt.taskRuntimeState.activeTaskId, null);
  assert.ok(rt.taskRuntimeState.taskOrder.includes('task-1'));
  assert.equal(rt.abortRequested, true);
  assert.equal(rt.activeTaskId, null);
  assert.equal(rt.activeRunId, null);
  assert.equal(rt.fetchController, null);
  assert.equal(rt.busy, false);
  assert.equal(calls.flushed, 1);
});

test('a draft conversation stop only restores the queued text and stays local', () => {
  const queuedDeploy = { text: 'unsent message', targetConversationId: 'draft-1' };
  const { handlers, calls } = createHarness({
    conversationId: 'draft-1',
    draftConversation: { id: 'draft-1' },
    queuedDeploy,
  });
  const restoreText = handlers.handleStop();
  assert.equal(restoreText, 'unsent message');
  assert.deepEqual(calls.setQueuedDeploy, [null]);
  // 草稿还没有服务端记录——不骚扰服务端。
  assert.deepEqual(calls.cancelConversation, []);
});

test('stop without a conversation sends nothing', () => {
  const { handlers, calls } = createHarness({ conversationId: null });
  const restoreText = handlers.handleStop();
  assert.equal(restoreText, '');
  assert.deepEqual(calls.cancelConversation, []);
});
