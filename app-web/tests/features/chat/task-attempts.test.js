import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseFullTaskAttempts } from '../../../src/features/chat/model/task-attempts.js';

globalThis.window = {};
const { createAttemptHarness } = await import('../../fixtures/task-attempt-runtime.js');
const { createConversationHandlers } = await import('../../../src/features/conversations/hooks/createConversationHandlers.js');
const { taskOrderTimestamp } = await import('../../../src/features/conversations/model/workspace-state.js');

const sourceTurn = () => ({ taskId: 'source', conversationId: 'conversation', userMessageId: 'original-user',
  title: 'Old message', displayText: 'Old message', requestText: 'Old message', status: 'cancelled', originViewMode: 'chat' });

test('edited text replaces every display projection while preserving the source turn', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source);
  await harness.executeQuest(source, source.conversationId, { attempt: 'edit', message: 'Revised message', requestId: 'edit-request' });
  assert.equal(harness.requests[0].body.message, 'Revised message');
  assert.equal(harness.requests[0].operation, 'edit');
  assert.equal(harness.snapshots[0].displayText, 'Revised message');
  assert.equal(harness.snapshots[0].requestText, 'Revised message');
  const state = harness.runtime.taskRuntimeState;
  const visible = collapseFullTaskAttempts(state.taskOrder.map((id) => state.tasksById[id]));
  assert.equal(visible.length, 1);
  assert.equal(visible[0].displayText ?? visible[0].title, 'Revised message');
  assert.equal(visible[0].status, 'done');
  assert.equal(source.displayText, 'Old message');
});

test('an ordinary retry preserves the original display text', async () => {
  const source = { ...sourceTurn(), status: 'failed' };
  const harness = createAttemptHarness(source);
  await harness.executeQuest(source, source.conversationId, { attempt: 'rerun', requestId: 'retry-request' });
  assert.equal(harness.requests[0].body.message, undefined);
  assert.equal(harness.requests[0].body.provider, undefined);
  assert.equal(harness.requests[0].body.model_id, undefined);
  assert.equal(harness.runtime.taskRuntimeState.tasksById['confirmed-attempt'].displayText, source.displayText);
});

test('editing uses the current run configuration without changing the original task', async () => {
  const source = { ...sourceTurn(), requestedProvider: 'old-provider', requestedModelId: 'old-model', requestedReasoningEffort: 'high' };
  const harness = createAttemptHarness(source);
  const handlers = createConversationHandlers({
    executeQuest: harness.executeQuest,
    canStartDeployForConversation: () => true,
    getRuntime: () => harness.runtime,
  });
  const runConfig = { provider: 'current-provider', modelId: 'current-model', reasoningEffort: 'low' };
  await handlers.handleRetryTask(source, 'Revised message', runConfig);
  const body = harness.requests[0].body;
  assert.equal(body.provider, runConfig.provider);
  assert.equal(body.model_id, runConfig.modelId);
  assert.equal(body.reasoning_effort, runConfig.reasoningEffort);
  assert.equal(harness.snapshots[0].requestedProvider, runConfig.provider);
  assert.equal(harness.snapshots[0].requestedModelId, runConfig.modelId);
  assert.equal(harness.snapshots[0].requestedReasoningEffort, runConfig.reasoningEffort);
  assert.equal(source.requestedProvider, 'old-provider');
  assert.equal(source.requestedModelId, 'old-model');
  assert.equal(source.requestedReasoningEffort, 'high');
});

test('a new attempt orders by its own start rather than the original task time', async () => {
  const OLD_TASK_TIME = Date.UTC(2026, 0, 1);
  for (const attempt of ['edit', 'rerun']) {
    const source = { ...sourceTurn(), createdAt: OLD_TASK_TIME, updatedAt: OLD_TASK_TIME };
    const startedAfter = Date.now();
    const harness = createAttemptHarness(source);
    await harness.executeQuest(source, source.conversationId, { attempt, message: 'New attempt', requestId: attempt });
    assert.ok(taskOrderTimestamp(harness.snapshots[0]) >= startedAfter, 'running attempts must rank at the new send time');
    assert.equal(source.createdAt, OLD_TASK_TIME);
  }
});

