import test from 'node:test';
import assert from 'node:assert/strict';
import { selectActiveAskUserItemId, selectPendingUserInput } from '../../../src/features/chat/model/pending-user-input.js';

const scope = {
  active: true,
  conversationId: 'conversation-1',
  taskId: 'task-1',
  toolCallId: 'tool-call-id',
  toolInput: {
    context: 'Choose one',
    questions: [{ id: 'choice', question: 'Which option?' }],
  },
};

test('ask_user falls back from transformed call ids only inside the active task', () => {
  const expected = {
    request_id: 'request-1',
    conversation_id: 'conversation-1',
    task_id: 'task-1',
    tool_call_id: 'provider-call-id',
    context: 'Choose one',
    questions: [{ id: 'choice', question: 'Which option?' }],
  };
  const unrelated = {
    ...expected,
    request_id: 'request-2',
    conversation_id: 'conversation-2',
    task_id: 'task-2',
  };

  assert.equal(selectPendingUserInput([unrelated, expected], scope), expected);
  assert.equal(selectPendingUserInput([unrelated], scope), null);
});

test('ask_user uses the workflow task as its stable scope when the technical conversation is hidden', () => {
  const expected = {
    request_id: 'request-1',
    conversation_id: 'backend-conversation',
    task_id: 'task-1',
    tool_call_id: 'tool-call-id',
    questions: [{ id: 'choice', question: 'Which option?' }],
  };

  assert.equal(selectPendingUserInput([expected], { ...scope, conversationId: '' }), expected);
  assert.equal(selectPendingUserInput([expected], { ...scope, conversationId: 'stale-conversation' }), expected);
});

test('ask_user refuses an ambiguous pair of requests in the same task', () => {
  const requests = ['one', 'two'].map((id) => ({
    request_id: id,
    conversation_id: 'conversation-1',
    task_id: 'task-1',
    tool_call_id: `provider-${id}`,
    context: id,
    questions: [{ id, question: id }],
  }));

  assert.equal(selectPendingUserInput(requests, { ...scope, toolInput: null }), null);
});

test('only the latest ask_user item owns the pending form', () => {
  const items = [
    { id: 'old', kind: 'tool', toolName: 'ask_user', status: 'done' },
    { id: 'read', kind: 'tool', toolName: 'read_file', status: 'done' },
    { id: 'current', kind: 'tool', toolName: 'ask_user', status: 'done' },
  ];

  assert.equal(selectActiveAskUserItemId(items, true), 'current');
  assert.equal(selectActiveAskUserItemId(items, false), '');
  assert.equal(selectActiveAskUserItemId([{ ...items[2], status: 'running' }], false), 'current');
});
