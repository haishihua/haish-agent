import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeployTargetConversationId } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

test('an unsent draft is the only deployment target even if polling selected another conversation', () => {
  assert.equal(resolveDeployTargetConversationId({
    draftConversation: { id: 'draft-zhanruitao', projectId: 'project-zhanruitao' },
    selectedConversationId: 'default-conversation',
    currentConversationId: 'draft-zhanruitao',
  }), 'draft-zhanruitao');
});

test('an existing conversation uses the selected sidebar conversation', () => {
  assert.equal(resolveDeployTargetConversationId({
    draftConversation: null,
    selectedConversationId: 'selected-conversation',
    currentConversationId: 'previous-conversation',
  }), 'selected-conversation');
});
