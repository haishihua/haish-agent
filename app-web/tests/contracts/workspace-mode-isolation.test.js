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
  mergeConversationTasks,
  replaceWorkspaceModeFromProjects,
  saveWorkspaceState,
} = await import('../../src/features/conversations/model/workspace-state.js');
const handlerSource = fs.readFileSync(
  new URL('../../src/features/conversations/hooks/createConversationHandlers.js', import.meta.url),
  'utf8',
);
const ownerId = 'owner-a';

test('project removal deletes every conversation in the typed project', () => {
  assert.match(handlerSource, /const executionMode = project\.executionMode/);
  assert.match(handlerSource, /const conversationsToRemove = project\.conversations/);
  assert.match(handlerSource, /DELETE/);
});

test('stored conversations keep their explicit execution mode and reject untyped entries', () => {
  storedValues.clear();
  saveWorkspaceState(ownerId, {
    activeProjectId: 'project',
    activeConversationId: 'workflow-conversation',
    projects: [{
      id: 'project',
      executionMode: 'chat',
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

  const restored = loadStoredWorkspaceState(ownerId);
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

test('agent conversations and workflow tasks keep separate expansion state', () => {
  storedValues.clear();
  saveWorkspaceState(ownerId, {
    activeProjectId: 'project',
    projects: [{
      id: 'project',
      executionMode: 'chat',
      chatConversationsExpanded: false,
      workflowTasksExpanded: true,
      conversations: [],
    }],
  });

  const project = loadStoredWorkspaceState(ownerId).projects.find((item) => item.id === 'project');
  assert.equal(project.chatConversationsExpanded, false);
  assert.equal(project.workflowTasksExpanded, true);
});

test('refreshing one mode replaces only that mode with the backend project list', () => {
  const previousState = {
    activeProjectId: 'bot-project',
    activeConversationId: 'bot-conversation',
    projects: [
      {
        id: 'stale-chat-project',
        executionMode: 'chat',
        name: 'Custom project',
        conversations: [],
      },
      {
        id: 'bot-project',
        executionMode: 'bot',
        name: 'Bot project',
        conversations: [{
          id: 'bot-conversation',
          executionMode: 'bot',
          tasks: [],
        }],
      },
    ],
  };

  const nextState = replaceWorkspaceModeFromProjects('chat', [{
    project_id: 'chat-project',
    execution_mode: 'chat',
    name: 'Chat project',
    workspace_path: '/tmp/chat-project',
    conversations: [],
  }], previousState);

  assert.deepEqual(
    nextState.projects.map(({ id, name, executionMode }) => ({ id, name, executionMode })),
    [
      { id: 'bot-project', name: 'Bot project', executionMode: 'bot' },
      { id: 'chat-project', name: 'Chat project', executionMode: 'chat' },
    ],
  );
  assert.equal(nextState.activeProjectId, 'bot-project');
  assert.equal(nextState.activeConversationId, 'bot-conversation');
});

test('mode refresh rejects projects from a different execution mode', () => {
  assert.throws(
    () => replaceWorkspaceModeFromProjects('chat', [{
      project_id: 'bot-project',
      execution_mode: 'bot',
      name: 'Bot project',
      conversations: [],
    }], { projects: [], activeProjectId: null, activeConversationId: null }),
    /does not match the requested mode/,
  );
});

test('mode refresh preserves the project owning an unsent draft', () => {
  const previousState = {
    activeProjectId: 'workspace-project',
    activeConversationId: null,
    projects: [{
      id: 'workspace-project',
      executionMode: 'chat',
      name: 'zhanruitao',
      conversations: [],
    }],
  };
  const projects = [
    {
      project_id: 'default-project-chat',
      execution_mode: 'chat',
      name: 'Default project',
      conversations: [{
        conversation_id: 'default-conversation',
        execution_mode: 'chat',
        title: 'Default conversation',
      }],
    },
    {
      project_id: 'workspace-project',
      execution_mode: 'chat',
      name: 'zhanruitao',
      workspace_path: '/Users/zhanruitao',
      conversations: [],
    },
  ];

  const nextState = replaceWorkspaceModeFromProjects(
    'chat',
    projects,
    previousState,
    (task) => task,
    { id: 'draft-1', projectId: 'workspace-project', executionMode: 'chat' },
  );

  assert.equal(nextState.activeProjectId, 'workspace-project');
  assert.equal(nextState.activeConversationId, null);
});

test('opened conversation runtime overlays directory tasks without hiding remote tasks', () => {
  const merged = mergeConversationTasks(
    [
      { taskId: 'local-task', status: 'running', title: 'stale summary' },
      { taskId: 'remote-task', status: 'queued', title: 'remote task' },
    ],
    [{ taskId: 'local-task', status: 'done', answerText: 'finished locally' }],
  );

  assert.deepEqual(merged, [
    {
      taskId: 'local-task',
      status: 'done',
      title: 'stale summary',
      answerText: 'finished locally',
    },
    { taskId: 'remote-task', status: 'queued', title: 'remote task' },
  ]);
});
