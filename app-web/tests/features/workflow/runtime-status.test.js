import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { HAISH_API_BASE: '' };
const { workflowRuntimeDisplayStatus, workflowRuntimeNodeStatus } = await import('../../../src/features/workflow/model/runtime-status.js');
import { workflowNodeOutcomesFromEvents } from '../../../src/features/workflow/model/runtime-workflow-layout.js';
const { applyTerminalTaskState } = await import('../../../src/features/tasks/model/task-runtime.js');

const node = { id: 'active', type: 'agent' };
const run = { status: 'running', current_node_id: 'active', nodes: { active: { status: 'running' }, completed: { status: 'done', summary: 'Keep this answer' } } };
const task = { status: 'running', workflowRun: run };
const active = new Set(['active']);

for (const [status, expected] of [['failed', 'failed'], ['error', 'failed'], ['cancelled', 'cancelled'], ['aborted', 'cancelled'], ['done', 'done']]) {
  test(`${status} receipt wins over stale run without a node finish event`, () => {
    const ended = { ...task, status, serverFinished: true };
    assert.equal(workflowRuntimeDisplayStatus(ended), expected);
    assert.equal(workflowRuntimeNodeStatus(node, run, ended, active), expected);
    assert.equal(workflowRuntimeNodeStatus(node, { ...run, current_node_id: null, nodes: {} }, ended, active), expected, 'stream-only active attempt');
    assert.equal(workflowRuntimeNodeStatus({ id: 'completed', type: 'llm' }, run, ended, active), 'done');
    assert.equal(workflowRuntimeNodeStatus({ id: 'unstarted', type: 'tool' }, run, ended, active), 'pending');
    assert.equal(workflowRuntimeNodeStatus({ id: 'queued', type: 'tool' }, { ...run, nodes: { queued: { status: 'queued' } } }, ended, active), 'pending', 'unstarted queued node is not terminated');
    assert.equal(run.nodes.completed.summary, 'Keep this answer');
  });
}

test('persisted cancellation receipt keeps Cancelled despite success:false', () => {
  const ended = applyTerminalTaskState(task, 'cancelled');
  assert.equal(workflowRuntimeDisplayStatus(ended), 'cancelled');
  assert.equal(workflowRuntimeNodeStatus(node, ended.workflowRun, ended, active), 'cancelled');
  assert.equal(workflowRuntimeNodeStatus({ id: 'completed', type: 'llm' }, ended.workflowRun, ended), 'done');
});

test('serverFinished/completed marker alone extinguishes running nodes and title', () => {
  for (const marker of [{ serverFinished: true }, { completedAt: 42 }, { completed_at: 42 }]) {
    const ended = { ...task, ...marker };
    assert.equal(workflowRuntimeDisplayStatus(ended), 'done');
    assert.equal(workflowRuntimeNodeStatus(node, run, ended, active), 'done');
  }
});

test('completed current node, event receipts and traversed loops survive task failure/cancellation', () => {
  for (const status of ['failed', 'cancelled']) {
    const ended = { ...task, status, serverFinished: true };
    for (const result of [{ status: 'done', summary: 'answer' }, { success: true }, { finished_at: '2026-10-01T00:00:00Z' }]) {
      assert.equal(workflowRuntimeNodeStatus(node, { ...run, nodes: { active: result } }, ended), 'done');
      assert.equal(workflowRuntimeNodeStatus(node, { ...run, nodes: { active: result } }, ended, active), 'done', 'completed persisted result wins even without node finish event');
    }
    const outcomes = workflowNodeOutcomesFromEvents([{ type: 'workflow_node_finished', workflowNodeId: 'active', status: 'done' }]);
    assert.equal(workflowRuntimeNodeStatus(node, run, ended, new Set(), outcomes), 'done');
    assert.equal(workflowRuntimeNodeStatus({ id: 'loop', type: 'loop' }, run, ended, new Set(), new Map(), new Set(['loop'])), 'done');
  }
});

test('live waits and approval decisions survive, but terminal tasks cannot remain actionable', () => {
  const approval = { id: 'active', type: 'human_approval' };
  const waiting = { ...run, status: 'waiting_approval' };
  assert.equal(workflowRuntimeDisplayStatus({ ...task, workflowRun: waiting }), 'approval');
  assert.equal(workflowRuntimeNodeStatus(approval, waiting, task, active), 'approval');
  assert.equal(workflowRuntimeNodeStatus(node, { ...run, status: 'waiting_input' }, task, active), 'waiting_input');
  assert.equal(workflowRuntimeNodeStatus(node, run, task, active), 'running');
  for (const status of ['failed', 'cancelled']) {
    const ended = { ...task, status, workflowRun: waiting, serverFinished: true };
    assert.equal(workflowRuntimeNodeStatus(approval, waiting, ended, active), status);
    for (const [decision, expected] of [['approve', 'approved'], ['reject', 'rejected']]) {
      assert.equal(workflowRuntimeNodeStatus(approval, { ...waiting, nodes: { active: { decision } } }, ended), expected);
      const outcomes = workflowNodeOutcomesFromEvents([{ type: 'workflow_node_finished', workflowNodeId: 'active', decision }]);
      assert.equal(workflowRuntimeNodeStatus(approval, waiting, ended, new Set(), outcomes), expected);
    }
  }
});
