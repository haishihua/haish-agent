import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTaskCompletionNotice,
  clearConversationCompletionNotices,
  clearReadTaskCompletionNotices,
  clearTaskCompletionNotice,
  conversationNoticesFromTasks,
  loadTaskCompletionNotices,
  mergeConversationReadCursors,
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

test('shared read cursors merge monotonically', () => {
  const current = { 'conv-a': 2000 };
  assert.equal(mergeConversationReadCursors(current, { 'conv-a': 1000 }), current);
  assert.deepEqual(mergeConversationReadCursors(current, {
    'conv-a': 3000,
    'conv-b': 1500,
    broken: Number.NaN,
  }), { 'conv-a': 3000, 'conv-b': 1500 });
});

test('shared read cursors clear only notices that had already settled', () => {
  let notices = {};
  notices = addTaskCompletionNotice(notices, {
    conversationId: 'conv-a', taskId: 'task-old', status: 'done', settledAt: 1000,
  });
  notices = addTaskCompletionNotice(notices, {
    conversationId: 'conv-a', taskId: 'task-new', status: 'done', settledAt: 3000,
  });
  notices = addTaskCompletionNotice(notices, {
    conversationId: 'conv-b', taskId: 'task-other', status: 'failed', settledAt: 1000,
  });

  const remaining = clearReadTaskCompletionNotices(notices, { 'conv-a': 2000 });
  assert.deepEqual(Object.keys(remaining).sort(), ['conv-a:task-new', 'conv-b:task-other']);
  assert.equal(clearReadTaskCompletionNotices(remaining, { 'conv-a': 1500 }), remaining);
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
