import test from 'node:test';
import assert from 'node:assert/strict';

// The activation handler chain reaches shared/api/base.js, which reads window.
globalThis.window = globalThis.window || { haish: {} };

const {
  configureContextTotalTokens, createEmptyContextUsage, createContextUsageTracker,
  contextUsageFromConversationDetail, estimateContextUsageFromConversationDetail,
  latestContextUsageFromTasks, loadStoredContextUsage, normalizeContextUsage,
  saveStoredContextUsage,
} = await import('../../../src/features/chat/model/context-usage.js');
const { createConversationActivationHandlers } = await import(
  '../../../src/features/conversations/hooks/createConversationActivationHandlers.js'
);
const { sortTaskIdsForRestore, taskSummaryToRuntimeTask, isTerminalTaskStatus } = await import(
  '../../../src/features/tasks/model/task-runtime.js'
);
const { findConversationById, isTaskActuallyActive, mergeChatImageRefs } = await import(
  '../../../src/features/conversations/model/workspace-state.js'
);

const CONVERSATION_ID = 'forked-conversation';
const CONTEXT_LIMIT = 256000;
const FORK_TOKENS = 71859;
const RECORDED_TOKENS = 240137;
// 用户截图上的那次：本地存着前一天 200k 的读数，服务端这一轮实测已经从
// 229k 压到 50k——表盘必须跟着服务端走。
const STALE_TOKENS = 199844;
const STALE_AT = '2026-09-17T18:04:22.077484Z';
const MEASURED_TOKENS = 50217;
const MEASURED_AT = '2026-09-18T06:06:18.704000Z';
const CACHED_AT = '2026-09-18T02:06:00Z';
const BEFORE_COMPACTION_TOKENS = 229211;
const BEFORE_COMPACTION_AT = '2026-09-18T06:04:33.000000Z';

function measuredTaskSummary(taskId, { tokens, at }) {
  return {
    ...taskSummary(taskId, 1),
    context_used_tokens: tokens,
    context_used_tokens_at: at,
  };
}

function taskSummary(taskId, index) {
  return {
    task_id: taskId,
    conversation_id: CONVERSATION_ID,
    title: `Turn ${index}`,
    description: '',
    status: 'done',
    stage: 'done',
    created_at: `2026-09-18T02:0${index}:00.000Z`,
    updated_at: `2026-09-18T02:0${index}:30.000Z`,
  };
}

// A forked conversation inherits its whole prefix history: 322 messages is the shape
// that showed up as "279k / 256k · Over limit" right after forking 后端优化.
const inheritedHistory = () => Array.from(
  { length: 322 },
  () => ({ content: '文'.repeat(900) }),
);

