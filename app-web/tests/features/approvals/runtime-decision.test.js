import test from 'node:test';
import assert from 'node:assert/strict';

const originalWindow = globalThis.window;

test.after(() => {
  globalThis.window = originalWindow;
});

test('computer runtime install and deny decisions use the dedicated approval kind', async () => {
  const calls = [];
  globalThis.window = { haish: {
    async resolveApproval(...args) {
      calls.push(args);
    },
  } };

  const { postComputerRuntimeDecision } = await import(
    '../../../src/features/approvals/api/approvals.js'
  );
  const request = { request_id: 'computer-request' };
  await postComputerRuntimeDecision(request, 'install');
  await postComputerRuntimeDecision(request, 'deny');

  assert.deepEqual(calls, [
    ['computer_runtime', 'computer-request', { decision: 'install', timeout_seconds: 900 }],
    ['computer_runtime', 'computer-request', { decision: 'deny' }],
  ]);
});
