import test from 'node:test';
import assert from 'node:assert/strict';
import { appendStreamEvent, compactStreamEvents } from './stream-events.js';

test('compactStreamEvents collapses adjacent answer deltas without crossing boundaries', () => {
  const events = [
    { type: 'llm_answer_delta', delta: '你', loopIndex: 1, textBlockId: 'answer-1' },
    { type: 'llm_answer_delta', delta: '好', loopIndex: 1, textBlockId: 'answer-1' },
    { type: 'agent_progress_delta', delta: 'working', loopIndex: 1 },
    { type: 'llm_answer_delta', delta: '！', loopIndex: 1, textBlockId: 'answer-1' },
  ];

  assert.deepEqual(compactStreamEvents(events).map(({ type, delta }) => ({ type, delta })), [
    { type: 'llm_answer_delta', delta: '你好' },
    { type: 'agent_progress_delta', delta: 'working' },
    { type: 'llm_answer_delta', delta: '！' },
  ]);
});

test('appendStreamEvent keeps tool output from different calls separate', () => {
  const first = appendStreamEvent([], { type: 'tool_output_delta', delta: 'a', callId: 'call-1' });
  const second = appendStreamEvent(first, { type: 'tool_output_delta', delta: 'b', callId: 'call-2' });

  assert.equal(second.length, 2);
});
