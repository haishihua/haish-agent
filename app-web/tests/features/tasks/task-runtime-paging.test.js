import test from 'node:test';
import assert from 'node:assert/strict';

// The task-runtime model chain reaches shared/api/base.js, which reads window.
globalThis.window = globalThis.window || {};
const {
  EARLIER_TASK_RUNTIME_PAGE_SIZE,
  INITIAL_TASK_RUNTIME_RESTORE_COUNT,
  STALE_TASK_RUNTIME_REBUILD_LIMIT,
  nextEarlierTaskRuntimeIds,
  pendingTaskRuntimeIds,
  splitTaskRuntimeRestoreOrder,
  staleTaskRuntimeIds,
} = await import('../../../src/features/tasks/model/task-runtime-paging.js');
const {
  runtimeTaskToQuest,
  taskDetailToRuntimeTask,
  taskSummaryToRuntimeTask,
} = await import('../../../src/features/tasks/model/task-runtime.js');
const {
  settledTaskIds,
} = await import('../../../src/features/conversations/model/conversation-run-state.js');
const {
  isTaskSettled,
} = await import('../../../src/features/conversations/model/conversation-status.js');
const {
  mergeConversationTasks,
} = await import('../../../src/features/conversations/model/workspace-state.js');

const summary = (status = 'done') => ({ status, runtimeHydrated: false });
const hydrated = (status = 'done') => ({ status, runtimeHydrated: true });
const live = (status = 'running') => ({ status });
// 同一轮对话的两份拷贝：面板渲染的本地运行时拷贝 + 服务端列表拷贝。
const runtimeCopy = (taskId, extra = {}) => ({ taskId, status: 'running', title: `task ${taskId}`, ...extra });
const listCopy = (taskId, status, extra = {}) => ({ task_id: taskId, status, title: `task ${taskId}`, ...extra });

test('only the newest tasks are hydrated when a conversation opens', () => {
  const { initialIds, deferredIds } = splitTaskRuntimeRestoreOrder(['task-6', 'task-5', 'task-4', 'task-3', 'task-2', 'task-1']);
  assert.equal(INITIAL_TASK_RUNTIME_RESTORE_COUNT, 3);
  assert.deepEqual(initialIds, ['task-6', 'task-5', 'task-4']);
  assert.deepEqual(deferredIds, ['task-3', 'task-2', 'task-1']);
});

test('a conversation shorter than one page hydrates every task', () => {
  const { initialIds, deferredIds } = splitTaskRuntimeRestoreOrder(['task-3', 'task-2', 'task-1']);
  assert.deepEqual(initialIds, ['task-3', 'task-2', 'task-1']);
  assert.deepEqual(deferredIds, []);
});

test('restore order split tolerates duplicates, gaps, and a custom page size', () => {
  assert.deepEqual(splitTaskRuntimeRestoreOrder(['a', 'a', null, 'b']).initialIds, ['a', 'b']);
  assert.deepEqual(splitTaskRuntimeRestoreOrder([], {}).initialIds, []);
  assert.deepEqual(splitTaskRuntimeRestoreOrder(null).deferredIds, []);
  assert.deepEqual(
    splitTaskRuntimeRestoreOrder(['a', 'b', 'c'], { initialCount: 2 }).deferredIds,
    ['c'],
  );
});

test('older tasks are hydrated in pages that walk up from the loaded window', () => {
  const order = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6'];
  assert.equal(EARLIER_TASK_RUNTIME_PAGE_SIZE, 3);
  const tasksById = Object.fromEntries(order.map((taskId) => [taskId, summary()]));
  tasksById['task-6'] = hydrated();

  assert.deepEqual(nextEarlierTaskRuntimeIds(order, tasksById), ['task-3', 'task-4', 'task-5']);

  for (const taskId of ['task-3', 'task-4', 'task-5']) tasksById[taskId] = hydrated();
  assert.deepEqual(nextEarlierTaskRuntimeIds(order, tasksById), ['task-1', 'task-2']);

  for (const taskId of ['task-1', 'task-2']) tasksById[taskId] = hydrated();
  assert.deepEqual(nextEarlierTaskRuntimeIds(order, tasksById), []);
});

