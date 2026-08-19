import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const storedValues = new Map();

globalThis.window = {
  localStorage: {
    getItem: (key) => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, value),
    removeItem: (key) => storedValues.delete(key),
  },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};

const {
  loadStoredWorkspaceState,
  removeProjectModeFromWorkspace,
  saveWorkspaceState,
} = await import('./workspace-state.js');
const handlerSource = fs.readFileSync(
  new URL('../features/app/hooks/createConversationHandlers.js', import.meta.url),
  'utf8',
);

test('removing a workflow project keeps its agent conversations', () => {
  const state = {
    activeProjectId: 'project',
    activeConversationId: 'workflow-conversation',
    projects: [{
      id: 'project',
      removable: true,
      conversations: [
        {
          id: 'agent-conversation',
          executionMode: 'chat',
          tasks: [
            { id: 'agent-task', executionMode: 'chat' },
            { id: 'workflow-task', executionMode: 'bot' },
          ],
        },
        { id: 'workflow-conversation', executionMode: 'bot', tasks: [] },
      ],
    }],
  };

  const next = removeProjectModeFromWorkspace(state, 'project', 'bot');

  assert.deepEqual(next.projects[0].conversations.map((item) => item.id), ['agent-conversation']);
  assert.deepEqual(next.projects[0].hiddenModes, ['bot']);
});

test('project removal only deletes conversations from the current mode', () => {
  assert.match(handlerSource, /const conversationsToRemove = project\.conversations\.filter/);
  assert.match(handlerSource, /Promise\.all\(conversationsToRemove\.map/);
  assert.doesNotMatch(handlerSource, /Promise\.all\(project\.conversations\.map/);
});

test('stored conversations keep their explicit execution mode and reject untyped entries', () => {
  storedValues.clear();
  saveWorkspaceState({
    activeProjectId: 'project',
    activeConversationId: 'workflow-conversation',
    projects: [{
      id: 'project',
      conversations: [
        {
          id: 'agent-conversation',
          executionMode: 'chat',
          tasks: [
            { id: 'agent-task', executionMode: 'chat' },
            { id: 'workflow-task', executionMode: 'bot' },
          ],
        },
        { id: 'workflow-conversation', executionMode: 'bot', tasks: [] },
        { id: 'untyped-conversation', tasks: [] },
      ],
    }],
  });

  const restored = loadStoredWorkspaceState();
  const project = restored.projects.find((item) => item.id === 'project');
  assert.deepEqual(
    project.conversations.map(({ id, executionMode }) => ({ id, executionMode })),
    [
      { id: 'agent-conversation', executionMode: 'chat' },
      { id: 'workflow-conversation', executionMode: 'bot' },
    ],
  );
  const agentConversation = project.conversations.find((item) => item.id === 'agent-conversation');
  assert.deepEqual(agentConversation.tasks.map((task) => task.id), ['agent-task']);
});
