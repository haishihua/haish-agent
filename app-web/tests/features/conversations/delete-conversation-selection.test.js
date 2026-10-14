import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationHandlers } from '../../../src/features/conversations/hooks/createConversationHandlers.js';

globalThis.window = { HAISH_API_BASE: '', haish: {} };
const { workspaceStateWithConversationDetail } = await import('../../../src/features/conversations/model/workspace-state.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function harness({ selected = 'b', sibling = false } = {}) {
  let state = {
    activeProjectId: selected === 'a' ? 'pa' : 'pb', activeConversationId: selected,
    projects: [
      { id: 'pa', type: 'system', executionMode: 'chat', conversations: [
        { id: 'a', executionMode: 'chat' }, ...(sibling ? [{ id: 'sibling', executionMode: 'chat' }] : []),
      ] },
      { id: 'pb', type: 'system', executionMode: 'chat', conversations: [{ id: 'b', executionMode: 'chat' }] },
    ],
  };
  const conversationIdRef = { current: selected };
  const viewModeRef = { current: 'chat' };
  const deletion = deferred();
  const creation = deferred();
  const requests = [];
  const activations = [];
  const ctx = {
    API_BASE: 'http://runtime', workspaceState: state, conversationId: selected,
    conversationIdRef, viewModeRef, buildApiHeaders: () => ({}),
    apiFetch: (url, options) => { requests.push({ url, options }); return options.method === 'DELETE' ? deletion.promise : creation.promise; },
    stopConversationRuntimeBeforeDelete: async () => {},
    normalizeWorkspaceOrdering: (value) => value, workspaceStateWithConversationDetail,
    setWorkspaceState: (update) => { state = update(state); },
    activateConversationDetail: async (detail) => {
      activations.push(detail.conversation_id);
      conversationIdRef.current = detail.conversation_id;
      state = workspaceStateWithConversationDetail(state, detail, true);
    },
    // Cached sibling selection exercises the real handleSelectConversation path.
    draftConversationRef: { current: null }, conversationDetailAbortRef: { current: null },
    findConversationById: (workspace, id) => workspace.projects.flatMap((p) => p.conversations).find((c) => c.id === id),
    getRuntime: () => ({ shellSeeded: false, taskRuntimeState: { taskOrder: [], tasksById: {} } }),
    invalidateConversationActivation: () => 1,
    activateConversationShell: (_project, id) => { activations.push(id); conversationIdRef.current = id; },
    taskUpdatedTimestamp: () => 0,
  };
  const switchToB = (mode = 'chat') => {
    conversationIdRef.current = 'b';
    viewModeRef.current = mode;
    state = { ...state, activeProjectId: 'pb', activeConversationId: 'b' };
  };
  const resolveCreation = () => creation.resolve({ ok: true, json: async () => ({
    conversation_id: 'replacement', project_id: 'pa', execution_mode: 'chat', title: 'New Conversation', tasks: [],
  }) });
  return { handlers: createConversationHandlers(ctx), deletion, requests, activations, switchToB, resolveCreation, state: () => state };
}

for (const race of ['already-background', 'during-delete', 'during-create']) {
  test(`deleting the last conversation ${race} records a replacement without taking selection from B`, async () => {
    const h = harness({ selected: race === 'already-background' ? 'b' : 'a' });
    const deleting = h.handlers.handleDeleteConversation('pa', 'a');
    await tick();
    if (race === 'during-delete') h.switchToB('workflow');
    h.deletion.resolve({ ok: true });
    await tick();
    assert.equal(h.requests[1].options.method, 'POST');
    assert.deepEqual(JSON.parse(h.requests[1].options.body), { execution_mode: 'chat', project_id: 'pa' }, 'replacement keeps project mode and backend-owned automatic title');
    if (race === 'during-create') h.switchToB();
    h.resolveCreation();
    await deleting;
    assert.deepEqual(h.activations, []);
    assert.equal(h.state().activeConversationId, 'b');
    assert.equal(h.state().activeProjectId, 'pb');
    assert.deepEqual(h.state().projects.find((p) => p.id === 'pa').conversations.map((c) => c.id), ['replacement']);
  });
}

test('deleting the still-selected last conversation activates its recorded replacement', async () => {
  const h = harness({ selected: 'a' });
  const deleting = h.handlers.handleDeleteConversation('pa', 'a');
  await tick();
  h.deletion.resolve({ ok: true });
  await tick();
  h.resolveCreation();
  await deleting;
  assert.deepEqual(h.activations, ['replacement']);
  assert.equal(h.state().activeConversationId, 'replacement');
  assert.equal(h.state().projects.find((p) => p.id === 'pa').conversations.length, 1);
});

for (const switchDuringDelete of [false, true]) {
  test(`existing sibling fallback ${switchDuringDelete ? 'does not steal a newer selection' : 'activates for the still-selected deletion'}`, async () => {
    const h = harness({ selected: 'a', sibling: true });
    const deleting = h.handlers.handleDeleteConversation('pa', 'a');
    await tick();
    if (switchDuringDelete) h.switchToB();
    h.deletion.resolve({ ok: true });
    await deleting;
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.activations, switchDuringDelete ? [] : ['sibling']);
    assert.equal(h.state().activeConversationId, switchDuringDelete ? 'b' : 'sibling');
  });
}
