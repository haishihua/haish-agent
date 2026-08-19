import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  layoutRuntimeWorkflow,
  mergeWorkflowNodeAttempts,
  workflowApprovalDecisionStatus,
  workflowNodeOutcomesFromEvents,
} from './runtime-workflow-layout.js';
import { worldEventToRuntimeLog } from './world-events.js';

const runtimeSource = fs.readFileSync(
  new URL('../features/workflow/WorkflowRuntimePage.jsx', import.meta.url),
  'utf8',
);
const editorSource = fs.readFileSync(
  new URL('../features/settings/WorkflowConfigEditor.jsx', import.meta.url),
  'utf8',
);
const chatMessageSource = fs.readFileSync(
  new URL('../panels/ChatMessageRow.jsx', import.meta.url),
  'utf8',
);
const runtimeStyles = fs.readFileSync(
  new URL('../../styles/workflow-runtime.css', import.meta.url),
  'utf8',
);
const baseStyles = fs.readFileSync(
  new URL('../../styles/base.css', import.meta.url),
  'utf8',
);
const taskStreamSource = fs.readFileSync(
  new URL('../features/app/hooks/createTaskStreamHandlers.js', import.meta.url),
  'utf8',
);

test('runtime workflow layout wraps the primary route and keeps rejection work below its parent', () => {
  const nodes = [
    { id: 'start', type: 'start' },
    { id: 'one' },
    { id: 'approval', type: 'human_approval' },
    { id: 'three' },
    { id: 'four' },
    { id: 'five' },
    { id: 'six' },
    { id: 'seven' },
    { id: 'output', type: 'output' },
    { id: 'rework', type: 'loop' },
  ];
  const edges = [
    { from: 'start', to: 'one' },
    { from: 'one', to: 'approval' },
    { from: 'approval', to: 'three', branch: 'approved' },
    { from: 'approval', to: 'rework', branch: 'rejected' },
    { from: 'rework', to: 'one', branch: 'retry' },
    { from: 'three', to: 'four' },
    { from: 'four', to: 'five' },
    { from: 'five', to: 'six' },
    { from: 'six', to: 'seven' },
    { from: 'seven', to: 'output' },
  ];

  const layout = layoutRuntimeWorkflow(nodes, edges, 1200);

  assert.equal(layout.columns, 4);
  assert.deepEqual(layout.positions.get('start'), { x: 48, y: 96 });
  assert.deepEqual(layout.positions.get('three'), { x: 918, y: 96 });
  assert.deepEqual(layout.positions.get('four'), { x: 918, y: 326 });
  assert.deepEqual(layout.positions.get('seven'), { x: 48, y: 326 });
  assert.deepEqual(layout.positions.get('rework'), { x: 628, y: 214 });
  assert.equal(layout.meta.get('four').direction, 'left');
  assert.equal(layout.meta.get('rework').kind, 'secondary');
});

test('runtime feedback edges keep routed ports and align every rework edge on one baseline', () => {
  assert.match(runtimeSource, /targetHandle: feedback \? 'runtime-feedback'/);
  assert.match(runtimeSource, /type: curved \? 'smoothstep'/);
  assert.match(runtimeSource, /const reworkEdge = sourceLayout\?\.kind !== targetLayout\?\.kind/);
  assert.match(runtimeSource, /borderRadius: 18, offset: reworkEdge \? 0 : 28/);
  assert.doesNotMatch(runtimeSource, /type: curved \? 'default'/);
});

test('workflow editor reuses the runtime snake layout and routed ports', () => {
  assert.match(editorSource, /layoutRuntimeWorkflow\(nodes, edges, canvasWidth\)/);
  assert.match(editorSource, /position: layout\.positions\.get/);
  assert.match(editorSource, /targetHandle: feedback \? 'runtime-feedback'/);
  assert.doesNotMatch(editorSource, /nodesDraggable=\{false\}/);
});