test('rerunning a summary-only turn builds a complete live runtime', async () => {
  const source = { ...sourceTurn(), runtimeHydrated: false };
  const harness = createAttemptHarness(source);
  await harness.executeQuest(source, source.conversationId, { attempt: 'rerun', requestId: 'summary-retry' });
  const completed = harness.runtime.taskRuntimeState.tasksById['confirmed-attempt'];
  assert.equal(completed.status, 'done');
  assert.notEqual(completed.runtimeHydrated, false, 'the completed live trace must not be marked as waiting for history');
  assert.equal(source.runtimeHydrated, false);
});

test('a rejected edit waits for the previous task to release, then fails in plain language', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source, { reject: true });
  await assert.rejects(
    harness.executeQuest(source, source.conversationId, { attempt: 'edit', message: 'Keep my draft', requestId: 'rejected-edit' }),
    /not been sent/,
  );
  // 409 “active task” 不再立刻报错：先用同一个 request_id 重发（后端幂等），
  // 窗口用尽才算失败。
  assert.deepEqual(harness.requests.map((request) => request.body.request_id), ['rejected-edit', 'rejected-edit', 'rejected-edit']);
  assert.deepEqual(harness.runtime.taskRuntimeState.taskOrder, [source.taskId]);
  assert.equal(harness.runtime.taskRuntimeState.pendingTask, null);
  assert.equal(harness.runtime.taskRuntimeState.tasksById.source, source);
  assert.equal(harness.runtime.busy, false);
  assert.equal(harness.runtime.fetchController, null);
});

test('an edit blocked by a stopping task is sent as soon as the previous turn releases', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source, { reject: 1 });
  await harness.executeQuest(source, source.conversationId, { attempt: 'edit', message: 'Revised message', requestId: 'waited-edit' });

  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].body.message, 'Revised message');
  assert.equal(harness.requests[1].body.request_id, 'waited-edit');
  const state = harness.runtime.taskRuntimeState;
  const visible = collapseFullTaskAttempts(state.taskOrder.map((id) => state.tasksById[id]));
  assert.equal(visible[0].displayText ?? visible[0].title, 'Revised message');
  assert.equal(visible[0].status, 'done');
});

test('an edit against an unready conversation cannot be acknowledged as successful', async () => {
  const handlers = createConversationHandlers({
    executeQuest: () => assert.fail('must not send'), canStartDeployForConversation: () => false,
  });
  await assert.rejects(handlers.handleRetryTask(sourceTurn(), 'Keep my draft'), /not been sent/);
});

test('a local running task blocks a second attempt without replacing its runtime', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source);
  harness.runtime.busy = true;
  harness.runtime.activeRunId = 'current-run';
  await assert.rejects(harness.executeQuest(source, source.conversationId, { attempt: 'edit', message: 'Keep my draft', requestId: 'duplicate-edit' }), /finish or stop/);
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.runtime.activeRunId, 'current-run');
});

test('retries and edits replace the source turn without removing independent workflow runs', () => {
  const tasks = [
    { taskId: 'failed' },
    { taskId: 'cancelled', sourceTaskId: 'failed' },
    { taskId: 'edited', sourceTaskId: 'cancelled' },
    { taskId: 'node', sourceTaskId: 'edited', rerunFromNodeId: 'node-1' },
  ];
  assert.deepEqual(collapseFullTaskAttempts(tasks).map((task) => task.taskId), ['edited', 'node']);
  assert.equal(tasks.length, 4);
});

