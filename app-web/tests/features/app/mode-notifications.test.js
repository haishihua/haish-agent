import test from 'node:test';
import assert from 'node:assert/strict';
import { modeNotification } from '../../../src/features/app/model/mode-notifications.js';
const projects = [
  { executionMode: 'chat', conversations: [{ id: 'chat', tasks: [{ taskId: 'a', status: 'running' }] }] },
  { executionMode: 'bot', conversations: [{ id: 'bot', tasks: [{ taskId: 'b', status: 'running' }] }, { id: 'done', tasks: [{ taskId: 'c', status: 'failed' }] }] },
];
test('mode notices aggregate only the destination mode and do not acknowledge on read', () => {
  const notices = { a: { conversationId: 'chat' }, b: { conversationId: 'done' } };
  assert.deepEqual(modeNotification(projects, notices, 'bot'), { count: 1, needsAction: false });
  assert.deepEqual(modeNotification(projects, notices, 'chat'), { count: 1, needsAction: false });
  assert.equal(Object.keys(notices).length, 2);
  assert.deepEqual(modeNotification(projects, {}, 'bot'), { count: 0, needsAction: false });
});
test('ask_user and approval take priority, deduplicate conversations, and clear with snapshots', () => {
  const input = [{ conversation_id: 'bot', task_id: 'b' }];
  const approvals = [{ conversation_id: 'chat', task_id: 'a' }];
  assert.deepEqual(modeNotification(projects, { b: { conversationId: 'bot' } }, 'bot', input, approvals), { count: 1, needsAction: true });
  assert.deepEqual(modeNotification(projects, {}, 'chat', input, approvals), { count: 1, needsAction: true });
  assert.deepEqual(modeNotification(projects, {}, 'bot', [{ conversation_id: 'done', task_id: 'c' }]), { count: 0, needsAction: false });
});
