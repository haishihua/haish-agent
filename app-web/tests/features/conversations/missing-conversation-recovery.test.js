import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 激活链路会走到 shared/api/base.js，它在模块顶层读 window（和 context-usage-activation
// 那份测试同一个理由），所以先把 window 搭好再动态导入。
globalThis.window = globalThis.window || {
  haish: {},
  localStorage: { getItem: () => null, setItem: () => {} },
};

const { createConversationActivationHandlers } = await import(
  '../../../src/features/conversations/hooks/createConversationActivationHandlers.js'
);
const { createConversationHandlers } = await import(
  '../../../src/features/conversations/hooks/createConversationHandlers.js'
);

const PROJECT_ID = 'project-1';
const LIVE_CONVERSATION_ID = 'conversation-live';
const DEAD_CONVERSATION_ID = 'conversation-dead';
const SECOND_DEAD_CONVERSATION_ID = 'conversation-dead-2';

const findConversationById = (state, conversationId) => (state?.projects || [])
  .flatMap((project) => project.conversations)
  .find((conversation) => conversation.id === conversationId) || null;
const findProjectByConversationId = (state, conversationId) => (state?.projects || [])
  .find((project) => project.conversations.some(
    (conversation) => conversation.id === conversationId,
  )) || null;

const conversationDetail = (conversationId) => ({
  conversation_id: conversationId,
  project_id: PROJECT_ID,
  execution_mode: 'chat',
  title: 'Conversation',
  messages: [],
  tasks: [],
});

// 空草稿被清掉之后的现场：服务端已经没有这条会话，本地列表还留着它。
function createHarness({
  requestStatus = (conversationId) => (conversationId === DEAD_CONVERSATION_ID ? 404 : 200),
  conversationIds = [DEAD_CONVERSATION_ID, LIVE_CONVERSATION_ID],
  onOpenDraft = null,
} = {}) {
  const conversationIdRef = { current: null };
  const runtimes = new Map();
  const modeLocationRef = { current: { chat: null, workflow: null } };
  const storedIds = [];
  const toasts = [];
  const requests = [];
  let activationSeq = 0;
  let workspaceState = {
    activeProjectId: PROJECT_ID,
    activeConversationId: null,
    projects: [{
      id: PROJECT_ID,
      type: 'custom',
      executionMode: 'chat',
      conversations: conversationIds.map((conversationId) => ({
        id: conversationId, executionMode: 'chat', tasks: [],
      })),
    }],
  };
  const apiFetch = async (url) => {
    requests.push(String(url));
    // 恢复链一定要收敛：来回弹就会撞到这个上限。
    assert.ok(requests.length <= 20, `too many conversation requests: ${requests.length}`);
    const conversationId = String(url).split('/').pop();
    const status = requestStatus(conversationId);
    if (status !== 200) {
      return { ok: false, status, json: async () => ({ detail: 'Conversation not found.' }) };
    }
    return { ok: true, status, json: async () => conversationDetail(conversationId) };
  };
  const activation = createConversationActivationHandlers({
    API_BASE: 'http://runtime',
    activeRuntimeTargetConvId: (explicit) => explicit || conversationIdRef.current,
    apiFetch,
    applyContextUsage: () => {},
    buildTaskRuntimeRecord: () => ({}),
    chatImageFallbacksByTaskIdFromMessages: () => new Map(),
    clearDraftConversationState: () => {},
    contextUsageFromConversationDetail: () => ({}),
    conversationIdRef,
    draftConversationRef: { current: null },
    estimateContextUsageFromConversationDetail: () => ({}),
    findConversationById,
    findProjectByConversationId,
    flushRuntimeTasksToWorkspace: () => {},
    getRuntime: (conversationId) => (conversationId ? runtimes.get(conversationId) || null : null),
    invalidateConversationActivation: () => 1,
    isConversationActivationCurrent: () => true,
    isTaskActuallyActive: () => false,
    isTerminalTaskStatus: () => false,
    latestContextUsageFromTasks: () => ({}),
    loadStoredContextUsage: () => ({}),
    mergeChatImageRefs: () => [],
    modeLocationRef,
    mutateRuntime: (conversationId, mutator) => {
      let runtime = runtimes.get(conversationId);
      if (!runtime) {
        runtime = {
          shellSeeded: false,
          busy: false,
          activeRunId: null,
          activeTaskId: null,
          fetchController: null,
          answerBuffer: '',
          cancelledRunIds: new Set(),
          abortRequested: false,
          taskRuntimeState: {
            activeTaskId: null,
            pendingTask: null,
            taskOrder: [],
            tasksById: {},
          },
        };
        runtimes.set(conversationId, runtime);
      }
      mutator(runtime);
      return runtime;
    },
    pendingCreatedDetailRef: { current: null },
    restoreTaskRuntimes: async () => [],
    runtimesRef: { current: runtimes },
    setComposerAttachment: () => {},
    setConversationAttachments: () => {},
    setConversationId: () => {},
    setLocalWorkspace: () => {},
    setStoredConversationId: (conversationId) => storedIds.push(conversationId),
    setUploadState: () => {},
    setViewMode: () => {},
    setWorkspaceState: (updater) => {
      workspaceState = updater(workspaceState);
    },
    sortTaskIdsForRestore: (tasks) => tasks.map(
      (task) => task.task_id || task.taskId || task.id,
    ),
    syncDisplayedRuntime: () => {},
    taskImageAttachmentsRef: { current: new Map() },
    taskSummaryToRuntimeTask: (task) => task,
    timestampValue: () => 0,
    updateTaskRuntimeState: () => {},
    userCancelledTaskIdsRef: { current: new Set() },
    viewModeRef: { current: 'chat' },
    workspaceState,
    workspaceStateWithConversationDetail: (state) => state,
  });
  const handlers = createConversationHandlers({
    API_BASE: 'http://runtime',
    activateConversationDetail: activation.activateConversationDetail,
    activateConversationShell: activation.activateConversationShell,
    applyConversationSnapshot: activation.applyConversationSnapshot,
    conversationDetailAbortRef: { current: null },
    conversationId: null,
    conversationIdRef,
    draftConversationRef: { current: null },
    dropMissingConversation: activation.dropMissingConversation,
    fetchConversationDetail: activation.fetchConversationDetail,
    findConversationById,
    findProjectByConversationId,
    getRuntime: (conversationId) => (conversationId ? runtimes.get(conversationId) || null : null),
    invalidateConversationActivation: () => {
      activationSeq += 1;
      return activationSeq;
    },
    isConversationActivationCurrent: (seq) => seq === activationSeq,
    modeLocationRef,
    normalizeWorkspaceOrdering: (state) => state,
    openDraftConversation: (projectId) => {
      if (onOpenDraft) {
        onOpenDraft(projectId);
        return;
      }
      assert.fail('unexpected draft conversation');
    },
    setWorkspaceState: (updater) => {
      workspaceState = updater(workspaceState);
    },
    showToast: (kind, message) => toasts.push({ kind, message }),
    viewModeRef: { current: 'chat' },
    workspaceState,
  });
  return {
    activation,
    handlers,
    conversationIdRef,
    modeLocationRef,
    requests,
    runtimes,
    storedIds,
    toasts,
    state: () => workspaceState,
  };
}

