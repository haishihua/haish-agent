import test from 'node:test';
import assert from 'node:assert/strict';
import { questsFromRuntimeState, runtimeCurrentTaskFor } from '../../../src/features/app/model/shell-derived-state.js';

for (const executionMode of ['chat', 'bot']) {
  test(`${executionMode}: submission does not replace the confirmed task or enter its list`, () => {
    const task = { id: 'confirmed', taskId: 'confirmed', title: 'Previous task', status: 'done', executionMode };
    const state = { activeTaskId: null, taskOrder: ['confirmed'], tasksById: { confirmed: task }, pendingTask: null, submission: { requestId: 'sending', payload: { title: 'Not accepted' } } };
    assert.equal(runtimeCurrentTaskFor(state), task);
    assert.equal(questsFromRuntimeState(state).length, 1);
    state.submission = null;
    assert.equal(runtimeCurrentTaskFor(state), task);
    assert.equal(questsFromRuntimeState(state).length, 1);
  });
}
test('first submission has no task before server acceptance', () => {
  const state = { activeTaskId: null, taskOrder: [], tasksById: {}, pendingTask: null, submission: { requestId: 'sending', payload: {} } };
  assert.equal(runtimeCurrentTaskFor(state), null);
  assert.deepEqual(questsFromRuntimeState(state), []);
});
