import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftConversationHandlers } from '../../../src/features/conversations/hooks/createDraftConversationHandlers.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createRuntimeRestoreHarness(responsePromise) {
  const updates = [];
  const conversationIdRef = { current: 'workflow-conversation' };
  const handlers = createDraftConversationHandlers({
    API_BASE: 'http://runtime',
    apiFetch: () => responsePromise,
    conversationIdRef,
    normalizeRuntimeEvents: (events) => events || [],
    taskDetailToRuntimeTask: (task) => task,
    taskRuntimeEventCacheRef: { current: new Map() },
    taskRuntimeFetchesRef: { current: new Map() },
    updateTaskRuntimeState: (updater, targetConversationId) => {
      updates.push({ updater, targetConversationId });
    },
  });
  return { conversationIdRef, handlers, updates };
}

test('stale task restore cannot update the newly active conversation', async () => {
  const response = deferred();
  const harness = createRuntimeRestoreHarness(response.promise);
  const restore = harness.handlers.restoreLatestTaskRuntime('workflow-task', {
    targetConversationId: 'workflow-conversation',
    isCurrentActivation: () => harness.conversationIdRef.current === 'workflow-conversation',
  });

  harness.conversationIdRef.current = 'agent-conversation';
  response.resolve({
    ok: true,
    json: async () => ({
      task_id: 'workflow-task',
      conversation_id: 'workflow-conversation',
      events: [],
    }),
  });
  await restore;

  assert.deepEqual(harness.updates, []);
});

test('task restore writes only to the declared owning conversation', async () => {
  const harness = createRuntimeRestoreHarness(Promise.resolve({
    ok: true,
    json: async () => ({
      task_id: 'workflow-task',
      conversation_id: 'workflow-conversation',
      events: [],
    }),
  }));

  await harness.handlers.restoreLatestTaskRuntime('workflow-task', {
    targetConversationId: 'workflow-conversation',
    isCurrentActivation: () => true,
  });

  assert.equal(harness.updates.length, 1);
  assert.equal(harness.updates[0].targetConversationId, 'workflow-conversation');
});

test('task restore rejects a task owned by another conversation', async () => {
  const harness = createRuntimeRestoreHarness(Promise.resolve({
    ok: true,
    json: async () => ({
      task_id: 'workflow-task',
      conversation_id: 'agent-conversation',
      events: [],
    }),
  }));

  await assert.rejects(
    harness.handlers.restoreLatestTaskRuntime('workflow-task', {
      targetConversationId: 'workflow-conversation',
      isCurrentActivation: () => true,
    }),
    /does not belong to conversation workflow-conversation/,
  );
  assert.deepEqual(harness.updates, []);
});

test('draft materialization rejects a server conversation from another project', async () => {
  const handlers = createDraftConversationHandlers({
    conversationId: 'draft-1',
    conversationIdRef: { current: 'draft-1' },
    draftConversationRef: {
      current: {
        id: 'draft-1',
        projectId: 'project-zhanruitao',
        name: 'New Conversation',
      },
    },
    pendingCreatedDetailRef: {
      current: {
        conversation_id: 'server-conversation',
        project_id: 'default-project-chat',
        title: 'Existing title',
      },
    },
    isDefaultConversationName: () => false,
    titleFromTaskText: () => 'New task',
  });

  await assert.rejects(
    handlers.materializeDraftConversationForSend({ text: 'New task' }),
    /draft conversation project mismatch/,
  );
});

test('concurrent task polls share one request and restore a missing task into task order', async () => {
  const response = deferred();
  let requestCount = 0;
  let runtimeState = {
    activeTaskId: null,
    pendingTask: null,
    taskOrder: [],
    tasksById: {},
  };
  const handlers = createDraftConversationHandlers({
    API_BASE: 'http://runtime',
    apiFetch: () => {
      requestCount += 1;
      return response.promise;
    },
    conversationIdRef: { current: 'conversation-1' },
    isTaskActuallyActive: (task) => task.status === 'running',
    normalizeRuntimeEvents: (events) => events || [],
    taskDetailToRuntimeTask: (task) => ({ taskId: task.task_id, status: task.status }),
    taskRuntimeEventCacheRef: { current: new Map() },
    taskRuntimeFetchesRef: { current: new Map() },
    updateTaskRuntimeState: (updater) => { runtimeState = updater(runtimeState); },
  });

  const first = handlers.restoreLatestTaskRuntime('task-1', {
    targetConversationId: 'conversation-1',
    isCurrentActivation: () => true,
  });
  const second = handlers.restoreLatestTaskRuntime('task-1', {
    targetConversationId: 'conversation-1',
    isCurrentActivation: () => true,
  });
  response.resolve({
    ok: true,
    json: async () => ({
      task_id: 'task-1',
      conversation_id: 'conversation-1',
      status: 'running',
      events: [],
    }),
  });
  await Promise.all([first, second]);

  assert.equal(requestCount, 1);
  assert.deepEqual(runtimeState.taskOrder, ['task-1']);
  assert.equal(runtimeState.activeTaskId, 'task-1');
});