test('runtime and editor keep edges attached while nodes are dragged', () => {
  assert.match(runtimeSource, /useNodesState\(layoutNodes\)/);
  assert.match(runtimeSource, /onNodesChange=\{onNodesChange\}/);
  assert.doesNotMatch(runtimeSource, /nodesDraggable=\{false\}/);
  assert.match(editorSource, /useNodesState\(nodes\)/);
  assert.match(runtimeSource, /draggedNodePositionsRef\.current\.get\(node\.id\)/);
  assert.match(editorSource, /draggedNodePositionsRef\.current\.get\(node\.id\)/);
  assert.doesNotMatch(editorSource, /currentById/);
});

test('node execution details can be resized without hiding the workflow', () => {
  assert.match(runtimeSource, /className="workflow-detail-resizer"/);
  assert.match(runtimeSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(runtimeSource, /'--workflow-detail-width'/);
  assert.match(runtimeStyles, /var\(--workflow-detail-width, 460px\)/);
  assert.match(runtimeStyles, /calc\(100% - 360px\)/);
});

test('assistant messages keep the original penguin icon', () => {
  assert.match(baseStyles, /\.ico-assistant-avatar\s*\{[^}]*penguin\.png/s);
});

test('runtime details use executed node data and real workflow transitions', () => {
  assert.match(runtimeSource, /DETAIL_NODE_TYPES = new Set\(\['agent', 'llm', 'tool', 'human_approval'\]\)/);
  assert.match(runtimeSource, /executedNodeIds\.has\(String\(node\.id\)\)/);
  assert.doesNotMatch(runtimeSource, /detailText\(node\.input \|\| node\.prompt/);
  assert.match(runtimeSource, /className: active \? 'is-flowing'/);
  assert.match(runtimeSource, /const active = latestSelected/);
  assert.doesNotMatch(runtimeSource, /const active = targetStatus === 'running'/);
  assert.match(runtimeSource, /normalizedTaskStatus === 'cancelled'/);
  assert.match(runtimeSource, /if \(eventOutcome && eventOutcome !== 'running'\) return eventOutcome;/);
  assert.match(runtimeSource, /function activeNodeIdsFromEvents\(eventLog\)/);
  assert.match(runtimeSource, /if \(event\.type === 'workflow_node_started'\) active\.add\(nodeId\);/);
  assert.match(runtimeSource, /if \(event\.type === 'workflow_node_finished'\) active\.delete\(nodeId\);/);
  assert.match(runtimeSource, /if \(activeFromEvents\)[\s\S]*?return 'running';/);
  assert.match(runtimeSource, /nodeStatus\(selectedNode, run, task\?\.status, activeEventNodeIds, eventNodeOutcomes\)/);

  const edge = worldEventToRuntimeLog({
    type: 'workflow_edge_selected',
    from_node_id: 'agent',
    to_node_id: 'tool',
  });
  assert.equal(edge.fromNodeId, 'agent');
  assert.equal(edge.toNodeId, 'tool');

  const started = worldEventToRuntimeLog({
    type: 'workflow_node_started',
    workflow_node_id: 'agent',
    input: { message: 'real resolved input' },
  });
  assert.deepEqual(started.nodeInput, { message: 'real resolved input' });
  assert.match(runtimeSource, /inputEvent\?\.nodeInput/);
  assert.match(runtimeSource, /status === 'waiting_input'/);
  assert.match(editorSource, /WORKFLOW_RUNTIME_STATUS_ICON/);
  assert.match(chatMessageSource, /label=\{elapsed \|\| '0s'\}/);
  assert.doesNotMatch(chatMessageSource, /label=\{elapsed \|\| 'Trace'\}/);
});

test('completed approval nodes preserve their explicit decision', () => {
  assert.match(taskStreamSource, /decision: event\.decision \|\|/);
  assert.match(runtimeSource, /decision: base\?\.decision \|\| base\?\.structured\?\.decision \|\| finishedEvent\.decision/);
  assert.doesNotMatch(runtimeSource, /status === 'done' \? 'approved'/);
  assert.equal(
    workflowApprovalDecisionStatus(
      { type: 'human_approval' },
      { status: 'cancelled', decision: 'approved' },
    ),
    'approved',
  );
  assert.equal(
    workflowApprovalDecisionStatus(
      { type: 'human_approval' },
      { status: 'done', structured: { decision: 'rejected' } },
    ),
    'rejected',
  );
  assert.equal(workflowApprovalDecisionStatus({ type: 'agent' }, { decision: 'rejected' }), '');
  assert.ok(
    runtimeSource.indexOf('if (approvalDecision) return approvalDecision;')
      < runtimeSource.indexOf("if (normalized === 'cancelled') return 'cancelled';"),
  );
});

test('an active streamed attempt does not inherit the previous persisted result', () => {
  const attempts = mergeWorkflowNodeAttempts(
    [
      { attempt: 9, decision: 'rejected', started_at: '2026-08-18T18:11:52Z', finished_at: '2026-08-18T18:12:00Z' },
      { attempt: 10, decision: 'rejected', started_at: '2026-08-18T18:14:56Z', finished_at: '2026-08-18T18:15:30Z' },
    ],
    [
      { id: 'approval-9', finishedAt: '2026-08-18T18:12:00Z' },
      { id: 'approval-10', finishedAt: '2026-08-18T18:15:30Z' },
      { id: 'approval-11', finishedAt: null },
    ],
    'approval',
  );

  assert.equal(attempts[0].result.attempt, 9);
  assert.equal(attempts[1].result.attempt, 10);
  assert.equal(attempts[2].result, null);
});

test('current approval waiting state wins over an older rejected decision', () => {
  const waitingCheck = runtimeSource.indexOf("runStatus === 'waiting_approval'");
  const decisionCheck = runtimeSource.indexOf('if (approvalDecision) return approvalDecision;');
  assert.ok(waitingCheck >= 0 && waitingCheck < decisionCheck);
  assert.match(runtimeSource, /className="workflow-detail-history"/);
  assert.match(runtimeSource, /previous Attempts \(\{historicalAttempts\.length\}\)/);
  assert.match(runtimeSource, /<ChatTimelineChevron open=\{historyOpen\} \/>/);
});

test('a selected outgoing edge completes its source node when the finish receipt is missing', () => {
  const outcomes = workflowNodeOutcomesFromEvents([
    { type: 'workflow_node_started', workflowNodeId: 'requirements_rework' },
    { type: 'workflow_edge_selected', fromNodeId: 'requirements_rework', toNodeId: 'requirements' },
  ]);

  assert.equal(outcomes.get('requirements_rework'), 'done');
  assert.match(runtimeSource, /active\.delete\(String\(event\.fromNodeId \|\| event\.from_node_id \|\| ''\)\)/);
});

test('secondary loop nodes normalize their top input and retry output to one handle', () => {
  assert.doesNotMatch(runtimeSource, /retry: \{ left: '72%' \}/);
  assert.doesNotMatch(editorSource, /retry: \{ left: '72%' \}/);
});

test('only the latest approval attempt binds to the live approval request', () => {
  assert.match(runtimeSource, /allowLiveRequest=\{showApproval\}/);
  assert.match(runtimeSource, /showApproval=\{isLatestAttempt\}/);
});

test('running node details keep time and open at the latest event', () => {
  assert.match(runtimeSource, /const completedAt = running\s*\? null/);
  assert.match(runtimeSource, /element\.scrollTop = element\.scrollHeight/);
});

test('terminal workflow tasks can rerun an executed business node', () => {
  assert.match(runtimeSource, /Run from this node/);
  assert.match(runtimeSource, /\['agent', 'llm', 'tool', 'human_approval'\]\.includes\(node\.type\)/);
  assert.match(runtimeSource, /onRetry\(node\.id\)/);
  assert.match(taskStreamSource, /workflow\/nodes\/\$\{encodeURIComponent\(streamRequest\.rerunNodeId\)\}\/rerun\/stream/);
  assert.match(taskStreamSource, /const runId = rerunningNode \? generateHexId\(\)/);
  assert.match(taskStreamSource, /sourceTaskId/);
  assert.doesNotMatch(taskStreamSource, /allowTerminalReset: true/);
  assert.match(taskStreamSource, /case 'workflow_resumed'/);
  assert.match(taskStreamSource, /event\.invalidated_node_ids/);
  assert.match(taskStreamSource, /chatFinalizedTaskIdsRef\.current\.delete\(runId\)/);
  assert.match(taskStreamSource, /rollbackUnconfirmedRerun/);
  assert.match(taskStreamSource, /removeConversationTaskFromWorkspace\(runConversationId, runId\)/);
});
