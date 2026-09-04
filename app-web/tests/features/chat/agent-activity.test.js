import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};

const { resolveAgentActivity } = await import('../../../src/features/chat/model/chat-timeline.js');

const tool = (toolName, status = 'running') => ({ kind: 'tool', toolName, status });
const supportedOrbStates = new Set(['working', 'searching', 'solving', 'listening', 'composing']);

test('agent activity follows the active runtime work instead of rotating copy', () => {
  assert.deepEqual(resolveAgentActivity([tool('ask_user')], true), { state: 'listening', label: 'Waiting for you…' });
  assert.deepEqual(resolveAgentActivity([tool('search_text')], true), { state: 'searching', label: 'Searching…' });
  assert.deepEqual(resolveAgentActivity([tool('exec_command')], true), { state: 'working', label: 'Working…' });
  assert.deepEqual(resolveAgentActivity([{ kind: 'thinking', streaming: true }], true), { state: 'composing', label: 'Thinking…' });
  assert.deepEqual(resolveAgentActivity([tool('read_file', 'done')], true), { state: 'solving', label: 'Solving…' });
  assert.equal(resolveAgentActivity([tool('search_text')], false), null);
});

test('every emitted activity uses a supported Thinking Orb state', () => {
  const samples = [
    [[], true],
    [[tool('ask_user')], true],
    [[tool('search_text')], true],
    [[tool('exec_command')], true],
    [[tool('read_file', 'done')], true],
  ];
  samples.forEach(([items, streaming]) => {
    assert.equal(supportedOrbStates.has(resolveAgentActivity(items, streaming).state), true);
  });
});
