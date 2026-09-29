// 首条发送的竞态回归：草稿 → 服务端会话的交接 / 建会话 / runtime 生命周期。
//
// 现场（2026-09，新建会话后偶发发送失败）：toast 是
// "conversation runtime is missing: <32位会话id>"——前端在"草稿的第一次发送"这段
// 窗口里把 runtime 丢了：交接只搬不补、并发建会话各建一条、在途发送被空壳回收。
// 这里钉住三个不变式：
//   1. 交接必须补齐：真会话没有 runtime 就补一块，不许静默跳过；
//   2. 同一个草稿只允许一次建会话（并发调用共享同一个 promise）；
//   3. 在途的首条发送不允许被回收（runtime 不删、空壳 DELETE 不发）。
import test from 'node:test';
import assert from 'node:assert/strict';

// 这条链路会走到 shared/api/base.js，它在模块顶层读 window（和
// missing-conversation-recovery / context-usage-activation 两份测试同一个理由），
// 所以先把 window 搭好再动态导入。
globalThis.window = globalThis.window || {
  haish: {},
  localStorage: { getItem: () => null, setItem: () => {} },
};

const { createDraftConversationHandlers } = await import(
  '../../../src/features/conversations/hooks/createDraftConversationHandlers.js'
);
const { createDeployHandlers } = await import(
  '../../../src/features/tasks/hooks/createDeployHandlers.js'
);
const { createConversationActivationHandlers } = await import(
  '../../../src/features/conversations/hooks/createConversationActivationHandlers.js'
);

const PROJECT_ID = 'project-1';
const PROJECTS = [{ id: PROJECT_ID, type: 'project', workspacePath: '/tmp/one', conversations: [] }];

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function emptyTaskRuntimeState() {
  return { activeTaskId: null, pendingTask: null, taskOrder: [], tasksById: {} };
}

function emptyRuntime() {
  return {
    taskRuntimeState: emptyTaskRuntimeState(),
    busy: false,
    activeRunId: null,
    activeTaskId: null,
    fetchController: null,
    answerBuffer: '',
    cancelledRunIds: new Set(),
    abortRequested: false,
    shellSeeded: false,
  };
}

// createConversationRuntime 的最小等价物：getRuntime 默认不建、显式 create 才建——
// 生产里 "conversation runtime is missing" 就是 getRuntime(...) 拿到 null 抛出来的。
function createRuntimeStore() {
  const runtimesRef = { current: new Map() };
  const getRuntime = (conversationIdValue, { create = false } = {}) => {
    if (!conversationIdValue) return null;
    let runtime = runtimesRef.current.get(conversationIdValue);
    if (!runtime && create) {
      runtime = emptyRuntime();
      runtimesRef.current.set(conversationIdValue, runtime);
    }
    return runtime || null;
  };
  const mutateRuntime = (conversationIdValue, mutator) => {
    const runtime = getRuntime(conversationIdValue, { create: true });
    mutator(runtime);
    return runtime;
  };
  const updateTaskRuntimeState = (updater, targetConversationId = null) => {
    mutateRuntime(targetConversationId, (runtime) => {
      runtime.taskRuntimeState = updater(runtime.taskRuntimeState);
    });
  };
  return { getRuntime, mutateRuntime, runtimesRef, updateTaskRuntimeState };
}

