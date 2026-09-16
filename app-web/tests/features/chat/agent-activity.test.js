import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};

const { resolveAgentActivity } = await import('../../../src/features/chat/model/chat-timeline.js');

const tool = (toolName, status = 'running') => ({ kind: 'tool', toolName, status });
const supportedOrbStates = new Set(['working', 'searching', 'solving', 'listening', 'composing']);

test('agent activity follows the active runtime work instead of rotating copy', () => {
  // 「在等人」不再由 ask_user 卡片推导，而是由会话状态判据（后端实时快照）传入。
  assert.deepEqual(
    resolveAgentActivity([tool('ask_user')], true, 'waiting_input'),
    { state: 'listening', label: 'Waiting for you…' },
  );
  assert.deepEqual(
    resolveAgentActivity([tool('ask_user')], true, 'approval'),
    { state: 'listening', label: 'Awaiting approval…' },
  );
  // 快照里没有等人在内的事件时，ask_user 卡片在飞也只算普通工具。
  assert.deepEqual(resolveAgentActivity([tool('ask_user')], true), { state: 'working', label: 'Working…' });
  assert.deepEqual(resolveAgentActivity([tool('search_text')], true), { state: 'searching', label: 'Searching…' });
  assert.deepEqual(resolveAgentActivity([tool('exec_command')], true), { state: 'working', label: 'Working…' });
  assert.deepEqual(resolveAgentActivity([{ kind: 'thinking', streaming: true }], true), { state: 'composing', label: 'Thinking…' });
  assert.deepEqual(resolveAgentActivity([tool('read_file', 'done')], true), { state: 'solving', label: 'Solving…' });
  assert.equal(resolveAgentActivity([tool('search_text')], false), null);
  // 用户答完的那一瞬间：快照已清空，文案立刻回到在跑（不再停留在 Waiting for you…）。
  assert.deepEqual(resolveAgentActivity([tool('ask_user', 'done')], true), { state: 'solving', label: 'Solving…' });
});

test('every emitted activity uses a supported Thinking Orb state', () => {
  const samples = [
    [[], true, ''],
    [[tool('ask_user')], true, 'waiting_input'],
    [[tool('ask_user')], true, 'approval'],
    [[tool('search_text')], true, ''],
    [[tool('exec_command')], true, ''],
    [[tool('read_file', 'done')], true, ''],
  ];
  samples.forEach(([items, streaming, waitState]) => {
    assert.equal(supportedOrbStates.has(resolveAgentActivity(items, streaming, waitState).state), true);
  });
});