test('live and missing tasks are never queued for hydration', () => {
  const order = ['task-1', 'task-2', 'task-3', 'task-4'];
  const tasksById = {
    'task-1': summary('cancelled'),
    'task-2': live(),
    'task-3': live('queued'),
    'task-4': summary('done'),
  };
  assert.deepEqual(pendingTaskRuntimeIds(order, tasksById), ['task-1', 'task-4']);
  assert.deepEqual(pendingTaskRuntimeIds(['task-missing'], tasksById), []);
  assert.deepEqual(pendingTaskRuntimeIds(null, tasksById), []);
});

test('summary-only state is exactly the marker the paging logic keys on', () => {
  const detail = {
    task_id: 'task-1',
    conversation_id: 'conversation-1',
    title: 'Summarized turn',
    status: 'done',
    created_at: '2026-09-12T00:00:00.000Z',
    updated_at: '2026-09-12T00:00:01.000Z',
  };
  const summaryTask = taskSummaryToRuntimeTask(detail, []);
  const hydratedTask = taskDetailToRuntimeTask({ ...detail, events: [] }, summaryTask);
  assert.equal(summaryTask.runtimeHydrated, false);
  assert.equal(hydratedTask.runtimeHydrated, true);
  assert.deepEqual(
    pendingTaskRuntimeIds(['task-1'], { 'task-1': summaryTask }),
    ['task-1'],
  );
  assert.deepEqual(
    pendingTaskRuntimeIds(['task-1'], { 'task-1': hydratedTask }),
    [],
  );
});

// 过期拷贝：列表说这一轮收工了，面板手上那份本地拷贝却还停在半路。所有轮询路径都只
// 盯「列表说还活着」的任务，所以这份拷贝再也没人碰——不重建的话，界面上就是一条
// 「已收工、却没有正文」的空气泡。

test('a runtime copy that is still live while the list copy settled is stale', () => {
  const settled = settledTaskIds([
    runtimeCopy('task-1', { eventLog: [{ type: 'tool_call_completed' }] }),
    listCopy('task-1', 'done', { completed_at: '2026-09-17T01:57:25Z' }),
  ]);
  assert.deepEqual([...settled], ['task-1']);
  assert.deepEqual(
    staleTaskRuntimeIds(['task-1'], { 'task-1': runtimeCopy('task-1') }, settled),
    ['task-1'],
  );
});

test('the judge must read the directory copy: merging can hide its landed marker', () => {
  // 面板渲染用的那份 task 列表是 mergeConversationTasks 的产物：本地拷贝覆写 status /
  // completedAt，目录（服务端列表）写下的「已落地」就没了——只剩 serverFinished 漏过来，
  // 而它只认 done / failed / cancelled，历史别名不算（真实列表里就有 completed 的老任务）。
  const directoryTask = taskSummaryToRuntimeTask({
    task_id: 'task-1',
    conversation_id: 'conversation-1',
    title: 'Legacy turn',
    status: 'completed',
    created_at: '2026-07-16T08:59:43.000Z',
    updated_at: '2026-07-16T08:59:43.000Z',
    completed_at: '2026-07-16T08:59:43.000Z',
  }, []);
  const runtimeTask = runtimeCopy('task-1');
  const [merged] = mergeConversationTasks([directoryTask], [runtimeTaskToQuest(runtimeTask)]);

  assert.equal(isTaskSettled(directoryTask), true);
  assert.equal(isTaskSettled(runtimeTask), false);
  assert.equal(merged.status, 'running');
  assert.equal(merged.completedAt, undefined);
  assert.equal(merged.serverFinished, false);
  assert.equal(isTaskSettled(merged), false, '合并后的拷贝不能拿来判收工：它把目录的落地标记盖掉了');

  // 两份权威拷贝（运行时 + 目录）一起判才对：这一轮就算收工，而且这份拷贝要重建。
  const settled = settledTaskIds([runtimeTask, directoryTask]);
  assert.deepEqual([...settled], ['task-1']);
  assert.deepEqual(staleTaskRuntimeIds(['task-1'], { 'task-1': runtimeTask }, settled), ['task-1']);
});

