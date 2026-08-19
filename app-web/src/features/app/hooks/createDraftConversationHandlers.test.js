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
  const liveSnapshots = [];
  const conversationIdRef = { current: 'workflow-conversation' };
  const handlers = createDraftConversationHandlers({
    API_BASE: 'http://runtime',
    authFetch: () => responsePromise,
    buildAgentLiveSnapshot: () => ({ restored: true }),
    conversationIdRef,
    normalizeWorldEvents: (events) => events || [],
    setAgentLive: (value) => liveSnapshots.push(value),
    taskDetailToRuntimeTask: (task) => task,
    taskRuntimeEventCacheRef: { current: new Map() },
    updateWorldTaskState: (updater, targetConversationId) => {
      updates.push({ updater, targetConversationId });
    },
    userIdRef: { current: 'owner' },
  });
  return { conversationIdRef, handlers, liveSnapshots, updates };
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
  assert.deepEqual(harness.liveSnapshots, []);
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
  assert.deepEqual(harness.liveSnapshots, [{ restored: true }]);
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
  assert.deepEqual(harness.liveSnapshots, []);
});