function createDraftHarness({ createConversationInProject } = {}) {
  const state = { conversationId: null, createCalls: 0, deletedConversationIds: [] };
  let hexCount = 0;
  let serverCount = 0;
  const conversationIdRef = { current: null };
  const draftConversationRef = { current: null };
  const draftConversationIdsRef = { current: new Map() };
  const draftFirstSendRef = { current: null };
  const draftServerCreateRef = { current: null };
  const pendingCreatedDetailRef = { current: null };
  const runtimeStore = createRuntimeStore();
  const apiFetch = async (url, options = {}) => {
    if (options.method === 'DELETE') {
      state.deletedConversationIds.push(decodeURIComponent(String(url).split('/').pop()));
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const handlers = createDraftConversationHandlers({
    API_BASE: 'http://runtime',
    DEFAULT_SESSION_NAME: 'New Conversation',
    applyConversationSnapshot: () => {},
    apiFetch,
    applyContextUsage: () => {},
    buildApiHeaders: () => ({}),
    chatFinalizedTaskIdsRef: { current: new Set() },
    conversationActivationSeqRef: { current: 0 },
    conversationDetailAbortRef: { current: null },
    conversationId: null,
    conversationIdRef,
    createConversationInProject: async (project, title) => {
      state.createCalls += 1;
      if (createConversationInProject) return createConversationInProject(project, title);
      serverCount += 1;
      return {
        conversation_id: `server-${serverCount}`,
        project_id: project.id,
        title,
        messages: [],
        tasks: [],
      };
    },
    createDefaultProject: () => ({ id: PROJECT_ID }),
    createEmptyTaskRuntimeState: emptyTaskRuntimeState,
    detachActiveRunFromCurrentConversation: () => {},
    draftConversationIdsRef,
    draftConversationRef,
    draftFirstSendRef,
    draftServerCreateRef,
    flushRuntimeTasksToWorkspace: () => {},
    generateHexId: () => `hex${++hexCount}`,
    getRuntime: runtimeStore.getRuntime,
    isDefaultConversationName: (name) => !name || name === 'New Conversation',
    isTaskActuallyActive: () => false,
    latestContextUsageFromTasks: () => ({}),
    mutateRuntime: runtimeStore.mutateRuntime,
    normalizeRuntimeEvents: (events) => events || [],
    normalizeWorkspaceOrdering: (value) => value,
    pendingCreatedDetailRef,
    rekeyChatDraft: () => {},
    resetContextUsage: () => {},
    runtimesRef: runtimeStore.runtimesRef,
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
    updateTaskRuntimeState: runtimeStore.updateTaskRuntimeState,
    userCancelledTaskIdsRef: { current: new Set() },
    viewModeRef: { current: 'chat' },
    workspaceState: { projects: PROJECTS.map((project) => ({ ...project })) },
    workspaceStateWithConversationDetail: (value) => value,
  });
  return {
    conversationIdRef,
    draftConversationRef,
    draftFirstSendRef,
    draftServerCreateRef,
    handlers,
    pendingCreatedDetailRef,
    runtimeStore,
    state,
  };
}

function createDeployHarness(options = {}) {
  const draft = createDraftHarness(options);
  const { state } = draft;
  state.executions = [];
  state.notices = [];
  state.queued = [];
  const handlers = createDeployHandlers({
    APP_DEFAULT_AGENT_OPTIONS: [{ id: 'agent-1' }],
    applyTerminalTaskState: (task) => task,
    cancelActiveConversationTask: async () => ({ ok: true }),
    cancelActiveTask: async () => ({ ok: true }),
    chatFinalizedTaskIdsRef: { current: new Set() },
    conversationDetailToWorkspaceConversation: () => null,
    conversationError: '',
    conversationId: null,
    conversationIdRef: draft.conversationIdRef,
    conversationReady: true,
    conversationSelectionPending: false,
    createPendingTaskDraft: (text) => ({ id: `pending-${state.executions.length + 1}`, title: text }),
    defaultAgentId: 'agent-1',
    defaultWorkflowId: null,
    draftConversationRef: draft.draftConversationRef,
    executeQuest: async (pendingTask, targetConversationId) => {
      // 模拟真 executeQuest 的首尾：会话完成 hydration、运行态释放。
      draft.runtimeStore.mutateRuntime(targetConversationId, (runtime) => {
        runtime.shellSeeded = false;
        runtime.busy = false;
        runtime.activeTaskId = null;
      });
      state.executions.push({ pendingTask, targetConversationId });
    },
    findConversationById: () => null,
    flushRuntimeTasksToWorkspace: () => {},
    getRuntime: draft.runtimeStore.getRuntime,
    isDefaultConversationName: (name) => !name || name === 'New Conversation',
    isDraftFirstSendInFlight: draft.handlers.isDraftFirstSendInFlight,
    isTaskActuallyActive: () => false,
    markDraftFirstSendInFlight: draft.handlers.markDraftFirstSendInFlight,
    materializeDraftConversationForSend: draft.handlers.materializeDraftConversationForSend,
    mutateRuntime: draft.runtimeStore.mutateRuntime,
    normalizeWorkflowSettings: () => ({ presets: [], custom: [] }),
    normalizeWorkspaceOrdering: (value) => value,
    pendingCreatedDetailRef: draft.pendingCreatedDetailRef,
    queuedDeploy: null,
    queueTaskInput: async () => ({}),
    readRuntimeAnswerBuffer: () => '',
    selectedConversationId: null,
    setComposerAttachment: () => {},
    setQueuedDeploy: (value) => { state.queued.push(value); },
    setRuntimeActiveRunId: () => {},
    setRuntimeActiveTaskId: () => {},
    setRuntimeBusy: () => {},
    setRuntimeFetchController: () => {},
    setWorkspaceState: () => {},
    showToast: (...args) => { state.notices.push(args); },
    taskUpdatedTimestamp: () => 0,
    titleFromTaskText: (text) => String(text || '').trim().slice(0, 48),
    updateConversationTitle: async () => null,
    updateTaskById: () => {},
    updateTaskRuntimeState: draft.runtimeStore.updateTaskRuntimeState,
    uploadChatImage: async () => ({}),
    userCancelledTaskIdsRef: { current: new Set() },
    viewMode: 'chat',
    viewModeRef: { current: 'chat' },
    workflowSettingsDraft: null,
    workspaceState: { projects: PROJECTS.map((project) => ({ ...project })) },
    workspaceStateWithConversationDetail: (value) => value,
    workspaceStateWithTouchedConversation: (value) => value,
  });
  return { ...draft, deployHandlers: handlers };
}

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

test('the handoff rebuilds the real conversation runtime after the draft runtime was reclaimed', async () => {
  const harness = createDraftHarness();
  harness.handlers.openDraftConversation(PROJECT_ID);
  const draftId = harness.state.conversationId;
  harness.handlers.markDraftFirstSendInFlight(draftId);
  // 在途发送期间 runtime 被别处回收：旧实现到这里就静默跳过交接，
  // 真会话永远没有 runtime，startDeploy 必抛 "conversation runtime is missing"。
  harness.runtimeStore.runtimesRef.current.delete(draftId);
  assert.equal(harness.runtimeStore.runtimesRef.current.has(draftId), false);

  const detail = await harness.handlers.ensureServerConversationForActiveDraft({ title: 'First message' });

  assert.equal(detail.conversation_id, 'server-1');
  assert.ok(
    harness.runtimeStore.runtimesRef.current.has('server-1'),
    '真会话必须拿到一块 runtime，而不是让首条发送失败',
  );
  assert.equal(harness.runtimeStore.runtimesRef.current.has(draftId), false);
});

test('concurrent first sends share one server conversation and one runtime handoff', async () => {
  const create = deferred();
  const harness = createDraftHarness({ createConversationInProject: () => create.promise });
  harness.handlers.openDraftConversation(PROJECT_ID);
  const draftId = harness.state.conversationId;
  harness.runtimeStore.mutateRuntime(draftId, (runtime) => { runtime.shellSeeded = true; });

  const first = harness.handlers.ensureServerConversationForActiveDraft({ title: 'first' });
  const second = harness.handlers.ensureServerConversationForActiveDraft({ title: 'second' });
  assert.equal(harness.state.createCalls, 1, '并发调用只能建一条服务端会话');

  create.resolve({
    conversation_id: 'server-9',
    project_id: PROJECT_ID,
    title: 'first',
    messages: [],
    tasks: [],
  });
  const [firstDetail, secondDetail] = await Promise.all([first, second]);

  assert.equal(harness.state.createCalls, 1);
  assert.equal(firstDetail.conversation_id, 'server-9');
  assert.equal(secondDetail.conversation_id, 'server-9');
  assert.ok(harness.runtimeStore.runtimesRef.current.has('server-9'));
  assert.equal(harness.runtimeStore.runtimesRef.current.get('server-9').shellSeeded, true);
});

test('a first send in flight keeps its empty shell alive when the user switches away', async () => {
  const harness = createDraftHarness();
  harness.handlers.openDraftConversation(PROJECT_ID);
  const draftId = harness.state.conversationId;
  await harness.handlers.ensureServerConversationForActiveDraft({ title: 'First message' });
  const serverId = harness.state.conversationId;
  harness.handlers.markDraftFirstSendInFlight(serverId);
  harness.runtimeStore.mutateRuntime(serverId, (runtime) => {
    runtime.taskRuntimeState = { ...runtime.taskRuntimeState, pendingTask: { id: 'pending-1' } };
  });

  // 用户切走 / 再点 "+"：清理不能把在途发送的 runtime 和空壳会话一起删掉。
  harness.handlers.clearDraftConversationState({ clearComposer: true });

  assert.deepEqual(harness.state.deletedConversationIds, [], '在途发送时不能发空壳 DELETE');
  assert.ok(harness.runtimeStore.runtimesRef.current.has(serverId), '在途发送的 runtime 不能回收');
  assert.equal(harness.runtimeStore.runtimesRef.current.has(draftId), false);
});

test('startDeploy recreates a missing runtime instead of failing the send', async () => {
  const harness = createDeployHarness();
  const request = harness.deployHandlers.buildDeployRequest(
    'hi',
    null,
    'model-1',
    'high',
    [],
    'agent-1',
    '',
    'hi',
    [],
  );

  assert.doesNotThrow(() => harness.deployHandlers.startDeploy(request, 'server-42'));
  assert.ok(harness.runtimeStore.runtimesRef.current.has('server-42'));

  await settle();
  assert.equal(harness.state.executions.length, 1);
  assert.equal(harness.state.executions[0].targetConversationId, 'server-42');
  assert.deepEqual(
    harness.state.notices.filter(([kind]) => kind === 'error'),
    [],
    '本地簿记缺失不该变成用户可见的失败',
  );
});

test('a second send while the first one materializes keeps its text and sends nothing', async () => {
  const create = deferred();
  const harness = createDeployHarness({ createConversationInProject: () => create.promise });
  harness.handlers.openDraftConversation(PROJECT_ID);
  const draftId = harness.draftConversationRef.current.id;
  assert.equal(draftId, harness.conversationIdRef.current);

  assert.equal(harness.deployHandlers.handleDeploy('first message'), true);
  assert.equal(harness.deployHandlers.handleDeploy('second message'), false, '文字必须留在输入框');
  assert.equal(harness.state.createCalls, 1, '第二次提交不能再建会话');
  assert.match(String(harness.state.notices.at(-1)[1]), /still being sent/);

  create.resolve({
    conversation_id: 'server-1',
    project_id: PROJECT_ID,
    title: 'first message',
    messages: [],
    tasks: [],
  });
  await settle();
  await settle();

  assert.equal(harness.state.executions.length, 1, '第一条消息只能发一轮');
  assert.equal(harness.state.executions[0].targetConversationId, 'server-1');
  assert.equal(harness.draftConversationRef.current, null);
  assert.equal(harness.deployHandlers.handleDeploy('third message'), true, '落地后发送恢复正常');
  await settle();
  assert.equal(harness.state.executions.length, 2);
});

test('a stream event for a dropped runtime recreates it instead of throwing', () => {
  const runtimeStore = createRuntimeStore();
  const updates = [];
  const handlers = createConversationActivationHandlers({
    activeRuntimeTargetConvId: (explicit) => explicit || 'conversation-1',
    buildTaskRuntimeRecord: (event) => ({ taskId: event.task_id, conversationId: event.conversation_id }),
    getRuntime: runtimeStore.getRuntime,
    mutateRuntime: runtimeStore.mutateRuntime,
    timestampValue: () => 1,
    updateTaskRuntimeState: (updater, targetConversationId) => {
      updates.push({ targetConversationId, next: updater(emptyTaskRuntimeState()) });
    },
    userCancelledTaskIdsRef: { current: new Set() },
  });

  const taskId = handlers.ensureTaskForEvent(
    { type: 'run_started', task_id: 'task-1', conversation_id: 'conversation-1' },
    'conversation-1',
  );

  assert.equal(taskId, 'task-1');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].targetConversationId, 'conversation-1');
  assert.ok(updates[0].next.tasksById['task-1'], '事件要能把任务补回 runtime');
  assert.ok(runtimeStore.runtimesRef.current.has('conversation-1'));
});