test('a turn nobody has settled yet is not stale (no rebuild while a run is going)', () => {
  const settled = settledTaskIds([
    runtimeCopy('task-1'),
    listCopy('task-1', 'running'),
  ]);
  assert.deepEqual([...settled], []);
  assert.deepEqual(staleTaskRuntimeIds(['task-1'], { 'task-1': runtimeCopy('task-1') }, settled), []);
});

test('a copy that landed its own terminal state is not stale', () => {
  const finished = runtimeCopy('task-1', { status: 'done', completedAt: 1_789_610_245_642 });
  const settled = settledTaskIds([finished, listCopy('task-1', 'done')]);
  assert.deepEqual([...settled], ['task-1']);
  assert.deepEqual(staleTaskRuntimeIds(['task-1'], { 'task-1': finished }, settled), []);
  // 落地标记自己就够：status 还挂着 running 也不算停半路。
  assert.deepEqual(
    staleTaskRuntimeIds(['task-1'], { 'task-1': runtimeCopy('task-1', { completedAt: 1 }) }, settled),
    [],
  );
});

test('a copy parked on a status nobody treats as live is rebuilt, not trusted', () => {
  // 判「停半路」问的是「这份拷贝自己收工了没」，不是「状态串看着像在跑」：本地写着列表判据
  // 不认识的中间态时宁可多问一次服务端，也不能拿一份停在半路的拷贝当终态。
  const parked = runtimeCopy('task-1', { status: 'waiting_input' });
  const settled = settledTaskIds([
    parked,
    listCopy('task-1', 'done', { completed_at: '2026-09-17T01:57:25Z' }),
  ]);
  assert.deepEqual([...settled], ['task-1']);
  assert.deepEqual(staleTaskRuntimeIds(['task-1'], { 'task-1': parked }, settled), ['task-1']);
});

test('stale ids tolerate missing copies, page like the rest, and skip what was rebuilt', () => {
  const order = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5'];
  const tasksById = Object.fromEntries(order.map((taskId) => [taskId, runtimeCopy(taskId)]));
  const settled = new Set(order);

  assert.equal(STALE_TASK_RUNTIME_REBUILD_LIMIT, 3);
  // 默认只发一页（最新的那几条）。
  assert.deepEqual(staleTaskRuntimeIds(order, tasksById, settled), ['task-3', 'task-4', 'task-5']);
  assert.deepEqual(staleTaskRuntimeIds(order, tasksById, settled, { limit: 2 }), ['task-4', 'task-5']);
  assert.deepEqual(staleTaskRuntimeIds(order, tasksById, new Set(['task-2'])), ['task-2']);
  assert.deepEqual(staleTaskRuntimeIds(['task-missing'], tasksById, new Set(['task-missing'])), []);
  assert.deepEqual(staleTaskRuntimeIds(null, null, null), []);
});

test('a copy that never reconciles steps aside instead of hogging the page', () => {
  // 用户报的问题的同一条链：列表说收工、本地拷贝停在半路。重建一次仍没对上（服务端
  // 说它还在跑）的那几条不能一直占着名额——否则更早的半路拷贝永远排不到，空气泡
  // 就这么留在时间线上。
  const order = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5'];
  const tasksById = Object.fromEntries(order.map((taskId) => [taskId, runtimeCopy(taskId)]));
  const settled = new Set(order);

  assert.deepEqual(
    staleTaskRuntimeIds(order, tasksById, settled, { attemptedIds: new Set(['task-5', 'task-4']) }),
    ['task-1', 'task-2', 'task-3'],
  );
  // 一页名额全被重修过的那几条占着时，要接着排更早的——而不是这一轮什么都不做。
  assert.deepEqual(
    staleTaskRuntimeIds(order, tasksById, settled, { attemptedIds: ['task-3', 'task-4', 'task-5'] }),
    ['task-1', 'task-2'],
  );
  // 全部都重建过：这一轮什么都不做，下一次状态变化再说（不会来回打转）。
  assert.deepEqual(staleTaskRuntimeIds(order, tasksById, settled, { attemptedIds: order }), []);
});
