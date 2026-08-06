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

const auth = await import('../src/api/auth.js');
const workspace = await import('../src/lib/workspace-state.js');

function signIn(id) {
  auth.saveAuthSession({
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    user: { id },
  });
}

test('workspace and active conversation caches are isolated by user', () => {
  signIn('user-a');
  const first = workspace.createEmptyWorkspaceState();
  first.projects[0].conversations = [{ id: 'conversation-a', name: 'A', tasks: [] }];
  first.activeConversationId = 'conversation-a';
  workspace.saveWorkspaceState(first);
  workspace.setStoredConversationId('conversation-a');

  signIn('user-b');
  assert.deepEqual(workspace.loadStoredWorkspaceState(), workspace.createEmptyWorkspaceState());
  assert.equal(workspace.getStoredConversationId(), null);

  const second = workspace.createEmptyWorkspaceState();
  second.projects[0].conversations = [{ id: 'conversation-b', name: 'B', tasks: [] }];
  second.activeConversationId = 'conversation-b';
  workspace.saveWorkspaceState(second);
  workspace.setStoredConversationId('conversation-b');

  signIn('user-a');
  assert.equal(workspace.loadStoredWorkspaceState().activeConversationId, 'conversation-a');
  assert.equal(workspace.getStoredConversationId(), 'conversation-a');
});

test('server summaries restore missing conversations without discarding cached tasks', () => {
  const previous = workspace.createEmptyWorkspaceState();
  previous.projects[0].conversations = [{
    id: 'conversation-a',
    name: 'Cached title',
    tasks: [{ taskId: 'task-a' }],
  }];
  previous.activeConversationId = 'conversation-a';

  const restored = workspace.buildWorkspaceStateFromConversationDetails([
    { conversation_id: 'conversation-a', title: 'Server title' },
    { conversation_id: 'conversation-missing', title: 'Recovered from server' },
  ], previous);

  assert.deepEqual(workspace.getWorkspaceConversationIds(restored), [
    'conversation-a',
    'conversation-missing',
  ]);
  assert.deepEqual(
    workspace.findConversationById(restored, 'conversation-a').tasks,
    [{ taskId: 'task-a' }],
  );
});

test('legacy workspace preferences are filtered to the signed-in users conversations', () => {
  const legacy = workspace.createEmptyWorkspaceState();
  legacy.projects = [
    {
      ...workspace.createDefaultProject(),
      conversations: [{ id: 'other-user-conversation', name: 'Other', tasks: [] }],
    },
    {
      id: 'workspace:mine',
      name: 'My pinned project',
      pinned: true,
      conversations: [{ id: 'my-conversation', name: 'Mine', tasks: [] }],
    },
  ];
  legacy.activeProjectId = 'workspace:mine';
  legacy.activeConversationId = 'my-conversation';

  const migrated = workspace.filterWorkspaceStateByConversationIds(legacy, ['my-conversation']);

  assert.deepEqual(workspace.getWorkspaceConversationIds(migrated), ['my-conversation']);
  assert.equal(migrated.projects.find((project) => project.id === 'workspace:mine').pinned, true);
  assert.equal(migrated.activeConversationId, 'my-conversation');
});
