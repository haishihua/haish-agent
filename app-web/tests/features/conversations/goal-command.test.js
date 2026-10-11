import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createConversationHandlers } from '../../../src/features/conversations/hooks/createConversationHandlers.js';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';
import { goalInvocation, goalMenuItems, GOAL_WORKFLOW_ID } from '../../../src/features/chat/model/goal-command.js';

function harness({ missing = false, defaultProject = false, fail = '', workflow = { nodes: [{ id: 'worker', type: 'agent', runtime_config: { provider: 'fixture', model_id: 'model' } }] }, draft = false, interrupt = '' } = {}) {
  const source = { id: 'chat-project', executionMode: 'chat', name: 'Renamed project', workspacePath: defaultProject ? null : '/repo', conversations: [] };
  const target = { project_id: 'bot-project', execution_mode: 'bot', name: 'Different name', workspace_path: source.workspacePath, is_default: defaultProject };
  const ctx = {
    API_BASE: '', providerOptions: ['fixture', 'old', 'custom.provider-id'].map((provider) => ({ provider })), workspaceState: { activeProjectId: source.id, projects: [source] },
    conversationIdRef: { current: draft ? 'draft-chat' : 'chat-conversation' },
    viewModeRef: { current: 'chat' }, draftConversationRef: { current: draft ? { projectId: source.id } : null },
    modeLocationRef: { current: {} }, workflowSettingsDraft: {},
    workflowById: () => workflow, buildApiHeaders: () => ({ 'Content-Type': 'application/json' }),
    normalizeWorkspaceOrdering: (state) => state,
    replaceWorkspaceModeFromProjects: (mode, projects, state) => ({ ...state, projects: [...state.projects, ...projects.map((p) => ({ id: p.project_id, executionMode: mode }))] }),
    setWorkspaceState: (update) => { ctx.workspaceState = update(ctx.workspaceState); },
    invalidateConversationActivation: () => ++seq,
    isConversationActivationCurrent: (value) => seq === value,
    showToast: (...args) => notices.push(args),
    activateConversationDetail: async (detail) => { events.push('activate'); ctx.conversationIdRef.current = detail.conversation_id; },
    setViewMode: (mode) => events.push(mode),
    setSelectedWorkflowId: (id) => events.push(id),
    startDeploy: (...args) => { events.push('deploy'); sent.push(args); },
    contextTask: { taskId: 'source-task', conversationId: 'chat-conversation', title: 'report' },
  };
  let seq = 0;
  const calls = [], events = [], notices = [], sent = [];
  ctx.buildDeployRequest = createDeployHandlers(ctx).buildDeployRequest;
  ctx.apiFetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, method: options.method || 'GET', body });
    if (interrupt === url) seq++;
    if (fail === url) return { ok: false, status: 500 };
    const payload = url.includes('?') ? { projects: missing ? [] : [target] }
      : url === '/api/projects' ? target
        : url === '/api/conversations' ? { conversation_id: 'new-bot-conversation', workspace_path: source.workspacePath }
          : body;
    return { ok: true, json: async () => payload };
  };
  return { ctx, calls, events, notices, sent, run: createConversationHandlers(ctx).handleGoalCommand };
}

test('/goal parses only a leading, complete command token and preserves multiline tasks', () => {
  assert.deepEqual(goalInvocation('/goal'), { prompt: '' });
  assert.deepEqual(goalInvocation(' /GOAL  fix\nthen test  '), { prompt: 'fix\nthen test' });
  for (const text of ['look at /goal', '/goals fix', '/goal-loop fix', '/goal/fix', 'normal message']) assert.equal(goalInvocation(text), null);
});

test('the built-in menu entry wins over a skill called goal, and stays chat-only', () => {
  const skills = [{ name: 'goal' }, { name: 'other' }];
  assert.deepEqual(goalMenuItems('/go', skills, true).map((item) => item.name), ['goal', 'other']);
  assert.equal(goalMenuItems('/go', skills, true)[0].command, true);
  assert.equal(goalMenuItems('/go', skills, false), skills);
  assert.equal(goalMenuItems('/other', skills, true), skills);
});

