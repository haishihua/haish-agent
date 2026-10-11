import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { HAISH_API_BASE: '' };
const { createWorkflowTaskSelectionHandler } = await import('../../../src/features/conversations/hooks/createWorkflowTaskSelectionHandler.js');
const { createGoalCommandHandler } = await import('../../../src/features/conversations/hooks/createGoalCommandHandler.js');
const { createDeployHandlers } = await import('../../../src/features/tasks/hooks/createDeployHandlers.js');
const { createConversationRuntime } = await import('../../../src/features/conversations/hooks/createConversationRuntime.js');
const { createConversationActivationHandlers } = await import('../../../src/features/conversations/hooks/createConversationActivationHandlers.js');
const { buildTaskRuntimeRecord, createEmptyTaskRuntimeState, createPendingTaskDraft, runtimeTaskToQuest } = await import('../../../src/features/tasks/model/task-runtime.js');
const { pendingTaskToQuest } = await import('../../../src/features/chat/model/chat-timeline.js');
const {
  conversationDetailToWorkspaceConversation, findConversationById, isDefaultConversationName,
  mergeConversationTasks, normalizeWorkspaceOrdering, projectWorkflowTasks,
  replaceWorkspaceModeFromProjects, taskUpdatedTimestamp,
  workspaceStateWithConversationDetail, workspaceStateWithTouchedConversation,
} = await import('../../../src/features/conversations/model/workspace-state.js');

for (const background of [false, true]) {
  test(`/goal imports a missing project and replaces its only task placeholder (${background ? 'background' : 'foreground'})`, async () => {
    const source = { id: 'chat-project', name: 'Project', executionMode: 'chat', workspacePath: '/repo', conversations: [] };
    const target = { project_id: 'bot-project', name: 'Project', execution_mode: 'bot', workspace_path: '/repo', conversations: [], tasks: [] };
    const detail = { conversation_id: 'bot-conversation', project_id: 'bot-project', execution_mode: 'bot', workspace_path: '/repo', title: 'Goal', tasks: [] };
    let workspace = { activeProjectId: source.id, activeConversationId: 'chat-conversation', projects: [source] };
    const calls = [], notices = [];
    let seq = 0, launches = 0, confirm;
    const ctx = {
      API_BASE: '', workspaceState: workspace, providerOptions: [{ provider: 'source-provider' }],
      conversationIdRef: { current: 'chat-conversation' }, viewModeRef: { current: 'chat' },
      draftConversationRef: { current: null }, streamTargetConvIdRef: { current: null },
      modeLocationRef: { current: {} }, runtimesRef: { current: new Map() },
      taskImageAttachmentsRef: { current: new Map() },
      userCancelledTaskIdsRef: { current: new Set() }, chatFinalizedTaskIdsRef: { current: new Set() },
      workflowSettingsDraft: { presets: [{ workflow_id: 'workflow.goal-loop', nodes: ['clarify', 'goal_worker', 'goal_verifier'].map((id) => ({ id, type: 'agent' })) }] }, workflowById: (settings) => settings.presets[0],
      buildApiHeaders: () => ({}),
      invalidateConversationActivation: () => ++seq,
      isConversationActivationCurrent: (value) => value === seq,
      setWorkspaceState: (update) => { workspace = update(workspace); },
      setTaskRuntimeState: () => {}, setBusy: () => {}, setShellSeeded: () => {},
      setViewMode: () => {}, setSelectedWorkflowId: () => {}, setComposerAttachment: () => {},
      showToast: (...args) => notices.push(args),
      createEmptyTaskRuntimeState, createPendingTaskDraft, buildTaskRuntimeRecord,
      normalizeWorkspaceOrdering, conversationDetailToWorkspaceConversation, replaceWorkspaceModeFromProjects,
      workspaceStateWithConversationDetail, workspaceStateWithTouchedConversation,
      findConversationById, isDefaultConversationName, taskUpdatedTimestamp,
      titleFromTaskText: (text) => text,
      normalizeWorkflowSettings: (value) => ({ ...value, custom: [] }),
      timestampValue: (value) => Date.parse(value) || 0,
      apiFetch: async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET' });
        return { ok: true, json: async () => url.includes('?') ? { projects: [] } : target };
      },
      createConversationInProject: async () => { calls.push({ url: '/api/conversations', method: 'POST' }); return detail; },
      activateConversationDetail: async () => {
        ctx.conversationIdRef.current = detail.conversation_id;
        ctx.setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail));
      },
    };
    Object.assign(ctx, createConversationRuntime(ctx));
    const activation = createConversationActivationHandlers(ctx);
    ctx.executeQuest = async () => {
      launches++;
      ctx.getRuntime(detail.conversation_id, { create: true }).activeRunId = 'local-run';
      await new Promise((resolve) => { confirm = resolve; });
      activation.ensureTaskForEvent({ task_id: 'server-task', conversation_id: detail.conversation_id }, detail.conversation_id);
    };
    Object.assign(ctx, createDeployHandlers(ctx));
    const runConfig = { provider: 'source-provider', model_id: 'source-model', reasoning_effort: 'high' };
    const expectedConfigs = Object.fromEntries(['clarify', 'goal_worker', 'goal_verifier'].map((id) => [id, runConfig]));
    const accepted = await createGoalCommandHandler(ctx)({ prompt: 'Goal', runConfig });
    assert.equal(accepted, true);
    assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST', 'POST', 'PUT']);
    const project = () => workspace.projects.find((item) => item.id === target.project_id);
    const runtime = ctx.getRuntime(detail.conversation_id);
    const placeholder = runtime.taskRuntimeState.pendingTask;
    assert.equal(project().conversations.length, 1);
    assert.equal(projectWorkflowTasks(project()).length, 1);
    assert.notEqual(placeholder.id, 'server-task');
    assert.deepEqual(placeholder.nodeRuntimeConfigs, expectedConfigs);
    if (background) ctx.conversationIdRef.current = 'another-conversation';
    confirm();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.taskRuntimeState.pendingTask, null);
    const rows = projectWorkflowTasks(project());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].task.taskId, 'server-task');
    assert.equal(rows[0].conversationId, detail.conversation_id);
    assert.deepEqual(runtime.taskRuntimeState.tasksById['server-task'].nodeRuntimeConfigs, expectedConfigs);
    assert.deepEqual(rows[0].task.nodeRuntimeConfigs, expectedConfigs);
    assert.equal(launches, 1);
    assert.equal(notices.length, 0);
    // Simulate a delayed sidebar snapshot retaining the local placeholder.
    const merged = mergeConversationTasks([placeholder], [runtime.taskRuntimeState.tasksById['server-task']]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].taskId, 'server-task');
    assert.equal(merged[0].id, 'server-task');
  });
}

