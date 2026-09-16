// Same harness style as create-draft-conversation-handlers.test.js: the handler
// factory is plain code, so a spy ctx can drive the real draft lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftConversationHandlers } from '../../../src/features/conversations/hooks/createDraftConversationHandlers.js';

const PROJECTS = [
  { id: 'project-1', type: 'project', workspacePath: '/tmp/one', conversations: [] },
  { id: 'project-2', type: 'project', workspacePath: '/tmp/two', conversations: [] },
];

function createHarness() {
  const state = {
    conversationId: null,
    // Stands in for usePerConversationDraft: composer text keyed by conversation id.
    composerDrafts: new Map(),
    aliases: new Map(),
    deletedConversationIds: [],
  };
  let hexCount = 0;
  let serverCount = 0;
  const handlers = createDraftConversationHandlers({
    API_BASE: 'http://runtime',
    DEFAULT_SESSION_NAME: 'New Conversation',
    applyConversationSnapshot: () => {},
    apiFetch: (url, options = {}) => {
      if (options.method === 'DELETE') {
        state.deletedConversationIds.push(decodeURIComponent(String(url).split('/').pop()));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    },
    buildApiHeaders: () => ({}),
    chatFinalizedTaskIdsRef: { current: new Set() },
    conversationActivationSeqRef: { current: 0 },
    conversationDetailAbortRef: { current: null },
    conversationId: null,
    conversationIdRef: { current: null },
    createConversationInProject: async (project, title) => {
      serverCount += 1;
      return {
        conversation_id: `server-${serverCount}`,
        project_id: project.id,
        title,
        messages: [],
        tasks: [],
      };
    },
    createDefaultProject: () => ({ id: 'project-1' }),
    createEmptyContextUsage: () => ({ usedTokens: 0, totalTokens: 0, ratio: 0 }),
    createEmptyTaskRuntimeState: () => ({
      activeTaskId: null,
      pendingTask: null,
      taskOrder: [],
      tasksById: {},
    }),
    detachActiveRunFromCurrentConversation: () => {},
    draftConversationIdsRef: { current: new Map() },
    draftConversationRef: { current: null },
    flushRuntimeTasksToWorkspace: () => {},
    generateHexId: () => `hex${++hexCount}`,
    getRuntime: () => null,
    isDefaultConversationName: (name) => !name || name === 'New Conversation',
    isTaskActuallyActive: () => false,
    mutateRuntime: () => {},
    normalizeWorkspaceOrdering: (value) => value,
    normalizeRuntimeEvents: (events) => events || [],
    pendingCreatedDetailRef: { current: null },
    rekeyChatDraft: (fromId, toId) => {
      state.aliases.set(fromId, toId);
      if (state.composerDrafts.has(fromId)) state.composerDrafts.set(toId, state.composerDrafts.get(fromId));
      state.composerDrafts.delete(fromId);
    },
    runtimesRef: { current: new Map() },
    setComposerAttachment: () => {},
    setContextUsage: () => {},
    setConversationAttachments: () => {},
    setConversationError: () => {},
    setConversationId: (value) => { state.conversationId = value; },
    setConversationReady: () => {},
    setLocalWorkspace: () => {},
    setStoredConversationId: () => {},
    setUploadState: () => {},
    setWorkspaceState: () => {},
    taskDetailToRuntimeTask: (task) => task,
    taskRuntimeEventCacheRef: { current: new Map() },
    taskRuntimeFetchesRef: { current: new Map() },
    taskUpdatedTimestamp: (task) => task?.updatedAt || 0,
    titleFromTaskText: (text) => String(text || '').trim().slice(0, 48),
    updateTaskRuntimeState: () => {},
    userCancelledTaskIdsRef: { current: new Set() },
    viewModeRef: { current: 'chat' },
    workspaceState: { projects: PROJECTS.map((project) => ({ ...project })) },
    workspaceStateWithConversationDetail: (value) => value,
  });
  return {
    handlers,
    state,
    draftText: (id) => state.composerDrafts.get(id),
    setDraftText: (id, text) => state.composerDrafts.set(id, text),
  };
}

test('leaving a blank new conversation keeps its unsent prompt for the next visit', () => {
  const harness = createHarness();
  harness.handlers.openDraftConversation('project-1');
  const draftId = harness.state.conversationId;
  harness.setDraftText(draftId, '还没发送的 prompt');

  // Switch to another conversation: the draft conversation is dropped from the
  // UI, but the composer text stored under its id must survive.
  harness.handlers.clearDraftConversationState({ clearComposer: true });
  assert.equal(harness.draftText(draftId), '还没发送的 prompt');

  harness.handlers.openDraftConversation('project-1');
  assert.equal(harness.state.conversationId, draftId, 're-entering the blank chat must reuse the draft id');
  assert.equal(harness.draftText(draftId), '还没发送的 prompt');
});

test('each project keeps its own blank new conversation', () => {
  const harness = createHarness();
  harness.handlers.openDraftConversation('project-1');
  const firstDraftId = harness.state.conversationId;
  harness.setDraftText(firstDraftId, 'project one draft');

  harness.handlers.openDraftConversation('project-2');
  const secondDraftId = harness.state.conversationId;
  assert.notEqual(secondDraftId, firstDraftId);
  assert.equal(harness.draftText(secondDraftId), undefined);

  harness.handlers.openDraftConversation('project-1');
  assert.equal(harness.state.conversationId, firstDraftId);
  assert.equal(harness.draftText(firstDraftId), 'project one draft');
});

test('a sent draft frees its id so the next new conversation starts empty', async () => {
  const harness = createHarness();
  harness.handlers.openDraftConversation('project-1');
  const draftId = harness.state.conversationId;
  harness.setDraftText(draftId, '第一条消息');

  const materialized = await harness.handlers.materializeDraftConversationForSend({ text: '第一条消息' });
  assert.equal(materialized.id, 'server-1');

  harness.handlers.openDraftConversation('project-1');
  assert.notEqual(harness.state.conversationId, draftId, 'the consumed draft id must not be reused');
  assert.equal(harness.draftText(harness.state.conversationId), undefined);
});

test('discarding a draft that already created a server conversation returns the text to the draft id', async () => {
  const harness = createHarness();
  harness.handlers.openDraftConversation('project-1');
  const draftId = harness.state.conversationId;
  harness.setDraftText(draftId, '带图片的草稿');

  const detail = await harness.handlers.ensureServerConversationForActiveDraft({ title: 'New Conversation' });
  const serverId = detail.conversation_id;
  assert.equal(harness.draftText(serverId), '带图片的草稿');

  harness.handlers.clearDraftConversationState({ clearComposer: true });
  assert.deepEqual(harness.state.deletedConversationIds, [serverId]);
  assert.equal(harness.draftText(draftId), '带图片的草稿');

  harness.handlers.openDraftConversation('project-1');
  assert.equal(harness.state.conversationId, draftId);
  assert.equal(harness.draftText(draftId), '带图片的草稿');
});
