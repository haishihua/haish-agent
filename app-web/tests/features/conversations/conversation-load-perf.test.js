import test from 'node:test';
import assert from 'node:assert/strict';
import { timedConversationFetch } from '../../../src/shared/lib/conversation-load-perf.js';

test('temporary timing preserves response identity, JSON payload and request arguments', async () => {
  const controller = new AbortController();
  const init = { method: 'GET', signal: controller.signal };
  const response = new Response(JSON.stringify({ messages: [{ content: 'private fixture' }], tasks: [] }));
  let args;
  const result = await timedConversationFetch(async (...input) => { args = input; return response; }, '/api/conversations/abcdef', init);
  assert.equal(result, response);
  assert.deepEqual(args, ['/api/conversations/abcdef', init]);
  assert.deepEqual(await result.json(), { messages: [{ content: 'private fixture' }], tasks: [] });
});

test('temporary timing leaves unrelated responses untouched and propagates failures', async () => {
  const response = new Response('{}');
  const original = response.json;
  assert.equal(await timedConversationFetch(async () => response, '/api/settings', {}), response);
  assert.equal(response.json, original);
  const failure = new DOMException('cancel', 'AbortError');
  await assert.rejects(timedConversationFetch(async () => { throw failure; }, '/api/conversations/abcdef', {}), (error) => error === failure);
});
