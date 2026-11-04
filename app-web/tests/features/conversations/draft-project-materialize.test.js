import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftMaterializeHandlers } from '../../../src/features/conversations/hooks/draft-handlers/draft-materialize.js';

test('first send creates the draft in its switched project and does not forget another draft', async () => {
  const draft = { id: 'draft-a', projectId: 'beta', workspacePath: '/beta', workspaceLabel: 'Beta', executionMode: 'chat' };
  const registry = new Map([['beta', 'draft-other']]);
  const draftConversationRef = { current: draft };
  const conversationIdRef = { current: draft.id };
  let createdProject;
  const handlers = createDraftMaterializeHandlers({
    draftConversationRef, conversationIdRef, conversationId: draft.id, draftConversationIdsRef: { current: registry },
    draftFirstSendRef: { current: null }, draftServerCreateRef: { current: null }, pendingCreatedDetailRef: { current: null },
    conversationActivationSeqRef: { current: 1 }, isConversationActivationCurrent: (seq) => seq === 1,
    workspaceState: { projects: [] }, viewModeRef: { current: 'chat' }, runtimesRef: { current: new Map() },
    createConversationInProject: async (project) => { createdProject = project; return { conversation_id: 'real', project_id: project.id }; },
    getRuntime: () => ({}), rekeyChatDraft: () => {}, setConversationId: () => {}, setStoredConversationId: () => {},
    applyConversationSnapshot: () => {}, setWorkspaceState: () => {}, workspaceStateWithConversationDetail: (state) => state,
    clearDraftFirstSendInFlight: () => {},
  });
  const result = await handlers.materializeDraftConversationForSend();
  assert.equal(result.id, 'real');
  assert.deepEqual(createdProject, { id: 'beta', executionMode: 'chat', workspacePath: '/beta', workspaceLabel: 'Beta' });
  assert.equal(registry.get('beta'), 'draft-other');
});
