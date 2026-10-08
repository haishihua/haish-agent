import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowAttentionRequest } from '../../../src/features/workflow/model/workflow-attention.js';

const workflow = { workflow_id: 'goal', nodes: [{ id: 'clarify', type: 'agent' }, { id: 'approve', type: 'human_approval' }, { id: 'end', type: 'output' }] };
const task = { taskId: 'task', conversationId: 'conv', status: 'running', workflowSnapshot: workflow, workflowRun: { current_node_id: 'clarify' } };
const input = { request_id: 'question', task_id: 'task', conversation_id: 'conv', node_id: 'clarify' };
const approval = { request_id: 'approval', task_id: 'task', conversation_id: 'conv', workflow_node_id: 'approve' };

test('pending questions and approval snapshots identify their node independently of stale run status', () => {
  assert.equal(workflowAttentionRequest(workflow, task, [input]).nodeId, 'clarify');
  const attention = workflowAttentionRequest(workflow, task, [], [approval]);
  assert.equal(attention.nodeId, 'approve');
  assert.equal(attention.status, 'approval');
  assert.equal(workflowAttentionRequest(workflow, task, [input], [approval]).status, 'waiting_input');
});

test('historical requests, other tasks/conversations/workflows and terminal tasks cannot steal selection', () => {
  for (const request of [{ ...input, task_id: 'other' }, { ...input, conversation_id: 'other' }, { ...input, node_id: 'end' }, { ...input, node_id: 'missing' }]) {
    assert.equal(workflowAttentionRequest(workflow, task, [request]), null);
  }
  for (const ended of [{ ...task, status: 'done' }, { ...task, completedAt: 123 }, { ...task, serverFinished: true }, { ...task, workflowSnapshot: { workflow_id: 'other' } }]) {
    assert.equal(workflowAttentionRequest(workflow, ended, [input]), null);
  }
  assert.equal(workflowAttentionRequest(workflow, { ...task, workflowRun: { status: 'waiting_input', current_node_id: 'clarify' }, eventLog: [{ tool_name: 'ask_user' }] }), null);
});

test('legacy requests map via the matching tool event then the current node', () => {
  const legacy = { ...input, node_id: undefined, tool_call_id: 'call' };
  assert.equal(workflowAttentionRequest(workflow, { ...task, workflowRun: { current_node_id: 'approve' }, eventLog: [{ call_id: 'call', workflowNodeId: 'clarify' }] }, [legacy]).nodeId, 'clarify');
  assert.equal(workflowAttentionRequest(workflow, task, [legacy]).nodeId, 'clarify');
  assert.notEqual(workflowAttentionRequest(workflow, task, [input]).key, workflowAttentionRequest(workflow, task, [{ ...input, request_id: 'next' }]).key);
});
