import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';
import { createQuestExecutor } from '../../../src/features/tasks/hooks/task-stream/quest-execution.js';

for (const executionMode of ['chat', 'bot']) {
  test(`${executionMode}: actual executor rejection preserves formal history and releases transport`, async () => {
    const original = { id: 'old', status: 'done', executionMode };
    const rt = { taskRuntimeState: { tasksById: { old: original }, taskOrder: ['old'], latestTaskId: 'old', activeTaskId: null, pendingTask: null }, cancelledRunIds: new Set() };
    const workflow = { workflow_id: 'workflow', nodes: [{ id: 'agent', type: 'agent', runtime_config: { llm_config_id: 'fixture', model_id: 'model' } }] };
    const noop = () => {};
    const execute = createQuestExecutor({
      ctx: { providerOptions: [{ id: 'fixture', provider: 'custom' }] },
      getRuntime: () => rt,
      mutateRuntime: (_, fn) => fn(rt),
      updateTaskRuntimeState: fn => { rt.taskRuntimeState = fn(rt.taskRuntimeState); },
      generateHexId: () => 'request',
      chatFinalizedTaskIdsRef: { current: new Set() }, userCancelledTaskIdsRef: { current: new Set() },
      setRuntimeFetchController: value => { rt.fetchController = value; },
      setRuntimeActiveTaskId: value => { rt.activeTaskId = value; },
      setRuntimeBusy: value => { rt.busy = value; },
      runTaskStream: async () => { throw Object.assign(new Error('Creation rejected'), { status: 400 }); },
      activeTaskConflictDetail: '', streamTargetConvIdRef: { current: null },
      batchRuntimeMutations: (_, fn) => fn(),
      removeConversationTaskFromWorkspace: noop,
    });
    const toasts = [];
    let clearedPayload = 0;
    const handlers = createDeployHandlers({
      executeQuest: execute, getRuntime: () => rt,
      conversationIdRef: { current: 'conversation' },
      viewModeRef: { current: executionMode === 'chat' ? 'chat' : 'workflow' },
      APP_DEFAULT_AGENT_OPTIONS: [{ id: 'agent' }],
      providerOptions: [{ id: 'fixture', provider: 'custom' }],
      normalizeWorkflowSettings: () => ({ presets: [workflow], custom: [] }),
      findConversationById: () => ({ name: 'Existing', tasks: [original] }),
      isDefaultConversationName: () => false, titleFromTaskText: text => text,
      setComposerAttachment: () => { clearedPayload++; }, clearContextTask: () => { clearedPayload++; }, setWorkspaceState: noop,
      updateTaskRuntimeState: fn => { rt.taskRuntimeState = fn(rt.taskRuntimeState); },
      flushRuntimeTasksToWorkspace: noop,
      showToast: (...args) => toasts.push(args),
      setRuntimeBusy: value => { rt.busy = value; },
      setRuntimeActiveTaskId: value => { rt.activeTaskId = value; },
      setRuntimeActiveRunId: value => { rt.activeRunId = value; },
      setRuntimeFetchController: value => { rt.fetchController = value; },
    });
    const accepted = await handlers.startDeploy({ text: 'Keep input', displayText: 'Keep input', executionMode,
      agentId: 'agent', workflowId: 'workflow', providerRequest: 'fixture', modelId: 'model', imageAttachments: [], annotations: [], contextTasks: [{ taskId: 'old' }],
    }, 'conversation');
    assert.equal(accepted, false);
    assert.equal(clearedPayload, 0);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0][1], /Failed to create task/);
    assert.equal(rt.taskRuntimeState.submission, null);
    assert.equal(rt.busy, false);
    assert.equal(rt.activeRunId, null);
    assert.deepEqual(rt.taskRuntimeState.taskOrder, ['old']);
    assert.equal(rt.taskRuntimeState.tasksById.old, original);
    assert.equal(rt.fetchController, null);
    assert.equal(rt.pendingRun, null);
  });
}
