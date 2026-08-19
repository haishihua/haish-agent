import test from 'node:test';
import assert from 'node:assert/strict';

test('cancelling a task also terminates its active workflow node', async () => {
  globalThis.window = { AGENT_WORLD_API_BASE: '' };
  const { applyTerminalTaskState } = await import('./task-runtime.js');
  const task = {
    status: 'running',
    workflowRun: {
      status: 'waiting_input',
      current_node_id: 'requirements',
      nodes: {},
    },
  };

  const cancelled = applyTerminalTaskState(task, 'cancelled', { aborted: true });

  assert.equal(cancelled.workflowRun.status, 'cancelled');
  assert.equal(cancelled.workflowRun.current_node_id, null);
  assert.equal(cancelled.workflowRun.nodes.requirements.status, 'cancelled');
  assert.equal(cancelled.workflowRun.nodes.requirements.success, false);
});

test('cancelling a task preserves an active node that already finished successfully', async () => {
  globalThis.window = { AGENT_WORLD_API_BASE: '' };
  const { applyTerminalTaskState } = await import('./task-runtime.js');
  const task = {
    status: 'running',
    workflowRun: {
      status: 'running',
      current_node_id: 'rework',
      nodes: {
        rework: { status: 'done', success: true, summary: 'completed' },
      },
    },
  };

  const cancelled = applyTerminalTaskState(task, 'cancelled', { aborted: true });

  assert.equal(cancelled.workflowRun.status, 'cancelled');
  assert.equal(cancelled.workflowRun.current_node_id, null);
  assert.deepEqual(cancelled.workflowRun.nodes.rework, task.workflowRun.nodes.rework);
});
