import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeAttempts } from '../../../src/core/node-attempts.js';

test('attempt projections reuse identity across unrelated task updates', () => {
  const eventLog = [{ type: 'workflow_node_started', nodeId: 'agent' }, { type: 'llm_answer_delta', text: 'hello' }];
  const task = { eventLog };
  const first = nodeAttempts(task, 'agent');
  assert.equal(nodeAttempts({ ...task, updatedAt: 'new', answerText: 'new' }, 'agent'), first);
  assert.equal(first[0].events.length, 2);
});
test('events, results and persisted attempts independently invalidate projection', () => {
  const task = { eventLog: [{ type: 'workflow_node_started', nodeId: 'agent' }] };
  const first = nodeAttempts(task, 'agent');
  const appended = { ...task, eventLog: [...task.eventLog, { type: 'llm_answer_delta', text: 'new' }] };
  assert.notEqual(nodeAttempts(appended, 'agent'), first);
  const result = { summary: 'done', status: 'done' };
  const withResult = { ...task, workflowRun: { nodes: { agent: result } } };
  const second = nodeAttempts(withResult, 'agent');
  assert.notEqual(second, first);
  const withPersisted = { ...withResult, workflowRun: { ...withResult.workflowRun, node_attempts: { agent: [{ summary: 'saved' }] } } };
  assert.notEqual(nodeAttempts(withPersisted, 'agent'), second);
  assert.equal(nodeAttempts(withResult, 'agent')[0].events.length, 1);
});
test('node and task caches do not leak results between unrelated histories', () => {
  const one = { workflowRun: { nodes: { agent: { summary: 'one' } } } };
  const two = { workflowRun: { nodes: { agent: { summary: 'two' } } } };
  assert.equal(nodeAttempts(one, 'agent')[0].result.summary, 'one');
  assert.equal(nodeAttempts(two, 'agent')[0].result.summary, 'two');
  assert.deepEqual(nodeAttempts(one, 'judge'), []);
});
