import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { eventDeltaText } from '../../../lib/chat-text.js';
import {
  mergeQueuedStreamDelta,
  workflowNodeFinishedState,
  workflowNodeStartedState,
} from './createTaskStreamHandlers.js';

const handlerSource = fs.readFileSync(new URL('./createTaskStreamHandlers.js', import.meta.url), 'utf8');

function eventCaseSource(type, nextType) {
  const start = handlerSource.indexOf(`case '${type}'`);
  const end = handlerSource.indexOf(`case '${nextType}'`, start + 1);
  return handlerSource.slice(start, end);
}

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

test('delivery receipts do not mark chat tasks done before run_finished', () => {
  const finalAnswerCase = eventCaseSource('llm_final_answer', 'agent_gateway_reported');
  const gatewayReportedCase = eventCaseSource('agent_gateway_reported', 'run_cancelled');

  assert.doesNotMatch(finalAnswerCase, /status:\s*'done'/);
  assert.doesNotMatch(gatewayReportedCase, /status:\s*'done'/);
  assert.match(handlerSource, /status:\s*terminalStatus/);
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

test('a completed rerun appends its result without replacing previous attempts', () => {
  const previous = {
    attempt: 1,
    status: 'done',
    summary: 'first result',
    started_at: '2026-08-20T10:31:40Z',
    finished_at: '2026-08-20T10:35:46Z',
  };
  const completed = workflowNodeFinishedState({
    status: 'done',
    success: true,
    summary: 'revised result',
    started_at: '2026-08-20T11:45:17Z',
    finished_at: '2026-08-20T11:46:09Z',
  }, {
    status: 'running',
    started_at: '2026-08-20T11:45:17Z',
  }, [previous]);

  assert.equal(completed.attempts.length, 2);
  assert.equal(completed.attempts[0], previous);
  assert.equal(completed.attempts[1].attempt, 2);
  assert.equal(completed.attempts[1].summary, 'revised result');
  assert.equal(completed.node, completed.attempts[1]);
});

test('a repeated workflow finish receipt does not duplicate attempt history', () => {
  const event = {
    status: 'done',
    summary: 'result',
    started_at: '2026-08-20T11:45:17Z',
    finished_at: '2026-08-20T11:46:09Z',
  };
  const first = workflowNodeFinishedState(event, { status: 'running' }, []);
  const repeated = workflowNodeFinishedState(event, first.node, first.attempts);

  assert.equal(repeated.attempts.length, 1);
});