test('a 404 conversation is dropped silently and swapped for a live one', async () => {
  const harness = createHarness();
  await harness.handlers.handleSelectConversation(PROJECT_ID, DEAD_CONVERSATION_ID);

  // 不许弹错：404 是数据（这条记录没了），不是故障。
  assert.deepEqual(harness.toasts, []);
  // 本地那一行被抹掉，选中的换成了同项目里还能用的会话。
  assert.deepEqual(
    harness.state().projects[0].conversations.map((conversation) => conversation.id),
    [LIVE_CONVERSATION_ID],
  );
  assert.equal(harness.conversationIdRef.current, LIVE_CONVERSATION_ID);
  assert.equal(harness.state().activeConversationId, LIVE_CONVERSATION_ID);
  // 落盘的选中 id：点进去那一刻先写了死会话；404 之后先被清空，再写回接手的新会话。
  assert.equal(harness.storedIds[0], DEAD_CONVERSATION_ID);
  assert.equal(harness.storedIds[1], null);
  assert.deepEqual([...new Set(harness.storedIds.slice(2))], [LIVE_CONVERSATION_ID]);
  // 死会话的运行时不留着。
  assert.equal(harness.runtimes.has(DEAD_CONVERSATION_ID), false);
});

test('dropping a missing conversation leaves the current selection alone', () => {
  const harness = createHarness();
  harness.conversationIdRef.current = LIVE_CONVERSATION_ID;
  harness.state().activeConversationId = LIVE_CONVERSATION_ID;

  const recovery = harness.activation.dropMissingConversation(DEAD_CONVERSATION_ID, {
    projectId: PROJECT_ID,
  });

  assert.equal(recovery.wasSelected, false);
  assert.equal(harness.conversationIdRef.current, LIVE_CONVERSATION_ID);
  assert.equal(harness.state().activeConversationId, LIVE_CONVERSATION_ID);
  // 没被选中的话，落盘 id 不动（它指着的是另一个还活着的会话）。
  assert.deepEqual(harness.storedIds, []);
  assert.deepEqual(
    harness.state().projects[0].conversations.map((conversation) => conversation.id),
    [LIVE_CONVERSATION_ID],
  );
});

