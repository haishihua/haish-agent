import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';
import { executionConfigError } from '../../../src/features/workflow/model/execution-config.js';
import { nodeRuntimeConfigRequest, nodeRuntimeConfigsForWorkflow, workflowNodeRuntimeConfig } from '../../../src/features/workflow/model/node-runtime-config.js';

const providerOptions = [{ id: 'ui-id', requestProvider: 'configured' }];
const workflow = { nodes: [{ id: 'first', type: 'agent' }, { id: 'second', type: 'agent' }] };
const route = { provider: 'configured', model_id: 'custom-model', reasoning_effort: null };

test('Chat rejects missing, auto or removed provider and missing concrete model', () => {
  for (const provider of ['', 'auto', 'AUTO', 'removed']) {
    assert.match(executionConfigError({ provider, modelId: 'custom-model', providerOptions }), /provider/);
  }
  for (const modelId of ['', 'auto', 'AUTO', '   ']) {
    assert.match(executionConfigError({ provider: 'configured', modelId, providerOptions }), /concrete model/);
  }
  assert.equal(executionConfigError({ provider: 'configured', modelId: 'custom-model', providerOptions }), '');
});

test('Bot requires each node config, not another global picker or the first configured node', () => {
  const input = { executionMode: 'bot', workflow, providerOptions, nodeRuntimeConfigs: { first: route } };
  assert.match(executionConfigError(input), /Node second.*provider/);
  assert.equal(executionConfigError({ ...input, nodeRuntimeConfigs: { first: route, second: route } }), '');
  assert.match(executionConfigError({ ...input, nodeRuntimeConfigs: { first: route, second: { ...route, provider: 'removed' } } }), /unavailable/);
});

test('Bot accepts explicit task defaults but cannot execute a model-free graph without a route', () => {
  assert.equal(executionConfigError({ executionMode: 'bot', workflow, providerOptions, provider: route.provider, modelId: route.model_id }), '');
  assert.match(executionConfigError({ executionMode: 'bot', workflow: { nodes: [{ id: 'tool', type: 'tool' }] }, providerOptions }), /provider/);
});

test('Chat and Bot deploy reject before task staging, upload or conversation creation', () => {
  for (const executionMode of ['chat', 'bot']) {
    const notices = [];
    const handlers = createDeployHandlers({ providerOptions, showToast: (...args) => notices.push(args),
      viewModeRef: { current: executionMode === 'chat' ? 'chat' : 'workflow' },
      conversationIdRef: { current: 'draft-1' }, draftConversationRef: { current: { id: 'draft-1' } },
      getRuntime: () => ({ taskRuntimeState: { tasksById: {}, taskOrder: [] } }),
      conversationReady: true, normalizeWorkflowSettings: () => ({ presets: [{ ...workflow, workflow_id: 'wf' }], custom: [] }),
      createPendingTaskDraft: () => assert.fail('must not create pending task'),
      materializeDraftConversationForSend: () => assert.fail('must not create conversation'),
    });
    assert.equal(handlers.handleDeploy('Keep my draft', null, 'model', null, [], executionMode === 'chat' ? 'agent' : 'wf'), false);
    assert.match(notices[0][1], /provider/);
    const request = handlers.buildDeployRequest('Keep my draft', null, 'model', null, [], 'wf');
    assert.equal(handlers.startDeploy(request, 'conversation'), false);
    assert.equal(request.pendingTask, undefined);
  }
});

test('old node null is normalized before save/rerun while raw merge preserves migration input', () => {
  assert.deepEqual(nodeRuntimeConfigsForWorkflow(workflow, { first: route }).first, { ...route, reasoning_effort: 'high' });
  assert.deepEqual(nodeRuntimeConfigRequest(route).nodeRuntimeConfig, { ...route, reasoning_effort: 'high' });
  assert.equal(workflowNodeRuntimeConfig({ id: 'first', runtime_config: { ...route, reasoning_effort: 'high' } }, null, { first: { reasoning_effort: null } }).reasoning_effort, null);
});