test('an accepted edit is on screen as the running turn before the server names it', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source, { hold: true });
  const handlers = createConversationHandlers({
    executeQuest: harness.executeQuest,
    canStartDeployForConversation: () => true,
    getRuntime: () => harness.runtime,
  });
  let acknowledged = false;
  const edit = handlers.handleRetryTask(source, 'Revised message', {}).then((accepted) => {
    acknowledged = true;
    return accepted;
  });
  for (let turn = 0; turn < 16; turn += 1) await Promise.resolve();
  // 请求已发出去、这一轮已以运行态渲染出来，但整段流还挂在那里没跑完。
  assert.equal(harness.requests.length, 1);
  assert.equal(acknowledged, true, '编辑框必须在服务端接下这一笔时就收工，不能等整段流跑完');
  assert.equal(await edit, true);
  const state = harness.runtime.taskRuntimeState;
  assert.equal(state.pendingTask.status, 'running');
  assert.equal(state.pendingTask.displayText, 'Revised message');
  assert.equal(state.pendingTask.sourceTaskId, source.taskId);
  // 旧的取消态（行里那支编辑框）让位给新的运行态：同一个位置不留两轮。
  const projected = collapseFullTaskAttempts(state.taskOrder.map((id) => state.tasksById[id]), state.pendingTask);
  assert.deepEqual(projected.map((task) => task.taskId), []);
  harness.release();
  for (let turn = 0; turn < 60; turn += 1) await Promise.resolve();
  const settled = harness.runtime.taskRuntimeState;
  assert.equal(settled.pendingTask, null);
  assert.deepEqual(
    collapseFullTaskAttempts(settled.taskOrder.map((id) => settled.tasksById[id]), settled.pendingTask)
      .map((task) => task.taskId),
    ['confirmed-attempt'],
  );
});

test('a run that dies after it was taken still closes the editor and reports the reason', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source, { reject: true });
  const toasts = [];
  const handlers = createConversationHandlers({
    executeQuest: harness.executeQuest,
    canStartDeployForConversation: () => true,
    getRuntime: () => harness.runtime,
    showToast: (kind, message) => toasts.push([kind, message]),
  });
  assert.equal(await handlers.handleRetryTask(source, 'Keep my draft', {}), true);
  for (let turn = 0; turn < 40 && toasts.length === 0; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(toasts.length, 1, '接下之后的失败由提示条说出来，不再阻塞编辑框');
  assert.match(toasts[0][1], /not been sent/);
  const state = harness.runtime.taskRuntimeState;
  assert.deepEqual(state.taskOrder, [source.taskId], '回滚把原来那一轮放回时间线');
  assert.equal(state.pendingTask, null);
});

test('an edit blocked before the server takes it keeps the editor and its draft', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source);
  harness.runtime.busy = true;
  harness.runtime.activeRunId = 'current-run';
  const handlers = createConversationHandlers({
    executeQuest: harness.executeQuest,
    canStartDeployForConversation: () => true,
    getRuntime: () => harness.runtime,
    showToast: () => {},
  });
  await assert.rejects(handlers.handleRetryTask(source, 'Keep my draft', {}), /finish or stop/);
  assert.equal(harness.requests.length, 0, '被拦下的发送一个字都没发出去');
});

test('a pending turn only replaces the attempt it actually succeeds', () => {
  const tasks = [
    { taskId: 'cancelled' },
    { taskId: 'node', sourceTaskId: 'cancelled', rerunFromNodeId: 'node-1' },
  ];
  const pending = { id: 'pending-attempt', taskId: 'pending-attempt', status: 'running', sourceTaskId: 'cancelled' };
  assert.deepEqual(collapseFullTaskAttempts(tasks, pending).map((task) => task.taskId), ['node']);
  // 普通发送的 pending 没有 source：不顶掉任何一轮。
  assert.deepEqual(collapseFullTaskAttempts(tasks, { id: 'local-draft', status: 'queued' }).map((task) => task.taskId), ['cancelled', 'node']);
  // workflow 节点重跑不是全量重发：不参与顶替。
  assert.deepEqual(
    collapseFullTaskAttempts(tasks, { id: 'node-run', sourceTaskId: 'cancelled', rerunFromNodeId: 'node-1' })
      .map((task) => task.taskId),
    ['cancelled', 'node'],
  );
  assert.deepEqual(collapseFullTaskAttempts(tasks).map((task) => task.taskId), ['cancelled', 'node']);
});
