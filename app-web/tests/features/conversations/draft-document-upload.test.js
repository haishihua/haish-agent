// 传过文件的草稿不是空壳。
//
// 规则：文件一旦交给服务端（解析成功、失败都算），这条会话就是用户的真实内容，
// 切走时不能再被「空草稿回收」删掉；打好的字也留在它自己的输入框里，下次打开
// 这条会话还能接着发（"+ 新建会话" 换一个干净的新壳）。
//
// 这里把两个工厂接在一起跑：上传入口（createComposerHandlers）→ 草稿生命周期
// （createDraftConversationHandlers），走的是 AppShell 里同一条线。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createComposerHandlers } from '../../../src/features/chat/hooks/createComposerHandlers.js';
import { createDraftConversationHandlers } from '../../../src/features/conversations/hooks/createDraftConversationHandlers.js';

const PROJECT_ID = 'project-1';
const PROJECTS = [{ id: PROJECT_ID, type: 'custom', workspacePath: '/tmp/one', conversations: [] }];

function createHarness({ uploadStatus = 200 } = {}) {
  const state = {
    composerDrafts: new Map(),
    conversationId: null,
    deletedConversationIds: [],
    uploadTargets: [],
    serverCount: 0,
  };
  let hexCount = 0;
  const conversationIdRef = { current: null };
  const draftConversationRef = { current: null };
  const draftConversationIdsRef = { current: new Map() };
  const apiFetch = async (url, options = {}) => {
    const path = String(url);
    if (options.method === 'DELETE') {
      state.deletedConversationIds.push(decodeURIComponent(path.split('/').pop()));
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (path.endsWith('/api/documents/upload')) {
      const target = String(options.body?.get?.('conversation_id') || '');
      state.uploadTargets.push(target);
      if (uploadStatus !== 200) {
        return {
          ok: false,
          status: uploadStatus,
          json: async () => ({ detail: 'Import failed: broken file' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          attachment: {
            attachment_id: 'att-1',
            document_id: 'doc-1',
            file_name: 'plan.md',
            size_bytes: 12,
            content_type: 'text/markdown',
            title: 'plan',
            conversation_id: target,
          },
          conversation: { conversation_id: target },
        }),
      };
    }
    throw new Error(`unexpected request: ${path}`);
  };
  const draftHandlers = createDraftConversationHandlers({
    API_BASE: 'http://runtime',
    DEFAULT_SESSION_NAME: 'New Conversation',
    applyContextUsage: () => {},
    applyConversationSnapshot: () => {},
    apiFetch,
    buildApiHeaders: () => ({}),
    chatFinalizedTaskIdsRef: { current: new Set() },
    conversationActivationSeqRef: { current: 0 },
    conversationDetailAbortRef: { current: null },
    conversationId: null,
    conversationIdRef,
    createConversationInProject: async (project, title) => {
      state.serverCount += 1;
      return {
        conversation_id: `server-${state.serverCount}`,
        project_id: project.id,
        title,
        messages: [],
        tasks: [],
        attachments: [],
      };
    },
    createDefaultProject: () => ({ id: PROJECT_ID }),
    createEmptyTaskRuntimeState: () => ({
      activeTaskId: null,
      pendingTask: null,
      taskOrder: [],
      tasksById: {},
    }),
    detachActiveRunFromCurrentConversation: () => {},
    draftConversationIdsRef,
    draftConversationRef,
    flushRuntimeTasksToWorkspace: () => {},
    generateHexId: () => `hex${++hexCount}`,
    getRuntime: () => null,
    isDefaultConversationName: (name) => !name || name === 'New Conversation',
    isTaskActuallyActive: () => false,
    latestContextUsageFromTasks: () => ({}),
    mutateRuntime: () => {},
    normalizeRuntimeEvents: (events) => events || [],
    normalizeWorkspaceOrdering: (value) => value,
    pendingCreatedDetailRef: { current: null },
    rekeyChatDraft: (fromId, toId) => {
      if (state.composerDrafts.has(fromId)) state.composerDrafts.set(toId, state.composerDrafts.get(fromId));
      state.composerDrafts.delete(fromId);
    },
    resetContextUsage: () => {},
    runtimesRef: { current: new Map() },
    setComposerAttachment: () => {},
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
  const composerHandlers = createComposerHandlers({
    API_BASE: 'http://runtime',
    apiFetch,
    applyConversationSnapshot: () => {},
    conversationId: null,
    conversationIdRef,
    draftConversationRef,
    ensureServerConversationForActiveDraft: draftHandlers.ensureServerConversationForActiveDraft,
    getRuntime: () => null,
    isDraftConversationId: draftHandlers.isDraftConversationId,
    markDraftConversationKept: draftHandlers.markDraftConversationKept,
    mutateRuntime: () => {},
    setComposerAttachment: () => {},
    setRuntimeFetchController: () => {},
    setUploadState: () => {},
    showToast: () => {},
    viewMode: 'chat',
    viewModeRef: { current: 'chat' },
  });
  return {
    composerHandlers,
    draftHandlers,
    state,
    draftText: (id) => state.composerDrafts.get(id),
    setDraftText: (id, text) => state.composerDrafts.set(id, text),
  };
}

test('an uploaded document keeps its conversation when the user switches away', async () => {
  const harness = createHarness();
  harness.draftHandlers.openDraftConversation(PROJECT_ID);
  const draftId = harness.state.conversationId;
  harness.setDraftText(draftId, '帮我看看这个文档');

  await harness.composerHandlers.handleAttachmentSelect(
    { name: 'plan.md', size: 12, type: 'text/markdown' },
    'agent-1',
    'chat',
  );
  const serverId = harness.state.conversationId;
  assert.equal(serverId, 'server-1');
  assert.deepEqual(harness.state.uploadTargets, [serverId]);

  // 切走：这条会话不能删，打好的字留在它自己身上。
  harness.draftHandlers.clearDraftConversationState({ clearComposer: true });
  assert.deepEqual(harness.state.deletedConversationIds, []);
  assert.equal(harness.draftText(serverId), '帮我看看这个文档');

  // "+" 换一个新壳：文字和附件都归那条真会话，新会话是干净的。
  harness.draftHandlers.openDraftConversation(PROJECT_ID);
  assert.notEqual(harness.state.conversationId, draftId);
  assert.equal(harness.draftText(harness.state.conversationId), undefined);
});

test('a failed parse keeps the conversation too — the file was still handed over', async () => {
  const harness = createHarness({ uploadStatus: 500 });
  harness.draftHandlers.openDraftConversation(PROJECT_ID);
  const draftId = harness.state.conversationId;
  harness.setDraftText(draftId, '换个文件再试');

  await assert.rejects(
    () => harness.composerHandlers.handleAttachmentSelect(
      { name: 'broken.pdf', size: 3, type: 'application/pdf' },
      'agent-1',
      'chat',
    ),
    /upload failed: 500/,
  );

  harness.draftHandlers.clearDraftConversationState({ clearComposer: true });
  assert.deepEqual(harness.state.deletedConversationIds, []);
  assert.equal(harness.draftText('server-1'), '换个文件再试');
});

test('a draft that never carried a file is still reclaimed as before', async () => {
  const harness = createHarness();
  harness.draftHandlers.openDraftConversation(PROJECT_ID);
  const draftId = harness.state.conversationId;
  harness.setDraftText(draftId, '空手切走');

  await harness.draftHandlers.ensureServerConversationForActiveDraft({ title: 'New Conversation' });
  harness.draftHandlers.clearDraftConversationState({ clearComposer: true });

  // 没传过文件的空壳照旧回收，文字退回 "+" 那个草稿壳。
  assert.deepEqual(harness.state.deletedConversationIds, ['server-1']);
  assert.equal(harness.draftText(draftId), '空手切走');
});
