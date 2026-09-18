import test from 'node:test';
import assert from 'node:assert/strict';

// The activation handler chain reaches shared/api/base.js, which reads window.
globalThis.window = globalThis.window || { haish: {} };

const { createConversationActivationHandlers } = await import(
  '../../../src/features/conversations/hooks/createConversationActivationHandlers.js'
);
const { sortTaskIdsForRestore, taskSummaryToRuntimeTask, isTerminalTaskStatus } = await import(
  '../../../src/features/tasks/model/task-runtime.js'
);
const { isTaskActuallyActive, mergeChatImageRefs } = await import(
  '../../../src/features/conversations/model/workspace-state.js'
);

const CONVERSATION_ID = 'conversation-1';

function taskSummary(taskId, index) {
  return {
    task_id: taskId,
    conversation_id: CONVERSATION_ID,
    title: `Turn ${index}`,
    description: '',
    status: 'done',
    stage: 'done',
    created_at: `2026-09-12T00:00:0${index}.000Z`,
    updated_at: `2026-09-12T00:00:0${index}.500Z`,
  };
}

const DETAIL = {
  conversation_id: CONVERSATION_ID,
  last_task_id: 'task-6',
  execution_mode: 'chat',
  workspace_path: '/tmp/haish-workspace',
  messages: [],
  tasks: [
    taskSummary('task-1', 1),
    taskSummary('task-2', 2),
    taskSummary('task-3', 3),
    taskSummary('task-4', 4),
    taskSummary('task-5', 5),
    taskSummary('task-6', 6),
  ],
};

const TASK_ORDER = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6'];

function createActivationHarness() {
  const conversationIdRef = { current: null };
  const runtimes = new Map();
  const restoreCalls = [];
  const handlers = createConversationActivationHandlers({
    API_BASE: 'http://runtime',
    activeRuntimeTargetConvId: (explicit) => explicit || conversationIdRef.current,
    apiFetch: async () => { throw new Error('activation must not fetch on its own'); },
    buildTaskRuntimeRecord: () => ({}),
    chatImageFallbacksByTaskIdFromMessages: () => new Map(),
    clearDraftConversationState: () => {},
    applyContextUsage: () => {},
    contextUsageFromConversationDetail: () => ({}),
    conversationIdRef,
    draftConversationRef: { current: null },
    estimateContextUsageFromConversationDetail: () => ({}),
    findConversationById: () => null,
    findProjectByConversationId: () => null,
    flushRuntimeTasksToWorkspace: () => {},
    getRuntime: (convId) => (convId ? runtimes.get(convId) || null : null),
    invalidateConversationActivation: () => 1,
    isConversationActivationCurrent: () => true,
    isTaskActuallyActive,
    isTerminalTaskStatus,
    latestContextUsageFromTasks: () => ({}),
    loadStoredContextUsage: () => ({}),
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
    restoreTaskRuntimes: async (taskIds, options) => {
      restoreCalls.push({ taskIds, options });
      return [];
    },
    saveStoredContextUsage: () => {},
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
    workspaceState: { projects: [] },
    workspaceStateWithConversationDetail: (state) => state,
  });
  return { conversationIdRef, handlers, restoreCalls, runtimes };
}

test('opening a conversation fetches only the newest task runtimes', async () => {
  const harness = createActivationHarness();
  await harness.handlers.activateConversationDetail(DETAIL, { restoreLatest: true, activationSeq: 1 });

  assert.equal(harness.restoreCalls.length, 1);
  assert.deepEqual(harness.restoreCalls[0].taskIds, ['task-6', 'task-5', 'task-4']);
  assert.equal(harness.restoreCalls[0].options.targetConversationId, CONVERSATION_ID);
  assert.equal(harness.restoreCalls[0].options.isCurrentActivation(), true);

  // Every older turn still has its summary, so the timeline keeps its rows and
  // only the execution records are missing until the user scrolls up.
  const { taskOrder, tasksById } = harness.runtimes.get(CONVERSATION_ID).taskRuntimeState;
  assert.deepEqual(taskOrder, TASK_ORDER);
  assert.deepEqual(Object.keys(tasksById).sort(), TASK_ORDER);
  for (const task of Object.values(tasksById)) {
    assert.equal(task.runtimeHydrated, false);
    assert.equal(task.status, 'done');
  }
});

test('an activation without restoreLatest never fetches task runtimes', async () => {
  const harness = createActivationHarness();
  await harness.handlers.activateConversationDetail(DETAIL, { restoreLatest: false, activationSeq: 1 });

  assert.deepEqual(harness.restoreCalls, []);
  assert.deepEqual(
    harness.runtimes.get(CONVERSATION_ID).taskRuntimeState.taskOrder,
    TASK_ORDER,
  );
});

test('a single-task conversation still hydrates that task up front', async () => {
  const harness = createActivationHarness();
  await harness.handlers.activateConversationDetail(
    { ...DETAIL, last_task_id: 'task-1', tasks: [taskSummary('task-1', 1)] },
    { restoreLatest: true, activationSeq: 1 },
  );

  assert.deepEqual(harness.restoreCalls[0].taskIds, ['task-1']);
});
