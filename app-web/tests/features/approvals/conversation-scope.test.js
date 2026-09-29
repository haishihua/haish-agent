import test from 'node:test';
import assert from 'node:assert/strict';

import {
  requestBelongsToConversation,
  selectConversationApprovalRequests,
} from '../../../src/features/approvals/model/approval-store.js';

const requests = [
  { request_id: 'tool-a', conversation_id: 'conversation-a', type: 'approval_requested' },
  { request_id: 'computer-a', conversation_id: 'conversation-a', type: 'computer_runtime_install_required' },
  { request_id: 'browser-b', conversation_id: 'conversation-b', type: 'browser_runtime_install_required' },
  { request_id: 'unscoped', type: 'approval_requested' },
];

test('approval and runtime requests are strictly scoped to their owning conversation', () => {
  assert.deepEqual(
    selectConversationApprovalRequests(requests, 'conversation-a').map((request) => request.request_id),
    ['tool-a', 'computer-a'],
  );
  assert.deepEqual(
    selectConversationApprovalRequests(requests, 'conversation-b').map((request) => request.request_id),
    ['browser-b'],
  );
});

test('unscoped interactions never fall back into an arbitrary chat', () => {
  assert.equal(requestBelongsToConversation(requests[3], 'conversation-a'), false);
  assert.deepEqual(selectConversationApprovalRequests(requests, ''), []);
});

test('switching away only changes the projection and switching back restores it', () => {
  assert.deepEqual(selectConversationApprovalRequests(requests, 'conversation-b'), [requests[2]]);
  assert.deepEqual(selectConversationApprovalRequests(requests, 'conversation-a'), [requests[0], requests[1]]);
});
