import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkflowTask } from '../../../src/features/conversations/model/default-workflow-task.js';
const task = (taskId, status, updatedAt) => ({ taskId, status, updatedAt });
const workspace = (tasks) => ({ projects: [{ id: 'p', executionMode: 'bot', conversations: tasks.map((t, i) => ({ id: `c${i}`, executionMode: 'bot', tasks: [t] })) }] });
const pick = (tasks, runtime = () => null) => defaultWorkflowTask(workspace(tasks), runtime, t => t.updatedAt);
test('running task wins over newer completed task and list order', () => {
  assert.equal(pick([task('old', 'completed', 1), task('live', 'running', 2), task('new', 'completed', 3)]).task.taskId, 'live');
});
test('latest task wins when none are active; newest active wins otherwise', () => {
  assert.equal(pick([task('a', 'completed', 1), task('b', 'failed', 3)]).task.taskId, 'b');
  assert.equal(pick([task('a', 'running', 1), task('b', 'running', 3)]).task.taskId, 'b');
});
test('fresh runtime overrides stale running summary', () => {
  assert.equal(pick([task('a', 'running', 1), task('b', 'completed', 3)], id => id === 'c0' ? { taskRuntimeState: { tasksById: { a: task('a', 'completed', 2) } } } : null).task.taskId, 'b');
});
test('chat tasks excluded and empty workspace supported', () => {
  assert.equal(defaultWorkflowTask({ projects: [{ executionMode: 'chat', conversations: [{ id: 'c', tasks: [task('x', 'running', 9)] }] }] }, () => null, t => t.updatedAt), null);
  assert.equal(pick([]), null);
});
