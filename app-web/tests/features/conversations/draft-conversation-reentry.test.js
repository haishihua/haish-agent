// Same harness style as create-draft-conversation-handlers.test.js: the handler
// factory is plain code, so a spy ctx can drive the real draft lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftConversationHandlers } from '../../../src/features/conversations/hooks/createDraftConversationHandlers.js';

const PROJECTS = [
  { id: 'project-1', type: 'project', executionMode: 'chat', workspacePath: '/tmp/one', conversations: [] },
  { id: 'project-2', type: 'project', executionMode: 'chat', workspacePath: '/tmp/two', conversations: [] },
];

function createHarness({ viewMode = 'chat', projects = PROJECTS } = {}) {
  globalThis.window = { haish: { homePath: '/home' } };
  const state = {
    conversationId: null,
    // Stands in for usePerConversationDraft: composer text keyed by conversation id.
    composerDrafts: new Map(),
    aliases: new Map(),
    deletedConversationIds: [],
  };
  const draftConversationRef = { current: null };
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
    createEmptyTaskRuntimeState: () => ({
      activeTaskId: null,
      pendingTask: null,
      taskOrder: [],
      tasksById: {},
    }),
    detachActiveRunFromCurrentConversation: () => {},
    draftConversationIdsRef: { current: new Map() },
    draftConversationRef,
    draftFirstSendRef: { current: null },
    draftServerCreateRef: { current: null },
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
    resetContextUsage: () => {},
    applyContextUsage: () => {},
    latestContextUsageFromTasks: () => ({}),
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
    viewModeRef: { current: viewMode },
    workspaceState: { projects: projects.map((project) => ({ ...project })) },
    workspaceStateWithConversationDetail: (value) => value,
  });
  return {
    handlers,
    state,
    draft: () => draftConversationRef.current,
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

test('a task-mode blank entry never borrows a chat project', () => {
  // 两个模式的项目共用一个 id 空间：外面递进来的 activeProjectId 可能还是会话模式那个。
  // 这种 id 不能拿来开任务草稿，否则首条消息会撞「执行模式不匹配」。
  const harness = createHarness({
    viewMode: 'workflow',
    projects: [
      { id: 'chat-project', type: 'project', executionMode: 'chat', conversations: [] },
      { id: 'bot-project', type: 'project', executionMode: 'bot', conversations: [] },
    ],
  });

  harness.handlers.openDraftConversation('chat-project');

  assert.equal(harness.draft().executionMode, 'bot');
  assert.equal(harness.draft().projectId, 'bot-project');
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
