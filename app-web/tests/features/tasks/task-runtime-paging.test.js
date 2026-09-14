import test from 'node:test';
import assert from 'node:assert/strict';

// The task-runtime model chain reaches shared/api/base.js, which reads window.
globalThis.window = globalThis.window || {};
const {
  EARLIER_TASK_RUNTIME_PAGE_SIZE,
  INITIAL_TASK_RUNTIME_RESTORE_COUNT,
  nextEarlierTaskRuntimeIds,
  pendingTaskRuntimeIds,
  splitTaskRuntimeRestoreOrder,
} = await import('../../../src/features/tasks/model/task-runtime-paging.js');
const {
  taskDetailToRuntimeTask,
  taskSummaryToRuntimeTask,
} = await import('../../../src/features/tasks/model/task-runtime.js');

const summary = (status = 'done') => ({ status, runtimeHydrated: false });
const hydrated = (status = 'done') => ({ status, runtimeHydrated: true });
const live = (status = 'running') => ({ status });

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