test('real failures still surface and keep the conversation row', async () => {
  const harness = createHarness({ requestStatus: () => 500 });

  await assert.rejects(
    () => harness.handlers.handleSelectConversation(PROJECT_ID, LIVE_CONVERSATION_ID),
    /conversation restore failed: 500/,
  );
  assert.deepEqual(
    harness.state().projects[0].conversations.map((conversation) => conversation.id),
    [DEAD_CONVERSATION_ID, LIVE_CONVERSATION_ID],
  );
});

test('the list-poll removal path is the same fallback as 404 recovery', async () => {
  const harness = createHarness();
  await harness.handlers.handleConversationRemoved({
    projectId: PROJECT_ID,
    conversationId: LIVE_CONVERSATION_ID,
  });
  assert.equal(harness.conversationIdRef.current, LIVE_CONVERSATION_ID);
  assert.deepEqual(harness.toasts, []);

  // 项目里一个能接手的会话都没有：开个空白对话，和 404 那条路一致。
  const emptied = [];
  const blank = createHarness({ conversationIds: [], onOpenDraft: (projectId) => emptied.push(projectId) });
  await blank.handlers.handleConversationRemoved({ projectId: PROJECT_ID });
  assert.deepEqual(emptied, [PROJECT_ID]);
  // 什么上下文都没有时静默跳过，不炸也不弹错。
  await blank.handlers.handleConversationRemoved({});
  assert.deepEqual(blank.toasts, []);
});

test('two locally-stale rows converge on the live conversation instead of ping-ponging', async () => {
  const harness = createHarness({
    conversationIds: [DEAD_CONVERSATION_ID, SECOND_DEAD_CONVERSATION_ID, LIVE_CONVERSATION_ID],
    requestStatus: (conversationId) => (conversationId === LIVE_CONVERSATION_ID ? 200 : 404),
  });
  await harness.handlers.handleSelectConversation(PROJECT_ID, DEAD_CONVERSATION_ID);

  assert.deepEqual(harness.toasts, []);
  assert.equal(harness.conversationIdRef.current, LIVE_CONVERSATION_ID);
  assert.equal(harness.state().activeConversationId, LIVE_CONVERSATION_ID);
  assert.deepEqual(
    harness.state().projects[0].conversations.map((conversation) => conversation.id),
    [LIVE_CONVERSATION_ID],
  );
  // 两条死会话各探一次 + 接手的活会话一次：多一次就说明恢复链在打转。
  assert.equal(harness.requests.length, 3);
});

test('a caller holding a newer workspace snapshot picks the fallback from it', () => {
  // 启动恢复现场：ctx 里的快照还停在挂载前（连项目都没进来），调用方手里的
  // nextState 才是刚拼好的那份。
  const harness = createHarness({ conversationIds: [] });
  const snapshot = {
    activeProjectId: PROJECT_ID,
    activeConversationId: DEAD_CONVERSATION_ID,
    projects: [{
      id: PROJECT_ID,
      executionMode: 'chat',
      conversations: [
        { id: DEAD_CONVERSATION_ID, executionMode: 'chat', tasks: [] },
        { id: LIVE_CONVERSATION_ID, executionMode: 'chat', tasks: [] },
      ],
    }],
  };
  const recovery = harness.activation.dropMissingConversation(DEAD_CONVERSATION_ID, { snapshot });

  assert.equal(recovery.wasSelected, true);
  assert.equal(recovery.projectId, PROJECT_ID);
  assert.equal(recovery.fallbackConversationId, LIVE_CONVERSATION_ID);
  // 落盘的选中 id 指着死会话：先清掉，等调用方接手新会话时重写。
  assert.deepEqual(harness.storedIds, [null]);
});

test('bootstrap treats a missing remembered conversation as data, not an error page', () => {
  const source = fs.readFileSync(
    new URL('../../../src/features/conversations/hooks/useConversationBootstrap.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /if \(activationError\?\.status !== 404\) throw activationError;/);
  // 启动恢复把刚拼好的 nextState 交给恢复函数当候选来源（ctx 快照还停在挂载前）。
  assert.match(
    source,
    /activationApi\.dropMissingConversation\?\.\(missingConversationId, \{\s*snapshot: nextState,\s*\}\)/,
  );
});
