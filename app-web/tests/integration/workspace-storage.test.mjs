import assert from 'node:assert/strict';
import test from 'node:test';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

globalThis.window = {
  localStorage: storage(),
  sessionStorage: storage(),
  dispatchEvent: () => true,
};

const workspace = await import('../../src/features/conversations/model/workspace-state.js');

test('workspace and active conversation caches are isolated by owner', () => {
  const ownerId = 'owner-a';
  const state = workspace.createEmptyWorkspaceState();
  state.projects[0].conversations = [{ id: 'conversation-a', name: 'A', tasks: [] }];
  state.activeConversationId = 'conversation-a';
  workspace.saveWorkspaceState(ownerId, state);
  workspace.setStoredConversationId(ownerId, 'conversation-a');

  assert.equal(workspace.loadStoredWorkspaceState(ownerId).activeConversationId, 'conversation-a');
  assert.equal(workspace.getStoredConversationId(ownerId), 'conversation-a');
  assert.equal(workspace.loadStoredWorkspaceState('owner-b').activeConversationId, null);
  assert.equal(workspace.getStoredConversationId('owner-b'), null);
});

test('backend projects override stale local pin and ordering data', () => {
  const previous = workspace.createEmptyWorkspaceState();
  previous.projects = [
    {
      ...workspace.createDefaultProject(),
      pinned: true,
      sortOrder: 99,
      conversations: [{
        id: 'default-conversation',
        executionMode: 'chat',
        pinned: true,
        sortOrder: 99,
        tasks: [{ taskId: 'cached-task' }],
      }],
    },
    {
      id: 'custom-project',
      conversations: [],
      pinned: false,
      sortOrder: 0,
    },
  ];
  previous.activeConversationId = 'default-conversation';

  const restored = workspace.buildWorkspaceStateFromProjects([
    {
      project_id: 'custom-project',
      execution_mode: 'chat',
      name: 'Custom',
      pinned: true,
      sort_order: 0,
      conversations: [],
    },
    {
      project_id: 'default-project-chat',
      execution_mode: 'chat',
      name: 'Default project',
      is_default: true,
      pinned: false,
      sort_order: 1,
      conversations: [{
        conversation_id: 'default-conversation',
        execution_mode: 'chat',
        pinned: false,
        sort_order: 0,
      }],
    },
  ], previous);

  assert.deepEqual(restored.projects.map((project) => project.id), [
    'custom-project',
    'default-project-chat',
  ]);
  const conversation = workspace.findConversationById(restored, 'default-conversation');
  assert.equal(conversation.pinned, false);
  assert.equal(conversation.sortOrder, 0);
  assert.deepEqual(conversation.tasks, [{ taskId: 'cached-task' }]);
});

test('stored workspace payload excludes backend-owned pin and ordering fields', () => {
  const compact = workspace.compactWorkspaceStateForStorage({
    activeProjectId: 'default-project-chat',
    activeConversationId: 'conversation',
    projects: [{
      ...workspace.createDefaultProject(),
      pinned: true,
      sortOrder: 7,
      conversations: [{
        id: 'conversation',
        executionMode: 'chat',
        pinned: true,
        sortOrder: 8,
        tasks: [],
      }],
    }],
  });

  assert.equal('pinned' in compact.projects[0], false);
  assert.equal('sortOrder' in compact.projects[0], false);
  assert.equal('pinned' in compact.projects[0].conversations[0], false);
  assert.equal('sortOrder' in compact.projects[0].conversations[0], false);
});