function createHarness({ workspaceState = { projects: [] } } = {}) {
  const storage = new Map();
  globalThis.window = {
    haish: { homePath: '/tmp/haish-home' },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  configureContextTotalTokens(CONTEXT_LIMIT);
  const conversationIdRef = { current: null };
  const runtimes = new Map();
  const displayed = [];
  // AppShell 里的表盘工厂：应用侧的写入入口就是它，测试直接接上同一份仲裁逻辑。
  const contextUsageTracker = createContextUsageTracker({
    getActiveConversationId: () => conversationIdRef.current,
    onChange: (usage) => displayed.push(usage),
  });
  const handlers = createConversationActivationHandlers({
    API_BASE: 'http://runtime',
    activeRuntimeTargetConvId: (explicit) => explicit || conversationIdRef.current,
    apiFetch: async () => { throw new Error('activation must not fetch on its own'); },
    applyContextUsage: (candidate, options) => contextUsageTracker.apply(candidate, options),
    buildTaskRuntimeRecord: () => ({}),
    chatImageFallbacksByTaskIdFromMessages: () => new Map(),
    clearDraftConversationState: () => {},
    contextUsageFromConversationDetail,
    conversationIdRef,
    draftConversationRef: { current: null },
    estimateContextUsageFromConversationDetail,
    findConversationById,
    findProjectByConversationId: () => null,
    flushRuntimeTasksToWorkspace: () => {},
    getRuntime: (convId) => (convId ? runtimes.get(convId) || null : null),
    invalidateConversationActivation: () => 1,
    isConversationActivationCurrent: () => true,
    isTaskActuallyActive,
    isTerminalTaskStatus,
    latestContextUsageFromTasks,
    loadStoredContextUsage,
    mergeChatImageRefs,
    mutateRuntime: (convId, mutator) => {
      let runtime = runtimes.get(convId);
      if (!runtime) {
        runtime = { taskRuntimeState: { activeTaskId: null, pendingTask: null, taskOrder: [], tasksById: {} } };
        runtimes.set(convId, runtime);
      }
      mutator(runtime);
      return runtime;
    },
    pendingCreatedDetailRef: { current: null },
    restoreTaskRuntimes: async () => [],
    setComposerAttachment: () => {},
    setConversationAttachments: () => {},
    setConversationId: () => {},
    setLocalWorkspace: () => {},
    setStoredConversationId: () => {},
    setUploadState: () => {},
    setViewMode: () => {},
    setWorkspaceState: (updater) => updater({ projects: [] }),
    sortTaskIdsForRestore,
    syncDisplayedRuntime: () => {},
    taskImageAttachmentsRef: { current: new Map() },
    taskSummaryToRuntimeTask,
    timestampValue: (value) => (value ? Date.parse(value) || 0 : 0),
    updateTaskRuntimeState: () => {},
    userCancelledTaskIdsRef: { current: new Set() },
    viewModeRef: { current: 'chat' },
    workspaceState,
    workspaceStateWithConversationDetail: (state) => state,
  });
  return { handlers, displayed, storage };
}

const activationDetail = (overrides = {}) => ({
  conversation_id: CONVERSATION_ID,
  project_id: 'project-1',
  execution_mode: 'chat',
  workspace_path: '/tmp/haish-workspace',
  last_task_id: 'task-1',
  messages: inheritedHistory(),
  tasks: [taskSummary('task-1', 1)],
  ...overrides,
});

test('a forked conversation shows the inherited measurement, not the history estimate', async () => {
  const harness = createHarness();
  await harness.handlers.activateConversationDetail(
    activationDetail({ context_used_tokens: FORK_TOKENS, updated_at: '2026-09-18T02:07:28Z' }),
    { restoreLatest: true, activationSeq: 1 },
  );

  assert.equal(harness.displayed.length, 1);
  assert.equal(harness.displayed[0].usedTokens, FORK_TOKENS);
  assert.equal(harness.displayed[0].estimated, false);
  assert.equal(harness.displayed[0].overLimit, false);
  // 同一份历史按正文长度估算会虚高到超过窗口——这正是不能拿它当真值的原因。
  assert.ok(
    estimateContextUsageFromConversationDetail(activationDetail()).usedTokens > CONTEXT_LIMIT,
  );
  // 会话级落盘值没有采样时刻：写进本地缓存也读不回来（loadStoredContextUsage 只认带
  // 采样时刻的读数），下次打开会话时它由服务端（详情 / 工作区快照）再给一次。
  assert.deepEqual([...harness.storage.values()], []);
});

test('without any measurement the estimate is a placeholder that never reads as over limit', async () => {
  const harness = createHarness();
  await harness.handlers.activateConversationDetail(activationDetail(), {
    restoreLatest: true, activationSeq: 1,
  });

  const usage = harness.displayed[0];
  assert.equal(usage.estimated, true);
  assert.ok(usage.usedTokens > CONTEXT_LIMIT, 'the raw estimate is still shown');
  assert.equal(usage.overLimit, false);
  assert.equal(usage.compressed, false);
  // 估算不落盘，否则下次会冒充真实读数。
  assert.deepEqual([...harness.storage.values()], []);
});

test('the server-side measurement outranks a local cache, and a fresh sample outranks both', async () => {
  const harness = createHarness();
  // 本地缓存：上一次会话看到的读数（能带采样时刻，但仍然只是个缓存）。
  saveStoredContextUsage(normalizeContextUsage({
    conversationId: CONVERSATION_ID,
    usedTokens: RECORDED_TOKENS,
    totalTokens: CONTEXT_LIMIT,
    updatedAt: '2026-09-18T02:06:00Z',
  }));

  // 服务端会话级实测值（fork 继承 / 服务端的最后一次实测）：没有采样时刻，但它
  // 是服务端自己的真相，比本地缓存可信——否则读旧会话时会一直看着好几天前的数字。
  await harness.handlers.activateConversationDetail(
    activationDetail({ context_used_tokens: FORK_TOKENS, updated_at: '2026-09-18T02:07:28Z' }),
    { restoreLatest: true, activationSeq: 1 },
  );

  assert.equal(harness.displayed.at(-1).usedTokens, FORK_TOKENS);
  assert.equal(harness.displayed.at(-1).valid, true);
});

test('a sample seen in this session beats the server-side conversation value', async () => {
  const harness = createHarness();
  // 远端在跑、本机只是轮询：任务快照（压缩后实测 50k）先到，随后到的会话级旧值
  // （229k）没有采样时刻，不能把表盘推回去。
  await harness.handlers.activateConversationDetail(
    activationDetail({
      context_used_tokens: BEFORE_COMPACTION_TOKENS,
      tasks: [measuredTaskSummary('task-9', { tokens: MEASURED_TOKENS, at: MEASURED_AT })],
    }),
    { restoreLatest: true, activationSeq: 1 },
  );

  assert.equal(harness.displayed.at(-1).usedTokens, MEASURED_TOKENS);
  assert.equal(harness.displayed.at(-1).updatedAt, MEASURED_AT);
});

test('legacy stored estimates lose their voice instead of painting the meter red', async () => {
  const harness = createHarness();
  saveStoredContextUsage(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: 1, totalTokens: CONTEXT_LIMIT,
    updatedAt: '2026-09-18T02:00:00Z',
  }));
  const [storageKey] = harness.storage.keys();
  // 旧版本把历史估算当读数存过：没有 provider 时间戳，读回来只能当"没有读数"。
  harness.storage.set(storageKey, JSON.stringify({
    [CONVERSATION_ID]: { usedTokens: 279256, totalTokens: CONTEXT_LIMIT, overLimit: true },
  }));

  const loaded = loadStoredContextUsage(CONVERSATION_ID);
  assert.equal(loaded.usedTokens, 0);
  assert.equal(loaded.valid, false);
  assert.equal(loaded.overLimit, false);
  assert.equal(contextUsageFromConversationDetail(null).usedTokens, 0);
  assert.equal(createEmptyContextUsage(CONVERSATION_ID).overLimit, false);
});

