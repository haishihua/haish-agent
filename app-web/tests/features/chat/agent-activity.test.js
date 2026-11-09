import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};

const { resolveAgentActivity, orbStateForActivity } = await import('../../../src/core/tool-grouping.js');

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

// 改前基线（重构前 ChatTimelineNodes 里那一行三元）：
//   state={activity.state === 'composing' ? 'working' : activity.state === 'working' ? 'composing' : activity.state}
// 这里把它抄成数据，改动后逐条对拍——活动词表到 orb 词表的映射必须一模一样。
const ORB_STATE_BEFORE_REFACTOR = {
  composing: 'working',
  working: 'composing',
  searching: 'searching',
  solving: 'solving',
  listening: 'listening',
};

test('activity state reaches the orb in exactly the pre-refactor word', () => {
  for (const [activityState, orbState] of Object.entries(ORB_STATE_BEFORE_REFACTOR)) {
    assert.equal(orbStateForActivity(activityState), orbState, `${activityState} → ${orbState}`);
  }
});

test('every state the activity resolver emits has a pinned orb word', () => {
  const samples = [
    [[], true, ''],
    [[tool('ask_user')], true, 'waiting_input'],
    [[tool('ask_user')], true, 'approval'],
    [[tool('search_text')], true, ''],
    [[tool('exec_command')], true, ''],
    [[tool('read_file', 'done')], true, ''],
    [[{ kind: 'thinking', streaming: true }], true, ''],
  ];
  for (const [items, streaming, waitState] of samples) {
    const { state } = resolveAgentActivity(items, streaming, waitState);
    assert.equal(
      orbStateForActivity(state),
      ORB_STATE_BEFORE_REFACTOR[state],
      `no pinned orb word for activity state ${state}`,
    );
  }
});

test('orb words the app does not use pass through untouched', () => {
  // 库自己还有 connecting / weaving / breathing / shaping；翻译表只该改它认识的词，
  // 否则以后换一个库状态会被静默改成别的动画。
  for (const orbState of ['connecting', 'weaving', 'breathing', 'shaping']) {
    assert.equal(orbStateForActivity(orbState), orbState);
  }
  assert.equal(orbStateForActivity(undefined), undefined);
});
