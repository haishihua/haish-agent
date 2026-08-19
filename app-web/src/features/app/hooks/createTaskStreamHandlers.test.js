import test from 'node:test';
import assert from 'node:assert/strict';
import { eventDeltaText } from '../../../lib/chat-text.js';
import {
  mergeQueuedStreamDelta,
  workflowNodeStartedState,
} from './createTaskStreamHandlers.js';

function deltaEvent(type, delta, extra = {}) {
  return {
    type,
    delta,
    task_id: 'task-1',
    conversation_id: 'conversation-1',
    loop_index: 1,
    ...extra,
  };
}

test('mergeQueuedStreamDelta preserves repeated and overlapping tool output', () => {
  const repeated = mergeQueuedStreamDelta(
    deltaEvent('tool_output_delta', 'a', { call_id: 'call-1' }),
    deltaEvent('tool_output_delta', 'a', { call_id: 'call-1' }),
    eventDeltaText,
  );
  assert.equal(repeated.delta, 'aa');

  const overlapping = mergeQueuedStreamDelta(
    deltaEvent('tool_output_delta', 'abc', { call_id: 'call-1' }),
    deltaEvent('tool_output_delta', 'bcd', { call_id: 'call-1' }),
    eventDeltaText,
  );
  assert.equal(overlapping.delta, 'abcbcd');
});

test('mergeQueuedStreamDelta merges answer deltas but keeps progress events separate', () => {
  const answer = mergeQueuedStreamDelta(
    deltaEvent('llm_answer_delta', 'a'),
    deltaEvent('llm_answer_delta', 'a'),
    eventDeltaText,
  );
  assert.equal(answer.delta, 'aa');

  const progress = mergeQueuedStreamDelta(
    deltaEvent('agent_progress_delta', 'step one'),
    deltaEvent('agent_progress_delta', 'step two'),
    eventDeltaText,
  );
  assert.equal(progress, null);
});

test('mergeQueuedStreamDelta does not cross tool or text-block boundaries', () => {
  const differentTool = mergeQueuedStreamDelta(
    deltaEvent('tool_output_delta', 'a', { call_id: 'call-1' }),
    deltaEvent('tool_output_delta', 'b', { call_id: 'call-2' }),
    eventDeltaText,
  );
  assert.equal(differentTool, null);

  const differentNestedTool = mergeQueuedStreamDelta(
    deltaEvent('tool_output_delta', 'a', { data: { call_id: 'call-1' } }),
    deltaEvent('tool_output_delta', 'b', { data: { tool_call_id: 'call-2' } }),
    eventDeltaText,
  );
  assert.equal(differentNestedTool, null);

  const unidentifiedTool = mergeQueuedStreamDelta(
    deltaEvent('tool_output_delta', 'a'),
    deltaEvent('tool_output_delta', 'b'),
    eventDeltaText,
  );
  assert.equal(unidentifiedTool, null);

  const sameNestedTool = mergeQueuedStreamDelta(
    deltaEvent('tool_output_delta', 'a', { data: { call_id: 'call-1' } }),
    deltaEvent('tool_output_delta', 'b', { data: { tool_call_id: 'call-1' } }),
    eventDeltaText,
  );
  assert.equal(sameNestedTool.delta, 'ab');

  const differentBlock = mergeQueuedStreamDelta(
    deltaEvent('llm_answer_delta', 'a', { text_block_id: 'block-1' }),
    deltaEvent('llm_answer_delta', 'b', { text_block_id: 'block-2' }),
    eventDeltaText,
  );
  assert.equal(differentBlock, null);
});

test('a new workflow node attempt starts without terminal state from the previous attempt', () => {
  const next = workflowNodeStartedState({
    input: { summaryText: 'new review' },
    started_at: '2026-08-19T00:00:00Z',
  });

  assert.deepEqual(next, {
    status: 'running',
    success: null,
    input: { summaryText: 'new review' },
    attempt: null,
    started_at: '2026-08-19T00:00:00Z',
  });
  assert.equal('decision' in next, false);
  assert.equal('error' in next, false);
  assert.equal('reviewed_input' in next, false);
});
