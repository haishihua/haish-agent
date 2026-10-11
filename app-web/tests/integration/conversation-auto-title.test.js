import test from 'node:test';
import assert from 'node:assert/strict';

// workspace-state reads the browser API base when imported.
globalThis.window = globalThis.window || {
  haish: {},
  localStorage: { getItem: () => null, setItem: () => {} },
};

const { createConversationHandlers } = await import(
  '../../src/features/conversations/hooks/createConversationHandlers.js'
);
const { createDraftConversationHandlers } = await import(
  '../../src/features/conversations/hooks/createDraftConversationHandlers.js'
);
const { createDeployHandlers } = await import(
  '../../src/features/tasks/hooks/createDeployHandlers.js'
);
const {
  conversationDetailToWorkspaceConversation,
  findConversationById,
  isDefaultConversationName,
  replaceWorkspaceModeFromProjects,
  titleFromTaskText,
  workspaceStateWithConversationDetail,
  workspaceStateWithTouchedConversation,
} = await import('../../src/features/conversations/model/workspace-state.js');

function createHarness({ executionMode = 'chat', projectType = 'custom' } = {}) {
  const project = {
    id: 'project-1', executionMode, type: projectType,
    workspacePath: projectType === 'system' ? null : '/repo', conversations: [],
  };
  const state = {
    workspace: { projects: [project], activeProjectId: project.id, activeConversationId: null },
    calls: [], executions: [], detail: null,
  };
  const runtimesRef = { current: new Map() };
  const emptyTaskState = () => ({ activeTaskId: null, pendingTask: null, taskOrder: [], tasksById: {} });
  const getRuntime = (id, { create = false } = {}) => {
    if (!runtimesRef.current.has(id) && create) {
      runtimesRef.current.set(id, { taskRuntimeState: emptyTaskState(), cancelledRunIds: new Set() });
    }
    return runtimesRef.current.get(id) || null;
  };
  const ctx = {
    API_BASE: 'http://runtime', DEFAULT_SESSION_NAME: 'Default Session',
    workspaceState: state.workspace,
    conversationIdRef: { current: null }, conversationActivationSeqRef: { current: 0 },
    conversationDetailAbortRef: { current: null },
    draftConversationRef: { current: null }, draftConversationIdsRef: { current: new Map() },
    draftFirstSendRef: { current: null }, draftServerCreateRef: { current: null },
    pendingCreatedDetailRef: { current: null },
    viewModeRef: { current: executionMode === 'chat' ? 'chat' : 'workflow' },
    runtimesRef, getRuntime,
    mutateRuntime: (id, update) => update(getRuntime(id, { create: true })),
    updateTaskRuntimeState: (update, id) => {
      const runtime = getRuntime(id, { create: true });
      runtime.taskRuntimeState = update(runtime.taskRuntimeState);
    },
    setWorkspaceState: (update) => { state.workspace = update(state.workspace); },
    normalizeWorkspaceOrdering: (value) => value,
    workspaceStateWithConversationDetail, workspaceStateWithTouchedConversation,
    conversationDetailToWorkspaceConversation, titleFromTaskText, isDefaultConversationName,
    findConversationById: (_snapshot, id) => findConversationById(state.workspace, id),
    createEmptyTaskRuntimeState: emptyTaskState,
    buildApiHeaders: () => ({ 'content-type': 'application/json' }),
    apiFetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      state.calls.push({ url, method: options.method || 'GET', body });
      if (url.endsWith('/api/conversations') && options.method === 'POST') {
        state.detail = {
          conversation_id: 'server-1', project_id: body.project_id,
          execution_mode: body.execution_mode, workspace_path: project.workspacePath,
          title: body.title || 'New Chat 1', messages: [], tasks: [],
        };
      } else if (options.method === 'PATCH' && body?.title) {
        state.detail = { ...state.detail, title: body.title };
      } else {
        throw new Error(`Unexpected request: ${options.method} ${url}`);
      }
      return { ok: true, json: async () => state.detail };
    },
    applyConversationSnapshot: () => {},
    generateHexId: () => 'local-1', createDefaultProject: () => project,
    detachActiveRunFromCurrentConversation: () => {}, flushRuntimeTasksToWorkspace: () => {},
    rekeyChatDraft: () => {}, resetContextUsage: () => {},
    setComposerAttachment: () => {}, setConversationAttachments: () => {},
    setConversationError: () => {}, setConversationId: () => {}, setConversationReady: () => {},
    setLocalWorkspace: () => {}, setStoredConversationId: () => {}, setUploadState: () => {},
    APP_DEFAULT_AGENT_OPTIONS: [{ id: 'agent-1' }], defaultAgentId: 'agent-1', defaultWorkflowId: 'workflow-1',
    createPendingTaskDraft: (text) => ({ id: 'pending-1', title: text }),
    providerOptions: [{ provider: 'fixture' }],
    normalizeWorkflowSettings: () => ({ presets: [{ workflow_id: 'workflow-1', nodes: [{ id: 'worker', type: 'agent', runtime_config: { provider: 'fixture', model_id: 'model' } }] }], custom: [] }),
    executeQuest: async (task, id) => { state.executions.push({ task, id }); },
  };
  const conversations = createConversationHandlers(ctx);
  ctx.createConversationInProject = conversations.createConversationInProject;
  const drafts = createDraftConversationHandlers(ctx);
  Object.assign(ctx, drafts);
  const deploy = createDeployHandlers(ctx);
  return { ctx, conversations, drafts, deploy, project, state };
}

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

