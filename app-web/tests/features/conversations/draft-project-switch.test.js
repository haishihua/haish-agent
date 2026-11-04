import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftLifecycleHandlers } from '../../../src/features/conversations/hooks/draft-handlers/draft-lifecycle.js';

function setup() {
  globalThis.window = { haish: { homePath: '/home' } };
  const a = { id: 'a', name: 'Alpha', executionMode: 'chat', workspacePath: '/a' };
  const b = { id: 'b', name: 'Beta', executionMode: 'chat', workspacePath: '/b' };
  const bot = { id: 'bot', name: 'Bot', executionMode: 'bot' };
  let workspace = { projects: [a, b, bot], activeProjectId: 'a', activeConversationId: null };
  let localWorkspace = null;
  const draftConversationRef = { current: { id: 'draft-1', projectId: 'a', workspacePath: '/a', executionMode: 'chat', composerScopeId: 'draft-project:a' } };
  const ctx = {
    draftConversationRef, conversationIdRef: { current: 'draft-1' },
    draftConversationIdsRef: { current: new Map([['a', 'draft-1']]) },
    draftFirstSendRef: { current: null }, draftServerCreateRef: { current: null }, pendingCreatedDetailRef: { current: null },
    runtimesRef: { current: new Map() }, workspaceState: workspace,
    normalizeWorkspaceOrdering: (state) => state,
    setWorkspaceState: (update) => { workspace = update(workspace); },
    setLocalWorkspace: (value) => { localWorkspace = value; },
  };
  return { ctx, handlers: createDraftLifecycleHandlers(ctx), workspace: () => workspace, localWorkspace: () => localWorkspace };
}

test('switching project keeps the draft identity and composer while changing its execution workspace', () => {
  const { ctx, handlers, workspace, localWorkspace } = setup();
  assert.equal(handlers.switchDraftProject('b'), true);
  assert.deepEqual(ctx.draftConversationRef.current, { id: 'draft-1', projectId: 'b', workspacePath: '/b', workspaceLabel: 'Beta', executionMode: 'chat', composerScopeId: 'draft-project:a' });
  assert.equal(workspace().activeProjectId, 'b');
  assert.deepEqual(localWorkspace(), { path: '/b', label: 'Beta' });
  assert.equal(ctx.draftConversationIdsRef.current.get('b'), 'draft-1');
  assert.equal(ctx.draftConversationIdsRef.current.has('a'), false);
});

test('project switching rejects non-chat projects, created drafts, and in-flight creation or sends', () => {
  for (const block of [
    ({ ctx }) => { ctx.draftConversationRef.current.serverCreated = true; },
    ({ ctx }) => { ctx.draftServerCreateRef.current = { draftId: 'draft-1' }; },
    ({ ctx }) => { ctx.draftFirstSendRef.current = 'draft-1'; },
    ({ ctx }) => { ctx.runtimesRef.current.set('draft-1', { busy: true }); },
    ({ ctx }) => { ctx.pendingCreatedDetailRef.current = { conversation_id: 'real' }; },
  ]) {
    const fixture = setup(); block(fixture);
    assert.equal(fixture.handlers.switchDraftProject('b'), false);
    assert.equal(fixture.ctx.draftConversationRef.current.projectId, 'a');
  }
  const fixture = setup();
  assert.equal(fixture.handlers.switchDraftProject('bot'), false);
  assert.equal(fixture.handlers.switchDraftProject('missing'), false);
});

test('switching to a project with a remembered draft never overwrites its registry', () => {
  const { ctx, handlers } = setup();
  ctx.draftConversationIdsRef.current.set('b', 'draft-other');
  assert.equal(handlers.switchDraftProject('b'), true);
  assert.equal(ctx.draftConversationIdsRef.current.get('b'), 'draft-other');
  assert.equal(handlers.switchDraftProject('a'), true);
  assert.equal(ctx.draftConversationIdsRef.current.get('b'), 'draft-other');
});

test('keeping an uploaded draft does not forget another draft in the same project', () => {
  const { ctx, handlers } = setup();
  ctx.draftConversationRef.current = { id: 'real', localDraftId: 'draft-1', projectId: 'b', keepServerConversation: true };
  ctx.draftConversationIdsRef.current.set('b', 'draft-other');
  handlers.clearDraftConversationState({ clearComposer: false });
  assert.equal(ctx.draftConversationIdsRef.current.get('b'), 'draft-other');
});
