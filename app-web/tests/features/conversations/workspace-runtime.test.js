import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { HAISH_API_BASE: 'http://fixture.invalid', location: { origin: 'http://fixture.invalid' } };
const {
  conversationDetailToWorkspaceConversation,
  buildWorkspaceStateFromProjects,
  replaceWorkspaceModeFromProjects,
  workspaceStateWithConversationDetail,
} = await import('../../../src/features/app/model/workspace-runtime.js');

const task = {
  task_id: 'task-1',
  conversation_id: 'conversation-1',
  title: 'Recorded task',
  execution_mode: 'chat',
  status: 'done',
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:01:00Z',
  provider_key: 'configured-provider',
  model: 'custom-model',
  reasoning_effort: 'medium',
};
const detail = {
  conversation_id: 'conversation-1',
  project_id: 'project-1',
  execution_mode: 'chat',
  title: 'Conversation',
  tasks: [task],
};
const project = {
  project_id: 'project-1',
  execution_mode: 'chat',
  name: 'Project',
  conversations: [detail],
};
const empty = () => ({ projects: [], activeProjectId: null, activeConversationId: null });

function assertRuntimeTask(actual) {
  assert.equal(actual.taskId, task.task_id);
  assert.equal(actual.requestedProvider, task.provider_key);
  assert.equal(actual.requestedModelId, task.model);
  assert.equal(actual.requestedReasoningEffort, task.reasoning_effort);
  assert.equal(actual.runtimeHydrated, false);
  assert.equal(actual.updatedAt, Date.parse(task.updated_at));
}

test('shell detail mapping binds task normalization and preserves previous local state', () => {
  const previous = { name: 'Local title', userExpanded: true };
  const mapped = conversationDetailToWorkspaceConversation({ ...detail, title: 'Default Session' }, previous);
  assert.equal(mapped.name, previous.name);
  assert.equal(mapped.userExpanded, true);
  assertRuntimeTask(mapped.tasks[0]);
  assertRuntimeTask(conversationDetailToWorkspaceConversation(detail).tasks[0]);
});

test('shell project mapping binds task normalization', () => {
  const state = buildWorkspaceStateFromProjects([project], empty());
  assertRuntimeTask(state.projects[0].conversations[0].tasks[0]);
  assert.equal(state.activeConversationId, detail.conversation_id);
});

test('shell mode replacement preserves the other mode and forwards active draft', () => {
  const bot = { id: 'bot-project', executionMode: 'bot', conversations: [] };
  const previous = { projects: [bot], activeProjectId: bot.id, activeConversationId: null };
  const state = replaceWorkspaceModeFromProjects('chat', [project], previous, {
    executionMode: 'chat', projectId: project.project_id,
  });
  assert.equal(state.activeProjectId, project.project_id);
  assert.equal(state.activeConversationId, null);
  assert.ok(state.projects.some((item) => item.id === bot.id));
  assertRuntimeTask(state.projects.find((item) => item.id === project.project_id).conversations[0].tasks[0]);
  assert.equal(replaceWorkspaceModeFromProjects('chat', [project], previous).activeProjectId, bot.id);
});

test('shell detail merge preserves explicit activation behavior', () => {
  const state = buildWorkspaceStateFromProjects([project], empty());
  const untouchedSelection = { ...state, activeConversationId: 'other-conversation' };
  const merged = workspaceStateWithConversationDetail(untouchedSelection, detail, false);
  assert.equal(merged.activeConversationId, untouchedSelection.activeConversationId);
  assertRuntimeTask(merged.projects[0].conversations[0].tasks[0]);
  const activated = workspaceStateWithConversationDetail(untouchedSelection, detail);
  assert.equal(activated.activeConversationId, detail.conversation_id);
  assert.equal(activated.projects[0].conversations[0].userExpanded, false);
});
