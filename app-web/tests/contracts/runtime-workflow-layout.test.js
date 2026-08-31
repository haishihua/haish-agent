import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  layoutRuntimeWorkflow,
  mergeWorkflowNodeAttempts,
  workflowApprovalDecisionStatus,
  workflowNodeOutcomesFromEvents,
  workflowResultForAttempt,
  workflowToolCallsForAttempt,
  workflowTraversedLoopNodeIds,
} from '../../src/features/workflow/model/runtime-workflow-layout.js';
import { runtimeEventToLog } from '../../src/features/tasks/model/runtime-events.js';

const runtimeSource = fs.readFileSync(
  new URL('../../src/features/workflow/components/WorkflowRuntimePage.jsx', import.meta.url),
  'utf8',
);
const editorSource = fs.readFileSync(
  new URL('../../src/features/settings/components/WorkflowConfigEditor.jsx', import.meta.url),
  'utf8',
);
const flowNodeSource = fs.readFileSync(
  new URL('../../src/features/workflow/components/WorkflowFlowNode.jsx', import.meta.url),
  'utf8',
);
const chatMessageSource = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url),
  'utf8',
);
const chatTimelineSource = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
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
  new URL('../../src/features/tasks/hooks/createTaskStreamHandlers.js', import.meta.url),
  'utf8',
);
const appShellSource = fs.readFileSync(
  new URL('../../src/features/app/AppShell.jsx', import.meta.url),
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

test('live traces stay visible while their tool cards remain collapsed', () => {
  assert.match(chatMessageSource, /const traceForcedOpen = message\.streaming \|\| message\.traceOpen/);
  assert.match(appShellSource, /traceOpen: !isLast && streaming/);
  assert.match(chatMessageSource, /const showTimelineExpanded = hasTraceDisclosure && \(traceForcedOpen \|\| traceExpanded\)/);
  assert.match(chatMessageSource, /const showTimelineToggle = hasTraceDisclosure && !traceForcedOpen/);
  assert.match(chatMessageSource, /showTimelineToggle \? \(\s*<ChatTimelineCollapsed/);
  assert.match(chatMessageSource, /expanded=\{traceExpanded\}/);
  assert.match(chatMessageSource, /setTraceExpanded\(false\).*message\.conversationId, message\.id/s);
  assert.match(chatMessageSource, /traceForcedOpen && firstTokenMs \? <ChatTimelineElapsedPill/);
  assert.doesNotMatch(chatTimelineSource, /expandedByDefault/);
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
  assert.match(runtimeSource, /nodeStatus\(selectedNode, run, task\?\.status, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds\)/);

  const edge = runtimeEventToLog({
    type: 'workflow_edge_selected',
    from_node_id: 'agent',
    to_node_id: 'tool',
  });
  assert.equal(edge.fromNodeId, 'agent');
  assert.equal(edge.toNodeId, 'tool');

  const started = runtimeEventToLog({
    type: 'workflow_node_started',
    workflow_node_id: 'agent',
    input: { message: 'real resolved input' },
  });
  assert.deepEqual(started.nodeInput, { message: 'real resolved input' });
  assert.match(runtimeSource, /inputEvent\?\.nodeInput/);
  assert.match(runtimeSource, /status === 'waiting_input'/);
  assert.match(flowNodeSource, /WORKFLOW_RUNTIME_STATUS_ICON/);
  assert.match(chatMessageSource, /label=\{elapsed \|\| '0s'\}/);
  assert.doesNotMatch(chatMessageSource, /label=\{elapsed \|\| 'Trace'\}/);
});

test('completed approval nodes preserve their explicit decision', () => {
  assert.match(taskStreamSource, /decision: event\.decision \|\|/);
  assert.doesNotMatch(runtimeSource, /status === 'done' \? 'approved'/);
  assert.equal(
    workflowResultForAttempt(
      {
        finishedAt: '2026-08-18T18:17:00Z',
        events: [{ type: 'workflow_node_finished', decision: 'rejected', status: 'done' }],
      },
      null,
      true,
    ).decision,
    'rejected',
  );
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

  const activeResult = workflowResultForAttempt(
    {
      ...attempts[2],
      startedAt: '2026-08-18T18:16:00Z',
      events: [{ type: 'workflow_node_started', nodeInput: { message: 'new input' } }],
    },
    { attempt: 10, summary: 'previous output', finished_at: '2026-08-18T18:15:30Z' },
    true,
    11,
  );
  assert.equal(activeResult.attempt, 11);
  assert.equal(activeResult.summary, '');
});

test('a completed attempt only receives the latest node result when their timestamps match', () => {
  const current = workflowResultForAttempt(
    {
      startedAt: '2026-08-18T18:16:00Z',
      finishedAt: '2026-08-18T18:17:00Z',
      events: [{ type: 'workflow_node_finished', summary: 'current event output', status: 'done' }],
    },
    { attempt: 11, summary: 'current persisted output', finished_at: '2026-08-18T18:17:00Z' },
    true,
    11,
  );
  assert.equal(current.attempt, 11);
  assert.equal(current.summary, 'current persisted output');

  const stale = workflowResultForAttempt(
    {
      startedAt: '2026-08-18T18:16:00Z',
      finishedAt: '2026-08-18T18:17:00Z',
      events: [{ type: 'workflow_node_finished', summary: 'current event output', status: 'done' }],
    },
    { attempt: 10, summary: 'previous output', finished_at: '2026-08-18T18:15:30Z' },
    true,
    11,
  );
  assert.equal(stale.attempt, 11);
  assert.equal(stale.summary, 'current event output');
});

test('a new loop attempt never reuses tool calls from the previous attempt', () => {
  const toolCalls = [
    { callId: 'previous-call', toolName: 'read_file' },
    { callId: 'current-call', toolName: 'write_file' },
  ];

  assert.deepEqual(workflowToolCallsForAttempt(toolCalls, []), []);
  assert.deepEqual(
    workflowToolCallsForAttempt(toolCalls, [{ callId: 'current-call' }]),
    [{ callId: 'current-call', toolName: 'write_file' }],
  );
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

test('historical rejected attempts keep their traversed loop node completed', () => {
  const traversed = workflowTraversedLoopNodeIds({
    nodes: [
      { id: 'approval', type: 'human_approval' },
      { id: 'rework', type: 'loop' },
    ],
    edges: [{ from: 'approval', to: 'rework', branch: 'rejected' }],
  }, {
    nodes: { approval: { decision: 'approved' } },
    node_attempts: {
      approval: [
        { status: 'done', success: true, decision: 'rejected', selected_branch: 'rejected' },
        { status: 'done', success: true, decision: 'approved', selected_branch: 'approved' },
      ],
    },
  });

  assert.deepEqual([...traversed], ['rework']);
});

test('secondary loop nodes normalize their top input and retry output to one handle', () => {
  assert.doesNotMatch(runtimeSource, /retry: \{ left: '72%' \}/);
  assert.doesNotMatch(editorSource, /retry: \{ left: '72%' \}/);
});

test('only the latest approval attempt binds to the live approval request', () => {
  assert.match(runtimeSource, /allowLiveRequest=\{showApproval\}/);
  assert.match(runtimeSource, /showApproval=\{isLatestAttempt\}/);
});

test('approval decisions follow the next executed detail node', () => {
  assert.match(runtimeSource, /previous\.status === 'approval'/);
  assert.match(runtimeSource, /\['approved', 'rejected'\]\.includes\(selectedStatus\)/);
  assert.match(runtimeSource, /events\.slice\(approvalFinishedIndex \+ 1\)\.find/);
  assert.match(runtimeSource, /event\.type !== 'workflow_node_started'/);
  assert.match(runtimeSource, /setSelectedNodeId\(nextNodeId\)/);
});

test('running node details keep time and open at the latest event', () => {
  assert.match(runtimeSource, /const completedAt = running\s*\? null/);
  assert.match(runtimeSource, /<ScrollToBottomButton[\s\S]*?autoFollow/);
});

test('terminal workflow tasks can rerun an executed business node', () => {
  assert.match(runtimeSource, /onRetry={isLatestAttempt && canRetry \? retryLatest : null}/);
  assert.match(chatMessageSource, /text="ReRun"/);
  assert.match(chatMessageSource, /aria-label="ReRun this node"/);
  assert.doesNotMatch(runtimeSource, /workflow-detail-retry-row/);
  assert.doesNotMatch(runtimeSource, /workflow-detail-footer/);
  assert.doesNotMatch(runtimeSource, /Upstream results and previous attempts will be kept/);
  assert.match(runtimeSource, /\['agent', 'llm', 'tool', 'human_approval'\]\.includes\(node\.type\)/);
  assert.match(runtimeSource, /onRetry\?\.\(node\.id\)/);
  assert.match(taskStreamSource, /workflow\/nodes\/\$\{encodeURIComponent\(streamRequest\.rerunNodeId\)\}\/rerun\/stream/);
  assert.match(taskStreamSource, /const runId = rerunningNode \? generateHexId\(\)/);
  assert.match(appShellSource, /setViewedWorkflowTask\(null\);\s*executeWorkflowNodeRerun\(currentWorkflowTask, nodeId\)/);
  assert.match(taskStreamSource, /sourceTaskId/);
  assert.doesNotMatch(taskStreamSource, /allowTerminalReset: true/);
  assert.match(taskStreamSource, /case 'workflow_resumed'/);
  assert.match(taskStreamSource, /event\.invalidated_node_ids/);
  assert.match(taskStreamSource, /chatFinalizedTaskIdsRef\.current\.delete\(runId\)/);
  assert.match(taskStreamSource, /rollbackUnconfirmedRerun/);
  assert.match(taskStreamSource, /removeConversationTaskFromWorkspace\(runConversationId, runId\)/);
});