test('existing Workflow project is matched by path, not its renamed title, and receives a fresh task', async () => {
  const h = harness();
  assert.equal(await h.run({ prompt: 'Fix the bug' }), true);
  assert.equal(h.calls.some((call) => call.url === '/api/projects'), false);
  assert.deepEqual(h.calls.find((call) => call.url === '/api/conversations').body, {
    execution_mode: 'bot', project_id: 'bot-project',
  });
  const [request, id, detail] = h.sent[0];
  assert.equal(request.executionMode, 'bot');
  assert.equal(request.workflowId, GOAL_WORKFLOW_ID);
  assert.equal(request.agentId, null);
  assert.equal(request.text, 'Fix the bug');
  assert.equal(request.providerRequest, '');
  assert.equal(request.modelId, null);
  assert.equal(request.targetConversationId, id);
  assert.equal(id, detail.conversation_id);
  assert.deepEqual(request.contextTasks, [{ taskId: 'source-task', conversationId: 'chat-conversation', title: 'report' }]);
  assert.deepEqual(h.events, ['activate', 'workflow', GOAL_WORKFLOW_ID, 'deploy']);
  assert.equal(h.ctx.modeLocationRef.current.chat.projectId, 'chat-project');
  const config = h.calls.find((call) => call.method === 'PUT').body;
  assert.equal(config.workflow_id, GOAL_WORKFLOW_ID, 'picker restores Goal Loop even if another workflow was previously preferred');
  assert.equal(config.execution_mode, 'bot');
});

test('missing project imports the source directory in bot mode before creating and sending the task', async () => {
  const h = harness({ missing: true, draft: true });
  assert.equal(await h.run({ prompt: 'Task' }), true);
  assert.deepEqual(h.calls.map((call) => call.method), ['GET', 'POST', 'POST', 'PUT']);
  assert.deepEqual(h.calls[1].body, { name: 'Renamed project', workspace_path: '/repo', execution_mode: 'bot' });
  assert.equal(h.ctx.workspaceState.projects.length, 2);
  assert.equal(h.sent.length, 1);
});

test('default Chat project maps to the default Workflow project without importing home or another directory', async () => {
  const h = harness({ defaultProject: true });
  assert.equal(await h.run({ prompt: 'Task' }), true);
  assert.equal(h.calls.some((call) => call.url === '/api/projects'), false);
  assert.equal(h.sent.length, 1);
});

test('bare /goal navigates with Goal Loop selected but never submits an empty task', async () => {
  const h = harness();
  assert.equal(await h.run({ prompt: '' }), true);
  assert.equal(h.ctx.viewModeRef.current, 'workflow');
  assert.equal(h.sent.length, 0);
});

const goalNodes = [
  { id: 'start', type: 'start' },
  { id: 'clarify', type: 'agent' },
  { id: 'approve_requirements', type: 'human_approval' },
  { id: 'goal_worker', type: 'agent', runtime_config: { provider: 'old', model_id: 'old-model' } },
  { id: 'goal_verifier', type: 'agent' },
  { id: 'goal_gate', type: 'condition' },
  { id: 'goal_loop', type: 'loop' },
  { id: 'output', type: 'output' },
];
for (const prompt of ['', 'Task']) {
  test(`/goal snapshots the source model for every Agent node and persists it (${prompt || 'navigation only'})`, async () => {
    const h = harness({ missing: true, workflow: { nodes: goalNodes } });
    const runConfig = { provider: 'custom.provider-id', model_id: 'gpt-5.5', reasoning_effort: 'xhigh', api_key: 'not-a-config-field', agent_id: 'source-agent' };
    const expected = Object.fromEntries(['clarify', 'goal_worker', 'goal_verifier'].map((id) => [id, {
      provider: 'custom.provider-id', model_id: 'gpt-5.5', reasoning_effort: 'xhigh',
    }]));
    const pending = h.run({ prompt, runConfig });
    runConfig.model_id = 'changed-after-navigation';
    assert.equal(await pending, true);
    assert.deepEqual(h.calls.find((call) => call.method === 'PUT').body.node_runtime_configs, expected);
    if (prompt) {
      assert.deepEqual(h.sent[0][0].nodeRuntimeConfigs, expected);
      assert.equal(h.sent[0][0].modelId, null, 'models are node scoped, not global Bot settings');
    } else assert.equal(h.sent.length, 0);
    assert.equal(h.notices.length, 0);
  });
}

test('/goal normalizes old null before persisting and sending node config', async () => {
  const h = harness({ workflow: { nodes: goalNodes } });
  assert.equal(await h.run({ prompt: 'Task', runConfig: { provider: 'custom.provider-id', model_id: 'model', reasoning_effort: null } }), true);
  assert.ok(Object.values(h.sent[0][0].nodeRuntimeConfigs).every((config) => config.reasoning_effort === 'high'));
});