// —— 表盘读数来源之间的仲裁（用户看到的 200k / 256k 就是这里出过问题）——

test('a fresh server measurement outranks the stale local record', async () => {
  const harness = createHarness();
  saveStoredContextUsage(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: STALE_TOKENS,
    totalTokens: CONTEXT_LIMIT, updatedAt: STALE_AT,
  }));

  await harness.handlers.activateConversationDetail(
    activationDetail({
      context_used_tokens: STALE_TOKENS,
      tasks: [measuredTaskSummary('task-9', { tokens: MEASURED_TOKENS, at: MEASURED_AT })],
    }),
    { restoreLatest: true, activationSeq: 1 },
  );

  assert.deepEqual(harness.displayed.map((usage) => usage.usedTokens), [STALE_TOKENS, MEASURED_TOKENS]);
  // 落盘也跟着换成新值：下次切回来不会又退到旧读数。
  assert.equal(loadStoredContextUsage(CONVERSATION_ID).usedTokens, MEASURED_TOKENS);
  assert.equal(loadStoredContextUsage(CONVERSATION_ID).updatedAt, MEASURED_AT);
});

test('a smaller reading after compaction still wins because it is newer', async () => {
  const harness = createHarness();
  saveStoredContextUsage(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: BEFORE_COMPACTION_TOKENS,
    totalTokens: CONTEXT_LIMIT, updatedAt: BEFORE_COMPACTION_AT,
  }));

  await harness.handlers.activateConversationDetail(
    activationDetail({
      tasks: [measuredTaskSummary('task-9', { tokens: MEASURED_TOKENS, at: MEASURED_AT })],
    }),
    { restoreLatest: true, activationSeq: 1 },
  );

  assert.ok(MEASURED_TOKENS < BEFORE_COMPACTION_TOKENS);
  assert.equal(harness.displayed.at(-1).usedTokens, MEASURED_TOKENS);
  assert.equal(harness.displayed.at(-1).overLimit, false);
});

