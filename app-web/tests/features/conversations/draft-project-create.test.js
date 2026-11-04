import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationCrudHandlers } from '../../../src/features/conversations/hooks/conversation-handlers/crud.js';

test('adding a project for a draft selects it without creating a server conversation', async () => {
  const requests = [];
  const selected = [];
  let workspace = { projects: [] };
  globalThis.window = { haish: { pickProjectDirectory: async () => ({ project: { name: 'Fresh', rootPath: '/fresh' } }) } };
  const handlers = createConversationCrudHandlers({
    API_BASE: '', viewModeRef: { current: 'chat' }, invalidateConversationActivation: () => 1,
    isConversationActivationCurrent: (seq) => seq === 1, buildApiHeaders: () => ({}),
    apiFetch: async (url) => { requests.push(url); return { ok: true, json: async () => ({ project_id: 'p-new', execution_mode: 'chat', name: 'Fresh', workspace_path: '/fresh' }) }; },
    setWorkspaceState: (update) => { workspace = update(workspace); }, normalizeWorkspaceOrdering: (value) => value,
    showToast: () => {},
  });
  await handlers.handleAddProject({ draftOnly: true, isDraftCurrent: () => true, switchDraftProject: (project) => selected.push(project) });
  assert.deepEqual(requests, ['/api/projects']);
  assert.equal(workspace.projects[0].id, 'p-new');
  assert.equal(selected[0].id, 'p-new');
  assert.equal(selected[0].workspacePath, '/fresh');
});

test('adding a project after navigating away does not switch the new selection', async () => {
  let resolvePick;
  let selected = false;
  globalThis.window = { haish: { pickProjectDirectory: () => new Promise((resolve) => { resolvePick = resolve; }) } };
  const handlers = createConversationCrudHandlers({
    API_BASE: '', viewModeRef: { current: 'chat' }, invalidateConversationActivation: () => 1,
    isConversationActivationCurrent: () => false, buildApiHeaders: () => ({}),
    apiFetch: async () => ({ ok: true, json: async () => ({ project_id: 'p', execution_mode: 'chat', name: 'Fresh' }) }),
    setWorkspaceState: () => {}, normalizeWorkspaceOrdering: (value) => value, showToast: () => {},
  });
  const pending = handlers.handleAddProject({ draftOnly: true, isDraftCurrent: () => true, switchDraftProject: () => { selected = true; } });
  resolvePick({ project: { name: 'Fresh', rootPath: '/fresh' } });
  await pending;
  assert.equal(selected, false);
});