test('/goal legacy effort uses the selected provider default rather than early high', async () => {
  const h = harness({ workflow: { nodes: goalNodes } });
  h.ctx.providerOptions.find((item) => item.provider === 'custom.provider-id').defaultReasoningEffort = 'medium';
  assert.equal(await h.run({ prompt: 'Task', runConfig: { provider: 'custom.provider-id', model_id: 'model', reasoning_effort: null } }), true);
  assert.ok(Object.values(h.sent[0][0].nodeRuntimeConfigs).every((config) => config.reasoning_effort === 'medium'));
  assert.ok(Object.values(h.calls.find((call) => call.method === 'PUT').body.node_runtime_configs).every((config) => config.reasoning_effort === 'medium'));
});

test('/goal without a valid node route rejects before creating a project or task', async () => {
  const h = harness({ workflow: { nodes: goalNodes } });
  assert.equal(await h.run({ prompt: 'Task', runConfig: { provider: '', model_id: 'unbound', reasoning_effort: 'high' } }), false);
  assert.equal(h.sent.length, 0);
  assert.equal(h.calls.length, 0);
  assert.match(h.notices[0][1], /provider/);
});

test('long prompts stay in the task, not in a user-title field on automatic create', async () => {
  const h = harness();
  const prompt = 'a'.repeat(500);
  await h.run({ prompt });
  assert.equal(Object.hasOwn(h.calls.find((call) => call.url === '/api/conversations').body, 'title'), false);
  assert.equal(h.sent[0][0].text, prompt);
});

for (const fail of ['/api/projects?execution_mode=bot', '/api/projects', '/api/conversations', '/api/conversations/new-bot-conversation/run-config']) {
  test(`failure at ${fail} does not switch or send, and returns false to preserve the draft`, async () => {
    const h = harness({ missing: true, fail });
    assert.equal(await h.run({ prompt: 'Task' }), false);
    assert.equal(h.sent.length, 0);
    assert.equal(h.ctx.viewModeRef.current, 'chat');
    assert.equal(h.notices.length, 1);
  });
}

for (const interrupt of ['/api/projects?execution_mode=bot', '/api/projects', '/api/conversations', '/api/conversations/new-bot-conversation/run-config']) {
  test(`navigation while awaiting ${interrupt} does not hijack the next conversation`, async () => {
    const h = harness({ missing: true, interrupt });
    assert.equal(await h.run({ prompt: 'Task' }), false);
    assert.equal(h.sent.length, 0);
    assert.equal(h.events.length, 0);
  });
}

test('unavailable/disabled workflow is rejected before any project or conversation writes', async () => {
  for (const workflow of [null, { enabled: false }, { executable: false }]) {
    const h = harness({ workflow });
    assert.equal(await h.run({ prompt: 'Task' }), false);
    assert.equal(h.calls.length, 0);
  }
});

test('documents are re-uploaded to the destination, not reused with a source conversation attachment id', async () => {
  const h = harness();
  const attachment = { file: { name: 'spec.pdf' }, uploaded: true, attachmentId: 'source-attachment' };
  const images = [{ file: { name: 'screenshot.png' } }];
  await h.run({ prompt: 'Task', attachment, images });
  assert.equal(h.sent[0][0].attachment.uploaded, false);
  assert.equal(attachment.uploaded, true);
  assert.equal(h.sent[0][0].imageAttachments.length, 1);
  const stale = harness();
  assert.equal(await stale.run({ prompt: 'Task', attachment: { uploaded: true } }), false);
  assert.equal(stale.calls.length, 0);
});

test('goal command uses a target icon while schedule keeps its clock', () => {
  const source = readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
  assert.match(source, /skill\.command && skill\.name === 'goal' \? <Target className="chat-skill-menu-icon"/);
  assert.match(source, /: skill\.command \? <Clock className="chat-skill-menu-icon"/);
});

test('composer intercepts /goal before skill expansion and runtime steering, and locks duplicate sends', () => {
  const source = readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
  assert.ok(source.indexOf('if (goal) {') < source.indexOf('const skillInvocation ='));
  assert.ok(source.indexOf('await onGoalCommand(') < source.indexOf('if (running) {'));
  assert.match(source, /goalPendingRef\.current = true/);
  assert.match(source, /if \(goalPendingRef\.current\) return/);
  assert.match(source, /if \(accepted !== false\)[\s\S]*?setDraft\(''\)/);
  assert.match(source, /modelConfigError/, 'Goal Loop with a prompt must have a valid effective model route');
});
