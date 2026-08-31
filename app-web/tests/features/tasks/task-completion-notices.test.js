import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTaskCompletionNotice,
  clearConversationCompletionNotices,
  clearTaskCompletionNotice,
  conversationNoticesFromTasks,
  loadTaskCompletionNotices,
  saveTaskCompletionNotices,
  taskNoticesByTaskId,
  terminalTaskNoticeStatus,
} from '../../../src/features/tasks/model/task-completion-notices.js';

test('distinct completed tasks increment the unread count without duplicating receipts', () => {
  let notices = {};
  notices = addTaskCompletionNotice(notices, { conversationId: 'conv-a', taskId: 'task-1', status: 'completed' });
  notices = addTaskCompletionNotice(notices, { conversationId: 'conv-a', taskId: 'task-2', status: 'done' });
  const unchanged = addTaskCompletionNotice(notices, { conversationId: 'conv-a', taskId: 'task-2', status: 'done' });

  assert.equal(Object.keys(notices).length, 2);
  assert.equal(unchanged, notices);
  assert.deepEqual(conversationNoticesFromTasks(notices), { 'conv-a': 'done' });
});

test('clearing one viewed conversation preserves unread tasks in other conversations', () => {
  let notices = {};
  notices = addTaskCompletionNotice(notices, { conversationId: 'conv-a', taskId: 'task-1', status: 'done' });
  notices = addTaskCompletionNotice(notices, { conversationId: 'conv-a', taskId: 'task-2', status: 'failed' });
  notices = addTaskCompletionNotice(notices, { conversationId: 'conv-b', taskId: 'task-3', status: 'cancelled' });

  notices = clearConversationCompletionNotices(notices, 'conv-a');

  assert.equal(Object.keys(notices).length, 1);
  assert.deepEqual(conversationNoticesFromTasks(notices), { 'conv-b': 'cancelled' });
});

test('viewing one of two unread tasks decrements the badge from two to one', () => {
  let notices = {};
  notices = addTaskCompletionNotice(notices, { conversationId: 'conv-a', taskId: 'task-1', status: 'done' });
  notices = addTaskCompletionNotice(notices, { conversationId: 'conv-a', taskId: 'task-2', status: 'failed' });
  notices = clearTaskCompletionNotice(notices, 'conv-a', 'task-1');

  assert.equal(Object.keys(notices).length, 1);
  assert.equal(notices['conv-a:task-2'].status, 'failed');
  assert.deepEqual(taskNoticesByTaskId(notices), { 'task-2': 'failed' });
});

test('only terminal outcomes create notices', () => {
  assert.equal(terminalTaskNoticeStatus('running'), '');
  assert.equal(terminalTaskNoticeStatus('queued'), '');
  assert.equal(terminalTaskNoticeStatus('error'), 'failed');
  assert.equal(terminalTaskNoticeStatus({ status: 'aborted' }), 'cancelled');
  assert.equal(terminalTaskNoticeStatus({ status: 'running', workflowRun: { status: 'cancelled' } }), 'cancelled');
});

test('unread task notices survive a renderer remount', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const notices = addTaskCompletionNotice({}, {
    conversationId: 'conv-a',
    taskId: 'task-1',
    status: 'done',
  });

  saveTaskCompletionNotices(storage, 'test-key', notices);

  assert.deepEqual(loadTaskCompletionNotices(storage, 'test-key'), notices);
});
