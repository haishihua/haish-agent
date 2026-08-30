import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftConversationHandlers } from './createDraftConversationHandlers.js';

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
    authFetch: () => responsePromise,
    conversationIdRef,
    normalizeRuntimeEvents: (events) => events || [],
    taskDetailToRuntimeTask: (task) => task,
    taskRuntimeEventCacheRef: { current: new Map() },
    updateTaskRuntimeState: (updater, targetConversationId) => {
      updates.push({ updater, targetConversationId });
    },
    userIdRef: { current: 'owner' },
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
