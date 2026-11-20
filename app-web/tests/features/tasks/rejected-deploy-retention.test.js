import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

test('rejected submissions are removed without creating local failed tasks', () => {
  let state = { tasksById: {}, taskOrder: [], pendingTask: null, submission: null };
  let flushed = 0;
  const handlers = createDeployHandlers({
    updateTaskRuntimeState: fn => { state = fn(state); },
    flushRuntimeTasksToWorkspace: () => { flushed++; },
  });
  for (const id of ['attempt-1', 'attempt-2']) {
    const payload = { id, requestText: 'with image', executionMode: 'bot' };
    state.submission = { requestId: id, payload };
    handlers.failPendingDeploy({ runtimeConversationId: 'conversation', pendingTask: payload });
    assert.equal(state.submission, null);
  }
  assert.deepEqual(state.taskOrder, []);
  assert.deepEqual(state.tasksById, {});
  assert.equal(flushed, 0);
});

test('an old rejection cannot clear a newer submission', () => {
  const newer = { requestId: 'new', payload: { id: 'new' } };
  let state = { submission: newer };
  const handlers = createDeployHandlers({ updateTaskRuntimeState: fn => { state = fn(state); }, flushRuntimeTasksToWorkspace: () => {} });
  handlers.failPendingDeploy({ runtimeConversationId: 'conversation', pendingTask: { id: 'old' } });
  assert.equal(state.submission, newer);
});

test('stopping an upload-only submission clears transport state without inventing a task', () => {
  const controller = new AbortController();
  const rt = { taskRuntimeState: { tasksById: {}, taskOrder: [], submission: { requestId: 'upload', payload: { id: 'upload' } } },
    busy: true, fetchController: controller, cancelledRunIds: new Set() };
  const handlers = createDeployHandlers({
    conversationIdRef: { current: 'draft-upload' }, draftConversationRef: { current: { id: 'draft-upload' } },
    getRuntime: () => rt, mutateRuntime: (_, fn) => fn(rt),
    updateTaskRuntimeState: fn => { rt.taskRuntimeState = fn(rt.taskRuntimeState); },
    isTaskActuallyActive: () => false, taskUpdatedTimestamp: () => 0,
    flushRuntimeTasksToWorkspace: () => {},
  });
  handlers.handleStop();
  assert.equal(controller.signal.aborted, true);
  assert.equal(rt.taskRuntimeState.submission, null);
  assert.equal(rt.busy, false);
  assert.deepEqual(rt.taskRuntimeState.taskOrder, []);
});