for (const idOnly of [false, true]) {
  test(`approval-node replay preserves its placeholder through sidebar projection (${idOnly ? 'id only' : 'taskId'})`, async () => {
    const source = { taskId: 'source', title: 'Same prompt', status: 'done' };
    const pending = {
      id: 'local-replay', ...(idOnly ? {} : { taskId: 'local-replay' }),
      conversationId: 'conversation', title: 'Same prompt', status: 'running',
      executionMode: 'bot', sourceTaskId: 'source', rerunFromNodeId: 'approve_requirements',
      workflowSnapshot: { id: 'workflow.goal-loop', nodes: [] },
      workflowRun: { nodes: { clarify: { status: 'done' } } },
      nodeRuntimeConfigs: { goal_worker: { model_id: 'source-model' } },
    };
    const projected = pendingTaskToQuest(pending);
    assert.equal(projected.id, 'local-replay');
    assert.equal(projected.taskId, 'local-replay');
    for (const field of ['conversationId', 'sourceTaskId', 'rerunFromNodeId', 'workflowSnapshot', 'workflowRun', 'nodeRuntimeConfigs']) {
      assert.deepEqual(projected[field], pending[field]);
    }
    const rows = mergeConversationTasks([source, pending], [runtimeTaskToQuest(source), projected]);
    assert.deepEqual(rows.map((task) => task.taskId || task.id), ['source', 'local-replay']);
    const selected = [], restored = [];
    const ctx = {
      getRuntime: () => ({ taskRuntimeState: { pendingTask: pending } }),
      handleSelectConversation: async (...args) => selected.push(args),
      setViewedWorkflowTask: (value) => assert.equal(value, null),
      restoreLatestTaskRuntime: async (id) => restored.push(id),
    };
    await createWorkflowTaskSelectionHandler(ctx)('project', 'conversation', rows[1]);
    assert.deepEqual(selected, [['project', 'conversation']]);
    assert.deepEqual(restored, []);
    const confirmed = buildTaskRuntimeRecord({ task_id: 'server-replay', conversation_id: 'conversation' }, pending);
    confirmed.status = 'running';
    const confirmedRows = mergeConversationTasks(rows, [runtimeTaskToQuest(source), runtimeTaskToQuest(confirmed)]);
    assert.deepEqual(confirmedRows.map((task) => task.taskId || task.id), ['source', 'server-replay']);
    assert.equal(confirmedRows[1].id, 'server-replay');
    ctx.getRuntime = () => ({ taskRuntimeState: { pendingTask: null } });
    ctx.setViewedWorkflowTask = () => {};
    ctx.setTaskCompletionNotices = () => {};
    ctx.ownerIdRef = { current: 'owner' };
    ctx.conversationIdRef = { current: 'conversation' };
    globalThis.window.localStorage = { getItem: () => null, setItem: () => {} };
    await createWorkflowTaskSelectionHandler(ctx)('project', 'conversation', confirmedRows[1]);
    assert.deepEqual(restored, ['server-replay']);
  });
}

