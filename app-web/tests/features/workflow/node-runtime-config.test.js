import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeRuntimeConfigsForWorkflow, nodeRuntimeConfigRequest, workflowNodeRuntimeConfig } from '../../../src/features/workflow/model/node-runtime-config.js';
import { createTaskStreamHandlers, workflowNodeFinishedState, workflowNodeConfiguredState } from '../../../src/features/tasks/hooks/createTaskStreamHandlers.js';
globalThis.window = { HAISH_API_BASE: 'http://fixture.invalid', location: { origin: 'http://fixture.invalid' } };
const { taskSummaryToRuntimeTask } = await import('../../../src/features/tasks/model/task-runtime.js');
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

const { nodeReasoningOptions } = await import('../../../src/features/workflow/model/node-reasoning-options.js');
test('known adapter limits exclude thinking values that would be ignored', () => {
  assert.deepEqual(nodeReasoningOptions('deepseek-chat').map((option) => option.id), ['high', 'xhigh']);
  assert.deepEqual(nodeReasoningOptions('MiniMax-M2'), []);
  assert.deepEqual(nodeReasoningOptions('glm-4.7'), []);
  assert.ok(!nodeReasoningOptions('gpt-5').some((option) => option.id === 'minimal'));
});

const workflow = { nodes: [{ id: 'worker', type: 'agent' }, { id: 'verifier', type: 'agent' }, { id: 'tool', type: 'tool' }] };
test('node selections stay independent and exclude stale nodes or credentials', () => {
  const configs = { worker: { provider: 'a', model_id: 'm1', reasoning_effort: 'high', api_key: 'never-send' }, verifier: { provider: 'b', model_id: 'm2', reasoning_effort: 'low' }, missing: {}, tool: {} };
  assert.deepEqual(nodeRuntimeConfigsForWorkflow(workflow, configs), { worker: { provider: 'a', model_id: 'm1', reasoning_effort: 'high' }, verifier: { provider: 'b', model_id: 'm2', reasoning_effort: 'low' } });
  assert.deepEqual(nodeRuntimeConfigRequest({}), { nodeRuntimeConfig: {} });
});
test('all pending and running nodes display recorded task defaults, with per-node execution precedence', () => {
  const task = { requestedProvider: 'source', requestedModelId: 'source-model', requestedReasoningEffort: 'high', workflowRun: { nodes: { worker: { runtime_config: { provider: 'actual', model_id: 'actual-model', reasoning_effort: 'low' } } } } };
  assert.equal(workflowNodeRuntimeConfig(workflow.nodes[0], task, {}, true).model_id, 'actual-model');
  assert.deepEqual(workflowNodeRuntimeConfig(workflow.nodes[1], task, {}, true), { provider: 'source', model_id: 'source-model', reasoning_effort: 'high' });
  assert.equal(workflowNodeRuntimeConfig(workflow.nodes[1], task, { verifier: { provider: 'other' } }, true).model_id, '');
  assert.deepEqual(workflowNodeRuntimeConfig(workflow.nodes[1], task, {}, false), {});
  const running = workflowNodeConfiguredState({ runtime_config: { provider: 'a', model_id: 'm1' } }, { status: 'running', input: 'work', attempt: 2 });
  assert.deepEqual(running, { status: 'running', input: 'work', attempt: 2, runtime_config: { provider: 'a', model_id: 'm1' } });
});

test('executed node config survives stream and task reload', () => {
  const config = { provider: 'a', model_id: 'm1', reasoning_effort: 'high' };
  const finished = workflowNodeFinishedState({ runtime_config: config, success: true }, {}, []);
  assert.deepEqual(finished.node.runtime_config, config);
  const task = taskSummaryToRuntimeTask({ task_id: 't', status: 'done', node_runtime_configs: { worker: config } });
  assert.deepEqual(task.nodeRuntimeConfigs, { worker: config });
});
async function captureStreamRequest(task, streamRequest = null) {
  const runtime = { cancelledRunIds: new Set(), taskRuntimeState: {} };
  let command;
  const handlers = createTaskStreamHandlers({
    generateHexId: () => 'derived', getRuntime: () => runtime,
    mutateRuntime: (_id, update) => update(runtime),
    updateTaskRuntimeState: (update) => { runtime.taskRuntimeState = update(runtime.taskRuntimeState); },
    setRuntimeFetchController: (controller) => { runtime.fetchController = controller; },
    setRuntimeActiveTaskId: (id) => { runtime.activeTaskId = id; }, setRuntimeBusy: () => {},
    chatFinalizedTaskIdsRef: { current: new Set() }, userCancelledTaskIdsRef: { current: new Set() },
    runTaskStream: async (request) => { command = request; },
  });
  await handlers.executeQuest(task, 'conversation', streamRequest);
  return { command, pending: runtime.taskRuntimeState.pendingTask };
}
test('Bot transport sends node map and no global thinking or model', async () => {
  const config = { worker: { provider: 'a', model_id: 'm1' } };
  const { command } = await captureStreamRequest({ taskId: 'task', title: 'Run', executionMode: 'bot', nodeRuntimeConfigs: config });
  assert.deepEqual(command.payload.options.node_runtime_configs, config);
  assert.equal(command.payload.options.provider, null);
  assert.equal(command.payload.options.model_id, null);
  assert.equal(command.payload.options.reasoning_effort, null);
});
test('node rerun replaces only target config, including empty reset, in transport and pending UI', async () => {
  const original = { worker: { provider: 'a', model_id: 'm1' }, verifier: { provider: 'b', model_id: 'm2' } };
  for (const replacement of [{}, { provider: 'c', model_id: 'm3' }]) {
    const { command, pending } = await captureStreamRequest({ taskId: 'task', title: 'Run', executionMode: 'bot', nodeRuntimeConfigs: original }, { rerunNodeId: 'worker', runConfig: nodeRuntimeConfigRequest(replacement) });
    assert.equal(command.operation, 'rerun_node');
    assert.deepEqual(command.payload.runtime_config, replacement);
    assert.deepEqual(pending.nodeRuntimeConfigs.worker, replacement);
    assert.deepEqual(pending.nodeRuntimeConfigs.verifier, original.verifier);
    assert.deepEqual(original.worker, { provider: 'a', model_id: 'm1' });
  }
});
test('deploy snapshots node config before queuing', () => {
  const config = { worker: { provider: 'a', model_id: 'm1' } };
  const handlers = createDeployHandlers({ viewModeRef: { current: 'bot' }, conversationIdRef: { current: 'c' }, draftConversationRef: { current: null }, conversationId: 'c' });
  const request = handlers.buildDeployRequest('hello', null, null, null, [], 'wf', null, 'hello', [], config);
  config.worker.model_id = 'changed';
  assert.equal(request.nodeRuntimeConfigs.worker.model_id, 'm1');
  assert.equal(request.modelId, null);
});
