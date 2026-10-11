import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationHandlers } from '../../../src/features/conversations/hooks/createConversationHandlers.js';

// A locally unaccepted task still uses the deploy path; it must not lose nodes
// or restore the source task's high when the caller explicitly clears effort.
test('Bot local retry preserves node configs and explicit null effort', async () => {
  let args, started;
  const nodes = { worker: { provider: 'p', model_id: 'm', reasoning_effort: null } };
  const handlers = createConversationHandlers({
    conversationIdRef: { current: 'conversation' }, viewModeRef: { current: 'workflow' }, setViewMode: () => {},
    buildDeployRequest: (...values) => { args = values; return {}; },
    canStartDeployForConversation: () => true,
    startDeploy: (request) => { started = request; },
  });
  await handlers.handleRetryTask({ executionMode: 'bot', conversationId: 'conversation', title: 'Run',
    requestedWorkflowId: 'wf', requestedProvider: 'p', requestedModelId: 'm', requestedReasoningEffort: 'high', nodeRuntimeConfigs: nodes,
  }, null, { reasoningEffort: null });
  assert.equal(args[3], null);
  assert.deepEqual(args[9], nodes);
  assert.equal(started.targetConversationId, 'conversation');
});