test('an older task snapshot coming back from paging never rolls the meter back', async () => {
  const harness = createHarness();
  saveStoredContextUsage(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: MEASURED_TOKENS,
    totalTokens: CONTEXT_LIMIT, updatedAt: MEASURED_AT,
  }));

  await harness.handlers.activateConversationDetail(
    activationDetail({
      tasks: [measuredTaskSummary('task-1', {
        tokens: BEFORE_COMPACTION_TOKENS, at: BEFORE_COMPACTION_AT,
      })],
    }),
    { restoreLatest: true, activationSeq: 1 },
  );

  assert.equal(harness.displayed.at(-1).usedTokens, MEASURED_TOKENS);
});

// —— 切回会话（运行时已就绪、详情不再回填）时的表盘 ——
// 现场：会话明明跑过任务，表盘却是 Context: 0k / 256k。切换只读本地缓存，而缓存里这
// 条会话的读数读不回来（旧版本存的估算条目、或被写脏的无采样时刻读数），运行时又已经
// 就绪（conversationRuntimeIsCurrent 直接返回 null，不再拉详情），表盘就空着等下轮采样。

function snapshotConversation(tasks) {
  return { id: CONVERSATION_ID, name: 'Turn 1', executionMode: 'chat', tasks };
}

const workspaceWithSnapshot = (tasks) => ({
  projects: [{ id: 'project-1', executionMode: 'chat', conversations: [snapshotConversation(tasks)] }],
});

test('a reading without a sampling time never overwrites the cached sample', async () => {
  const harness = createHarness();
  saveStoredContextUsage(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: RECORDED_TOKENS,
    totalTokens: CONTEXT_LIMIT, updatedAt: CACHED_AT,
  }));
  harness.handlers.activateConversationShell('project-1', CONVERSATION_ID);
  // 详情带来的会话级落盘值（fork 继承那种，没有采样时刻）本来就该压过本地缓存…
  await harness.handlers.activateConversationDetail(
    activationDetail({ context_used_tokens: FORK_TOKENS }),
    { activationSeq: 1 },
  );
  assert.equal(harness.displayed.at(-1).usedTokens, FORK_TOKENS);
  // …但不能把缓存写成读不回来的样子：写进去的是它，下次切回来读成 0k 的也是它。
  const stored = loadStoredContextUsage(CONVERSATION_ID);
  assert.equal(stored.usedTokens, RECORDED_TOKENS);
  assert.equal(stored.updatedAt, CACHED_AT);
});

test('coming back to a conversation with an unusable cache reads the snapshot measurement', async () => {
  const harness = createHarness({
    workspaceState: workspaceWithSnapshot([
      measuredTaskSummary('task-1', { tokens: MEASURED_TOKENS, at: MEASURED_AT }),
    ]),
  });
  // 第一次进入：本地还没有读数，详情把会话级落盘值（无采样时刻）带上表盘。
  harness.handlers.activateConversationShell('project-1', CONVERSATION_ID);
  await harness.handlers.activateConversationDetail(
    activationDetail({ context_used_tokens: FORK_TOKENS }),
    { activationSeq: 1 },
  );
  // 切走再切回来：运行时已就绪，这一步不再拉详情，表盘只剩缓存 + 工作区快照。
  harness.handlers.activateConversationShell('project-1', 'another-conversation');
  harness.handlers.activateConversationShell('project-1', CONVERSATION_ID);

  assert.notEqual(harness.displayed.at(-1).usedTokens, 0);
  assert.equal(harness.displayed.at(-1).usedTokens, MEASURED_TOKENS);
});
