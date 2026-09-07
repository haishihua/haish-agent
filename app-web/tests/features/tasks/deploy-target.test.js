import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeployHandlers, resolveDeployTargetConversationId } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

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

test('unready or mismatched conversation sends are rejected without queueing or steering another task', () => {
  for (const scenario of [
    { selected: 'new', current: 'old', ready: true, shellSeeded: false },
    { selected: 'new', current: 'new', ready: false, shellSeeded: false },
    { selected: 'new', current: 'new', ready: true, shellSeeded: true },
  ]) {
    const notices = [];
    const handlers = createDeployHandlers({
      draftConversationRef: { current: null },
      conversationIdRef: { current: scenario.current },
      selectedConversationId: scenario.selected,
      conversationReady: scenario.ready,
      viewModeRef: { current: 'chat' },
      getRuntime: () => ({ shellSeeded: scenario.shellSeeded, busy: true, activeTaskId: 'old-task' }),
      showToast: (...args) => notices.push(args),
      setQueuedDeploy: () => assert.fail('must not silently queue'),
      queueTaskInput: () => assert.fail('must not steer previous conversation'),
    });
    assert.equal(handlers.handleDeploy('keep this draft'), false);
    assert.match(notices[0][1], /has not been sent/);
  }
});