for (const executionMode of ['chat', 'bot']) {
  for (const projectType of ['system', 'custom']) {
    test(`${executionMode}/${projectType}: first send leaves persistent title ownership to the backend`, async () => {
      const h = createHarness({ executionMode, projectType });
      h.drafts.openDraftConversation(h.project.id);
      const displayText = '检查新会话首次任务结束后的自动标题生成行为，以及手动改名优先级和附件上传后的首次发送路径是否正确';
      const request = h.deploy.buildDeployRequest(
        `${displayText}\n\nInjected report not for titling`, null, 'model', null, [], executionMode === 'bot' ? 'workflow-1' : 'agent-1', 'fixture', displayText,
      );
      const materialized = await h.drafts.materializeDraftConversationForSend(request);
      h.deploy.startDeploy(request, materialized.id, materialized.detail);
      await settle();

      assert.deepEqual(h.state.calls, [{
        url: 'http://runtime/api/conversations', method: 'POST',
        body: { execution_mode: executionMode, project_id: h.project.id },
      }], 'automatic create must omit title, and first send must not PATCH it');
      assert.equal(h.state.executions.length, 1);
      assert.equal(h.state.executions[0].task.title, displayText);
      const row = findConversationById(h.state.workspace, materialized.id);
      assert.equal(row.name, titleFromTaskText(displayText));
      assert.equal(row.name.length, 48);
      assert.equal(h.state.detail.title, 'New Chat 1', 'optimistic placeholder is display-only');
    });
  }

  test(`${executionMode}: an attachment-created shell is reused without automatic renaming`, async () => {
    const h = createHarness({ executionMode });
    h.drafts.openDraftConversation(h.project.id);
    const shell = await h.drafts.ensureServerConversationForActiveDraft();
    h.drafts.markDraftConversationKept(shell.conversation_id);
    const request = h.deploy.buildDeployRequest('Review the uploaded document', null, 'model', null, [], executionMode === 'bot' ? 'workflow-1' : 'agent-1', 'fixture');
    const materialized = await h.drafts.materializeDraftConversationForSend(request);
    h.deploy.startDeploy(request, materialized.id, materialized.detail);
    await settle();

    assert.equal(h.state.calls.length, 1, 'no second create or title PATCH after attachment upload');
    assert.equal(Object.hasOwn(h.state.calls[0].body, 'title'), false);
    assert.equal(materialized.id, shell.conversation_id);
    assert.equal(findConversationById(h.state.workspace, materialized.id).name, 'Review the uploaded document');
    assert.equal(h.state.executions.length, 1);
  });
}

test('an explicit rename, even to the existing placeholder, still uses the manual-title API', async () => {
  const h = createHarness();
  h.drafts.openDraftConversation(h.project.id);
  const shell = await h.drafts.ensureServerConversationForActiveDraft();
  await h.conversations.handleRenameConversation(h.project.id, shell.conversation_id, shell.title);
  assert.deepEqual(h.state.calls[1], {
    url: `http://runtime/api/conversations/${shell.conversation_id}`, method: 'PATCH',
    body: { title: 'New Chat 1' },
  });
});

test('first send preserves a user-named attachment shell without another title write', async () => {
  const h = createHarness();
  h.drafts.openDraftConversation(h.project.id);
  const shell = await h.drafts.ensureServerConversationForActiveDraft();
  await h.conversations.handleRenameConversation(h.project.id, shell.conversation_id, '用户指定标题');
  h.ctx.pendingCreatedDetailRef.current = h.state.detail;
  const request = h.deploy.buildDeployRequest('An unrelated first request', null, 'model', null, [], 'agent-1', 'fixture');
  const materialized = await h.drafts.materializeDraftConversationForSend(request);
  h.deploy.startDeploy(request, materialized.id, materialized.detail);
  await settle();

  assert.equal(h.state.calls.length, 2, 'only automatic create and explicit user rename');
  assert.equal(findConversationById(h.state.workspace, materialized.id).name, '用户指定标题');
});

test('directory refresh replaces the local first-task placeholder with the generated title', async () => {
  const h = createHarness();
  h.drafts.openDraftConversation(h.project.id);
  const request = h.deploy.buildDeployRequest('Review conversation title generation', null, 'model', null, [], 'agent-1', 'fixture');
  const materialized = await h.drafts.materializeDraftConversationForSend(request);
  h.deploy.startDeploy(request, materialized.id, materialized.detail);
  await settle();
  const generated = { ...h.state.detail, title: 'Conversation title generation', tasks: [] };
  h.state.workspace = replaceWorkspaceModeFromProjects('chat', [{
    project_id: h.project.id, execution_mode: 'chat', workspace_path: '/repo',
    conversations: [generated],
  }], h.state.workspace);

  assert.equal(findConversationById(h.state.workspace, materialized.id).name, generated.title);
  assert.equal(h.state.calls.length, 1);
});
