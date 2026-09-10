import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseFullTaskAttempts } from '../../../src/features/chat/model/task-attempts.js';

globalThis.window = {};
const { createAttemptHarness } = await import('../../fixtures/task-attempt-runtime.js');
const { createConversationHandlers } = await import('../../../src/features/conversations/hooks/createConversationHandlers.js');

const sourceTurn = () => ({ taskId: 'source', conversationId: 'conversation', userMessageId: 'original-user',
  title: 'Old message', displayText: 'Old message', requestText: 'Old message', status: 'cancelled', originViewMode: 'chat' });

test('edited text replaces every display projection while preserving the source turn', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source);
  await harness.executeQuest(source, source.conversationId, { attempt: 'edit', message: 'Revised message', requestId: 'edit-request' });
  assert.equal(harness.requests[0].body.message, 'Revised message');
  assert.match(harness.requests[0].url, /edit-and-resend\/stream$/);
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
  assert.equal(harness.runtime.taskRuntimeState.tasksById['confirmed-attempt'].displayText, source.displayText);
});

test('a rejected edit restores the original turn and removes the temporary attempt', async () => {
  const source = sourceTurn();
  const harness = createAttemptHarness(source, { reject: true });
  await assert.rejects(harness.executeQuest(source, source.conversationId, { attempt: 'edit', message: 'Keep my draft', requestId: 'rejected-edit' }), /not been sent/);
  assert.deepEqual(harness.runtime.taskRuntimeState.taskOrder, [source.taskId]);
  assert.equal(harness.runtime.taskRuntimeState.pendingTask, null);
  assert.equal(harness.runtime.taskRuntimeState.tasksById.source, source);
  assert.equal(harness.runtime.busy, false);
  assert.equal(harness.runtime.fetchController, null);
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