test('confirmation dedupes a polled server summary but keeps unrelated tasks and repeated identical prompts', () => {
  const pending = { id: 'local', title: 'Same prompt' };
  const confirmed = { taskId: 'server', pendingTaskId: 'local', title: 'Same prompt', status: 'running' };
  const unrelated = { taskId: 'other', title: 'Same prompt', status: 'done' };
  const merged = mergeConversationTasks([pending, { task_id: 'server' }, unrelated], [confirmed]);
  assert.deepEqual(merged.map((task) => task.taskId || task.task_id || task.id), ['server', 'other']);
  assert.equal(merged[0].status, 'running');
});

test('clicking an unconfirmed Workflow task never fetches or persists its local id', async () => {
  const selected = [], viewed = [], restored = [];
  const ctx = {
    getRuntime: () => ({ taskRuntimeState: { pendingTask: { id: 'local' } } }),
    handleSelectConversation: async (...args) => selected.push(args),
    setViewedWorkflowTask: (value) => viewed.push(value),
    restoreLatestTaskRuntime: async (...args) => restored.push(args),
  };
  await createWorkflowTaskSelectionHandler(ctx)('project', 'conversation', { id: 'local' });
  assert.deepEqual(selected, [['project', 'conversation']]);
  assert.deepEqual(viewed, [null]);
  assert.equal(restored.length, 0);
});

test('a confirmed Workflow row restores its real task id and genuine missing tasks still recover', async () => {
  const restored = [], removed = [], notices = [];
  globalThis.window.localStorage = { getItem: () => null, setItem: () => {} };
  const ctx = {
    getRuntime: () => ({ taskRuntimeState: { pendingTask: null } }),
    ownerIdRef: { current: 'owner' }, conversationIdRef: { current: 'conversation' },
    setTaskCompletionNotices: () => {}, setViewedWorkflowTask: () => {},
    handleSelectConversation: async () => {},
    restoreLatestTaskRuntime: async (id, options) => { restored.push(id); assert.equal(options.isCurrentActivation(), true); },
    removeMissingTask: (...args) => removed.push(args), showToast: (...args) => notices.push(args),
  };
  await createWorkflowTaskSelectionHandler(ctx)('project', 'conversation', { taskId: 'server' });
  assert.deepEqual(restored, ['server']);
  ctx.restoreLatestTaskRuntime = async () => { throw Object.assign(new Error('missing'), { status: 404 }); };
  await createWorkflowTaskSelectionHandler(ctx)('project', 'conversation', { taskId: 'deleted' });
  assert.deepEqual(removed, [['conversation', 'deleted']]);
  assert.equal(notices.length, 1);
});
