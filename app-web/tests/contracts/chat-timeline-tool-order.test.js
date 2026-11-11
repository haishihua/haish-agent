import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatTimeline } from '../../src/core/chat-timeline.js';

const call = (callId, toolName = 'read_file') => ({ callId, toolName, state: 'completed' });
const started = (callId) => ({ type: 'tool_call_started', callId, toolName: 'read_file' });
const ids = (items) => items.flatMap((item) => item.kind === 'tool'
  ? [item.callId, ...ids(item.children || [])]
  : ids(item.tools || []));

test('an early visual call without a start event stays before later streamed tools', () => {
  for (const status of ['running', 'done']) {
    for (let count = 1; count <= 3; count += 1) {
      const later = Array.from({ length: count }, (_, index) => `later-${index}`);
      const timeline = buildChatTimeline({
        toolCalls: [call('vision', 'vision_analyze'), ...later.map((id) => call(id))],
        eventLog: [{ type: 'tool_call_completed', callId: 'vision' }, ...later.map(started)],
      }, status);
      assert.deepEqual(ids(timeline.items), ['vision', ...later]);
    }
  }
});

test('missing calls retain their relative order before an event-backed anchor', () => {
  const timeline = buildChatTimeline({
    toolCalls: [call('first'), call('missing-a'), call('missing-b'), call('last'), call('tail')],
    eventLog: [started('first'), { type: 'agent_progress_delta', message: 'Next step' }, started('last')],
  }, 'running');
  assert.deepEqual(ids(timeline.items), ['first', 'missing-a', 'missing-b', 'last', 'tail']);
  assert.equal(timeline.items.find((item) => item.kind === 'text')?.text, 'Next step');
});

test('toolCalls-only timelines keep their original order', () => {
  const timeline = buildChatTimeline({ toolCalls: [call('a'), call('b')], eventLog: [] }, 'done');
  assert.deepEqual(ids(timeline.items), ['a', 'b']);
});

test('a late start event does not duplicate or reorder the recovered call', () => {
  const toolCalls = [call('vision', 'vision_analyze'), call('later')];
  const timeline = buildChatTimeline({
    toolCalls,
    eventLog: [{ type: 'tool_call_started', callId: 'vision', toolName: 'vision_analyze' }, started('later')],
  }, 'running');
  assert.deepEqual(ids(timeline.items), ['vision', 'later']);
});
